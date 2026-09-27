import { JWT } from "google-auth-library";
import { serviceAccount } from "./config";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

let client: JWT | null = null;

export function hasGoogle() {
  return serviceAccount() !== null;
}

async function token(): Promise<string> {
  const sa = serviceAccount();
  if (!sa) throw new Error("Conta de serviço do Google não configurada.");
  if (!client) client = new JWT({ email: sa.client_email, key: sa.private_key, scopes: SCOPES });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Não foi possível obter o token do Google.");
  return token;
}

/** Chamada autenticada às APIs REST do Google. Devolve JSON ou texto. */
export async function googleFetch(url: string, init: RequestInit = {}, as: "json" | "text" = "json") {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${await token()}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google API ${res.status}: ${body.slice(0, 300)}`);
  }
  return as === "json" ? res.json() : res.text();
}
