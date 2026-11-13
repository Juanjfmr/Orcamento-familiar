
-- Duo Finn: authenticated Pluggy event inbox and server-verified Item claim.
-- Secrets are stored only as SHA-256 digests; plaintext is never part of Git.
create table if not exists duo_private.integration_keys (
  name text primary key check (name in ('pluggy_webhook','pluggy_confirm')),
  secret_sha256 text not null check (secret_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create table if not exists duo_private.pluggy_webhook_events (
  event_id uuid primary key,
  event_type text not null,
  item_id uuid,
  owner_hint uuid,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','completed','error','ignored')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0
);
create index if not exists idx_finn_pluggy_event_pending
 on duo_private.pluggy_webhook_events(processing_status,received_at)
 where processing_status in ('pending','error');

-- Separate application secrets, high-entropy values never persisted here.
insert into duo_private.integration_keys(name,secret_sha256) values
('pluggy_webhook','576b39c25a78cb238b5bacbca10e27e27e15a2a1086ff9b82448475633a1ff86'),
('pluggy_confirm','1d5d4a9c8be0c415a28f4947b3ad4d1150dcde3ac65873ca8843274a0d7dd5c1')
on conflict(name) do update set secret_sha256=excluded.secret_sha256;

create or replace function public.finn_queue_pluggy_webhook(
 p_secret text,p_client_id text,p_event_id uuid,p_event_type text,
 p_item_id uuid,p_owner_hint uuid
)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare v_hash text; v_expected_client text := '897c1337-2544-4832-bc0b-66700f34ebfd';
begin
  select secret_sha256 into v_hash
    from duo_private.integration_keys where name='pluggy_webhook';
  if v_hash is null or p_secret is null
      or encode(sha256(convert_to(p_secret,'UTF8')),'hex') <> v_hash
      or p_client_id is distinct from v_expected_client then
    raise exception 'Webhook not authorized' using errcode='42501';
  end if;
  -- Ignore unrelated Pluggy payments, avoiding accidental payment initiation scope.
  if p_event_type not in (
    'item/created','item/updated','item/deleted','item/error',
    'item/waiting_user_input','item/waiting_user_action','item/login_succeeded',
    'transactions/created','transactions/updated','transactions/deleted'
  ) then return false; end if;
  if p_item_id is null or p_event_id is null then
    raise exception 'Invalid webhook event' using errcode='22023';
  end if;
  -- Every event is only a signal; data/owner must be reverified with GET /items/{id}.
  insert into duo_private.pluggy_webhook_events
    (event_id,event_type,item_id,owner_hint)
    values(p_event_id,p_event_type,p_item_id,p_owner_hint)
  on conflict(event_id) do nothing;
  return true;
end
$fn$;
revoke all on function public.finn_queue_pluggy_webhook(text,text,uuid,text,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.finn_queue_pluggy_webhook(text,text,uuid,text,uuid,uuid)
 to service_role;

create or replace function public.finn_register_verified_item(p_secret text,p_item_id text)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare v_user uuid := (select auth.uid()); v_household uuid; v_hash text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode='42501'; end if;
  select secret_sha256 into v_hash from duo_private.integration_keys where name='pluggy_confirm';
  if v_hash is null or p_secret is null
      or encode(sha256(convert_to(p_secret,'UTF8')),'hex') <> v_hash then
    raise exception 'Server verification required' using errcode='42501'; end if;
  if p_item_id is null or p_item_id !~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid Item id' using errcode='22023'; end if;
  select household_id into v_household from public.household_members where user_id=v_user;
  if v_household is null then
    raise exception 'Family membership required' using errcode='42501'; end if;

  insert into duo_private.bank_connections
    (household_id,owner_user_id,provider,provider_item_id,status)
  values(v_household,v_user,'pluggy',p_item_id,'pending')
  on conflict(provider_item_id) do update set
    status=case when duo_private.bank_connections.status='connected' then 'connected' else 'pending' end
  where duo_private.bank_connections.owner_user_id=excluded.owner_user_id
    and duo_private.bank_connections.household_id=excluded.household_id;
  if not found then
    raise exception 'Item already belongs to another titular' using errcode='42501'; end if;
end
$fn$;
revoke all on function public.finn_register_verified_item(text,text)
 from public,anon,authenticated;
grant execute on function public.finn_register_verified_item(text,text)
 to authenticated;

-- No broad grants to anon or authenticated on duo_private schema.
revoke all on duo_private.integration_keys,duo_private.pluggy_webhook_events
 from public,anon,authenticated;
