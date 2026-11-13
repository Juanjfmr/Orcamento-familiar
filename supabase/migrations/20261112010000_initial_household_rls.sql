
-- Duo Finn | primeira estrutura privada e isolada | 2026-11-12
-- Nunca incluir dados financeiros reais nesta migração.
create schema if not exists duo_private;
revoke all on schema duo_private from public, anon, authenticated;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Nossa casa' check (char_length(label) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table duo_private.household_invites (
  household_id uuid primary key references public.households(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  provider text not null default 'pluggy',
  provider_account_id text not null,
  display_name text not null,
  kind text not null check (kind in ('bank','credit','investment')),
  balance_cents bigint,
  invoice_cents bigint,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider,provider_account_id),
  unique(id,owner_user_id,household_id),
  foreign key (household_id,owner_user_id) references public.household_members(household_id,user_id)
);

create table duo_private.bank_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  provider text not null default 'pluggy',
  provider_item_id text not null unique,
  status text not null default 'pending' check (status in ('pending','connected','error','disconnected')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (household_id,owner_user_id) references public.household_members(household_id,user_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  bank_account_id uuid not null,
  provider text not null default 'pluggy',
  provider_transaction_id text not null,
  booked_on date not null,
  description text not null,
  amount_cents bigint not null,
  kind text not null default 'regular'
    check (kind in ('regular','internal_transfer','card_settlement','balance_adjustment')),
  inferred_category text check (inferred_category in
    ('Moradia','Alimentação','Mercado','Transporte','Saúde','Educação','Lazer','Assinaturas','Outros','Revisar')),
  category_override text check (category_override in
    ('Moradia','Alimentação','Mercado','Transporte','Saúde','Educação','Lazer','Assinaturas','Outros','Revisar')),
  category_confidence numeric(4,3) check(category_confidence between 0 and 1),
  updated_at timestamptz not null default now(),
  unique(provider,provider_transaction_id,bank_account_id),
  foreign key (bank_account_id,owner_user_id,household_id)
     references public.bank_accounts(id,owner_user_id,household_id) on delete cascade
);

create index idx_finn_tx_owner_date on public.transactions(owner_user_id,booked_on desc);
create index idx_finn_tx_household_date on public.transactions(household_id,booked_on desc);
create index idx_finn_bank_owner on public.bank_accounts(owner_user_id,household_id);

-- Todos os dados bancários só podem ser inseridos pelo serviço de sincronização.
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.transactions enable row level security;

create policy "own household membership" on public.household_members
for select to authenticated
using (user_id=(select auth.uid()));

create policy "read household if member" on public.households
for select to authenticated
using (exists(select 1 from public.household_members m
              where m.household_id=id and m.user_id=(select auth.uid())));

create policy "read own accounts only" on public.bank_accounts
for select to authenticated
using (owner_user_id=(select auth.uid()) and exists
  (select 1 from public.household_members m
   where m.household_id=bank_accounts.household_id and m.user_id=(select auth.uid())));

create policy "read own transactions only" on public.transactions
for select to authenticated
using (owner_user_id=(select auth.uid()) and exists
  (select 1 from public.household_members m
   where m.household_id=transactions.household_id and m.user_id=(select auth.uid())));

create policy "correct own category only" on public.transactions
for update to authenticated
using (owner_user_id=(select auth.uid()) and exists
  (select 1 from public.household_members m
   where m.household_id=transactions.household_id and m.user_id=(select auth.uid())))
with check (owner_user_id=(select auth.uid()) and exists
  (select 1 from public.household_members m
   where m.household_id=transactions.household_id and m.user_id=(select auth.uid())));

revoke all on public.households,public.household_members,public.bank_accounts,public.transactions
from public, anon, authenticated;
grant select on public.households,public.household_members,public.bank_accounts,public.transactions
to authenticated;
grant update(category_override) on public.transactions to authenticated;

-- RPCs autenticadas. Sem políticas que permitam inserção direta de membros por clientes.
create function public.finn_create_household(p_label text default 'Nossa casa')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_id uuid;
begin
  if v_user is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if exists(select 1 from public.household_members where user_id=v_user)
  then raise exception 'Este usuário já pertence a uma família'; end if;
  insert into public.households(label)
  values (left(coalesce(nullif(trim(p_label),''),'Nossa casa'),60)) returning id into v_id;
  insert into public.household_members(household_id,user_id,role)
  values (v_id,v_user,'owner');
  return v_id;
end $$;

create function public.finn_create_invite()
returns text language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_home uuid; v_code text;
begin
  if v_user is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  select household_id into v_home from public.household_members
    where user_id=v_user and role='owner';
  if v_home is null then raise exception 'Somente o titular inicial pode convidar' using errcode='42501'; end if;
  if (select count(*) from public.household_members where household_id=v_home)>=2
  then raise exception 'A família já possui dois titulares'; end if;
  -- Token com entropia alta; somente o hash é persistido.
  v_code := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  delete from duo_private.household_invites where household_id=v_home;
  insert into duo_private.household_invites(household_id,token_hash,expires_at)
  values(v_home,encode(sha256(convert_to(v_code,'UTF8')),'hex'),now()+interval '48 hours');
  return v_code;
end $$;

create function public.finn_join_household(p_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_home uuid;
begin
  if v_user is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if exists(select 1 from public.household_members where user_id=v_user)
  then raise exception 'Este usuário já pertence a uma família'; end if;
  if p_code is null or length(trim(p_code))<>64 then raise exception 'Convite inválido'; end if;
  select household_id into v_home from duo_private.household_invites
  where token_hash=encode(sha256(convert_to(trim(p_code),'UTF8')),'hex')
    and expires_at>now() for update;
  if v_home is null then raise exception 'Convite inválido ou expirado'; end if;
  if (select count(*) from public.household_members where household_id=v_home)>=2
  then raise exception 'A família já possui dois titulares'; end if;
  insert into public.household_members(household_id,user_id,role)
  values (v_home,v_user,'member');
  delete from duo_private.household_invites where household_id=v_home;
  return v_home;
end $$;

create function public.finn_my_household()
returns table(household_id uuid,label text,member_count bigint,member_role text)
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  return query
    select h.id,h.label,(select count(*) from public.household_members x where x.household_id=h.id),m.role
    from public.household_members m join public.households h on h.id=m.household_id
    where m.user_id=v_user;
end $$;

-- Retorna exclusivamente valores consolidados da família, sem extratos individuais.
create function public.finn_family_dashboard(p_month date)
returns table(income_cents bigint,expense_cents bigint,available_cents bigint,
              invoice_cents bigint,last_synced_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_home uuid;
begin
  if v_user is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  select household_id into v_home from public.household_members where user_id=v_user;
  if v_home is null then raise exception 'Sem vínculo familiar' using errcode='42501'; end if;
  return query
  select
    coalesce((select sum(t.amount_cents) from public.transactions t
      where t.household_id=v_home and t.kind='regular' and t.amount_cents>0
        and t.booked_on>=date_trunc('month',p_month)::date
        and t.booked_on<(date_trunc('month',p_month)+interval '1 month')::date),0)::bigint,
    coalesce((select sum(-t.amount_cents) from public.transactions t
      where t.household_id=v_home and t.kind='regular' and t.amount_cents<0
        and t.booked_on>=date_trunc('month',p_month)::date
        and t.booked_on<(date_trunc('month',p_month)+interval '1 month')::date),0)::bigint,
    coalesce((select sum(a.balance_cents) from public.bank_accounts a
      where a.household_id=v_home and a.kind='bank'),0)::bigint,
    coalesce((select sum(a.invoice_cents) from public.bank_accounts a
      where a.household_id=v_home and a.kind='credit'),0)::bigint,
    (select max(a.last_synced_at) from public.bank_accounts a where a.household_id=v_home);
end $$;

create function public.finn_family_categories(p_month date)
returns table(category text,expense_cents bigint)
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_home uuid;
begin
  if v_user is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  select household_id into v_home from public.household_members where user_id=v_user;
  if v_home is null then raise exception 'Sem vínculo familiar' using errcode='42501'; end if;
  return query
    select coalesce(t.category_override,t.inferred_category,'Revisar')::text,
           sum(-t.amount_cents)::bigint
    from public.transactions t
    where t.household_id=v_home and t.kind='regular' and t.amount_cents<0
      and t.booked_on>=date_trunc('month',p_month)::date
      and t.booked_on<(date_trunc('month',p_month)+interval '1 month')::date
    group by 1 order by 2 desc;
end $$;

revoke all on function public.finn_create_household(text),
  public.finn_create_invite(),public.finn_join_household(text),
  public.finn_my_household(),public.finn_family_dashboard(date),
  public.finn_family_categories(date) from public,anon,authenticated;
grant execute on function public.finn_create_household(text),
  public.finn_create_invite(),public.finn_join_household(text),
  public.finn_my_household(),public.finn_family_dashboard(date),
  public.finn_family_categories(date) to authenticated;
