# AgroIA — arquitetura

## Visão geral

```
Celular / navegador (Next.js client, mobile-first)
  │  fotos ──────────────► Supabase Storage (bucket privado plant-photos, pasta = user_id)
  │  login ──────────────► Supabase Auth (cookies via @supabase/ssr)
  │
  ▼
Next.js 16 (servidor)
  ├─ proxy.ts ............ renova sessão, protege páginas
  ├─ /api/chat ........... SSE: valida, limita, salva, chama o motor do assistente
  ├─ /api/transcribe ..... áudio → texto (ElevenLabs, opcional)
  ├─ /api/tts ............ resposta → áudio MP3 (ElevenLabs, opcional)
  ├─ /api/weather ........ previsão + alertas (Open-Meteo)
  ├─ /api/geocode ........ município/UF → coordenadas (Open-Meteo Geocoding)
  ├─ /api/conversations .. renomear/excluir (com fotos)
  ├─ /api/webhooks/whatsapp  verificação do webhook (recebimento: futuro)
  └─ Server Actions ...... salvar/excluir propriedade
        │
        ▼
  src/lib/ai/assistant.ts  ← motor independente de canal (web hoje, WhatsApp amanhã)
        ├─ Claude (streaming, visão, effort configurável, fallback em recusa)
        ├─ ferramenta consultar_previsao_tempo → Open-Meteo
        ├─ busca web restrita a domínios oficiais (opcional)
        └─ trechos da base de conhecimento (RAG) → Postgres (FTS português + pgvector)
```

## Modelo de dados (Postgres / Supabase)

| Tabela | Conteúdo | Acesso |
|---|---|---|
| `profiles` | nome de exibição (1:1 com `auth.users`, criado por gatilho) | dono |
| `properties` | propriedade: município/UF, coordenadas, área, atividade, sistema, culturas, animais (`jsonb`), observações, `share_with_ai` + `consent_updated_at` | dono |
| `conversations` | título, tema (`geral`, `diagnostico`, `agricultura`, `clima`, `pecuaria`, `produtividade`), canal | dono |
| `messages` | papel, texto, fotos (`attachments`), referências (`sources`), modo de entrada (texto/voz), status, modelo, tokens | dono (inserção só em conversa própria) |
| `channel_identities` | vínculo de telefone (WhatsApp) com o usuário | leitura do dono; escrita só pelo backend |
| `kb_documents` | publicação oficial: título, instituição, URL, ano, tipo, temas, checksum | leitura autenticada; escrita só com chave de serviço |
| `kb_chunks` | trechos com `tsvector` (português) e `vector(1024)` | idem |

Função `search_knowledge(query_text, query_embedding, match_count)`: busca híbrida com fusão por rank recíproco. Funciona só com texto (sem custo de embeddings) e melhora quando há embeddings.

Storage: bucket `plant-photos` privado, 5 MB por arquivo, JPEG/PNG/WebP; políticas restringem envio, leitura e exclusão à pasta `<user_id>/`.

A migração foi validada em Postgres (PGlite) com stubs de `auth`/`storage`: isolamento entre usuários em leitura, escrita, atualização e Storage; restrições de UF; busca textual, vetorial e consulta só com *stopwords*.

## Fluxos principais

### Chat (`POST /api/chat`, Server-Sent Events)
1. Autentica (cookie), valida o corpo (Zod), confere que as fotos estão na pasta do usuário e aplica o limite por usuário.
2. Cria ou valida a conversa; salva a mensagem do usuário.
3. Carrega em paralelo: últimas 40 mensagens, propriedade e trechos da base de conhecimento.
4. Monta o histórico: reenvia as imagens apenas das 2 mensagens mais recentes com fotos (custo/latência); as antigas viram nota textual. Na última mensagem adiciona a data de hoje e os trechos numerados `[n]`.
5. `runAssistant` transmite eventos `meta`, `status` (analisando / consultando clima / buscando em fontes oficiais / escrevendo), `delta`, `reset`, `done` ou `error`.
6. Salva a resposta com referências, status, modelo e tokens. Se o produtor interrompe, o parcial é salvo marcado como interrompido.

### Prompt e cache
- Prompt de sistema estável (com `cache_control`) + bloco por conversa (tema e, com consentimento, dados da propriedade). Itens que variam a cada pedido (data, trechos do RAG) vão no fim da última mensagem, preservando o cache.
- Regras de segurança no prompt: hipóteses com grau de confiança, nunca diagnóstico incerto como definitivo, sem produto/dose de defensivo (receituário agronômico, AGROFIT), sem medicamento/dose para animais, doenças de notificação obrigatória → serviço veterinário oficial, nunca inventar clima, números ou referências, separar "fonte técnica" de "avaliação da IA".

### Recusas e erros do provedor
- `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) quando o modelo suporta: se o modelo principal recusar por política, o servidor da Anthropic reexecuta no modelo recomendado. Desligável com `AI_REFUSAL_FALLBACK=false`.
- Se a cadeia inteira recusar (`stop_reason: "refusal"`), o parcial é descartado e o produtor recebe uma mensagem clara.
- Erros da API são convertidos em mensagens amigáveis (configuração, limite de uso, conexão, instabilidade) sem vazar detalhes.

### Fotos
Celular → `createImageBitmap` (corrige orientação) → redução para 1568 px, JPEG 85 % → upload direto ao Storage com a sessão do usuário (RLS) → caminho enviado ao `/api/chat` → servidor baixa com a sessão do usuário e envia ao modelo em base64.

### Voz
- Entrada: `MediaRecorder` (WebM/Opus ou MP4) → `/api/transcribe` → texto no campo para o produtor revisar antes de enviar. Sem ElevenLabs: Web Speech API (`pt-BR`). Sem nenhum: microfone oculto.
- Saída: `/api/tts` lê a mensagem do banco (RLS), remove Markdown e limita o tamanho → MP3. Sem ElevenLabs: `speechSynthesis` com voz `pt-BR`. Pergunta feita por voz → resposta lida automaticamente.

### Clima
`fetchForecast` pede à Open-Meteo condições atuais, horário (48 h) e diário (7 dias) com fuso automático; calcula umidade diária a partir do horário, alertas (geada ≤ 3 °C / provável ≤ 1 °C, granizo, chuva ≥ 30/50 mm, rajadas ≥ 50/75 km/h, calor ≥ 35/38 °C, semana seca) e janelas de pulverização (≤ 30 °C, UR ≥ 55 %, vento 3–10 km/h, chance de chuva ≤ 20 %, ≥ 2 h). Cache de 15 min. Falha → `WeatherUnavailableError`, nunca valores padrão.

## RAG — base de conhecimento confiável

- **Fontes**: publicações oficiais (Embrapa, MAPA, Emater e órgãos estaduais, universidades). Cada documento carrega instituição, URL e ano; sem isso a ingestão recusa o arquivo.
- **Ingestão**: `scripts/ingest-knowledge.mjs` lê `knowledge/**/*.md|txt` com cabeçalho, divide em trechos de ~1.400 caracteres com sobreposição, calcula checksum (idempotente) e grava trechos com ou sem embeddings (Voyage `voyage-3.5`, 1024 dimensões).
- **Consulta**: busca híbrida por pergunta; até 5 trechos entram numerados no prompt; a resposta cita `[n]` e o app lista como "Referências" apenas os trechos efetivamente citados.
- **Web oficial (opcional)**: ferramenta de busca do provedor restrita a domínios oficiais; resultados citados aparecem como referências com link.
- **Distinção técnica × IA**: o prompt exige marcar o que vem de fonte e o que é avaliação da IA.

## Segurança

- Segredos apenas no servidor (`src/lib/env.ts` com `server-only`); o cliente recebe `PublicCapabilities` (booleans).
- RLS em todas as tabelas; Storage privado por pasta; URLs assinadas de 1 h.
- Validação com Zod em todas as rotas e na Server Action; limites de tamanho (mensagem 4.000 caracteres, 4 fotos, áudio 10 MB, imagem 5 MB).
- Limite de taxa por usuário (mensagens salvas nos últimos 10 min) e limite em memória para voz.
- Redirecionamentos de login aceitam só caminhos internos.
- Markdown da IA renderizado sem HTML bruto; links externos com `noopener noreferrer nofollow`.
- Cabeçalhos HTTP de segurança em `next.config.ts`.

## Integração futura com WhatsApp

Já preparado:
- `runAssistant()` não depende de HTTP nem de React: recebe mensagens e devolve texto + referências.
- `conversations.channel` (`web` | `whatsapp`) e `channel_identities` (telefone E.164 verificado ↔ usuário).
- `GET /api/webhooks/whatsapp` responde ao *handshake* da Meta quando `WHATSAPP_ENABLED=true`.

Falta implementar:
1. `POST` do webhook: validar `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`; responder 200 rápido e processar em fila.
2. Vincular telefone: código de verificação enviado pelo WhatsApp e confirmado no app (grava `channel_identities`).
3. Mídia: baixar imagens/áudios pela Graph API, guardar no Storage, transcrever áudio com a mesma rota de voz.
4. Responder pela Cloud API (texto; áudio opcional via TTS), respeitando a janela de 24 h e os modelos de mensagem aprovados.
5. Uma chave de serviço no backend para agir em nome do usuário vinculado (sem sessão de navegador).

## Próximos passos sugeridos

- Ingerir um conjunto inicial de publicações da Embrapa por cultura (soja, milho, trigo, arroz, feijão, hortaliças, frutas, pastagens, pecuária).
- Alertas oficiais do INMET como fonte adicional no painel de clima.
- Histórico de chuva observada e balanço hídrico por propriedade.
- Avaliações das respostas (👍/👎) para curadoria e conjunto de avaliação.
- Modo offline para consulta das últimas respostas no campo.
