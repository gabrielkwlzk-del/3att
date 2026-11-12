# AgroIA

Assistente de inteligência artificial para produtores rurais brasileiros: tira dúvidas de agricultura e pecuária, analisa fotos de plantas, consulta a previsão do tempo real e personaliza as respostas com os dados da propriedade (quando o produtor autoriza).

> "Olá! Sou a AgroIA. Como posso ajudar você na sua propriedade hoje?"

## O que já funciona (MVP)

| Recurso | Como funciona | Integração real |
|---|---|---|
| Chat com IA | Respostas em streaming, histórico salvo por usuário, perguntas sugeridas, perguntas de esclarecimento | Claude (Anthropic) via `@anthropic-ai/sdk` |
| Análise de fotos | Foto reduzida no celular → Storage privado → análise com hipóteses, grau de confiança, como confirmar e quando chamar o agrônomo | Claude (visão) + Supabase Storage |
| Mensagens de voz | Gravação no navegador → transcrição no servidor; sem servidor de voz, usa o ditado do navegador | ElevenLabs (opcional) ou Web Speech API |
| Respostas em áudio | Botão "Ouvir" e leitura automática quando a pergunta foi feita por voz | ElevenLabs (opcional) ou síntese de voz do navegador |
| Clima | Previsão de 7 dias, condições atuais, alertas de geada / chuva forte / vento / calor / semana seca, janelas de pulverização em 48 h | Open-Meteo (sem chave) |
| Clima no chat | A IA chama uma ferramenta de previsão real; se a API falhar, diz que está indisponível | Open-Meteo |
| Pecuária | Seção por espécie com perguntas frequentes e avisos de limite (veterinário, doenças de notificação obrigatória) | Claude |
| Perfil da propriedade | Nome, município/UF, coordenadas, área, atividade, sistema, culturas, animais, observações e **consentimento** para uso na IA | Supabase + IBGE (lista de municípios) |
| Referências | Base de conhecimento técnico (RAG) com busca textual em português + vetorial opcional; busca na web restrita a domínios oficiais | Postgres/pgvector, Voyage AI (opcional), busca web da Anthropic |
| Autenticação | E-mail e senha ou link de acesso por e-mail | Supabase Auth |
| Modo claro/escuro, mobile-first, PWA instalável | | |

Nada é simulado: sem chave de IA o chat avisa que não está configurado; sem previsão disponível o painel mostra o erro, nunca números inventados; sem documentos ingeridos a base de conhecimento simplesmente não retorna trechos.

## Stack

- **Next.js 16** (App Router, `proxy.ts`) + **TypeScript** + **Tailwind CSS 4**
- **Supabase**: Auth, Postgres com RLS, Storage privado, pgvector
- **Claude** (modelo configurável em `AI_MODEL`, padrão `claude-opus-5-5`) com streaming, visão, ferramenta de clima, busca em fontes oficiais e *fallback* automático em caso de recusa por política
- **Open-Meteo** para clima e geocodificação; **IBGE** para a lista de municípios
- **ElevenLabs** (opcional) para transcrição e voz

Arquitetura, modelo de dados e decisões: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Como rodar

Pré-requisitos: Node.js 20.9+ e um projeto no [Supabase](https://supabase.com).

1. **Instale as dependências**
   ```bash
   npm install
   ```
2. **Crie o banco**: no Supabase, abra *SQL Editor* e execute o conteúdo de
   [`supabase/migrations/20261112000000_init.sql`](supabase/migrations/20261112000000_init.sql)
   (ou `supabase db push` com a CLI). Isso cria tabelas, políticas RLS, a função de busca da base de conhecimento e o bucket privado `plant-photos`.
3. **Configure a autenticação** (*Authentication › URL Configuration*):
   - *Site URL*: a URL do app (ex.: `http://localhost:3000`)
   - *Redirect URLs*: `http://localhost:3000/auth/callback` e a URL de produção equivalente
   - Para cadastro por e-mail e senha sem confirmação, desative *Confirm email*; com confirmação, o usuário recebe um link que volta para `/auth/callback`.
4. **Variáveis de ambiente**: copie `.env.example` para `.env.local` e preencha. Mínimo:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`.
5. **Rode**
   ```bash
   npm run dev
   ```
   Abra http://localhost:3000 (no celular, use o IP da máquina na mesma rede; microfone e câmera exigem HTTPS fora de `localhost`).

### Recursos opcionais

- **Busca em fontes oficiais** (`AI_WEB_SEARCH=true`): a ferramenta de busca na web precisa estar habilitada pelo administrador no Console da Anthropic. As buscas ficam restritas a `embrapa.br`, `gov.br`, `scielo.br` e universidades públicas (lista em `src/lib/ai/assistant.ts`). Há custo por busca.
- **Voz no servidor**: defina `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` (ID de uma voz da sua conta). Sem eles, o app usa o reconhecimento e a síntese de voz do próprio navegador quando disponíveis; se nenhum existir, o botão de microfone não aparece.
- **Base de conhecimento**: adicione publicações oficiais em `knowledge/` e rode `npm run kb:ingest` (precisa de `SUPABASE_SERVICE_ROLE_KEY`; com `VOYAGE_API_KEY` também grava embeddings). Veja [`knowledge/README.md`](knowledge/README.md).

## Scripts

| Comando | Para quê |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | Gera tipos de rotas e roda o TypeScript |
| `npm run kb:ingest` | Ingere documentos de `knowledge/` na base de conhecimento |

## Deploy

Funciona em qualquer hospedagem Node.js. Na Vercel: importe o repositório, defina o *Root Directory* como `agroia`, cadastre as variáveis de ambiente e adicione a URL de produção nas *Redirect URLs* do Supabase. A rota de chat usa `maxDuration = 300` para respostas longas.

## Segurança e privacidade

- Chaves de IA, voz e serviço ficam **somente no servidor**; o navegador recebe apenas booleans de "recurso disponível".
- Todas as tabelas de usuário usam **Row Level Security**; fotos ficam em bucket **privado**, na pasta do próprio usuário, exibidas por URLs assinadas de 1 hora.
- O `proxy.ts` renova a sessão e protege as páginas; cada rota de API valida o usuário e o corpo da requisição (Zod).
- Limite de mensagens por usuário (`RATE_LIMIT_MESSAGES_PER_10_MIN`) e de pedidos de voz.
- Dados da propriedade só entram no contexto da IA com consentimento explícito (`share_with_ai`), registrado com data.
- Cabeçalhos de segurança (HSTS, `nosniff`, `X-Frame-Options`, `Permissions-Policy`).
- Página `/privacidade` com o resumo de tratamento de dados (complete com os dados do controlador antes de publicar).

## Limites conhecidos

- A análise por foto gera hipóteses, não laudos; a IA é instruída a não indicar produtos, doses de defensivos ou medicamentos.
- Alertas de clima são calculados pela AgroIA a partir da previsão numérica (não são alertas oficiais do INMET/Defesa Civil).
- A base de conhecimento começa vazia: a qualidade das referências depende dos documentos oficiais que você ingerir.
- Integração com WhatsApp: estrutura pronta (motor independente de canal, tabela `channel_identities`, webhook de verificação), recebimento de mensagens ainda não implementado.
