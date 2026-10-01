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
- `supabase/schema.sql` — empresas, perfis, convites, dados da empresa e regras de acesso (RLS)

## Supabase
Projeto `oirmqirfhwaypfkkdvuy` (região São Paulo).
- **Login**: Supabase Auth (e-mail e senha).
- **Empresas e equipe**: quem cria conta sem convite vira administrador de uma empresa nova. O administrador
  convida outras pessoas em **Configurações → Equipe e permissões** (link com token, válido por 14 dias, só para o
  e-mail convidado) e define, por área (Cadastros, Cotações, Simulador, Processos), se cada pessoa pode visualizar, criar e editar.
  Quem entra por convite completa telefone, cargo e foto no primeiro acesso.
- **Dados**: tabela `dados_empresa` — cotações, simulações, clientes, fornecedores e produtos da empresa, com versão.
  Se duas pessoas salvam ao mesmo tempo, o ERP mescla as alterações item a item (e renumera cotações com número repetido).
- **Regras no banco (RLS)**: cada pessoa só vê a própria empresa; ler exige "visualizar", gravar exige "criar" ou
  "editar", apagar exige "editar"; papel, permissões e empresa só mudam pelas funções de administrador.
  A diferença entre criar e editar dentro de uma mesma lista é aplicada pelo ERP.
- **Personalização** (Configurações → Personalização, só administradores; quem for promovido a administrador
  também pode editar): cores do cabeçalho e do fundo e logo da empresa nos PDFs da cotação, e as listas de
  Responsáveis e Vendedores (nome completo e cargo). Todos os campos e filtros de Responsável e Vendedor do site
  (Nova Cotação Simplificada e Formal, Processos, filtros de Cotações Salvas e de Processos) usam essas listas.
  Fica em `empresas.personalizacao`.
- **Processos** (barra superior → Processos): lista dos processos de importação da empresa (PRC-0001…) com busca
  e filtro de status, e "Cadastrar Novo Processo" com as janelas Cliente, Produto, Transporte, Desembaraço, Financeiro e
  Numerário. O **Numerário** resume todos os custos lidos das janelas anteriores (mercadoria, frete e seguro em reais,
  valor aduaneiro, tributos e despesas) e faz o rateio por produto, sem e com crédito de tributos, com PDF — nos
  moldes do Numerário das cotações. Frete ou seguro em moeda diferente da mercadoria pedem câmbio próprio no Financeiro. É uma área de permissão própria (visualizar, criar, editar); membros começam sem acesso.
  Em **Template** (à direita, na lista) cada usuário escolhe, por janela do processo, as informações que aparecem
  em **Configurar Card** e **Configurar Lista**, quais filtros ficam na tela em **Configurar Filtros**, e alterna
  entre Lista e Cards. Fica em `perfis.preferencias`. A data de abertura fica no topo do processo (obrigatória).
- **Cotações Salvas**: em Cards, cada cotação tem duplicar, baixar PDF e excluir. O botão **Template** tem
  **Configurar Card**, **Configurar Lista** e **Configurar Filtros** (quais filtros ficam na tela), por usuário,
  no mesmo padrão de Processos (`perfis.preferencias.cotacoes`).
- **Cadastro → Clientes e Empresas**: uma lista só (chave `clientes:list`), com **Tipo de Cadastro** obrigatório
  (Cliente, Fabricante, Fornecedor, Despachante Aduaneiro, Agente de Carga, Armador, Transportadora, Funcionário).
  A antiga lista de Fornecedores é unida a ela automaticamente. Em Processos, Cliente, Agente de Carga e Despachante
  só aceitam empresas cadastradas do tipo correspondente (sugestões a partir de 3 letras; outro texto é apagado).
- **Clientes e Empresas** e **Produtos**: Lista ou Cards e **Template** (Configurar Card, Lista e Filtros) por usuário
  (`perfis.preferencias.cad_cliente` / `cad_produto`). Todo campo do formulário pode ser filtro (Informações Gerais,
  Endereços e Contatos; em Produtos, todas as janelas).
- **Exportar**: Cotações Salvas, Clientes e Empresas, Produtos e Processos têm botões **Excel** e **PDF** que baixam
  só os registros filtrados, com as colunas do Template (Lista ou Card, conforme o modo em uso).
- **Rascunhos e filtros** ficam só no navegador, separados por usuário.
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
