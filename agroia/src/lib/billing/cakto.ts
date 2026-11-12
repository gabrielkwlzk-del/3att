import "server-only";
import type { Interval, PlanId } from "./plans";

/**
 * ÚNICO PONTO A PREENCHER quando você configurar o webhook na Cakto.
 *
 * Eu não verifiquei a documentação da Cakto, então NÃO assumi nomes de campos. O app
 * já recebe, valida o token, guarda o corpo bruto em `billing_events.raw` e responde 200.
 * Para ativar as assinaturas:
 *   1. Cadastre o webhook na Cakto (veja docs/ASSINATURAS.md) e dispare um evento de teste.
 *   2. No Supabase, abra `billing_events` e leia a coluna `raw`: é o formato real.
 *   3. Implemente `parseCaktoPayload` abaixo para converter esse formato em `BillingEvent`.
 *      Enquanto ela devolver `null`, os eventos ficam registrados com note = 'unmapped'
 *      e nenhuma assinatura é alterada (comportamento seguro).
 */

export type BillingEventKind =
  | "activated" // primeira compra confirmada
  | "renewed" // renovação paga
  | "past_due" // cobrança falhou / atrasada
  | "canceled" // cancelada (acesso até o fim do período pago)
  | "refunded"; // reembolso ou chargeback (acesso termina agora)

export type BillingEvent = {
  /** Identificador único do evento no gateway (garante que reenvios não sejam aplicados duas vezes). */
  eventId: string;
  kind: BillingEventKind;
  /** E-mail do comprador: é como achamos o usuário. Tem que ser o mesmo e-mail da conta no app. */
  email: string;
  /** Obrigatórios em activated/renewed. */
  plan?: PlanId;
  interval?: Interval;
  /** Fim do período pago, se o gateway informar. Sem isso, calculamos (+1 mês / +1 ano). */
  periodEnd?: Date;
  /** ID da assinatura no gateway (para suporte e conciliação). */
  externalSubscriptionId?: string;
};

/**
 * Converte o corpo do webhook da Cakto em um BillingEvent, ou devolve null se o evento
 * não for de assinatura (ou ainda não estiver mapeado).
 *
 * Dica para descobrir `plan`/`interval`: crie 4 ofertas na Cakto (Produtor/Fazenda × mensal/anual)
 * e use o ID da oferta que vem no corpo. `planFromOfferId` abaixo lê esses IDs do ambiente.
 */
export function parseCaktoPayload(payload: unknown): BillingEvent | null {
  void payload;
  // TODO: mapear o formato real da Cakto. Exemplo da forma esperada (os nomes dos campos
  // abaixo são ilustrativos, confira no corpo real):
  //
  //   const p = payload as { id: string; event: string; customer: { email: string }; offer: { id: string } };
  //   const offer = planFromOfferId(p.offer.id);
  //   if (!offer) return null;
  //   return { eventId: p.id, kind: "activated", email: p.customer.email, ...offer };
  return null;
}

/**
 * Descobre plano e periodicidade pelo ID da oferta, configurado nas variáveis
 * CAKTO_OFFER_PRODUTOR_MENSAL, _PRODUTOR_ANUAL, _FAZENDA_MENSAL e _FAZENDA_ANUAL.
 */
export function planFromOfferId(offerId: string): { plan: PlanId; interval: Interval } | null {
  const table: [string | undefined, PlanId, Interval][] = [
    [process.env.CAKTO_OFFER_PRODUTOR_MENSAL, "produtor", "month"],
    [process.env.CAKTO_OFFER_PRODUTOR_ANUAL, "produtor", "year"],
    [process.env.CAKTO_OFFER_FAZENDA_MENSAL, "fazenda", "month"],
    [process.env.CAKTO_OFFER_FAZENDA_ANUAL, "fazenda", "year"],
  ];
  const hit = table.find(([id]) => id && id.trim() === offerId);
  return hit ? { plan: hit[1], interval: hit[2] } : null;
}
