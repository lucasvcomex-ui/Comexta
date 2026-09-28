# Comexta

Projeto web da Comexta (importação).

## Estrutura
- `index.html` — redireciona para a página de login
- `login/index.html` — login e solicitação de cadastro (azul e branco)
- `conta/senha/index.html` — troca de senha (exige login)
- `conta/redefinir/index.html` — criar nova senha pelo link recebido por e-mail
- `erp/index.html` — ERP de Importação (arquivo único): Importação Simplificada e Formal, Cotações Salvas (lista e Kanban),
  Simulador de Carga (3D) e Cadastros. Dados salvos no navegador (localStorage).
- `api/cadastro.js` — recebe a solicitação e envia o e-mail de aprovação ao administrador
- `api/aprovar.js` — página do link do e-mail: aprovar, recusar ou revogar um cadastro
- `api/login.js`, `api/logout.js`, `api/trocar-senha.js` — sessão por cookie assinado
- `api/esqueci-senha.js`, `api/redefinir-senha.js` — link de redefinição enviado ao e-mail da pessoa (vale 1 hora, uso único)
- `middleware.js` — `/erp/` e `/conta/` só abrem com sessão válida; sem ela, volta para `/login/`
- `lib/` — senha e sessão (`auth.js`), cadastros no Vercel Blob (`usuarios*.js`), e-mail (`email.js`)

## Fluxo de cadastro
1. A pessoa preenche nome, empresa, e-mail, telefone e escolhe uma senha em "Criar nova conta".
2. O administrador (lucas.comexta@gmail.com) recebe um e-mail com o botão "Revisar e aprovar cadastro".
3. Ao aprovar, a pessoa já entra com o e-mail e a senha que escolheu; o botão "Entrar" leva ao ERP.
4. No ERP, "Trocar senha" altera a senha e desconecta os outros aparelhos. O mesmo link do e-mail serve para revogar o acesso.
5. Em "Esqueci minha senha", a pessoa recebe no próprio e-mail um link para criar uma nova senha e já entra no ERP.

## Configuração (Vercel → Settings → Environment Variables)
- `COMEXTA_SECRET` — chave aleatória que assina sessões e links de aprovação (trocar desconecta todo mundo)
- `BLOB_READ_WRITE_TOKEN` — criada automaticamente pelo Blob store privado `comexta-cadastros`
- `RESEND_API_KEY` — chave da API do [Resend](https://resend.com), usada para enviar os e-mails
- `RESEND_FROM` — remetente, `Comexta <nao-responda@comexta.com.br>`. O domínio comexta.com.br precisa estar
  verificado no Resend (Domains) para os e-mails chegarem aos clientes (aviso de aprovação e redefinição de senha).
  Enquanto não estiver, os pedidos de cadastro ainda chegam ao administrador pelo remetente de teste do Resend.
- `ADMIN_EMAIL` (opcional) — quem recebe os pedidos; padrão `lucas.comexta@gmail.com`

## Publicação
Push na branch `main` de `lucasvcomex-ui/Comexta` publica na Vercel (www.comexta.com.br).
Rotas: `/login/`, `/erp/` e `/conta/senha/`.
