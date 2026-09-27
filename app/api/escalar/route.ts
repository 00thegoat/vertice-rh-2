import { registrar } from "@/lib/registros";

export async function POST(req: Request) {
  const b = await req.json();
  const nome = String(b.nome || "").trim().slice(0, 120);
  if (!nome || !b.pergunta) return Response.json({ error: "Informe seu nome." }, { status: 400 });
  let r;
  try {
  r = await registrar({
    tipo: "escalacao",
    ref: String(b.logId || ""),
    pergunta: String(b.pergunta).slice(0, 1000),
    resposta: String(b.resposta || "").slice(0, 1500),
    nome,
    contato: String(b.contato || "").trim().slice(0, 160),
  });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Não foi possível registrar o encaminhamento." }, { status: 502 });
  }
  return Response.json({ ok: true, id: r.id });
}
