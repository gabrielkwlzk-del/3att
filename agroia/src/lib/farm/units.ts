export type HarvestUnit = "sc60" | "kg" | "t" | "arroba";

export const HARVEST_UNITS: { value: HarvestUnit; label: string; kg: number }[] = [
  { value: "sc60", label: "Sacas de 60 kg", kg: 60 },
  { value: "kg", label: "Quilos (kg)", kg: 1 },
  { value: "t", label: "Toneladas (t)", kg: 1000 },
  { value: "arroba", label: "Arrobas (15 kg)", kg: 15 },
];

export function toKg(amount: number, unit: HarvestUnit): number {
  const u = HARVEST_UNITS.find((h) => h.value === unit);
  return amount * (u?.kg ?? 1);
}

export const KG_PER_SACA = 60;
export const kgToSacas = (kg: number) => kg / KG_PER_SACA;
