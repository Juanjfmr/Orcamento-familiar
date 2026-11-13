-- Duo Finn: expose own connection status and server-only verified registration.
create or replace function public.finn_my_bank_connections()
returns table(id uuid, status text, created_at timestamptz, last_sync_at timestamptz)
language plpgsql security definer set search_path = ''
as $fn$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Autenticação necessária' using errcode='42501';
  end if;
  return query
    select c.id, c.status, c.created_at, c.last_sync_at
    from duo_private.bank_connections c
    join public.household_members m
      on m.household_id=c.household_id and m.user_id=c.owner_user_id
    where c.owner_user_id=v_user
    order by c.created_at desc;
end
$fn$;

revoke all on function public.finn_my_bank_connections() from public, anon, authenticated;
grant execute on function public.finn_my_bank_connections() to authenticated;

create or replace function public.finn_service_register_bank_connection(
  p_household_id uuid, p_user_id uuid, p_item_id text
)
returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_item_id is null or p_item_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid provider Item ID' using errcode='22023';
  end if;
  if not exists(select 1 from public.household_members
                where household_id=p_household_id and user_id=p_user_id) then
    raise exception 'Invalid household membership' using errcode='42501';
  end if;
  insert into duo_private.bank_connections
    (household_id, owner_user_id, provider, provider_item_id, status)
  values (p_household_id,p_user_id,'pluggy',p_item_id,'pending')
  on conflict (provider_item_id) do update
    set status='pending'
    where duo_private.bank_connections.household_id=excluded.household_id
      and duo_private.bank_connections.owner_user_id=excluded.owner_user_id;
  if not found then
    raise exception 'This connection is registered to another titular' using errcode='42501';
  end if;
end
$fn$;

revoke all on function public.finn_service_register_bank_connection(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.finn_service_register_bank_connection(uuid,uuid,text)
  to service_role;
