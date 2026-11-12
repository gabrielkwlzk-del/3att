# Assinaturas da AgroIA (Cakto)

Estado atual: **estrutura pronta, checkout e webhook por ligar.** Nada limita o uso até você definir `BILLING_ENABLED=true`.

## Planos e valores

| Plano | Mensal | Anual | Perguntas/mês | Fotos/mês | Modelo de IA (sugestão) |
|---|---|---|---|---|---|
| **Semente** (grátis) | — | — | 10 | 2 | Haiku 5.5 (foto: Opus 5.5) |
| **Produtor** | R$ 39,90 | R$ 399,00 (≈ R$ 33,25/mês, −17%) | 100 | 20 | Sonnet 5.5 (foto: Opus 5.5) |
| **Fazenda** | R$ 149,90 | R$ 1.499,00 (≈ R$ 124,92/mês, −17%) | 400 | 60 | Sonnet 5.5 (foto: Opus 5.5) |

Tudo isso mora em [`src/lib/billing/plans.ts`](../src/lib/billing/plans.ts) (valores em centavos). Mudou o preço? Altere lá **e** na oferta da Cakto.

**Fazenda: três itens ainda não existem no app** (até 5 propriedades, 3 pessoas da equipe, atendimento pelo WhatsApp). Aparecem na tela com o selo "Em breve". Hoje o diferencial real do plano é o limite maior. Construa esses recursos ou ajuste o preço/descrição antes de vender como prometido.

### Custo de IA × margem (estimativas, não medições)

Custo por uso, com conversas de tamanho médio e US$ 1 ≈ R$ 5,50: texto no Sonnet ≈ R$ 0,15; texto no Haiku ≈ R$ 0,01; análise com 3 fotos no Opus ≈ R$ 0,56. Busca em fontes oficiais soma R$ 0,15–0,30 por pergunta que a usa (desligada no Haiku).

| | Custo se usar 100% do limite | Receita mensal | Sobra antes da taxa da Cakto |
|---|---|---|---|
| Teste de 3 dias | ≈ R$ 3,90 (15 perguntas + 3 fotos) | 0 | −R$ 3,90 (custo de aquisição) |
| Semente | ≈ R$ 1,20 | 0 | −R$ 1,20 |
| Produtor mensal | ≈ R$ 26 | R$ 39,90 | ≈ R$ 13,70 |
| Produtor anual | ≈ R$ 26 | R$ 33,25 | ≈ R$ 7,00 |
| Fazenda mensal | ≈ R$ 94 | R$ 149,90 | ≈ R$ 56 |
| Fazenda anual | ≈ R$ 94 | R$ 124,92 | ≈ R$ 31 |

A maioria dos usuários não esgota o limite. O app grava os tokens de cada resposta (`messages.input_tokens` / `output_tokens`): depois de 2 a 4 semanas de uso real, calcule o custo verdadeiro por usuário e reajuste limites e preços.

**Taxas da Cakto:** não verifiquei. Confira no painel (percentual + valor fixo por venda, e prazos de repasse) e calcule: `líquido = preço × (1 − taxa%) − taxa fixa`. No Produtor anual a sobra é pequena, então vale conferir.

## Teste grátis de 3 dias

- **Sem cartão**, criado pelo próprio app (não depende de recurso da Cakto).
- **O relógio começa na primeira pergunta**, não no cadastro: o produtor que se cadastra e só usa depois não perde o teste.
- Durante o teste vale o plano **Produtor com limite reduzido: 15 perguntas e 3 fotos** (para conter o custo de IA).
- Ao terminar sem assinar, a conta cai no plano **Semente** (nada é apagado; o histórico continua).
- A duração está fixada no banco (`start_trial()` usa `interval '3 days'`): o usuário não consegue estendê-la. Se mudar `TRIAL_DAYS` em `plans.ts`, mude também a função SQL.
- **Abuso:** o teste é por conta. Para dificultar contas descartáveis, ative *Confirm email* no Supabase. Quem criar vários e-mails ainda consegue vários testes; se virar problema, o próximo passo é amarrar o teste a um telefone verificado.

Estados da conta (calculados pelas datas, sem cron): `trial_not_started`, `trial_active`, `trial_ended`, `paid`, `grace`, `canceled_active`, `free`. Regras:

- Pagamento atrasado (`past_due`) ou renovação que não chegou: **3 dias de tolerância** após o fim do período, depois volta ao Semente.
- Cancelada: usa até o fim do período já pago.
- Reembolso/chargeback: acesso termina na hora.
- Plano anual tem limite **mensal** (renovado todo mês de assinatura).

## Como ativar (quando for adicionar o checkout)

1. **Banco:** rode `supabase/migrations/20261113000000_billing.sql` no SQL Editor (depois da migração inicial). Usuários já existentes ganham um teste ainda não iniciado.
2. **Cakto:** crie as 4 ofertas de assinatura: Produtor mensal, Produtor anual, Fazenda mensal, Fazenda anual, com os valores da tabela acima. Anote o **link de checkout** e o **ID** de cada oferta.
3. **Variáveis de ambiente** (`.env.example` tem todas):
   - `CAKTO_CHECKOUT_URL_*` (4 links https) → os botões "Assinar" passam a aparecer em `/plano`.
   - `CAKTO_OFFER_*` (4 IDs) → o webhook identifica o plano comprado.
   - `CAKTO_WEBHOOK_TOKEN` (valor longo e aleatório: `openssl rand -hex 32`) e `SUPABASE_SERVICE_ROLE_KEY`.
   - `AI_MODEL_SEMENTE`, `AI_MODEL_PRODUTOR`, `AI_MODEL_FAZENDA`, `AI_MODEL_VISION` (ou deixe vazio para usar só `AI_MODEL`).
4. **Webhook:** na Cakto, cadastre `https://SEU-DOMINIO/api/webhooks/cakto?token=<CAKTO_WEBHOOK_TOKEN>` e marque os eventos de assinatura (compra aprovada, renovação, atraso, cancelamento, reembolso).
5. **Mapeamento (único código a escrever):** dispare um evento de teste, abra a tabela `billing_events` no Supabase e leia a coluna `raw`: é o formato real do aviso. Implemente `parseCaktoPayload` em [`src/lib/billing/cakto.ts`](../src/lib/billing/cakto.ts) para devolver `{ eventId, kind, email, plan, interval, … }`. Enquanto devolver `null`, os avisos só ficam registrados (`note = 'unmapped'`) e nenhuma conta é alterada.
6. **Ligue:** `BILLING_ENABLED=true` e reinicie.
7. **Teste de ponta a ponta:** conta nova → primeira pergunta (teste começa) → compra de teste na Cakto com o mesmo e-mail → conferir em `/plano`.

> Não verifiquei a documentação da Cakto (formato do webhook, assinatura do aviso, suporte a período de teste nativo, preenchimento do e-mail no checkout). Por isso o teste é do app e o mapeamento é a única peça a preencher. Se a Cakto assinar o corpo do aviso (HMAC), valide a assinatura no webhook além do token.

## Como o app protege as assinaturas

- O usuário só **lê** a própria assinatura; ninguém altera plano ou datas pelo navegador (RLS sem política de escrita, validado em Postgres). Quem escreve é o webhook (chave de serviço).
- O webhook exige o token (comparação em tempo constante), guarda o corpo bruto de cada evento e é idempotente (`billing_events` tem `unique(provider, event_id)`; reenvio idêntico não é aplicado duas vezes).
- O limite é conferido no servidor (`/api/chat` responde 402 com mensagem e link para `/plano`); o navegador não decide nada.

## Limitações conhecidas

- **O e-mail do pagamento precisa ser o da conta.** Se o comprador usar outro e-mail, o evento fica em `billing_events` com `note = 'user_not_found'` e a assinatura não é aplicada; resolva manualmente ou reprocesse após corrigir. A página `/plano` avisa o usuário para usar o mesmo e-mail.
- Uma pergunta que falha por erro do provedor de IA ainda conta no uso.
- Os limites e preços acima são ponto de partida; calibre com os dados reais do piloto.
