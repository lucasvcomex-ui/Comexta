# Comexta

Projeto web da Comexta (importação). Site estático na Vercel + Supabase (login e banco de dados).

## Estrutura
- `index.html` — redireciona para a página de login
- `login/index.html` — entrar, criar conta (sem aprovação) e "Esqueci minha senha"
- `conta/senha/index.html` — troca de senha (exige login)
- `conta/redefinir/index.html` — criar nova senha pelo link recebido por e-mail
- `erp/index.html` — ERP de Importação (arquivo único): Importação Simplificada e Formal, Cotações Salvas (lista e Kanban),
  Simulador de Carga (3D) e Cadastros
- `js/supabase-client.js` — conexão com o Supabase usada por todas as páginas
- `supabase/schema.sql` — tabela `erp_dados` e regras de acesso (RLS)

## Supabase
Projeto `oirmqirfhwaypfkkdvuy` (região São Paulo).
- **Login**: Supabase Auth (e-mail e senha). Nome, empresa e telefone ficam no perfil do usuário (`user_metadata`).
- **Dados**: tabela `erp_dados` — uma linha por usuário e chave (cotações, simulações, clientes, fornecedores,
  produtos, filtros), com o valor em JSON. As regras RLS só deixam cada usuário ler e alterar as próprias linhas.
- **Rascunhos** ficam só no navegador, separados por usuário.
- A chave publishable em `js/supabase-client.js` é pública por natureza; a proteção dos dados vem das regras RLS.

### Configuração no painel do Supabase
1. **SQL Editor** → cole `supabase/schema.sql` → **Run** (pode rodar de novo sem perder dados).
2. **Authentication → Sign In / Providers → Email** → desligue **Confirm email** (cadastro entra direto no ERP).
3. **Authentication → URL Configuration**:
   - Site URL: `https://www.comexta.com.br`
   - Redirect URLs: `https://www.comexta.com.br/**` e `https://comexta.com.br/**`
4. **E-mails para clientes** ("Esqueci minha senha"): o e-mail padrão do Supabase só entrega para membros da equipe
   do projeto. Para clientes, configure **Authentication → Emails → SMTP Settings** com um provedor
   (ex.: Resend, com o domínio comexta.com.br verificado).

## Publicação
Push na branch `main` de `lucasvcomex-ui/Comexta` publica na Vercel (www.comexta.com.br).
Rotas: `/login/`, `/erp/`, `/conta/senha/` e `/conta/redefinir/`.
