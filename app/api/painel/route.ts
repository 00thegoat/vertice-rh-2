import { config } from "@/lib/config";
import { painel, registrar } from "@/lib/registros";

export const dynamic = "force-dynamic";

function autorizado(req: Request) {
  return !config.rhSenha || req.headers.get("x-rh-senha") === config.rhSenha;
}

export async function GET(req: Request) {
  if (!autorizado(req)) return Response.json({ error: "Senha do RH incorreta." }, { status: 401 });
  try {
    return Response.json(await painel());
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}

// Marca um encaminhamento como resolvido.
export async function POST(req: Request) {
  if (!autorizado(req)) return Response.json({ error: "Senha do RH incorreta." }, { status: 401 });
  const { id } = await req.json();
  if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });
  try {
    await registrar({ tipo: "resolvida", ref: String(id) });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
