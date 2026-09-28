-- Comexta · estrutura do banco no Supabase
-- Rode uma vez em: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode rodar de novo sem problema (não apaga dados).

-- Dados do ERP de cada usuário: uma linha por chave (cotações, simulações, cadastros, filtros).
create table if not exists public.erp_dados (
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  chave         text        not null,
  valor         jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, chave),
  constraint erp_dados_chave_valida check (chave in (
    'cotacoes:index', 'cotacoesFormal:index', 'simulacoes:index',
    'clientes:list', 'fornecedores:list', 'produtos:list',
    'filtrosTodas:fixado'
  ))
);

comment on table public.erp_dados is 'Dados do ERP Comexta por usuário. Cada usuário só acessa as próprias linhas (RLS).';

create or replace function public.erp_dados_toca_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists erp_dados_atualizado_em on public.erp_dados;
create trigger erp_dados_atualizado_em
  before update on public.erp_dados
  for each row execute function public.erp_dados_toca_atualizado_em();

-- Segurança: sem estas regras, ninguém acessa nada; com elas, cada um só vê e altera o que é seu.
alter table public.erp_dados enable row level security;

drop policy if exists "ler os próprios dados"      on public.erp_dados;
drop policy if exists "criar os próprios dados"    on public.erp_dados;
drop policy if exists "alterar os próprios dados"  on public.erp_dados;
drop policy if exists "apagar os próprios dados"   on public.erp_dados;

create policy "ler os próprios dados" on public.erp_dados
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "criar os próprios dados" on public.erp_dados
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "alterar os próprios dados" on public.erp_dados
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "apagar os próprios dados" on public.erp_dados
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.erp_dados from anon;
grant select, insert, update, delete on public.erp_dados to authenticated;
