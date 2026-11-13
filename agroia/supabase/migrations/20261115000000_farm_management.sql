-- =====================================================================
-- AgroIA · gestão da propriedade
-- Talhões, safras, colheitas, financeiro, estoque, máquinas, irrigação,
-- tarefas, laudos de solo, cotações e previsões de produtividade.
-- Execute depois de 20261114000000_profile_name_from_google.sql.
--
-- Regras de segurança:
--  * Toda tabela tem user_id e RLS: cada produtor só vê e altera o que é seu.
--  * Registros que apontam para um talhão/safra/item só aceitam os que o
--    próprio usuário enxerga (o RLS da tabela referenciada filtra o EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Talhões e safras
-- ---------------------------------------------------------------------
create table public.fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  area_hectares numeric(12, 2) not null check (area_hectares > 0),
  crop text check (char_length(crop) <= 40),
  planting_date date,
  -- Estágio informado pelo produtor (usado no coeficiente de cultura da irrigação)
  stage text check (stage in ('inicial', 'desenvolvimento', 'medio', 'final')),
  -- Água disponível no solo (mm) na zona radicular, se o produtor souber
  soil_awc_mm numeric(6, 1) check (soil_awc_mm > 0 and soil_awc_mm <= 400),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.harvests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  crop text not null check (char_length(crop) between 1 and 40),
  amount numeric(14, 3) not null check (amount > 0),
  unit text not null check (unit in ('sc60', 'kg', 't', 'arroba')),
  harvested_on date,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id uuid references public.seasons (id) on delete set null,
  field_id uuid references public.fields (id) on delete set null,
  kind text not null check (kind in ('despesa', 'receita', 'investimento')),
  category text not null check (char_length(category) between 1 and 60),
  description text check (char_length(description) <= 200),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents < 100000000000),
  occurred_on date not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Estoque de insumos (cada linha é um lote)
-- ---------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (category in ('semente', 'fertilizante', 'defensivo', 'corretivo', 'combustivel', 'outros')),
  unit text not null check (unit in ('kg', 'L', 'sc', 't', 'un')),
  quantity numeric(14, 3) not null default 0 check (quantity >= 0),
  unit_cost_cents bigint check (unit_cost_cents >= 0),
  lot text check (char_length(lot) <= 60),
  expires_on date,
  min_quantity numeric(14, 3) not null default 0 check (min_quantity >= 0),
  supplier text check (char_length(supplier) <= 120),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  kind text not null check (kind in ('entrada', 'saida', 'ajuste')),
  -- entrada/saida: sempre positivo; ajuste: positivo soma, negativo subtrai
  quantity numeric(14, 3) not null check (quantity <> 0),
  field_id uuid references public.fields (id) on delete set null,
  occurred_on date not null,
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  check (kind = 'ajuste' or quantity > 0)
);

-- ---------------------------------------------------------------------
-- Máquinas
-- ---------------------------------------------------------------------
create table public.machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('trator', 'colheitadeira', 'pulverizador', 'plantadeira', 'implemento', 'caminhao', 'outro')),
  brand text check (char_length(brand) <= 60),
  model text check (char_length(model) <= 60),
  year integer check (year between 1950 and 2100),
  hour_meter numeric(10, 1) not null default 0 check (hour_meter >= 0),
  maintenance_interval_hours numeric(8, 1) check (maintenance_interval_hours > 0),
  last_maintenance_hours numeric(10, 1) not null default 0 check (last_maintenance_hours >= 0),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.machine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  machine_id uuid not null references public.machines (id) on delete cascade,
  field_id uuid references public.fields (id) on delete set null,
  kind text not null check (kind in ('uso', 'abastecimento', 'manutencao')),
  occurred_on date not null,
  hours numeric(8, 1) check (hours > 0),
  liters numeric(8, 1) check (liters > 0),
  cost_cents bigint check (cost_cents >= 0),
  description text check (char_length(description) <= 300),
  created_at timestamptz not null default now(),
  check (kind <> 'uso' or hours is not null),
  check (kind <> 'abastecimento' or liters is not null)
);

-- ---------------------------------------------------------------------
-- Irrigação
-- ---------------------------------------------------------------------
create table public.irrigation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  occurred_on date not null,
  amount_mm numeric(6, 1) not null check (amount_mm > 0 and amount_mm <= 500),
  method text check (method in ('pivo', 'aspersao', 'gotejamento', 'sulcos', 'outro')),
  duration_hours numeric(5, 1) check (duration_hours > 0),
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Tarefas e registros de operações (plantio, aplicação, inspeção, colheita…)
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  kind text not null check (kind in ('plantio', 'aplicacao', 'inspecao', 'colheita', 'irrigacao', 'manutencao', 'outro')),
  field_id uuid references public.fields (id) on delete set null,
  due_on date,
  done boolean not null default false,
  completed_on date,
  -- Registro de aplicação: o que foi feito, não recomendação
  product text check (char_length(product) <= 120),
  dose text check (char_length(dose) <= 80),
  target text check (char_length(target) <= 120),
  withdrawal_days integer check (withdrawal_days >= 0 and withdrawal_days <= 365),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Laudos de solo (PDF no Storage + interpretação)
-- ---------------------------------------------------------------------
create table public.soil_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  field_id uuid references public.fields (id) on delete set null,
  sample_on date,
  file_path text not null,
  file_name text not null check (char_length(file_name) <= 200),
  status text not null default 'processing' check (status in ('processing', 'done', 'error')),
  analysis jsonb,
  model text,
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Mercado: cotações lançadas pelo produtor (sempre com fonte) e alertas
-- ---------------------------------------------------------------------
create table public.market_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  commodity text not null check (commodity in ('soja', 'milho', 'trigo', 'arroz', 'feijao', 'cafe', 'algodao', 'boi_gordo', 'cana', 'leite')),
  price numeric(14, 4) not null check (price > 0),
  unit text not null check (char_length(unit) between 1 and 20),
  quoted_on date not null,
  source text not null check (char_length(source) between 1 and 120),
  source_url text check (char_length(source_url) <= 500),
  region text check (char_length(region) <= 80),
  created_at timestamptz not null default now(),
  unique (user_id, commodity, quoted_on, source)
);

create table public.market_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  commodity text not null check (commodity in ('soja', 'milho', 'trigo', 'arroz', 'feijao', 'cafe', 'algodao', 'boi_gordo', 'cana', 'leite')),
  kind text not null check (kind in ('acima', 'abaixo', 'variacao')),
  threshold numeric(14, 4) not null check (threshold > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Previsões de produtividade (histórico, para comparar com a colheita real)
-- ---------------------------------------------------------------------
create table public.yield_forecasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  season_id uuid references public.seasons (id) on delete set null,
  crop text not null,
  low_kg_ha numeric(12, 1),
  mid_kg_ha numeric(12, 1),
  high_kg_ha numeric(12, 1),
  inputs jsonb not null default '{}'::jsonb,
  narrative text,
  model text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Resumos de relatório gerados pela IA (um por geração, para consultar depois)
-- ---------------------------------------------------------------------
create table public.report_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  content text not null check (char_length(content) <= 20000),
  model text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
create index report_summaries_idx on public.report_summaries (user_id, season_id, created_at desc);
create index fields_user_idx on public.fields (user_id);
create index seasons_user_idx on public.seasons (user_id, start_date desc);
create index harvests_season_idx on public.harvests (user_id, season_id);
create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_season_idx on public.transactions (user_id, season_id);
create index inventory_items_user_idx on public.inventory_items (user_id);
create index inventory_movements_item_idx on public.inventory_movements (item_id, occurred_on desc);
create index machines_user_idx on public.machines (user_id);
create index machine_logs_machine_idx on public.machine_logs (machine_id, occurred_on desc);
create index irrigation_field_idx on public.irrigation_logs (user_id, field_id, occurred_on desc);
create index tasks_user_due_idx on public.tasks (user_id, done, due_on);
create index soil_reports_user_idx on public.soil_reports (user_id, created_at desc);
create index market_quotes_idx on public.market_quotes (user_id, commodity, quoted_on desc);
create index yield_forecasts_idx on public.yield_forecasts (user_id, field_id, created_at desc);

-- updated_at automático
create trigger fields_updated_at before update on public.fields for each row execute function public.set_updated_at();
create trigger inventory_items_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger machines_updated_at before update on public.machines for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Gatilhos: estoque e horímetro das máquinas
-- ---------------------------------------------------------------------
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_delta numeric(14, 3);
  v_new numeric(14, 3);
begin
  v_delta := case new.kind when 'entrada' then new.quantity when 'saida' then -new.quantity else new.quantity end;

  update public.inventory_items
     set quantity = quantity + v_delta
   where id = new.item_id
  returning quantity into v_new;

  if v_new is null then
    raise exception 'Item de estoque não encontrado.' using errcode = 'P0002';
  end if;
  return new;
exception
  when check_violation then
    raise exception 'Estoque insuficiente para esta saída.' using errcode = '23514';
end;
$$;

create trigger inventory_movements_apply
  after insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

create or replace function public.apply_machine_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'uso' then
    update public.machines set hour_meter = hour_meter + new.hours where id = new.machine_id;
  elsif new.kind = 'manutencao' then
    update public.machines set last_maintenance_hours = hour_meter where id = new.machine_id;
  end if;
  return new;
end;
$$;

create trigger machine_logs_apply
  after insert on public.machine_logs
  for each row execute function public.apply_machine_log();

-- ---------------------------------------------------------------------
-- RLS: só o dono; referências só a registros que o dono enxerga
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'fields', 'seasons', 'harvests', 'transactions', 'inventory_items', 'inventory_movements',
    'machines', 'machine_logs', 'irrigation_logs', 'tasks', 'soil_reports',
    'market_quotes', 'market_alerts', 'yield_forecasts', 'report_summaries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: leitura própria" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: exclusão própria" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Inserção e atualização com verificação das referências (uma política por tabela)
create policy "fields: criação própria" on public.fields for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "fields: atualização própria" on public.fields for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "seasons: criação própria" on public.seasons for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "seasons: atualização própria" on public.seasons for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "harvests: criação própria" on public.harvests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.seasons s where s.id = season_id)
    and exists (select 1 from public.fields f where f.id = field_id)
  );
create policy "harvests: atualização própria" on public.harvests for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.seasons s where s.id = season_id)
    and exists (select 1 from public.fields f where f.id = field_id)
  );

create policy "transactions: criação própria" on public.transactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (season_id is null or exists (select 1 from public.seasons s where s.id = season_id))
    and (field_id is null or exists (select 1 from public.fields f where f.id = field_id))
  );
create policy "transactions: atualização própria" on public.transactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (season_id is null or exists (select 1 from public.seasons s where s.id = season_id))
    and (field_id is null or exists (select 1 from public.fields f where f.id = field_id))
  );

create policy "inventory_items: criação própria" on public.inventory_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "inventory_items: atualização própria" on public.inventory_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "inventory_movements: criação própria" on public.inventory_movements for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.inventory_items i where i.id = item_id)
    and (field_id is null or exists (select 1 from public.fields f where f.id = field_id))
  );

create policy "machines: criação própria" on public.machines for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "machines: atualização própria" on public.machines for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "machine_logs: criação própria" on public.machine_logs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.machines m where m.id = machine_id)
    and (field_id is null or exists (select 1 from public.fields f where f.id = field_id))
  );

create policy "irrigation_logs: criação própria" on public.irrigation_logs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.fields f where f.id = field_id)
  );

create policy "tasks: criação própria" on public.tasks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (field_id is null or exists (select 1 from public.fields f where f.id = field_id))
  );
create policy "tasks: atualização própria" on public.tasks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (field_id is null or exists (select 1 from public.fields f where f.id = field_id))
  );

create policy "soil_reports: criação própria" on public.soil_reports for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and file_path like (select auth.uid())::text || '/%'
    and (field_id is null or exists (select 1 from public.fields f where f.id = field_id))
  );
create policy "soil_reports: atualização própria" on public.soil_reports for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "market_quotes: criação própria" on public.market_quotes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "market_quotes: atualização própria" on public.market_quotes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "market_alerts: criação própria" on public.market_alerts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "market_alerts: atualização própria" on public.market_alerts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "yield_forecasts: criação própria" on public.yield_forecasts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.fields f where f.id = field_id)
    and (season_id is null or exists (select 1 from public.seasons s where s.id = season_id))
  );

create policy "report_summaries: criação própria" on public.report_summaries for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.seasons s where s.id = season_id)
  );

-- ---------------------------------------------------------------------
-- Armazenamento de laudos (bucket privado; pasta = id do usuário)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soil-reports', 'soil-reports', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "soil-reports: envio na própria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'soil-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "soil-reports: leitura da própria pasta" on storage.objects
  for select to authenticated
  using (bucket_id = 'soil-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "soil-reports: exclusão da própria pasta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'soil-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
