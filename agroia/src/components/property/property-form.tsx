"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Check, Loader2, LocateFixed, ShieldCheck, Trash2 } from "lucide-react";
import {
  ACTIVITIES,
  CROP_OPTIONS,
  PRODUCTION_SYSTEMS,
  SPECIES,
  UFS,
  type PropertyRow,
} from "@/lib/domain";
import { deleteProperty, saveProperty, type SaveState } from "@/app/(app)/propriedade/actions";

const field =
  "h-12 w-full rounded-3xl border border-line bg-surface px-3.5 text-base outline-none transition focus:border-brand/60 aria-[invalid=true]:border-danger";
const labelClass = "mb-1.5 block text-sm font-medium";

export function PropertyForm({ property }: { property: PropertyRow | null }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(saveProperty, null);
  const [uf, setUf] = useState(property?.state ?? "");
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locMessage, setLocMessage] = useState<string | null>(null);
  const [selectedAnimals, setSelectedAnimals] = useState<Set<string>>(
    new Set(property?.animals.map((a) => a.species) ?? []),
  );
  const [deleting, startDelete] = useTransition();
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const knownCrops = new Set<string>(CROP_OPTIONS);
  const otherCrops = (property?.crops ?? []).filter((c) => !knownCrops.has(c)).join(", ");
  const errors = state?.fieldErrors ?? {};

  // Lista oficial de municípios do IBGE para sugerir nomes corretos
  useEffect(() => {
    if (!uf) return;
    const controller = new AbortController();
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { nome: string }[]) => setMunicipios(list.map((m) => m.nome)))
      .catch(() => setMunicipios([]));
    return () => controller.abort();
  }, [uf]);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setLocMessage("Seu navegador não permite obter a localização.");
      return;
    }
    setLocating(true);
    setLocMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocMessage("Localização do aparelho capturada. Ela será usada na previsão do tempo ao salvar.");
      },
      () => {
        setLocating(false);
        setLocMessage("Não foi possível obter a localização. Usaremos o centro do município.");
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  };

  const animalQty = (species: string) => property?.animals.find((a) => a.species === species)?.quantity ?? "";

  return (
    <>
      <form action={formAction} className="space-y-7" noValidate>
        <fieldset className="space-y-4">
          <legend className="mb-3 text-lg font-semibold">Identificação e localização</legend>
          <div>
            <label htmlFor="name" className={labelClass}>Nome da propriedade</label>
            <input
              id="name"
              name="name"
              defaultValue={property?.name ?? ""}
              className={field}
              placeholder="Ex.: Sítio Boa Esperança"
              aria-invalid={Boolean(errors.name)}
              required
              maxLength={120}
            />
            {errors.name && <p className="mt-1 text-sm text-danger">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-[6.5rem_1fr] gap-3">
            <div>
              <label htmlFor="state" className={labelClass}>Estado</label>
              <select
                id="state"
                name="state"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className={field}
                aria-invalid={Boolean(errors.state)}
                required
              >
                <option value="">UF</option>
                {UFS.map((u) => (
                  <option key={u.sigla} value={u.sigla}>{u.sigla}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="municipality" className={labelClass}>Município</label>
              <input
                id="municipality"
                name="municipality"
                list="municipios"
                defaultValue={property?.municipality ?? ""}
                className={field}
                placeholder="Ex.: Rio Verde"
                aria-invalid={Boolean(errors.municipality)}
                autoComplete="address-level2"
                required
                maxLength={120}
              />
              <datalist id="municipios">
                {municipios.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>
          {(errors.state || errors.municipality) && (
            <p className="-mt-2 text-sm text-danger">{errors.state ?? errors.municipality}</p>
          )}
          <div>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium transition hover:bg-surface-2"
            >
              {locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
              Usar a localização do aparelho
            </button>
            <p className="mt-1.5 text-sm text-muted">
              {locMessage ?? "Opcional: use se estiver na propriedade, para uma previsão do tempo mais precisa."}
            </p>
            <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
            <input type="hidden" name="longitude" value={coords?.lon ?? ""} />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-lg font-semibold">Produção</legend>
          <div>
            <span className={labelClass}>Atividade principal</span>
            <div className="grid grid-cols-3 gap-2">
              {ACTIVITIES.map((a) => (
                <label key={a.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="activity"
                    value={a.value}
                    defaultChecked={(property?.activity ?? "agricultura") === a.value}
                    className="peer sr-only"
                  />
                  <span className="flex h-12 items-center justify-center rounded-3xl border border-line bg-surface px-2 text-center text-sm leading-tight transition peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:font-medium peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40">
                    {a.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="area_hectares" className={labelClass}>Área aproximada (hectares)</label>
              <input
                id="area_hectares"
                name="area_hectares"
                inputMode="decimal"
                defaultValue={property?.area_hectares ?? ""}
                className={field}
                placeholder="Ex.: 48,5"
                aria-invalid={Boolean(errors.area_hectares)}
              />
              {errors.area_hectares && <p className="mt-1 text-sm text-danger">Informe um número válido.</p>}
            </div>
            <div>
              <label htmlFor="production_system" className={labelClass}>Sistema de produção</label>
              <select id="production_system" name="production_system" defaultValue={property?.production_system ?? ""} className={field}>
                <option value="">Não informar</option>
                {PRODUCTION_SYSTEMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className={labelClass}>Culturas produzidas</span>
            <div className="flex flex-wrap gap-2">
              {CROP_OPTIONS.map((crop) => (
                <label key={crop} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="crops"
                    value={crop}
                    defaultChecked={property?.crops.includes(crop)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm transition peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-fg peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40">
                    {crop}
                  </span>
                </label>
              ))}
            </div>
            <label htmlFor="other_crops" className="mt-3 mb-1.5 block text-sm text-muted">Outras culturas (separe por vírgula)</label>
            <input id="other_crops" name="other_crops" defaultValue={otherCrops} className={field} placeholder="Ex.: Banana, Abacaxi" />
          </div>

          <div>
            <span className={labelClass}>Animais criados</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {SPECIES.map((s) => {
                const checked = selectedAnimals.has(s.value);
                return (
                  <div
                    key={s.value}
                    className={`flex items-center gap-2 rounded-3xl border px-3 py-2 transition ${checked ? "border-brand/50 bg-brand-soft/60" : "border-line bg-surface"}`}
                  >
                    <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        name="animal_species"
                        value={s.value}
                        checked={checked}
                        onChange={(e) =>
                          setSelectedAnimals((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(s.value);
                            else next.delete(s.value);
                            return next;
                          })
                        }
                        className="size-5 accent-[var(--brand)]"
                      />
                      <span aria-hidden>{s.emoji}</span> {s.label}
                    </label>
                    {checked && (
                      <>
                        <label htmlFor={`qty-${s.value}`} className="sr-only">Quantidade de {s.label}</label>
                        <input
                          id={`qty-${s.value}`}
                          name={`animal_qty_${s.value}`}
                          inputMode="numeric"
                          defaultValue={animalQty(s.value)}
                          placeholder="Qtd."
                          className="h-9 w-20 rounded-2xl border border-line bg-surface px-2 text-sm outline-none focus:border-brand/60"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="notes" className={labelClass}>Observações (opcional)</label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={1000}
              defaultValue={property?.notes ?? ""}
              className="w-full rounded-3xl border border-line bg-surface px-3.5 py-3 text-base outline-none focus:border-brand/60"
              placeholder="Ex.: solo arenoso, irrigação por gotejamento, plantio direto há 8 anos"
            />
          </div>
        </fieldset>

        <fieldset className="rounded-[28px] border border-line bg-surface p-4 sm:p-5">
          <legend className="sr-only">Consentimento</legend>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="share_with_ai" defaultChecked={property?.share_with_ai ?? false} className="peer sr-only" />
            <span className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-surface-3 transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" aria-hidden />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="size-4 text-leaf" aria-hidden /> Usar estes dados para personalizar as respostas
              </span>
              <span className="mt-1 block text-sm text-muted">
                Com sua autorização, a AgroIA envia ao serviço de IA o município, as culturas, a área e os animais
                informados aqui, junto com suas perguntas. Você pode desligar quando quiser.
              </span>
            </span>
          </label>
        </fieldset>

        <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-medium text-brand-fg transition hover:bg-brand-strong active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            Salvar propriedade
          </button>
          {state && (
            <p role="status" className={`text-sm ${state.ok ? "text-leaf" : "text-danger"}`}>{state.message}</p>
          )}
        </div>
      </form>

      {property && (
        <section className="mt-10 rounded-[28px] border border-danger/30 p-4 sm:p-5" aria-labelledby="excluir-dados">
          <h2 id="excluir-dados" className="font-medium">Excluir dados da propriedade</h2>
          <p className="mt-1 text-sm text-muted">Remove o cadastro da propriedade. Suas conversas continuam salvas.</p>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              if (!window.confirm("Excluir os dados da propriedade?")) return;
              startDelete(async () => {
                const result = await deleteProperty();
                setDeleteMessage(result?.message ?? null);
                if (result?.ok) window.location.reload();
              });
            }}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-full border border-danger/40 px-4 text-sm font-medium text-danger transition hover:bg-danger-soft"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            Excluir dados
          </button>
          {deleteMessage && <p className="mt-2 text-sm text-muted">{deleteMessage}</p>}
        </section>
      )}
    </>
  );
}
