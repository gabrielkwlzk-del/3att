/** CSV compatível com Excel em português: separador ";", decimal com vírgula e BOM UTF-8. */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let s = typeof value === "number" ? String(value).replace(".", ",") : String(value);
  // Evita que o Excel interprete o texto como fórmula (injeção de CSV)
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Lê CSV simples (separador ; ou , ou tab), com aspas. Devolve linhas de células. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const sep = (clean.split("\n")[0].match(/;/g) ?? []).length >= (clean.split("\n")[0].match(/,/g) ?? []).length
    ? ((clean.split("\n")[0].match(/\t/g) ?? []).length > 0 ? "\t" : ";")
    : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}
