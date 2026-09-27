// Diagnóstico: abra /api/health no navegador para ver o que está configurado.
import { config } from "@/lib/config";
import { hasGoogle } from "@/lib/google";
import { getKB } from "@/lib/kb";
import { listar, usaPlanilha } from "@/lib/registros";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};

  // Groq
  if (!process.env.GROQ_API_KEY) out.groq = "FALTA GROQ_API_KEY";
  else {
    try {
      const r = await fetch(`${process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"}/models`, {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY?.trim()}` },
        cache: "no-store",
      });
      const j = await r.json();
      const ids: string[] = (j.data || []).map((m: any) => m.id).sort();
      out.groq = r.ok
        ? { ok: true, modeloEmUso: config.groqModel, modeloDisponivel: ids.includes(config.groqModel), modelos: ids }
        : { ok: false, erro: j.error?.message || r.status };
    } catch (e) {
      out.groq = { ok: false, erro: String(e) };
    }
  }

  // Base de conhecimento
  const kb = getKB();
  try {
    const docs = await kb.list();
    out.base = { ok: true, modo: kb.mode, pastaId: config.driveFolderId, documentos: docs.map((d) => d.title) };
  } catch (e) {
    out.base = { ok: false, modo: kb.mode, erro: String(e instanceof Error ? e.message : e) };
  }
  out.contaDeServicoGoogle = hasGoogle();

  // Registros
  try {
    const regs = await listar();
    out.registros = { ok: true, onde: usaPlanilha() ? "planilha" : "memoria (configure SHEETS_ID)", linhas: regs.length };
  } catch (e) {
    out.registros = { ok: false, erro: String(e instanceof Error ? e.message : e) };
  }

  return Response.json(out);
}
