"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Header from "./components/Header";

type Doc = { id: string; title: string; url: string; mimeType?: string };
type Base = { modo: "drive" | "local"; pasta: string; docs: Doc[]; erro?: string };

const SUGESTOES = [
  "Como solicito férias?",
  "Como funciona o vale-refeição?",
  "Qual a política de home office?",
  "Quem aprova meu reembolso?",
  "O que acontece na minha primeira semana?",
];

const tipo = (m?: string) =>
  !m ? "DOC" : /document/.test(m) ? "DOC" : /spreadsheet/.test(m) ? "PLAN" : /pdf/.test(m) ? "PDF" : "ARQ";

function textOf(m: UIMessage) {
  return m.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
}
const limpar = (t: string) => t.split("[[")[0].trim();
const semResposta = (t: string) => /\[\[\s*status:\s*sem_resposta/i.test(t);

export default function Page() {
  const [base, setBase] = useState<Base | null>(null);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const ocupado = status === "submitted" || status === "streaming";

  useEffect(() => {
    fetch("/api/base")
      .then((r) => r.json())
      .then(setBase)
      .catch(() => setBase({ modo: "drive", pasta: "", docs: [], erro: "Não foi possível carregar a base." }));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, status]);

  const perguntar = (texto: string) => {
    const t = texto.trim();
    if (!t || ocupado) return;
    sendMessage({ text: t });
    setInput("");
  };

  return (
    <div className="wrap">
      <Header atual="chat" />
      <div className="grid">
        <div className="chat">
          <div className="log" ref={logRef} aria-live="polite">
            <div className="msg bot">
              <span className="who">Guia Vértice</span>
              <div className="bubble">
                <p>Olá! Sou o <strong>Guia Vértice</strong>, o assistente de onboarding do Grupo Vértice.</p>
                <p>
                  Posso ajudar com férias, benefícios, políticas internas, onde encontrar documentos e quem é responsável por cada
                  processo. Eu respondo com base nos documentos oficiais da pasta do RH e mostro de onde tirei a informação.
                </p>
              </div>
            </div>

            {messages.map((m, i) => {
              const pergunta = m.role === "assistant" ? textOf(messages[i - 1] || m) : "";
              const final = m.role === "assistant" && (!ocupado || i < messages.length - 1);
              return m.role === "user" ? (
                <div className="msg user" key={m.id}>
                  <span className="who">Você</span>
                  <div className="bubble">{textOf(m)}</div>
                </div>
              ) : (
                <Resposta key={m.id} m={m} pergunta={pergunta} final={final} />
              );
            })}

            {status === "submitted" && (
              <div className="msg bot">
                <span className="who">Guia Vértice</span>
                <div className="steps"><span className="step live">Pensando…</span></div>
              </div>
            )}
            {error && <p className="error">{error.message || "Algo deu errado. Tente de novo."}</p>}
          </div>

          {messages.length === 0 && (
            <div className="suggest">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" onClick={() => perguntar(s)}>{s}</button>
              ))}
            </div>
          )}

          <form
            className="ask"
            onSubmit={(e) => {
              e.preventDefault();
              if (ocupado) stop();
              else perguntar(input);
            }}
          >
            <label htmlFor="q" hidden>Sua pergunta</label>
            <textarea
              id="q"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  perguntar(input);
                }
              }}
              placeholder="Pergunte sobre férias, benefícios, políticas, processos…"
              rows={1}
            />
            <button className={`primary ${ocupado ? "stop" : ""}`} type="submit">{ocupado ? "Parar" : "Enviar"}</button>
          </form>
        </div>

        <aside>
          <div className="panel">
            <p className="eyebrow">Base de conhecimento</p>
            <StatusBase base={base} />
            <ul className="doclist">
              {base?.docs
                .slice()
                .sort((a, b) => a.title.localeCompare(b.title, "pt"))
                .map((d) => (
                  <li key={d.id}>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer"><span className="t">{tipo(d.mimeType)}</span>{d.title}</a>
                    ) : (
                      <span className="item"><span className="t">{tipo(d.mimeType)}</span>{d.title}</span>
                    )}
                  </li>
                ))}
            </ul>
            <p className="scope">O agente lê apenas os arquivos desta pasta do Drive. Nada fora dela é consultado.</p>
          </div>
          <div className="panel">
            <p className="eyebrow">Como o agente trabalha</p>
            <p className="note" style={{ margin: 0 }}>
              Busca na pasta, lê os documentos relevantes e responde citando a fonte. Se a resposta não estiver nos documentos,
              ele diz isso e oferece encaminhar ao RH.
            </p>
            <div className="level" aria-label="Nível de autonomia 3 de 4">
              <span>1 Informa</span><span>2 Recomenda</span><span className="on">3 Supervisão</span><span>4 Age só</span>
            </div>
            <p className="note" style={{ margin: "10px 0 0" }}>IA: Groq · Base: Google Drive</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatusBase({ base }: { base: Base | null }) {
  if (!base) return <div className="status"><span className="dot" /><span>Conectando à base…</span></div>;
  if (base.erro) return <div className="status"><span className="dot bad" /><span>{base.erro}</span></div>;
  const n = base.docs.length;
  return (
    <div className="status">
      <span className={`dot ${n ? "ok" : "warn"}`} />
      <span>
        {n} documento{n === 1 ? "" : "s"} {base.modo === "drive" ? `em “${base.pasta}”` : "(cópia local)"}
      </span>
      <span className="badge">{base.modo === "drive" ? "Drive ao vivo" : "cópia local"}</span>
    </div>
  );
}

function Resposta({ m, pergunta, final }: { m: UIMessage; pergunta: string; final: boolean }) {
  const texto = textOf(m);
  const logId = (m.metadata as any)?.logId as string | undefined;
  const [fb, setFb] = useState<"up" | "down" | null>(null);
  const [escalar, setEscalar] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");

  const passos = useMemo(
    () =>
      m.parts.flatMap((p: any) => {
        if (p.type === "tool-buscar_na_base") return [{ k: p.toolCallId, t: `Buscando “${p.input?.termos ?? "…"}” na base`, live: p.state !== "output-available" && p.state !== "output-error" }];
        if (p.type === "tool-ler_documento") return [{ k: p.toolCallId, t: `Lendo “${p.output?.titulo ?? "documento"}”`, live: p.state !== "output-available" && p.state !== "output-error" }];
        return [];
      }),
    [m.parts],
  );
  const fontes = useMemo(() => {
    const map = new Map<string, { titulo: string; url: string }>();
    m.parts.forEach((p: any) => {
      if (p.type === "tool-ler_documento" && p.state === "output-available" && p.output) map.set(p.output.id, { titulo: p.output.titulo, url: p.output.url });
    });
    return [...map.values()];
  }, [m.parts]);

  useEffect(() => {
    if (final && semResposta(texto)) setEscalar(true);
  }, [final, texto]);

  const avaliar = (v: "up" | "down") => {
    setFb(v);
    if (v === "down") setEscalar(true);
    if (logId) fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logId, feedback: v }) });
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    const r = await fetch("/api/escalar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId, pergunta, resposta: limpar(texto), nome, contato }),
    }).catch(() => null);
    if (r?.ok) setEnviado(true);
    else setErro("Não foi possível enviar agora. Tente de novo.");
  };

  return (
    <div className="msg bot">
      <span className="who">Guia Vértice</span>
      {passos.length > 0 && (
        <div className="steps">
          {passos.map((s) => <span key={s.k} className={`step ${s.live ? "live" : ""}`}>{s.t}</span>)}
        </div>
      )}
      {limpar(texto) && (
        <div className="bubble">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>
            {limpar(texto)}
          </ReactMarkdown>
        </div>
      )}
      {final && (
        <>
          {fontes.length > 0 && (
            <div className="sources">
              <span className="lbl">Fontes</span>
              {fontes.map((f) =>
                f.url ? (
                  <a key={f.titulo} className="chip" href={f.url} target="_blank" rel="noopener noreferrer"><span className="doc" />{f.titulo}</a>
                ) : (
                  <span key={f.titulo} className="chip"><span className="doc" />{f.titulo}</span>
                ),
              )}
            </div>
          )}
          <div className="actions">
            <button className="ghost" aria-pressed={fb === "up"} onClick={() => avaliar("up")}>Resolveu</button>
            <button className="ghost" aria-pressed={fb === "down"} onClick={() => avaliar("down")}>Não resolveu</button>
            <button className="ghost" onClick={() => setEscalar(true)}>Encaminhar ao RH</button>
          </div>
          {escalar &&
            (enviado ? (
              <p className="note">Enviado. O RH vai responder pelo contato informado.</p>
            ) : (
              <form className="escal" onSubmit={enviar}>
                <strong style={{ fontSize: ".92rem" }}>Enviar esta dúvida ao RH</strong>
                <div className="row">
                  <label>Seu nome<input id={`n-${m.id}`} required value={nome} onChange={(e) => setNome(e.target.value)} /></label>
                  <label>E-mail ou ramal<input id={`c-${m.id}`} value={contato} onChange={(e) => setContato(e.target.value)} /></label>
                </div>
                <div><button className="primary" type="submit" style={{ minHeight: 36 }}>Enviar ao RH</button></div>
                {erro && <p className="error">{erro}</p>}
              </form>
            ))}
        </>
      )}
    </div>
  );
}
