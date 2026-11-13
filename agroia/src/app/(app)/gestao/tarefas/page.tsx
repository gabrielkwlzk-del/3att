import type { Metadata } from "next";
import Link from "next/link";
import { Check, ClipboardCheck, RotateCcw, Trash2 } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, optionsOf } from "@/lib/farm/data";
import { taskBucket, withdrawalEnds, type TaskBucket } from "@/lib/farm/operations";
import { formatDateBR, todayBR } from "@/lib/farm/format";
import { ActionForm, AddPanel, DateField, FieldGrid, NumberField, RowAction, SelectField, TextAreaField, TextField } from "@/components/farm/forms";
import { Badge, EmptyState, List, Note, PageShell } from "@/components/farm/ui";
import { createTask, deleteTask, setTaskDone } from "./actions";

export const metadata: Metadata = { title: "Tarefas e operações" };

const KINDS = [
  { value: "plantio", label: "Plantio" }, { value: "aplicacao", label: "Aplicação" }, { value: "inspecao", label: "Inspeção" },
  { value: "colheita", label: "Colheita" }, { value: "irrigacao", label: "Irrigação" }, { value: "manutencao", label: "Manutenção" }, { value: "outro", label: "Outro" },
];

type TaskRow = { id: string; title: string; kind: string; field_id: string | null; due_on: string | null; done: boolean; completed_on: string | null; product: string | null; dose: string | null; target: string | null; withdrawal_days: number | null; notes: string | null };

const GROUPS: { key: TaskBucket; title: string; tone: "danger" | "warn" | "info" | "muted" }[] = [
  { key: "atrasada", title: "Atrasadas", tone: "danger" },
  { key: "hoje", title: "Hoje", tone: "warn" },
  { key: "proximas", title: "Próximas", tone: "info" },
  { key: "sem_data", title: "Sem data", tone: "muted" },
];

export default async function TasksPage({ searchParams }: PageProps<"/gestao/tarefas">) {
  const { status } = await searchParams;
  const showDone = status === "concluidas";
  const { supabase } = await getAuthContext();
  const today = todayBR();
  const [fields, taskRes] = await Promise.all([
    loadFields(supabase),
    supabase.from("tasks").select("id, title, kind, field_id, due_on, done, completed_on, product, dose, target, withdrawal_days, notes").order("due_on", { ascending: true, nullsFirst: false }).limit(1000),
  ]);
  const tasks = (taskRes.data ?? []) as TaskRow[];
  const fieldName = new Map(fields.map((f) => [f.id, f.name]));
  const pending = tasks.filter((t) => !t.done);
  const finished = tasks.filter((t) => t.done).sort((a, b) => (b.completed_on ?? "").localeCompare(a.completed_on ?? ""));

  const renderTask = (t: TaskRow) => {
    const kind = KINDS.find((k) => k.value === t.kind)?.label ?? t.kind;
    const carencia = t.kind === "aplicacao" ? withdrawalEnds(t.completed_on ?? t.due_on ?? today, t.withdrawal_days) : null;
    return (
      <li key={t.id} className="flex items-start gap-2 px-4 py-3">
        <RowAction action={setTaskDone} id={t.id} extra={{ done: t.done ? "0" : "1" }} label={t.done ? "Reabrir tarefa" : "Marcar como feita"} icon={t.done ? <RotateCcw className="size-4" /> : <Check className="size-5" />} tone={t.done ? "quiet" : "ok"} />
        <div className="min-w-0 flex-1 pt-1.5">
          <p className={`font-medium ${t.done ? "text-muted line-through" : ""}`}>{t.title}</p>
          <p className="mt-0.5 text-sm text-muted">
            <Badge tone="muted">{kind}</Badge>
            {t.field_id && fieldName.get(t.field_id) ? ` · ${fieldName.get(t.field_id)}` : ""}
            {t.done ? ` · feita em ${formatDateBR(t.completed_on)}` : t.due_on ? ` · prazo ${formatDateBR(t.due_on)}` : ""}
          </p>
          {t.kind === "aplicacao" && (t.product || t.dose || t.target) && (
            <p className="mt-1 text-sm text-muted">
              {[t.product && `Produto: ${t.product}`, t.dose && `Dose: ${t.dose}`, t.target && `Alvo: ${t.target}`].filter(Boolean).join(" · ")}
              {carencia && <span className="block text-xs text-subtle">Carência informada: colheita a partir de {formatDateBR(carencia)} (confirme na bula)</span>}
            </p>
          )}
          {t.notes && <p className="mt-1 text-sm text-subtle">{t.notes}</p>}
        </div>
        <RowAction action={deleteTask} id={t.id} label="Excluir tarefa" icon={<Trash2 className="size-4" />} confirm="Excluir esta tarefa?" />
      </li>
    );
  };

  const tab = "inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition";
  return (
    <PageShell title="Tarefas e operações" description="Planeje o que fazer e registre plantios, aplicações, inspeções e colheitas.">
      <div className="flex gap-2" role="tablist" aria-label="Filtro">
        <Link href="/gestao/tarefas" role="tab" aria-selected={!showDone} className={`${tab} ${!showDone ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface hover:border-brand/40"}`}>Pendentes ({pending.length})</Link>
        <Link href="/gestao/tarefas?status=concluidas" role="tab" aria-selected={showDone} className={`${tab} ${showDone ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface hover:border-brand/40"}`}>Concluídas ({finished.length})</Link>
      </div>

      <AddPanel title="Nova tarefa ou registro" defaultOpen={tasks.length === 0}>
        <ActionForm action={createTask} submitLabel="Salvar">
          <TextField name="title" label="O que fazer / o que foi feito" placeholder="Ex.: Aplicação de fungicida no Talhão 1" required />
          <FieldGrid cols={3}>
            <SelectField name="kind" label="Tipo" required defaultValue="outro" options={KINDS} />
            <DateField name="due_on" label="Prazo / data" />
            <SelectField name="field_id" label="Talhão" options={optionsOf(fields)} emptyLabel="Não informar" />
          </FieldGrid>
          <fieldset className="rounded-3xl border border-line p-4">
            <legend className="px-2 text-sm font-medium">Registro de aplicação <span className="font-normal text-subtle">(só para o tipo Aplicação)</span></legend>
            <FieldGrid cols={2}>
              <TextField name="product" label="Produto aplicado" />
              <TextField name="dose" label="Dose usada" placeholder="Ex.: conforme receituário" />
              <TextField name="target" label="Alvo" placeholder="Ex.: ferrugem, lagarta" />
              <NumberField name="withdrawal_days" label="Carência (dias)" inputMode="numeric" hint="da bula" />
            </FieldGrid>
            <p className="mt-3 text-xs text-subtle">Anote o que foi realmente aplicado. A escolha do produto e da dose é do responsável técnico, conforme receituário agronômico e bula; a AgroIA não recomenda doses.</p>
          </fieldset>
          <TextAreaField name="notes" label="Observações" />
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" name="already_done" className="size-5 accent-[var(--brand)]" /> Já foi realizada (salvar como registro concluído)
          </label>
        </ActionForm>
      </AddPanel>

      {!showDone ? (
        pending.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="size-5" aria-hidden />} title="Nada pendente" text="Crie tarefas com prazo para não esquecer plantios, aplicações, inspeções e colheitas." />
        ) : (
          <div className="space-y-5">
            {GROUPS.map((g) => {
              const list = pending.filter((t) => taskBucket({ done: false, dueOn: t.due_on }, today) === g.key);
              if (!list.length) return null;
              return (
                <section key={g.key} aria-label={g.title}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted">{g.title} <Badge tone={g.tone}>{list.length}</Badge></h2>
                  <List>{list.map(renderTask)}</List>
                </section>
              );
            })}
          </div>
        )
      ) : finished.length === 0 ? (
        <EmptyState title="Nenhum registro concluído" />
      ) : (
        <List>{finished.slice(0, 100).map(renderTask)}</List>
      )}
      <Note>Os lembretes aparecem aqui e na tela de Gestão (tarefas atrasadas e do dia). Notificações no celular ainda não estão disponíveis.</Note>
    </PageShell>
  );
}
