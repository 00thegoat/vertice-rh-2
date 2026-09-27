import { createGroq } from "@ai-sdk/groq";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { randomUUID } from "crypto";
import { z } from "zod";
import { config } from "@/lib/config";
import { getKB } from "@/lib/kb";
import { systemPrompt } from "@/lib/prompt";
import { registrar } from "@/lib/registros";

export const maxDuration = 60;

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY, baseURL: process.env.GROQ_BASE_URL || undefined });

function textOf(m: UIMessage | undefined) {
  return (m?.parts || []).map((p: any) => (p.type === "text" ? p.text : "")).join("").trim();
}

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "GROQ_API_KEY não configurada no servidor." }, { status: 500 });
  }
  const { messages }: { messages: UIMessage[] } = await req.json();
  const kb = getKB();
  const docs = await kb.list();
  const logId = randomUUID();
  const pergunta = textOf([...messages].reverse().find((m) => m.role === "user")).slice(0, 1000);
  const lidos = new Map<string, string>();

  const result = streamText({
    model: groq(config.groqModel),
    system: systemPrompt(docs),
    messages: await convertToModelMessages(messages.slice(-8)),
    temperature: 0.2,
    stopWhen: stepCountIs(6),
    tools: {
      buscar_na_base: tool({
        description:
          "Busca por palavras-chave dentro dos documentos da pasta de onboarding do RH. Retorna até 5 documentos com id, título e um trecho. Use termos curtos (1 a 3 palavras), por exemplo 'férias', 'vale refeição', 'reembolso'.",
        inputSchema: z.object({ termos: z.string().describe("Palavras-chave da busca") }),
        execute: async ({ termos }) => {
          const hits = await kb.search(String(termos).slice(0, 80));
          return hits.map((h) => ({ id: h.id, titulo: h.title, trecho: h.trecho }));
        },
      }),
      ler_documento: tool({
        description: "Lê o texto completo de um documento da pasta pelo id. Use depois de identificar o documento certo.",
        inputSchema: z.object({ id: z.string().describe("id do documento") }),
        execute: async ({ id }) => {
          const { doc, conteudo } = await kb.read(String(id));
          lidos.set(doc.id, doc.title);
          return { id: doc.id, titulo: doc.title, url: doc.url, conteudo: conteudo.slice(0, 14000) };
        },
      }),
    },
    onFinish: async ({ text }) => {
      const status = /\[\[\s*status:\s*respondida/i.test(text) ? "respondida" : "sem_resposta";
      try {
        await registrar({
          id: logId,
          tipo: "pergunta",
          pergunta,
          status,
          fontes: [...lidos.values()].join(" | "),
          resposta: text.split("[[")[0].trim().slice(0, 1500),
        });
      } catch (e) {
        console.error("Falha ao registrar pergunta:", e);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: false,
    messageMetadata: ({ part }) => (part.type === "start" ? { logId } : undefined),
    onError: (e) => {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (/model/i.test(msg) && /not.*found|decommission|does not exist/i.test(msg))
        return `O modelo "${config.groqModel}" não está disponível no Groq. Troque GROQ_MODEL (veja /api/health).`;
      if (/401|invalid api key/i.test(msg)) return "A chave do Groq foi recusada. Confira GROQ_API_KEY.";
      if (/429|rate/i.test(msg)) return "Limite de uso do Groq atingido. Aguarde alguns segundos e tente de novo.";
      if (/Google API/i.test(msg)) return "Não consegui acessar a pasta do Google Drive. Veja /api/health.";
      return "A resposta foi interrompida. Tente de novo.";
    },
  });
}
