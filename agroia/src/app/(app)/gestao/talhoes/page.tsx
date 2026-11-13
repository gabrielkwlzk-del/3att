import type { Metadata } from "next";
import { MapPinned, Pencil, Trash2 } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, loadSeasons, optionsOf, pickSeason } from "@/lib/farm/data";
import { CROP_OPTIONS } from "@/lib/domain";
import { HARVEST_UNITS, kgToSacas, toKg, type HarvestUnit } from "@/lib/farm/units";
import { STAGES } from "@/lib/farm/water";
import { formatDateBR, formatNum1, formatNum2, formatInt, todayBR } from "@/lib/farm/format";
import { ActionForm, AddPanel, DateField, FieldGrid, NumberField, RowAction, SelectField, TextAreaField, TextField } from "@/components/farm/forms";
import { Badge, Card, EmptyState, List, ListRow, PageShell, SeasonTabs } from "@/components/farm/ui";
import { createField, createHarvest, createSeason, deleteField, deleteHarvest, deleteSeason, updateField } from "./actions";

export const metadata: Metadata = { title: "Talhões e safras" };

type HarvestRow = { id: string; season_id: string; field_id: string; crop: string; amount: number; unit: HarvestUnit; harvested_on: string | null };

export default async function FieldsPage({ searchParams }: PageProps<"/gestao/talhoes">) {
  const { safra } = await searchParams;
  const { supabase } = await getAuthContext();
  const [fields, seasons] = await Promise.all([loadFields(supabase), loadSeasons(supabase)]);
  const season = pickSeason(seasons, safra);
  const { data: harvestData } = season
    ? await supabase.from("harvests").select("id, season_id, field_id, crop, amount, unit, harvested_on").eq("season_id", season.id).order("harvested_on", { ascending: false, nullsFirst: false })
    : { data: [] };
  const harvests = (harvestData ?? []) as HarvestRow[];
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const totalArea = fields.reduce((s, f) => s + f.areaHectares, 0);

  return (
    <PageShell title="Talhões e safras" description="Cadastre as áreas, crie as safras e registre o que foi colhido.">
      <Card title="Talhões" aside={fields.length ? <Badge tone="muted">{formatNum1(totalArea)} ha no total</Badge> : undefined}>
        {fields.length === 0 ? (
          <EmptyState icon={<MapPinned className="size-5" aria-hidden />} title="Nenhum talhão ainda" text="Cada talhão é uma área com a mesma cultura e manejo. Ele serve de base para custos por hectare, irrigação e produtividade." />
        ) : (
          <List>
            {fields.map((f) => (
              <li key={f.id} className="px-4 py-3">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.name}</p>
                      <p className="text-sm text-muted">
                        {formatNum1(f.areaHectares)} ha{f.crop ? ` · ${f.crop}` : ""}
                        {f.stage ? ` · ${STAGES.find((s) => s.value === f.stage)?.label.split(" (")[0]}` : ""}
                      </p>
                    </div>
                    <span className="grid size-10 place-items-center rounded-full text-muted transition group-open:bg-surface-2" aria-hidden>
                      <Pencil className="size-4" />
                    </span>
                  </summary>
                  <div className="mt-4 border-t border-line pt-4">
                    <ActionForm action={updateField} submitLabel="Salvar alterações" resetOnSuccess={false}>
                      <input type="hidden" name="id" value={f.id} />
                      <FieldGrid>
                        <TextField name="name" label="Nome" defaultValue={f.name} required />
                        <NumberField name="area_hectares" label="Área (ha)" defaultValue={String(f.areaHectares).replace(".", ",")} required />
                        <TextField name="crop" label="Cultura" defaultValue={f.crop} suggestions={[...CROP_OPTIONS]} />
                        <SelectField name="stage" label="Estágio atual" options={STAGES.map((s) => ({ value: s.value, label: s.label }))} defaultValue={f.stage} />
                        <DateField name="planting_date" label="Data de plantio" defaultValue={f.plantingDate} />
                        <NumberField name="soil_awc_mm" label="Água disponível no solo (mm)" hint="opcional" defaultValue={f.soilAwcMm != null ? String(f.soilAwcMm).replace(".", ",") : ""} />
                      </FieldGrid>
                      <TextAreaField name="notes" label="Observações" defaultValue={f.notes} />
                    </ActionForm>
                    <div className="mt-3 flex justify-end">
                      <RowAction action={deleteField} id={f.id} label="Excluir talhão" icon={<Trash2 className="size-4" />} confirm={`Excluir o talhão "${f.name}"? As colheitas e registros de irrigação dele também serão removidos.`} />
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </List>
        )}
        <div className="mt-4">
          <AddPanel title="Adicionar talhão" defaultOpen={fields.length === 0}>
            <ActionForm action={createField} submitLabel="Cadastrar talhão">
              <FieldGrid>
                <TextField name="name" label="Nome" placeholder="Ex.: Talhão da sede" required />
                <NumberField name="area_hectares" label="Área (ha)" placeholder="Ex.: 48,5" required />
                <TextField name="crop" label="Cultura atual" placeholder="Ex.: Soja" suggestions={[...CROP_OPTIONS]} />
                <SelectField name="stage" label="Estágio atual" hint="usado na irrigação" options={STAGES.map((s) => ({ value: s.value, label: s.label }))} />
                <DateField name="planting_date" label="Data de plantio" />
                <NumberField name="soil_awc_mm" label="Água disponível no solo (mm)" hint="se souber" placeholder="Ex.: 60" />
              </FieldGrid>
              <TextAreaField name="notes" label="Observações" />
            </ActionForm>
          </AddPanel>
        </div>
      </Card>

      <Card title="Safras">
        {seasons.length === 0 ? (
          <p className="mb-4 text-sm text-muted">Crie a primeira safra para organizar custos, receitas e colheitas por período.</p>
        ) : (
          <List>
            {seasons.map((s) => (
              <ListRow key={s.id} actions={<RowAction action={deleteSeason} id={s.id} label="Excluir safra" icon={<Trash2 className="size-4" />} confirm={`Excluir a safra "${s.name}"? As colheitas dela serão removidas; os lançamentos financeiros ficam sem safra.`} />}>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted">{s.startDate || s.endDate ? `${formatDateBR(s.startDate)} a ${formatDateBR(s.endDate)}` : "Sem datas"}</p>
              </ListRow>
            ))}
          </List>
        )}
        <div className={seasons.length ? "mt-4" : ""}>
          <AddPanel title="Criar safra" defaultOpen={seasons.length === 0}>
            <ActionForm action={createSeason} submitLabel="Criar safra">
              <TextField name="name" label="Nome da safra" placeholder="Ex.: Safra 2025/26" required />
              <FieldGrid>
                <DateField name="start_date" label="Início" defaultValue={todayBR()} />
                <DateField name="end_date" label="Fim previsto" />
              </FieldGrid>
            </ActionForm>
          </AddPanel>
        </div>
      </Card>

      {seasons.length > 0 && (
        <Card title="Colheitas">
          <div className="mb-4">
            <SeasonTabs seasons={seasons} current={season?.id ?? null} basePath="/gestao/talhoes" />
          </div>
          {harvests.length === 0 ? (
            <p className="mb-4 text-sm text-muted">Nenhuma colheita registrada em {season?.name}.</p>
          ) : (
            <List>
              {harvests.map((h) => {
                const f = fieldById.get(h.field_id);
                const kg = toKg(Number(h.amount), h.unit);
                const kgHa = f ? kg / f.areaHectares : null;
                const unit = HARVEST_UNITS.find((u) => u.value === h.unit);
                return (
                  <ListRow key={h.id} actions={<RowAction action={deleteHarvest} id={h.id} label="Excluir colheita" icon={<Trash2 className="size-4" />} confirm="Excluir este registro de colheita?" />}>
                    <p className="font-medium">
                      {f?.name ?? "Talhão removido"} · {h.crop}
                    </p>
                    <p className="text-sm text-muted">
                      {formatNum2(Number(h.amount))} {unit?.value === "sc60" ? "sacas" : unit?.value === "arroba" ? "@" : unit?.value}
                      {kgHa != null && ` · ${formatInt(kgHa)} kg/ha (${formatNum1(kgToSacas(kgHa))} sc/ha)`}
                      {h.harvested_on ? ` · ${formatDateBR(h.harvested_on)}` : ""}
                    </p>
                  </ListRow>
                );
              })}
            </List>
          )}
          {season && fields.length > 0 && (
            <div className="mt-4">
              <AddPanel title={`Registrar colheita em ${season.name}`}>
                <ActionForm action={createHarvest} submitLabel="Registrar colheita">
                  <input type="hidden" name="season_id" value={season.id} />
                  <FieldGrid>
                    <SelectField name="field_id" label="Talhão" required options={optionsOf(fields)} />
                    <TextField name="crop" label="Cultura" placeholder="Ex.: Soja" suggestions={[...CROP_OPTIONS]} required />
                    <NumberField name="amount" label="Quantidade colhida" placeholder="Ex.: 3.200" required />
                    <SelectField name="unit" label="Unidade" required defaultValue="sc60" options={HARVEST_UNITS.map((u) => ({ value: u.value, label: u.label }))} />
                    <DateField name="harvested_on" label="Data da colheita" />
                  </FieldGrid>
                  <TextAreaField name="notes" label="Observações" />
                </ActionForm>
              </AddPanel>
            </div>
          )}
        </Card>
      )}
    </PageShell>
  );
}
