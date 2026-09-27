// Registros de perguntas, avaliações e encaminhamentos.
// Com SHEETS_ID + conta de serviço: grava na planilha "Guia Vértice - Registros".
// Sem isso: guarda em memória (some quando o servidor reinicia; serve só para testes).
import { randomUUID } from "crypto";
import { config } from "./config";
import { googleFetch, hasGoogle } from "./google";

export type Tipo = "pergunta" | "feedback" | "escalacao" | "resolvida";
export type Registro = {
  id: string;
  data: string;
  tipo: Tipo;
  pergunta?: string;
  status?: string;
  fontes?: string;
  feedback?: string;
  nome?: string;
  contato?: string;
  resposta?: string;
  ref?: string;
};

const COLS: (keyof Registro)[] = ["id", "data", "tipo", "pergunta", "status", "fontes", "feedback", "nome", "contato", "resposta", "ref"];
const memoria: Registro[] = ((globalThis as any).__registros ||= []);

export const usaPlanilha = () => Boolean(config.sheetsId && hasGoogle());

export async function registrar(r: Omit<Registro, "id" | "data"> & { id?: string }) {
  const row: Registro = { id: r.id || randomUUID(), data: new Date().toISOString(), ...r } as Registro;
  if (!usaPlanilha()) {
    memoria.push(row);
    return row;
  }
  const values = [COLS.map((c) => String(row[c] ?? "").slice(0, 2000))];
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetsId}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) },
  );
  return row;
}

export async function listar(): Promise<Registro[]> {
  if (!usaPlanilha()) return [...memoria];
  const r = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${config.sheetsId}/values/A:K`);
  const rows: string[][] = r.values || [];
  return rows
    .filter((row) => row[0] && row[0] !== "id")
    .map((row) => Object.fromEntries(COLS.map((c, i) => [c, row[i] ?? ""])) as Registro);
}

export async function painel() {
  const regs = await listar();
  const perguntas = regs.filter((r) => r.tipo === "pergunta");
  const feedback = new Map(regs.filter((r) => r.tipo === "feedback").map((r) => [r.ref!, r.feedback!]));
  const resolvidas = new Set(regs.filter((r) => r.tipo === "resolvida").map((r) => r.ref!));
  const escalacoes = regs
    .filter((r) => r.tipo === "escalacao")
    .map((e) => ({ ...e, aberta: !resolvidas.has(e.id) }))
    .reverse();

  const avaliadas = perguntas.filter((p) => feedback.has(p.id));
  const positivas = avaliadas.filter((p) => feedback.get(p.id) === "up").length;
  const respondidas = perguntas.filter((p) => p.status === "respondida").length;

  const contagem: Record<string, number> = {};
  perguntas.forEach((p) => (p.fontes || "").split(" | ").filter(Boolean).forEach((f) => (contagem[f] = (contagem[f] || 0) + 1)));

  return {
    armazenamento: usaPlanilha() ? "planilha" : "memoria",
    total: perguntas.length,
    taxaRespondidas: perguntas.length ? respondidas / perguntas.length : null,
    taxaPositivas: avaliadas.length ? positivas / avaliadas.length : null,
    abertas: escalacoes.filter((e) => e.aberta).length,
    escalacoes,
    topDocs: Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 6),
    recentes: perguntas.slice(-8).reverse().map((p) => ({ pergunta: p.pergunta, status: p.status, data: p.data })),
  };
}
