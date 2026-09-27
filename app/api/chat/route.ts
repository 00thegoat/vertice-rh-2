import { createGroq } from "@ai-sdk/groq";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { randomUUID } from "crypto";
import { z } from "zod";
import { config } from "@/lib/config";
import { getKB } from "@/lib/kb";
import { systemPrompt } from "@/lib/prompt";
import { registrar } from "@/lib/registros";

export const maxDuration = 60;

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY?.trim(), baseURL: process.env.GROQ_BASE_URL || undefined });

function mensagemDeErro(e: unknown) {
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  if (/model/i.test(msg) && /not.*found|decommission|does not exist/i.test(msg))
    return `O modelo "${config.groqModel}" não está disponível no Groq. Troque GROQ_MODEL (veja /api/health).`;
  // 429 antes de 401: a mensagem de limite traz números ("Used 7401") que casariam com /401/.
  if (/429|rate.?limit|tokens per minute/i.test(msg)) return "Limite de uso do Groq atingido. Aguarde alguns segundos e tente de novo.";
  if (/\b401\b|invalid api key/i.test(msg)) return "A chave do Groq foi recusada. Confira GROQ_API_KEY.";
  if (/Google API/i.test(msg)) return "Não consegui acessar a pasta do Google Drive. Veja /api/health.";
  return "A resposta foi interrompida. Tente de novo.";
}

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

  const system = systemPrompt(docs);
  const modelMessages = await convertToModelMessages(messages.slice(-8));

  const stream = createUIMessageStream({
    onError: mensagemDeErro,
    execute: async ({ writer }) => {
      const busca = streamText({
        model: groq(config.groqModel),
        system,
        messages: modelMessages,
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
      });
      // Repassa os chunks em sequência (e não com merge) para o "finish" sair sempre por último.
      for await (const chunk of busca.toUIMessageStream({
        sendReasoning: false,
        sendFinish: false,
        messageMetadata: ({ part }) => (part.type === "start" ? { logId } : undefined),
        onError: mensagemDeErro,
      })) {
        writer.write(chunk);
      }

      let texto = "";
      try {
        texto = await busca.text;
      } catch {
        writer.write({ type: "finish" });
        return; // o erro já foi enviado ao site no laço acima
      }

      // O modelo às vezes para depois de ler os documentos sem escrever nada.
      // Nesse caso, pede a resposta final numa chamada sem ferramentas.
      if (!texto.trim()) {
        const resposta = streamText({
          model: groq(config.groqModel),
          system,
          messages: [
            ...modelMessages,
            ...(await busca.responseMessages),
            { role: "user", content: "Com base nos documentos que você já leu acima, escreva agora a resposta final para a minha pergunta, seguindo as regras." },
          ],
          temperature: 0.2,
        });
        for await (const chunk of resposta.toUIMessageStream({ sendStart: false, sendReasoning: false, onError: mensagemDeErro })) {
          writer.write(chunk);
        }
        texto = await resposta.text.then((t) => t, () => "");
      } else {
        writer.write({ type: "finish" });
      }

      const status = /\[\[\s*status:\s*respondida/i.test(texto) ? "respondida" : "sem_resposta";
      try {
        await registrar({
          id: logId,
          tipo: "pergunta",
          pergunta,
          status,
          fontes: [...lidos.values()].join(" | "),
          resposta: texto.split("[[")[0].trim().slice(0, 1500),
        });
      } catch (e) {
        console.error("Falha ao registrar pergunta:", e);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
