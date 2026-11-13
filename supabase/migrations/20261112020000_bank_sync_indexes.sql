-- Small supporting indexes for foreign keys and future automatic bank sync.
create index if not exists idx_finn_connections_household_owner on duo_private.bank_connections(household_id,owner_user_id);
create index if not exists idx_finn_connections_owner on duo_private.bank_connections(owner_user_id);
create index if not exists idx_finn_accounts_household_owner on public.bank_accounts(household_id,owner_user_id);
create index if not exists idx_finn_tx_account_owner_household on public.transactions(bank_account_id,owner_user_id,household_id);
