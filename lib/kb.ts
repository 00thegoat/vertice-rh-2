// Base de conhecimento: Google Drive ao vivo (padrão) ou cópia local em /base (reserva).
import { promises as fs } from "fs";
import path from "path";
import { config } from "./config";
import { googleFetch, hasGoogle } from "./google";

export type Doc = { id: string; title: string; url: string; mimeType?: string };
export type Hit = Doc & { trecho: string };

export interface KnowledgeBase {
  mode: "drive" | "local";
  list(): Promise<Doc[]>;
  search(termos: string): Promise<Hit[]>;
  read(id: string): Promise<{ doc: Doc; conteudo: string }>;
}

const FOLDER = "application/vnd.google-apps.folder";
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const docUrl = (id: string) => `https://docs.google.com/document/d/${id}/edit`;

/* ---------------- Google Drive ---------------- */

class DriveKB implements KnowledgeBase {
  mode = "drive" as const;
  private cache: { at: number; docs: Doc[]; folders: string[] } | null = null;

  private async listChildren(folderId: string) {
    const out: any[] = [];
    let pageToken = "";
    for (let i = 0; i < 20; i++) {
      const params = new URLSearchParams({
        q: `'${q(folderId)}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
        pageSize: "100",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const r = await googleFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
      out.push(...(r.files || []));
      pageToken = r.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  }

  private async index() {
    // Cache curto: documentos novos na pasta aparecem em até 1 minuto.
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache;
    const folders = [config.driveFolderId];
    const top = await this.listChildren(config.driveFolderId);
    let files = top.filter((f) => f.mimeType !== FOLDER);
    for (const sub of top.filter((f) => f.mimeType === FOLDER).slice(0, 10)) {
      folders.push(sub.id);
      files = files.concat((await this.listChildren(sub.id)).filter((f) => f.mimeType !== FOLDER));
    }
    const docs: Doc[] = files.map((f) => ({ id: f.id, title: f.name, url: f.webViewLink, mimeType: f.mimeType }));
    this.cache = { at: Date.now(), docs, folders };
    return this.cache;
  }

  async list() {
    return (await this.index()).docs;
  }

  async search(termos: string): Promise<Hit[]> {
    const { docs, folders } = await this.index();
    const scope = folders.map((id) => `'${q(id)}' in parents`).join(" or ");
    const params = new URLSearchParams({
      q: `(${scope}) and trashed = false and fullText contains '${q(termos)}'`,
      fields: "files(id, name, webViewLink)",
      pageSize: "5",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    const r = await googleFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const allowed = new Set(docs.map((d) => d.id));
    const hits: Hit[] = [];
    for (const f of (r.files || []).filter((f: any) => allowed.has(f.id))) {
      // A API do Drive não devolve trecho; pegamos o parágrafo que contém o termo.
      const { conteudo } = await this.read(f.id).catch(() => ({ conteudo: "" }));
      hits.push({ id: f.id, title: f.name, url: f.webViewLink, trecho: excerpt(conteudo, termos) });
    }
    return hits;
  }

  async read(id: string) {
    const { docs } = await this.index();
    const doc = docs.find((d) => d.id === id);
    if (!doc) throw new Error("Esse id não pertence à pasta da base de conhecimento.");
    let conteudo = "";
    if (doc.mimeType === "application/vnd.google-apps.document") {
      conteudo = await googleFetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`, {}, "text");
    } else if (doc.mimeType === "application/vnd.google-apps.spreadsheet") {
      conteudo = await googleFetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/csv`, {}, "text");
    } else if (doc.mimeType?.startsWith("text/")) {
      conteudo = await googleFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {}, "text");
    } else {
      conteudo = "(Formato de arquivo não suportado para leitura. Use Google Docs.)";
    }
    return { doc, conteudo };
  }
}

/* ---------------- Cópia local (/base) ---------------- */

type LocalDoc = Doc & { conteudo: string };

class LocalKB implements KnowledgeBase {
  mode = "local" as const;
  private docs: LocalDoc[] | null = null;

  private async load() {
    if (this.docs) return this.docs;
    const dir = path.join(process.cwd(), "base");
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).sort();
    this.docs = await Promise.all(
      files.map(async (f) => {
        const raw = await fs.readFile(path.join(dir, f), "utf8");
        const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        const meta: Record<string, string> = {};
        (m?.[1] || "").split("\n").forEach((l) => {
          const i = l.indexOf(":");
          if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim();
        });
        const id = meta.driveId || f.replace(/\.md$/, "");
        return { id, title: meta.title || f, url: meta.driveId ? docUrl(meta.driveId) : "", conteudo: m?.[2] || raw };
      }),
    );
    return this.docs;
  }

  async list() {
    return (await this.load()).map(({ conteudo, ...d }) => d);
  }

  async search(termos: string): Promise<Hit[]> {
    const words = normalize(termos).split(/\s+/).filter((w) => w.length > 2);
    const scored = (await this.load())
      .map((d) => {
        const hay = normalize(d.title + " " + d.conteudo);
        const score = words.reduce((s, w) => s + (hay.split(w).length - 1), 0);
        return { d, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return scored.map(({ d }) => ({ id: d.id, title: d.title, url: d.url, trecho: excerpt(d.conteudo, termos) }));
  }

  async read(id: string) {
    const d = (await this.load()).find((x) => x.id === id);
    if (!d) throw new Error("Esse id não pertence à base de conhecimento.");
    const { conteudo, ...doc } = d;
    return { doc, conteudo };
  }
}

/* ---------------- helpers ---------------- */

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function excerpt(text: string, termos: string, size = 700) {
  if (!text) return "";
  const words = normalize(termos).split(/\s+/).filter((w) => w.length > 2);
  const norm = normalize(text);
  let pos = -1;
  for (const w of words) {
    pos = norm.indexOf(w);
    if (pos >= 0) break;
  }
  const start = Math.max(0, (pos < 0 ? 0 : pos) - 200);
  return text.slice(start, start + size).replace(/\s+/g, " ").trim();
}

let kb: KnowledgeBase | null = null;
export function getKB(): KnowledgeBase {
  if (!kb) kb = hasGoogle() ? new DriveKB() : new LocalKB();
  return kb;
}
