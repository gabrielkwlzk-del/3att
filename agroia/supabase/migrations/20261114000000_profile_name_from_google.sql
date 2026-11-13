-- =====================================================================
-- Nome do perfil também a partir do login com Google.
-- O Google envia "full_name" (ou "name") em vez de "display_name".
-- Execute depois de 20261113000000_billing.sql.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(left(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''), 80), '');

  insert into public.profiles (id, display_name, email)
  values (new.id, v_name, lower(new.email));

  insert into public.subscriptions (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
