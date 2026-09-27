import Link from "next/link";

export default function Header({ atual }: { atual: "chat" | "rh" }) {
  return (
    <header className="top">
      <Link href="/" className="brand">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <path d="M17 2 32 17 17 32 2 17Z" fill="none" stroke="var(--ink)" strokeWidth="2.4" />
          <path d="M11 12 17 24 23 12" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div>
          <h1>Guia Vértice</h1>
          <p>Onboarding · Grupo Vértice</p>
        </div>
      </Link>
      <nav className="tabs">
        <Link href="/" aria-current={atual === "chat" ? "page" : undefined}>Perguntar</Link>
        <Link href="/rh" aria-current={atual === "rh" ? "page" : undefined}>Painel do RH</Link>
      </nav>
    </header>
  );
}
