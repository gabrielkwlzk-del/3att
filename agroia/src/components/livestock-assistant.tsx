"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, MessageCirclePlus, ShieldAlert, Stethoscope } from "lucide-react";
import { SPECIES, type SpeciesValue } from "@/lib/domain";

const QUESTIONS: Record<SpeciesValue, string[]> = {
  bovinos_corte: [
    "Como manter o ganho de peso do rebanho de corte na época da seca?",
    "Qual a lotação adequada para minha pastagem e como ajustar ao longo do ano?",
    "Como organizar a estação de monta para melhorar a taxa de prenhez?",
    "Quais cuidados com o bezerro nos primeiros dias de vida?",
  ],
  bovinos_leite: [
    "Como reduzir o estresse por calor nas vacas leiteiras?",
    "Como prevenir mastite na ordenha?",
    "Como montar uma dieta equilibrada para vacas em lactação?",
    "Quais cuidados com a vaca no período pré e pós-parto?",
  ],
  suinos: [
    "Quais medidas de biosseguridade são essenciais na granja?",
    "Como controlar a temperatura da maternidade e da creche?",
    "Como reduzir a mortalidade de leitões no pré-desmame?",
    "Como melhorar a conversão alimentar na terminação?",
  ],
  aves_corte: [
    "Como fazer o manejo de ambiência do aviário em dias muito quentes?",
    "Como preparar o aviário para receber os pintinhos?",
    "Quais cuidados de biosseguridade evitam doenças no lote?",
    "Como manejar a cama do aviário entre lotes?",
  ],
  aves_postura: [
    "Como manter a produção de ovos estável ao longo do ano?",
    "Qual o programa de luz adequado para poedeiras?",
    "Como reduzir ovos trincados e sujos?",
    "Que cuidados ter na muda das poedeiras?",
  ],
  ovinos: [
    "Como controlar verminose em ovinos sem depender só de vermífugo?",
    "Como usar o método Famacha no rebanho?",
    "Qual a melhor época de parição para ovelhas na minha região?",
    "Como suplementar ovelhas no final da gestação?",
  ],
  caprinos: [
    "Como montar um capril adequado para cabras leiteiras?",
    "Como controlar verminose em caprinos?",
    "Que cuidados ter com os cabritos recém-nascidos?",
    "Como formar uma reserva de forragem para a seca no semiárido?",
  ],
  peixes: [
    "Como monitorar a qualidade da água no viveiro de tilápia?",
    "Como calcular a quantidade de ração por dia para os peixes?",
    "O que fazer quando os peixes sobem para respirar na superfície de manhã?",
    "Qual a densidade de estocagem adequada para tanques escavados?",
  ],
  equinos: [
    "Como montar uma dieta equilibrada para cavalos de trabalho?",
    "Quais cuidados com os cascos dos cavalos?",
    "Como prevenir cólica em equinos?",
    "Quais exames e vacinas são exigidos para transporte de equinos?",
  ],
  abelhas: [
    "Como preparar as colmeias para o período de escassez de florada?",
    "Como evitar que as abelhas abandonem a caixa?",
    "Como proteger o apiário de aplicações de defensivos nas lavouras vizinhas?",
    "Como fazer a divisão de enxames?",
  ],
};

export function LivestockAssistant({ defaultSpecies }: { defaultSpecies: SpeciesValue }) {
  const [species, setSpecies] = useState<SpeciesValue>(defaultSpecies);
  const current = SPECIES.find((s) => s.value === species)!;

  return (
    <div className="space-y-5">
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2 pb-1 sm:w-auto sm:flex-wrap" role="tablist" aria-label="Espécie">
          {SPECIES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="tab"
              aria-selected={species === s.value}
              onClick={() => setSpecies(s.value)}
              className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition active:scale-[0.97] ${
                species === s.value
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-surface text-fg hover:border-brand/40"
              }`}
            >
              <span aria-hidden>{s.emoji}</span> {s.label}
            </button>
          ))}
        </div>
      </div>

      <section aria-labelledby="perguntas-animais" className="rounded-3xl border border-line bg-surface p-2" role="tabpanel">
        <h2 id="perguntas-animais" className="px-3 pt-3 pb-1 text-sm font-medium text-muted">
          Perguntas frequentes · {current.label}
        </h2>
        <ul>
          {QUESTIONS[species].map((q) => (
            <li key={q}>
              <Link
                href={`/chat?topico=pecuaria&q=${encodeURIComponent(`[${current.label}] ${q}`)}`}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] transition hover:bg-surface-2"
              >
                <span className="flex-1">{q}</span>
                <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/chat?topico=pecuaria"
          className="m-1 mt-2 flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand text-sm font-medium text-brand-fg transition hover:bg-brand-strong"
        >
          <MessageCirclePlus className="size-4" aria-hidden /> Fazer outra pergunta
        </Link>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl bg-info-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-info">
            <Stethoscope className="size-4" aria-hidden /> Não substitui o veterinário
          </p>
          <p className="mt-1.5 text-fg/80">
            A AgroIA orienta sobre manejo, nutrição, instalações e prevenção. Diagnóstico, medicamentos e doses devem
            ser definidos por um médico-veterinário.
          </p>
        </div>
        <div className="rounded-3xl bg-danger-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <ShieldAlert className="size-4" aria-hidden /> Suspeita de doença grave?
          </p>
          <p className="mt-1.5 text-fg/80">
            Mortes súbitas, muitos animais doentes ao mesmo tempo, feridas na boca ou nos cascos ou sinais nervosos:
            isole os animais e avise imediatamente o serviço veterinário oficial do seu estado.
          </p>
        </div>
      </div>
    </div>
  );
}
