-- Comexta · estrutura do banco no Supabase (v2: empresas, equipe e permissões)
-- Rode em: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode rodar de novo sem perder dados.
--
-- Modelo:
--   empresas        dados cadastrais da empresa (CNPJ, endereço...)
--   perfis          um por usuário: nome, telefone, cargo, foto, empresa, papel (admin|membro) e permissões
--   convites        convites pendentes (link com token) criados pelo administrador
--   dados_empresa   dados do ERP compartilhados pela equipe (cotações, simulações, cadastros), com versão
-- Permissões por área ('cadastros', 'cotacoes', 'simulador'): { "ver": bool, "criar": bool, "editar": bool }.
-- Administradores podem tudo, inclusive editar a empresa e gerenciar a equipe.

-- ============================================================ Tabelas
create table if not exists public.empresas (
  id                 uuid primary key default gen_random_uuid(),
  nome_fantasia      text not null default '',
  razao_social       text not null default '',
  cnpj               text not null default '',
  inscricao_estadual text not null default '',
  telefone           text not null default '',
  email              text not null default '',
  site               text not null default '',
  cep                text not null default '',
  logradouro         text not null default '',
  numero             text not null default '',
  complemento        text not null default '',
  bairro             text not null default '',
  cidade             text not null default '',
  uf                 text not null default '',
  pais               text not null default 'Brasil',
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create table if not exists public.perfis (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  empresa_id  uuid not null references public.empresas (id),
  email       text not null default '',
  nome        text not null default '',
  telefone    text not null default '',
  cargo       text not null default '',
  foto        text,                       -- imagem pequena (data URI JPEG, ~256px)
  papel       text not null default 'membro' check (papel in ('admin','membro')),
  permissoes  jsonb not null default '{}'::jsonb,
  convidado   boolean not null default false,   -- entrou por convite: precisa completar o perfil
  criado_em   timestamptz not null default now()
);
create index if not exists perfis_empresa_idx on public.perfis (empresa_id);

create table if not exists public.convites (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  email         text not null,
  token         text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  papel         text not null default 'membro' check (papel in ('admin','membro')),
  permissoes    jsonb not null default '{}'::jsonb,
  convidado_por uuid references auth.users (id) on delete set null,
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null default now() + interval '14 days',
  aceito_em     timestamptz,
  aceito_por    uuid references auth.users (id) on delete set null
);
create index if not exists convites_empresa_idx on public.convites (empresa_id);

create table if not exists public.dados_empresa (
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  chave          text not null check (chave in (
                   'cotacoes:index', 'cotacoesFormal:index', 'simulacoes:index',
                   'clientes:list', 'fornecedores:list', 'produtos:list')),
  valor          jsonb,
  versao         integer not null default 1,
  atualizado_por uuid references auth.users (id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  primary key (empresa_id, chave)
);

-- ============================================================ Funções auxiliares
-- security definer: leem perfis sem cair nas próprias regras RLS (evita recursão).
create or replace function public.minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.perfis where user_id = auth.uid()
$$;

create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'admin' from public.perfis where user_id = auth.uid()), false)
$$;

create or replace function public.secao_da_chave(p_chave text) returns text
language sql immutable as $$
  select case
    when p_chave in ('clientes:list', 'fornecedores:list', 'produtos:list') then 'cadastros'
    when p_chave in ('cotacoes:index', 'cotacoesFormal:index') then 'cotacoes'
    when p_chave = 'simulacoes:index' then 'simulador'
  end
$$;

create or replace function public.pode(p_secao text, p_acao text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select papel = 'admin' or coalesce((permissoes -> p_secao ->> p_acao)::boolean, false)
    from public.perfis where user_id = auth.uid()
  ), false)
$$;

-- Permissões completas (usadas para administradores e como referência).
create or replace function public.permissoes_totais() returns jsonb
language sql immutable as $$
  select '{"cadastros":{"ver":true,"criar":true,"editar":true},
           "cotacoes":{"ver":true,"criar":true,"editar":true},
           "simulador":{"ver":true,"criar":true,"editar":true}}'::jsonb
$$;

-- Deixa só as áreas/ações conhecidas, com valores booleanos; "criar"/"editar" implicam "ver".
create or replace function public.limpar_permissoes(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  resultado jsonb := '{}'::jsonb;
  secao text;
  ver boolean; criar boolean; editar boolean;
begin
  foreach secao in array array['cadastros','cotacoes','simulador'] loop
    criar  := coalesce((p -> secao ->> 'criar')::boolean, false);
    editar := coalesce((p -> secao ->> 'editar')::boolean, false);
    ver    := coalesce((p -> secao ->> 'ver')::boolean, false) or criar or editar;
    resultado := resultado || jsonb_build_object(secao, jsonb_build_object('ver', ver, 'criar', criar, 'editar', editar));
  end loop;
  return resultado;
end $$;

-- ============================================================ Novo usuário
-- Ao criar conta: com convite válido (token no cadastro + mesmo e-mail) entra na empresa do convite;
-- sem convite, cria a própria empresa e vira administrador dela.
create or replace function public.ao_criar_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  c public.convites;
  nova_empresa uuid;
begin
  if meta ? 'convite' then
    select * into c from public.convites
     where token = meta ->> 'convite' and aceito_em is null and expira_em > now()
       and lower(email) = lower(new.email);
  end if;

  if c.id is not null then
    insert into public.perfis (user_id, empresa_id, email, nome, telefone, papel, permissoes, convidado)
    values (new.id, c.empresa_id, new.email, coalesce(meta ->> 'nome', ''), coalesce(meta ->> 'telefone', ''),
            c.papel, case when c.papel = 'admin' then public.permissoes_totais() else public.limpar_permissoes(c.permissoes) end, true);
    update public.convites set aceito_em = now(), aceito_por = new.id where id = c.id;
  else
    insert into public.empresas (nome_fantasia) values (coalesce(nullif(meta ->> 'empresa', ''), 'Minha empresa'))
    returning id into nova_empresa;
    insert into public.perfis (user_id, empresa_id, email, nome, telefone, papel, permissoes)
    values (new.id, nova_empresa, new.email, coalesce(meta ->> 'nome', ''), coalesce(meta ->> 'telefone', ''),
            'admin', public.permissoes_totais());
  end if;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- ============================================================ Convites
-- Informações públicas de um convite (para a tela de cadastro mostrar a empresa). Não revela o token de outros.
create or replace function public.ver_convite(p_token text)
returns table (email text, empresa text, valido boolean)
language sql stable security definer set search_path = public as $$
  select c.email, coalesce(nullif(e.nome_fantasia, ''), e.razao_social),
         (c.aceito_em is null and c.expira_em > now())
  from public.convites c join public.empresas e on e.id = c.empresa_id
  where c.token = p_token
$$;

-- Usuário que já tem conta aceita o convite (logado com o mesmo e-mail do convite).
create or replace function public.aceitar_convite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c public.convites;
  eu public.perfis;
  outros integer;
begin
  select * into c from public.convites where token = p_token;
  if c.id is null or c.aceito_em is not null or c.expira_em <= now() then
    raise exception 'convite_invalido' using hint = 'Convite inválido, expirado ou já usado.';
  end if;
  if lower(c.email) <> lower((select email from auth.users where id = auth.uid())) then
    raise exception 'convite_outro_email' using hint = 'Este convite foi enviado para outro e-mail.';
  end if;
  select * into eu from public.perfis where user_id = auth.uid();
  if eu.empresa_id = c.empresa_id then
    update public.convites set aceito_em = now(), aceito_por = auth.uid() where id = c.id;
    return c.empresa_id;
  end if;
  if eu.papel = 'admin' then
    select count(*) into outros from public.perfis where empresa_id = eu.empresa_id and user_id <> auth.uid();
    if outros > 0 then
      raise exception 'admin_com_equipe' using hint = 'Você administra outra empresa com equipe. Transfira a administração antes de aceitar.';
    end if;
  end if;
  update public.perfis
     set empresa_id = c.empresa_id, papel = c.papel, convidado = true,
         permissoes = case when c.papel = 'admin' then public.permissoes_totais() else public.limpar_permissoes(c.permissoes) end
   where user_id = auth.uid();
  update public.convites set aceito_em = now(), aceito_por = auth.uid() where id = c.id;
  return c.empresa_id;
end $$;

-- ============================================================ Administração da equipe
create or replace function public.definir_acesso(p_user uuid, p_papel text, p_permissoes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  alvo public.perfis;
  admins integer;
begin
  if not public.sou_admin() then raise exception 'sem_permissao'; end if;
  select * into alvo from public.perfis where user_id = p_user;
  if alvo.user_id is null or alvo.empresa_id <> public.minha_empresa() then raise exception 'usuario_nao_encontrado'; end if;
  if p_papel not in ('admin','membro') then raise exception 'papel_invalido'; end if;
  if alvo.papel = 'admin' and p_papel <> 'admin' then
    select count(*) into admins from public.perfis where empresa_id = alvo.empresa_id and papel = 'admin';
    if admins <= 1 then raise exception 'ultimo_admin' using hint = 'A empresa precisa de pelo menos um administrador.'; end if;
  end if;
  update public.perfis
     set papel = p_papel,
         permissoes = case when p_papel = 'admin' then public.permissoes_totais() else public.limpar_permissoes(p_permissoes) end
   where user_id = p_user;
end $$;

-- Remove alguém da equipe: a pessoa continua com a conta, mas passa para uma empresa própria, vazia.
create or replace function public.remover_membro(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  alvo public.perfis;
  admins integer;
  nova_empresa uuid;
begin
  if not public.sou_admin() then raise exception 'sem_permissao'; end if;
  select * into alvo from public.perfis where user_id = p_user;
  if alvo.user_id is null or alvo.empresa_id <> public.minha_empresa() then raise exception 'usuario_nao_encontrado'; end if;
  if alvo.papel = 'admin' then
    select count(*) into admins from public.perfis where empresa_id = alvo.empresa_id and papel = 'admin';
    if admins <= 1 then raise exception 'ultimo_admin' using hint = 'A empresa precisa de pelo menos um administrador.'; end if;
  end if;
  insert into public.empresas (nome_fantasia) values ('Minha empresa') returning id into nova_empresa;
  update public.perfis set empresa_id = nova_empresa, papel = 'admin', permissoes = public.permissoes_totais(), convidado = false
   where user_id = p_user;
end $$;

-- ============================================================ Dados do ERP com controle de versão
-- Grava só se ninguém tiver alterado desde a versão que o navegador carregou (p_versao; 0 = ainda não existe).
-- Em caso de conflito devolve null: o navegador busca a versão nova, mescla e tenta de novo.
create or replace function public.salvar_dado(p_chave text, p_valor jsonb, p_versao integer) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  secao text := public.secao_da_chave(p_chave);
  v integer;
begin
  if secao is null then raise exception 'chave_invalida'; end if;
  if not (public.pode(secao, 'criar') or public.pode(secao, 'editar')) then
    raise exception 'sem_permissao' using hint = 'Você não tem permissão para salvar nesta área.';
  end if;
  if coalesce(p_versao, 0) = 0 then
    insert into public.dados_empresa (empresa_id, chave, valor, versao, atualizado_por)
    values (public.minha_empresa(), p_chave, p_valor, 1, auth.uid())
    on conflict (empresa_id, chave) do nothing
    returning versao into v;
  else
    update public.dados_empresa
       set valor = p_valor, versao = versao + 1, atualizado_por = auth.uid(), atualizado_em = now()
     where empresa_id = public.minha_empresa() and chave = p_chave and versao = p_versao
    returning versao into v;
  end if;
  return v;
end $$;

-- ============================================================ Regras de acesso (RLS)
alter table public.empresas      enable row level security;
alter table public.perfis        enable row level security;
alter table public.convites      enable row level security;
alter table public.dados_empresa enable row level security;

drop policy if exists "ver a própria empresa"      on public.empresas;
drop policy if exists "admin edita a empresa"      on public.empresas;
create policy "ver a própria empresa" on public.empresas
  for select to authenticated using (id = public.minha_empresa());
create policy "admin edita a empresa" on public.empresas
  for update to authenticated using (id = public.minha_empresa() and public.sou_admin())
  with check (id = public.minha_empresa() and public.sou_admin());

drop policy if exists "ver a equipe"               on public.perfis;
drop policy if exists "editar o próprio perfil"    on public.perfis;
create policy "ver a equipe" on public.perfis
  for select to authenticated using (empresa_id = public.minha_empresa());
create policy "editar o próprio perfil" on public.perfis
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admin vê convites"          on public.convites;
drop policy if exists "admin cria convites"        on public.convites;
drop policy if exists "admin cancela convites"     on public.convites;
create policy "admin vê convites" on public.convites
  for select to authenticated using (empresa_id = public.minha_empresa() and public.sou_admin());
create policy "admin cria convites" on public.convites
  for insert to authenticated with check (empresa_id = public.minha_empresa() and public.sou_admin() and aceito_em is null);
create policy "admin cancela convites" on public.convites
  for delete to authenticated using (empresa_id = public.minha_empresa() and public.sou_admin());

drop policy if exists "ver dados da empresa"       on public.dados_empresa;
drop policy if exists "criar dados da empresa"     on public.dados_empresa;
drop policy if exists "alterar dados da empresa"   on public.dados_empresa;
drop policy if exists "apagar dados da empresa"    on public.dados_empresa;
create policy "ver dados da empresa" on public.dados_empresa
  for select to authenticated
  using (empresa_id = public.minha_empresa() and public.pode(public.secao_da_chave(chave), 'ver'));
create policy "criar dados da empresa" on public.dados_empresa
  for insert to authenticated
  with check (empresa_id = public.minha_empresa()
              and (public.pode(public.secao_da_chave(chave), 'criar') or public.pode(public.secao_da_chave(chave), 'editar')));
create policy "alterar dados da empresa" on public.dados_empresa
  for update to authenticated
  using (empresa_id = public.minha_empresa() and public.pode(public.secao_da_chave(chave), 'ver'))
  with check (empresa_id = public.minha_empresa()
              and (public.pode(public.secao_da_chave(chave), 'criar') or public.pode(public.secao_da_chave(chave), 'editar')));
create policy "apagar dados da empresa" on public.dados_empresa
  for delete to authenticated
  using (empresa_id = public.minha_empresa() and public.pode(public.secao_da_chave(chave), 'editar'));

-- Colunas que cada um pode alterar no próprio perfil (papel, permissões e empresa só pelas funções acima).
revoke all on public.empresas, public.perfis, public.convites, public.dados_empresa from anon;
revoke insert, update, delete on public.perfis from authenticated;
grant select on public.perfis to authenticated;
grant update (nome, telefone, cargo, foto) on public.perfis to authenticated;
revoke insert, delete on public.empresas from authenticated;
grant select on public.empresas to authenticated;
grant update (nome_fantasia, razao_social, cnpj, inscricao_estadual, telefone, email, site,
              cep, logradouro, numero, complemento, bairro, cidade, uf, pais, atualizado_em) on public.empresas to authenticated;
grant select, insert, delete on public.convites to authenticated;
grant select, insert, update, delete on public.dados_empresa to authenticated;

revoke execute on function public.ao_criar_usuario() from public, anon, authenticated;
grant execute on function public.ver_convite(text) to anon, authenticated;
grant execute on function public.aceitar_convite(text), public.definir_acesso(uuid, text, jsonb),
                           public.remover_membro(uuid), public.salvar_dado(text, jsonb, integer),
                           public.minha_empresa(), public.sou_admin(), public.pode(text, text)
  to authenticated;

-- ============================================================ Migração da v1
-- Usuários criados antes desta versão ganham empresa e perfil de administrador.
do $$
declare
  u record;
  nova_empresa uuid;
begin
  for u in select id, email, raw_user_meta_data as meta from auth.users
           where id not in (select user_id from public.perfis) loop
    insert into public.empresas (nome_fantasia)
    values (coalesce(nullif(u.meta ->> 'empresa', ''), 'Minha empresa')) returning id into nova_empresa;
    insert into public.perfis (user_id, empresa_id, email, nome, telefone, papel, permissoes)
    values (u.id, nova_empresa, u.email, coalesce(u.meta ->> 'nome', ''), coalesce(u.meta ->> 'telefone', ''),
            'admin', public.permissoes_totais());
  end loop;
end $$;

-- Dados da v1 (tabela erp_dados, um conjunto por usuário) passam para a empresa de cada usuário.
-- A tabela antiga fica como cópia de segurança, sem acesso pelo site.
do $$
begin
  if to_regclass('public.erp_dados') is not null then
    insert into public.dados_empresa (empresa_id, chave, valor, versao, atualizado_por, atualizado_em)
    select p.empresa_id, d.chave, d.valor, 1, d.user_id, d.atualizado_em
      from public.erp_dados d join public.perfis p on p.user_id = d.user_id
     where d.chave <> 'filtrosTodas:fixado'
    on conflict (empresa_id, chave) do nothing;
    alter table public.erp_dados rename to erp_dados_v1_backup;
    revoke all on public.erp_dados_v1_backup from anon, authenticated;
  end if;
end $$;
