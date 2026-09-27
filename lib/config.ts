// Todas as configurações vêm de variáveis de ambiente (.env.local ou painel da Vercel).

export const config = {
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  // Pasta "Vértice - Base RH" no Google Drive.
  driveFolderId: process.env.DRIVE_FOLDER_ID || "1ltkS6k1EoGDgoVRN9WTUuqjN_HUthxE9",
  driveFolderName: process.env.DRIVE_FOLDER_NAME || "Vértice - Base RH",
  // Planilha "Guia Vértice - Registros" (perguntas, avaliações e encaminhamentos).
  sheetsId: process.env.SHEETS_ID || "109EH6_8RWqRbM9sPi6Rg7oasLBaHOZY0xKmeUM9TnXM",
  // Senha simples para o painel do RH. Vazio = painel aberto.
  rhSenha: process.env.RH_SENHA || "",
};

export type ServiceAccount = { client_email: string; private_key: string };

export function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      const json = JSON.parse(text);
      if (json.client_email && json.private_key) {
        return { client_email: json.client_email, private_key: String(json.private_key).replace(/\\n/g, "\n") };
      }
    } catch {
      console.error("GOOGLE_SERVICE_ACCOUNT_JSON inválido: cole o JSON inteiro da chave da conta de serviço.");
    }
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  return null;
}
