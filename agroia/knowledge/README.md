# Base de conhecimento técnico

Coloque aqui publicações **oficiais** que a AgroIA deve consultar e citar. Cada arquivo `.md` ou `.txt` precisa começar com um cabeçalho identificando a origem:

```markdown
---
title: Título exato da publicação
institution: Embrapa Soja
url: https://link-oficial-da-publicacao
year: 2023
type: Circular Técnica
topics: soja, ferrugem-asiática, manejo de doenças
---

Texto da publicação (pode ser o conteúdo completo ou os capítulos relevantes)…
```

Depois rode:

```bash
npm run kb:ingest            # lê knowledge/
npm run kb:ingest -- pasta/  # ou outra pasta
```

- Requer `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`.
- Com `VOYAGE_API_KEY`, também grava embeddings (busca semântica). Sem ela, a busca é textual em português.
- Arquivos já ingeridos (mesmo conteúdo) são ignorados; para atualizar, altere o arquivo e rode de novo (a versão antiga pode ser apagada em `kb_documents`, o que remove os trechos em cascata).
- Arquivos sem `title` ou `institution` são recusados.

## Onde encontrar material confiável

- **Embrapa** — publicações técnicas gratuitas: Infoteca-e (https://www.infoteca.cnptia.embrapa.br) e Repositório Alice (https://www.alice.cnptia.embrapa.br).
- **Ministério da Agricultura (MAPA)** — zoneamento agrícola (ZARC) e o AGROFIT (https://agrofit.agricultura.gov.br/agrofit_cons/principal_agrofit_cons), sistema de produtos fitossanitários registrados.
- **Emater e órgãos estaduais de assistência técnica**, institutos estaduais de pesquisa e universidades públicas.

PDFs podem ser convertidos para texto (por exemplo, `pdftotext arquivo.pdf saida.txt`) e revisados antes da ingestão. Respeite os termos de uso de cada publicação e mantenha sempre o link oficial no cabeçalho: é ele que aparece como referência para o produtor.

Este diretório começa vazio de propósito: a AgroIA não inventa conteúdo técnico nem referências.
