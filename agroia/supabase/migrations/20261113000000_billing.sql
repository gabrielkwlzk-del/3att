-- =====================================================================
-- AgroIA · assinaturas (Cakto) e teste grátis de 3 dias
-- Execute depois de 20261112000000_init.sql.
--
-- Regras:
--  * Todo usuário nasce com uma assinatura "trialing" (teste) AINDA NÃO
--    iniciada. O relógio dos 3 dias começa na primeira pergunta
--    (função start_trial), não no cadastro.
--  * O usuário só LÊ a própria assinatura. Quem escreve é o backend com a
--    chave de serviço (webhook da Cakto) ou as funções abaixo.
--  * O uso mensal é contado a partir das próprias mensagens (usage_since).
-- =====================================================================

-- E-mail no perfil: é por ele que o webhook encontra o usuário.
alter table public.profiles add column if not exists email text;

update public.profiles p
   set email = lower(u.email)
  from auth.users u
 where u.id = p.id and p.email is null;

create unique index if not exists profiles_email_key
  on public.profiles (lower(email)) where email is not null;

-- ---------------------------------------------------------------------
-- Assinaturas (1 por usuário)
-- ---------------------------------------------------------------------
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'produtor' check (plan in ('semente', 'produtor', 'fazenda')),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  billing_interval text check (billing_interval in ('month', 'year')),
  -- Teste: null = ainda não começou. Preenchido por start_trial().
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  external_provider text not null default 'cakto',
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "subscriptions: leitura própria" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
-- Sem políticas de insert/update/delete: só a chave de serviço (que ignora RLS)
-- e as funções security definer abaixo alteram assinaturas.

-- ---------------------------------------------------------------------
-- Eventos de cobrança recebidos do gateway (auditoria + idempotência)
-- ---------------------------------------------------------------------
create table public.billing_events (
  id bigint generated always as identity primary key,
  provider text not null default 'cakto',
  event_id text not null,
  kind text,                     -- evento normalizado: activated, renewed, past_due, canceled, refunded
  email text,
  user_id uuid references auth.users (id) on delete set null,
  note text,                     -- 'unmapped', 'user_not_found', 'error: …'
  raw jsonb not null,            -- corpo original: use para conferir o formato real da Cakto
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create index billing_events_email_idx on public.billing_events (lower(email));
alter table public.billing_events enable row level security; -- sem políticas: só chave de serviço

-- ---------------------------------------------------------------------
-- Novo usuário: perfil (com e-mail) + assinatura de teste não iniciada
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), ''),
    lower(new.email)
  );
  insert into public.subscriptions (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

-- Usuários que já existiam também ganham um teste (ainda não iniciado)
insert into public.subscriptions (user_id)
select id from public.profiles
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Início do teste: chamado pelo app na primeira pergunta.
-- A duração (3 dias) fica AQUI de propósito: o usuário não pode escolher.
-- Mantenha igual a TRIAL_DAYS em src/lib/billing/plans.ts.
-- ---------------------------------------------------------------------
create or replace function public.start_trial()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_end timestamptz;
begin
  update public.subscriptions
     set trial_ends_at = now() + interval '3 days'
   where user_id = (select auth.uid())
     and status = 'trialing'
     and trial_ends_at is null
  returning trial_ends_at into v_end;

  if v_end is null then
    select trial_ends_at into v_end
      from public.subscriptions
     where user_id = (select auth.uid());
  end if;
  return v_end;
end;
$$;

revoke all on function public.start_trial() from public, anon;
grant execute on function public.start_trial() to authenticated;

-- ---------------------------------------------------------------------
-- Uso desde uma data: perguntas e fotos enviadas pelo próprio usuário
-- (security invoker: o RLS de messages garante que só conta as dele)
-- ---------------------------------------------------------------------
create or replace function public.usage_since(p_since timestamptz)
returns table (questions integer, photos integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::integer,
    coalesce(sum(jsonb_array_length(m.attachments)), 0)::integer
  from public.messages m
  where m.user_id = (select auth.uid())
    and m.role = 'user'
    and m.created_at >= p_since;
$$;

grant execute on function public.usage_since(timestamptz) to authenticated;
