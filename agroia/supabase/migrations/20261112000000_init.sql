-- =====================================================================
-- AgroIA · esquema inicial
-- Execute no SQL Editor do Supabase (ou `supabase db push`).
-- Todas as tabelas de usuário têm Row Level Security: cada produtor só
-- enxerga e altera os próprios dados.
-- =====================================================================

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------
-- Utilitário: updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: leitura própria" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: atualização própria" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Cria o perfil automaticamente quando um usuário se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Propriedade rural (MVP: uma por usuário)
-- ---------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  municipality text not null check (char_length(municipality) between 1 and 120),
  state char(2) not null check (state in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
    'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  area_hectares numeric(12, 2) check (area_hectares > 0),
  activity text not null default 'agricultura'
    check (activity in ('agricultura', 'pecuaria', 'mista')),
  production_system text
    check (production_system in ('convencional', 'organico', 'agroecologico', 'integracao', 'outro')),
  crops text[] not null default '{}' check (cardinality(crops) <= 30),
  -- [{ "species": "bovinos_corte", "quantity": 120 }]
  animals jsonb not null default '[]'::jsonb check (jsonb_typeof(animals) = 'array'),
  notes text check (char_length(notes) <= 1000),
  -- Consentimento explícito para usar estes dados nas respostas da IA
  share_with_ai boolean not null default false,
  consent_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger properties_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

alter table public.properties enable row level security;

create policy "properties: leitura própria" on public.properties
  for select to authenticated using (user_id = (select auth.uid()));
create policy "properties: criação própria" on public.properties
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "properties: atualização própria" on public.properties
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "properties: exclusão própria" on public.properties
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Conversas e mensagens
-- ---------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Nova conversa' check (char_length(title) <= 120),
  topic text not null default 'geral'
    check (topic in ('geral', 'diagnostico', 'agricultura', 'clima', 'pecuaria', 'produtividade')),
  channel text not null default 'web' check (channel in ('web', 'whatsapp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);

create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

create policy "conversations: leitura própria" on public.conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "conversations: criação própria" on public.conversations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "conversations: atualização própria" on public.conversations
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "conversations: exclusão própria" on public.conversations
  for delete to authenticated using (user_id = (select auth.uid()));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 60000),
  -- Fotos enviadas: [{ "path": "<user_id>/<arquivo>.jpg", "mediaType": "image/jpeg" }]
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  -- Referências usadas: [{ "kind": "web" | "knowledge_base", "title", "url", "institution" }]
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  input_mode text not null default 'text' check (input_mode in ('text', 'voice')),
  status text not null default 'complete' check (status in ('complete', 'refused', 'error')),
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index messages_user_created_idx on public.messages (user_id, created_at desc);

alter table public.messages enable row level security;

create policy "messages: leitura própria" on public.messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "messages: criação própria" on public.messages
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );
create policy "messages: exclusão própria" on public.messages
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Canais externos (estrutura para integração futura com WhatsApp)
-- ---------------------------------------------------------------------
create table public.channel_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  external_id text not null, -- telefone no formato E.164
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel, external_id)
);

alter table public.channel_identities enable row level security;

create policy "channel_identities: leitura própria" on public.channel_identities
  for select to authenticated using (user_id = (select auth.uid()));
create policy "channel_identities: exclusão própria" on public.channel_identities
  for delete to authenticated using (user_id = (select auth.uid()));
-- Inserção/verificação acontece apenas pelo backend com a chave de serviço.

-- ---------------------------------------------------------------------
-- Base de conhecimento técnico (RAG)
-- Somente leitura para usuários; a ingestão usa a chave de serviço.
-- ---------------------------------------------------------------------
create table public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  institution text not null,          -- ex.: "Embrapa Soja"
  url text,                           -- link oficial da publicação
  published_year integer check (published_year between 1900 and 2100),
  document_type text,                 -- circular técnica, comunicado, sistema de produção...
  topics text[] not null default '{}',
  checksum text not null unique,      -- evita reingestão do mesmo arquivo
  created_at timestamptz not null default now()
);

create table public.kb_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1024),
  fts tsvector generated always as (to_tsvector('portuguese', content)) stored,
  unique (document_id, chunk_index)
);

create index kb_chunks_fts_idx on public.kb_chunks using gin (fts);
create index kb_chunks_embedding_idx on public.kb_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;

create policy "kb_documents: leitura autenticada" on public.kb_documents
  for select to authenticated using (true);
create policy "kb_chunks: leitura autenticada" on public.kb_chunks
  for select to authenticated using (true);

-- Busca híbrida: texto em português (sempre) + similaridade vetorial
-- (quando um embedding da pergunta é enviado). Fusão por rank recíproco.
create or replace function public.search_knowledge(
  query_text text,
  query_embedding extensions.vector(1024) default null,
  match_count integer default 5
)
returns table (
  chunk_id bigint,
  content text,
  document_id uuid,
  title text,
  institution text,
  url text,
  published_year integer,
  score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select nullif(
      replace(plainto_tsquery('portuguese', query_text)::text, '&', '|'),
      ''
    )::tsquery as tsq
  ),
  text_hits as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc) as rnk
    from kb_chunks c, q
    where q.tsq is not null and c.fts @@ q.tsq
    order by ts_rank_cd(c.fts, q.tsq) desc
    limit 30
  ),
  vector_hits as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rnk
    from kb_chunks c
    where query_embedding is not null and c.embedding is not null
    order by c.embedding <=> query_embedding
    limit 30
  ),
  fused as (
    select id, sum(1.0 / (60 + rnk)) as score
    from (
      select id, rnk from text_hits
      union all
      select id, rnk from vector_hits
    ) hits
    group by id
  )
  select c.id, c.content, d.id, d.title, d.institution, d.url, d.published_year, f.score
  from fused f
  join kb_chunks c on c.id = f.id
  join kb_documents d on d.id = c.document_id
  order by f.score desc
  limit least(greatest(match_count, 1), 10);
$$;

grant execute on function public.search_knowledge(text, extensions.vector, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Armazenamento de fotos (bucket privado; pasta = id do usuário)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plant-photos', 'plant-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "plant-photos: envio na própria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "plant-photos: leitura da própria pasta" on storage.objects
  for select to authenticated
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "plant-photos: exclusão da própria pasta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
