# Guia Vértice

Agente de onboarding do Grupo Vértice (empresa fictícia, trabalho de Big Data e IA, UniCEUB).
O funcionário faz perguntas num site. O agente busca e lê os documentos da pasta **Vértice - Base RH** no Google Drive e responde citando a fonte. O que não está nos documentos vai para o RH.

- **IA:** Groq (padrão `openai/gpt-oss-120b`), via Vercel AI SDK com ferramentas (tool calling)
- **Base de conhecimento:** Google Drive (pasta "Vértice - Base RH"), com cópia local em `base/` como reserva
- **Registros:** planilha "Guia Vértice - Registros" no Google Sheets
- **Site:** Next.js, com deploy na Vercel

## Como funciona (RAG com ferramentas)

1. A pergunta chega em `/api/chat` junto com a lista de documentos da pasta.
2. O modelo do Groq chama `buscar_na_base` (busca por palavras dentro da pasta no Drive).
3. Depois chama `ler_documento` (exporta o Google Doc inteiro como texto).
4. Responde com base no texto lido. O site mostra os documentos usados como fonte.
5. A pergunta, o status (respondida ou sem resposta) e as fontes vão para a planilha. O Painel do RH (`/rh`) lê essa planilha.

## Rodar no computador

Precisa do Node.js 20 ou mais novo.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. O arquivo `.env.local` já tem a chave do Groq.
Sem a conta de serviço do Google, o app usa a cópia local dos documentos (aparece "cópia local" no painel lateral).

Para conferir tudo: http://localhost:3000/api/health

## Ligar no Google Drive ao vivo (conta de serviço, ~10 minutos)

1. Acesse https://console.cloud.google.com e crie um projeto (por exemplo, `guia-vertice`).
2. Em **APIs e serviços → Biblioteca**, ative **Google Drive API** e **Google Sheets API**.
3. Em **IAM e administrador → Contas de serviço**, clique em **Criar conta de serviço**, dê o nome `guia-vertice` e conclua (não precisa de papel).
4. Abra a conta criada → aba **Chaves** → **Adicionar chave → Criar nova chave → JSON**. Um arquivo `.json` será baixado.
5. Copie o e-mail da conta de serviço (termina em `iam.gserviceaccount.com`).
6. No Google Drive:
   - compartilhe a pasta **Vértice - Base RH** com esse e-mail como **Leitor**;
   - compartilhe a planilha **Guia Vértice - Registros** com esse e-mail como **Editor**.
7. Coloque o conteúdo do arquivo JSON em `GOOGLE_SERVICE_ACCOUNT_JSON` (tudo em uma linha, no `.env.local` ou na Vercel).

Depois disso o painel lateral mostra "Drive ao vivo" e qualquer mudança nos documentos aparece nas respostas em até 1 minuto.

## Publicar na Vercel

1. Suba esta pasta para um repositório no GitHub (o `.env.local` não sobe, está no `.gitignore`).
2. Em https://vercel.com → **Add New → Project**, importe o repositório.
3. Em **Environment Variables**, cadastre:
   - `GROQ_API_KEY`
   - `GOOGLE_SERVICE_ACCOUNT_JSON`
   - `RH_SENHA` (opcional, protege o Painel do RH)
4. Clique em **Deploy**. O site fica em `https://<nome-do-projeto>.vercel.app`. Um domínio próprio pode ser ligado em **Settings → Domains**.

Alternativa sem GitHub: `npx vercel` dentro da pasta e depois `npx vercel env add GROQ_API_KEY`.

## Estrutura

```
app/page.tsx              chat do funcionário
app/rh/page.tsx           painel do RH
app/api/chat/route.ts     agente (Groq + ferramentas)
app/api/base/route.ts     lista de documentos da pasta
app/api/escalar/route.ts  encaminhamento ao RH
app/api/feedback/route.ts avaliação "Resolveu / Não resolveu"
app/api/painel/route.ts   métricas do painel
app/api/health/route.ts   diagnóstico
lib/kb.ts                 base de conhecimento (Drive ou cópia local)
lib/registros.ts          registros na planilha
lib/prompt.ts             regras do agente
base/                     cópia local dos 12 documentos
```

## Problemas comuns

- **"O modelo não está disponível no Groq"**: abra `/api/health`, escolha um modelo da lista `modelos` e coloque em `GROQ_MODEL` (por exemplo `llama-3.3-70b-versatile`).
- **"Não consegui acessar a pasta do Google Drive"**: a pasta não foi compartilhada com o e-mail da conta de serviço, ou a Drive API não foi ativada.
- **Painel diz "registros temporários"**: a conta de serviço não está configurada ou a planilha não foi compartilhada como Editor.
