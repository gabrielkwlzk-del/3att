import test from "node:test";
import assert from "node:assert/strict";
import { extractJson, SoilAnalysisSchema, YieldAdjustmentSchema } from "../src/lib/ai/farm-schemas";

test("extractJson: JSON puro, com cerca de código e com texto em volta", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1,"b":"x"}\n```'), { a: 1, b: "x" });
  assert.deepEqual(extractJson('Claro! Aqui está:\n{"a":{"b":2}}\nEspero ter ajudado.'), { a: { b: 2 } });
  assert.throws(() => extractJson("sem json nenhum"));
  assert.throws(() => extractJson('{"a":'));
});

test("laudo de solo: resposta completa e bem formada", () => {
  const r = SoilAnalysisSchema.parse(JSON.parse(`{
    "is_soil_report": true, "laboratory": "Lab X", "sample_date": "2026-08-05", "depth": "0-20 cm", "identification": "T1",
    "indicators": [{ "name": "pH", "symbol": "pH", "value": "5,0", "unit": null, "classification": "baixo", "note": null }],
    "summary": "Solo ácido.", "limitations": ["V% baixa"], "questions_for_agronomist": ["Precisa de calagem?"], "quality_notes": null }`));
  assert.equal(r.indicators[0].value, "5,0");
  assert.equal(r.indicators[0].classification, "baixo");
});

test("laudo de solo: tolera números no lugar de texto, classificação desconhecida e listas ausentes", () => {
  const r = SoilAnalysisSchema.parse({
    is_soil_report: true,
    indicators: [
      { name: "Fósforo", value: 14, unit: "mg/dm³", classification: "razoavel" }, // número + classificação que não existe
      { name: "K", value: null, classification: "baixo" },
    ],
    summary: "Resumo",
    // limitations e questions ausentes
  });
  assert.equal(r.indicators[0].value, "14");
  assert.equal(r.indicators[0].classification, "nao_classificado");
  assert.equal(r.indicators[1].value, null);
  assert.deepEqual(r.limitations, []);
  assert.deepEqual(r.questions_for_agronomist, []);
});

test("laudo de solo: sem resumo é rejeitado (não exibimos análise vazia)", () => {
  assert.throws(() => SoilAnalysisSchema.parse({ is_soil_report: true, indicators: [] }));
  assert.throws(() => SoilAnalysisSchema.parse({ indicators: [{ value: "1" }], summary: "x" })); // indicador sem nome
});

test("laudo de solo: documento que não é laudo", () => {
  const r = SoilAnalysisSchema.parse({ is_soil_report: false, indicators: [], summary: "Isto é uma fatura." });
  assert.equal(r.is_soil_report, false);
});

test("ajuste de produtividade: valores fora do formato viram padrões seguros", () => {
  const r = YieldAdjustmentSchema.parse({ adjustment_pct: "muito", confidence: "certeza total", factors: "não é lista" });
  assert.equal(r.adjustment_pct, 0);
  assert.equal(r.confidence, "baixa");
  assert.deepEqual(r.factors, []);
  const ok = YieldAdjustmentSchema.parse({ adjustment_pct: -4.5, confidence: "media", factors: ["a"], risks: ["b"], what_would_improve: ["c"] });
  assert.equal(ok.adjustment_pct, -4.5);
  assert.equal(ok.confidence, "media");
});
