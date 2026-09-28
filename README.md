# Comexta

Projeto web da Comexta (importação).

## Estrutura
- `index.html` — redireciona para a página de login
- `login/index.html` — página de login (azul e branco); "Criar nova conta" abre e-mail para lucas.comexta@gmail.com
- `erp/index.html` — ERP de Importação (arquivo único): Importação Simplificada e Formal, Cotações Salvas (lista e Kanban),
  Simulador de Carga (3D) e Cadastros. Dados salvos no navegador (localStorage).
- `api/login.js`, `api/logout.js` — login e logout (cookie de sessão assinado)
- `middleware.js` — só deixa abrir `/erp/` com sessão válida; sem ela, volta para `/login/`
- `lib/auth.js` — funções de senha e sessão
- `scripts/aprovar-cadastro.mjs` — aprova um cadastro

## Login e aprovação de cadastros
Variáveis de ambiente na Vercel (Settings → Environment Variables):
- `COMEXTA_SECRET` — chave aleatória que assina as sessões (trocar desconecta todo mundo)
- `COMEXTA_USERS` — usuários aprovados, separados por `;`, no formato `email:salt:hash`

Para aprovar um cadastro recebido por e-mail:
1. `node scripts/aprovar-cadastro.mjs cliente@empresa.com` — mostra uma senha provisória e a linha do usuário
2. Na Vercel, acrescente a linha em `COMEXTA_USERS` (separando com `;`) e faça **Redeploy**
3. Envie a senha provisória ao cliente; ao entrar, o botão "Entrar" leva direto ao ERP

Para remover o acesso, apague a linha do usuário em `COMEXTA_USERS` e faça Redeploy.

## Publicação
Push na branch `main` de `lucasvcomex-ui/Comexta` publica na Vercel (www.comexta.com.br).
Rotas: `/login/` e `/erp/`.
