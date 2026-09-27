"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "../components/Header";

type Escalacao = { id: string; data: string; pergunta: string; resposta?: string; nome?: string; contato?: string; aberta: boolean };
type Painel = {
  armazenamento: "planilha" | "memoria";
  total: number;
  taxaRespondidas: number | null;
  taxaPositivas: number | null;
  abertas: number;
  escalacoes: Escalacao[];
  topDocs: [string, number][];
  recentes: { pergunta: string; status: string; data: string }[];
};

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function RH() {
  const [senha, setSenha] = useState("");
  const [dados, setDados] = useState<Painel | null>(null);
  const [erro, setErro] = useState("");
  const [pedirSenha, setPedirSenha] = useState(false);

  const carregar = useCallback(async (s: string) => {
    const r = await fetch("/api/painel", { headers: { "x-rh-senha": s }, cache: "no-store" }).catch(() => null);
    if (!r) return setErro("Não foi possível carregar o painel.");
    if (r.status === 401) return setPedirSenha(true);
    const j = await r.json();
    if (!r.ok) return setErro(j.error || "Erro ao carregar o painel.");
    setPedirSenha(false);
    setErro("");
    setDados(j);
  }, []);

  useEffect(() => {
    let s = "";
    try { s = sessionStorage.getItem("rh-senha") || ""; } catch {}
    setSenha(s);
    carregar(s);
    const t = setInterval(() => carregar(s), 15000);
    return () => clearInterval(t);
  }, [carregar]);

  const resolver = async (id: string) => {
    await fetch("/api/painel", { method: "POST", headers: { "Content-Type": "application/json", "x-rh-senha": senha }, body: JSON.stringify({ id }) });
    carregar(senha);
  };

  const max = dados?.topDocs[0]?.[1] || 1;

  return (
    <div className="wrap">
      <Header atual="rh" />
      {pedirSenha ? (
        <form
          className="panel"
          style={{ maxWidth: 420, marginTop: 24 }}
          onSubmit={(e) => {
            e.preventDefault();
            try { sessionStorage.setItem("rh-senha", senha); } catch {}
            carregar(senha);
          }}
        >
          <h2>Acesso do RH</h2>
          <label htmlFor="senha" className="note">Senha do painel</label>
          <div className="row" style={{ marginTop: 6 }}>
            <input id="senha" type="password" className="field" value={senha} onChange={(e) => setSenha(e.target.value)} />
            <button className="primary" type="submit" style={{ flex: "none" }}>Entrar</button>
          </div>
        </form>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><div className="v">{dados?.total ?? 0}</div><div className="l">perguntas recebidas</div></div>
            <div className="kpi"><div className="v">{pct(dados?.taxaRespondidas ?? null)}</div><div className="l">respondidas pela base</div></div>
            <div className="kpi"><div className="v">{dados?.abertas ?? 0}</div><div className="l">encaminhamentos abertos</div></div>
            <div className="kpi"><div className="v">{pct(dados?.taxaPositivas ?? null)}</div><div className="l">avaliações “Resolveu”</div></div>
          </div>
          <div className="rh">
            <div className="panel">
              <h2>Encaminhamentos para o RH</h2>
              <ul className="tickets">
                {!dados?.escalacoes.length && (
                  <li className="empty">Nenhum encaminhamento ainda. Quando o agente não encontrar a resposta, o colaborador pode enviar a dúvida para cá.</li>
                )}
                {dados?.escalacoes.map((e) => (
                  <li key={e.id} className={`ticket ${e.aberta ? "" : "done"}`}>
                    <div className="spread">
                      <span className="q">{e.pergunta}</span>
                      <span className={`pill ${e.aberta ? "" : "ok"}`}>{e.aberta ? "aberta" : "resolvida"}</span>
                    </div>
                    <span className="meta">{e.nome || "Sem nome"}{e.contato ? ` · ${e.contato}` : ""} · {quando(e.data)}</span>
                    {e.resposta && <span className="note">Agente respondeu: {e.resposta.slice(0, 180)}{e.resposta.length > 180 ? "…" : ""}</span>}
                    {e.aberta && <div><button className="ghost" onClick={() => resolver(e.id)}>Marcar como resolvida</button></div>}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: "grid", gap: 24, alignContent: "start" }}>
              <div className="panel">
                <h2>Documentos mais consultados</h2>
                <div className="bars">
                  {!dados?.topDocs.length && <p className="empty">Aparece após as primeiras perguntas.</p>}
                  {dados?.topDocs.map(([k, v]) => (
                    <div className="bar" key={k}>
                      <div className="spread"><span>{k}</span><b>{v}</b></div>
                      <div className="track"><div className="fill" style={{ width: `${(100 * v) / max}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <h2>Últimas perguntas</h2>
                <ul className="recent">
                  {!dados?.recentes.length && <li className="empty">Sem perguntas ainda.</li>}
                  {dados?.recentes.map((p, i) => (
                    <li key={i} className="spread">
                      <span>{p.pergunta}</span>
                      <span className={`pill ${p.status === "respondida" ? "ok" : ""}`}>{p.status === "respondida" ? "base" : "sem resposta"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <p className="note" style={{ marginTop: 16 }}>
            {erro ||
              (dados?.armazenamento === "memoria"
                ? "Registros temporários (em memória). Configure SHEETS_ID para gravar na planilha do Google."
                : dados ? "Registros gravados na planilha “Guia Vértice - Registros”. Atualiza a cada 15 segundos." : "")}
          </p>
        </>
      )}
    </div>
  );
}
