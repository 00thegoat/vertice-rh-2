import { config } from "@/lib/config";
import { getKB } from "@/lib/kb";

export const dynamic = "force-dynamic";

export async function GET() {
  const kb = getKB();
  try {
    const docs = await kb.list();
    return Response.json({
      modo: kb.mode,
      pasta: config.driveFolderName,
      docs: docs.map(({ id, title, url, mimeType }) => ({ id, title, url, mimeType })),
    });
  } catch (e) {
    return Response.json({ modo: kb.mode, pasta: config.driveFolderName, docs: [], erro: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
