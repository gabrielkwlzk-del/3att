#!/usr/bin/env node
/**
 * Ingestão da base de conhecimento técnico (RAG).
 *
 * Uso:  npm run kb:ingest            (lê knowledge/**\/*.md e *.txt)
 *       npm run kb:ingest -- caminho/para/pasta
 *
 * Cada arquivo precisa de um cabeçalho com a origem oficial do conteúdo:
 *   ---
 *   title: Título da publicação
 *   institution: Embrapa Soja
 *   url: https://www.embrapa.br/...
 *   year: 2023
 *   type: Circular Técnica
 *   topics: soja, ferrugem-asiática
 *   ---
 *
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Com VOYAGE_API_KEY,
 * também grava embeddings para busca semântica.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(process.argv[2] ?? "knowledge");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-3.5";
const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 200;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ex.: em .env.local).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (/\.(md|txt)$/i.test(entry.name) && entry.name.toLowerCase() !== "readme.md") files.push(full);
  }
  return files;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { meta, body: match[2] };
}

function chunkText(text) {
  const paragraphs = text.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length > CHUNK_SIZE && current) {
      chunks.push(current.trim());
      current = current.slice(-CHUNK_OVERLAP) + "\n\n" + paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
    while (current.length > CHUNK_SIZE * 1.5) {
      chunks.push(current.slice(0, CHUNK_SIZE).trim());
      current = current.slice(CHUNK_SIZE - CHUNK_OVERLAP);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function embed(texts) {
  if (!VOYAGE_KEY) return null;
  const out = [];
  for (let i = 0; i < texts.length; i += 64) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${VOYAGE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: texts.slice(i, i + 64), model: VOYAGE_MODEL, input_type: "document" }),
    });
    if (!res.ok) throw new Error(`Voyage respondeu ${res.status}: ${await res.text()}`);
    const json = await res.json();
    out.push(...json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

const files = await listFiles(ROOT).catch(() => []);
if (!files.length) {
  console.log(`Nenhum arquivo .md/.txt encontrado em ${ROOT}. Veja knowledge/README.md.`);
  process.exit(0);
}

let inserted = 0;
for (const file of files) {
  const raw = await readFile(file, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const rel = path.relative(process.cwd(), file);
  if (!meta.title || !meta.institution) {
    console.warn(`⚠ ${rel}: falta "title" ou "institution" no cabeçalho — ignorado.`);
    continue;
  }
  const checksum = createHash("sha256").update(raw).digest("hex");
  const { data: existing } = await supabase.from("kb_documents").select("id").eq("checksum", checksum).maybeSingle();
  if (existing) {
    console.log(`= ${rel}: já ingerido.`);
    continue;
  }

  const chunks = chunkText(body);
  if (!chunks.length) continue;
  const embeddings = await embed(chunks);

  const { data: doc, error: docError } = await supabase
    .from("kb_documents")
    .insert({
      title: meta.title,
      institution: meta.institution,
      url: meta.url || null,
      published_year: meta.year ? Number.parseInt(meta.year, 10) : null,
      document_type: meta.type || null,
      topics: meta.topics ? meta.topics.split(",").map((t) => t.trim()).filter(Boolean) : [],
      checksum,
    })
    .select("id")
    .single();
  if (docError) {
    console.error(`✗ ${rel}: ${docError.message}`);
    continue;
  }

  const rows = chunks.map((content, i) => ({
    document_id: doc.id,
    chunk_index: i,
    content,
    embedding: embeddings ? JSON.stringify(embeddings[i]) : null,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("kb_chunks").insert(rows.slice(i, i + 200));
    if (error) {
      console.error(`✗ ${rel}: ${error.message}`);
      await supabase.from("kb_documents").delete().eq("id", doc.id);
      break;
    }
  }
  inserted += 1;
  console.log(`✓ ${rel}: ${chunks.length} trechos${embeddings ? " com embeddings" : ""}.`);
}
console.log(`Concluído: ${inserted} documento(s) novo(s).`);
