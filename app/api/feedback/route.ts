import { registrar } from "@/lib/registros";

export async function POST(req: Request) {
  const { logId, feedback } = await req.json();
  if (!logId || !["up", "down"].includes(feedback)) return Response.json({ error: "Dados inválidos" }, { status: 400 });
  try {
    await registrar({ tipo: "feedback", ref: String(logId), feedback });
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Não foi possível gravar a avaliação." }, { status: 502 });
  }
}
