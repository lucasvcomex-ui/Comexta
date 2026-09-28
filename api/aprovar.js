// Link enviado por e-mail ao administrador. GET mostra o cadastro com os botões;
// a decisão só vale no POST (assim, leitores de e-mail que abrem links sozinhos não aprovam nada).
import { verifyToken } from '../lib/auth.js';
import { lerUsuario } from '../lib/usuarios.js';
import { salvarUsuario } from '../lib/usuarios-escrita.js';
import { enviarEmail, esc, podeAvisarCliente } from '../lib/email.js';
import { pagina } from '../lib/respostas.js';

const STATUS = { pendente:'Aguardando aprovação', aprovado:'Aprovado', recusado:'Recusado' };

async function carregar(token){
  const data = await verifyToken(token, process.env.COMEXTA_SECRET);
  if(!data || data.t!=='a' || !data.e) return null;
  return lerUsuario(data.e);
}

function linkInvalido(){
  return pagina(400, 'Link inválido', `<h1>Link inválido ou expirado</h1>
    <p>Este link de aprovação não é válido ou já passou de 14 dias. Peça para a pessoa enviar o cadastro de novo.</p>`);
}

function dados(u){
  return `<dl>
    <dt>Nome</dt><dd>${esc(u.nome)}</dd>
    <dt>Empresa</dt><dd>${esc(u.empresa)}</dd>
    <dt>E-mail</dt><dd>${esc(u.email)}</dd>
    <dt>Telefone</dt><dd>${esc(u.telefone || 'não informado')}</dd>
    <dt>Situação</dt><dd><span class="tag">${STATUS[u.status] || esc(u.status)}</span></dd>
  </dl>`;
}

export async function GET(request){
  const token = new URL(request.url).searchParams.get('t');
  const u = await carregar(token);
  if(!u) return linkInvalido();
  return pagina(200, 'Aprovar cadastro', `<h1>Solicitação de cadastro</h1>
    <p>Aprovar libera o acesso ao ERP com o e-mail e a senha que a pessoa escolheu.</p>
    ${dados(u)}
    <form method="POST" class="acoes">
      <input type="hidden" name="t" value="${esc(token)}">
      <button class="ok" name="decisao" value="aprovado">${u.status==='aprovado' ? 'Manter aprovado' : 'Aprovar'}</button>
      <button class="nao" name="decisao" value="recusado">${u.status==='aprovado' ? 'Revogar acesso' : 'Recusar'}</button>
    </form>`);
}

export async function POST(request){
  const form = await request.formData().catch(()=>null);
  const token = form && form.get('t');
  const decisao = form && form.get('decisao');
  if(decisao!=='aprovado' && decisao!=='recusado') return linkInvalido();
  const u = await carregar(token);
  if(!u) return linkInvalido();

  const mudou = u.status!==decisao;
  u.status = decisao;
  u.decididoEm = new Date().toISOString();
  if(mudou && decisao==='recusado') u.versao = (u.versao||0)+1; // derruba sessões abertas
  await salvarUsuario(u);

  let aviso = '';
  if(mudou && decisao==='aprovado'){
    if(podeAvisarCliente()){
      try{
        await enviarEmail({
          to: u.email,
          subject: 'Seu cadastro na Comexta foi aprovado',
          html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16222E">
            <p>Olá, ${esc(u.nome)}!</p>
            <p>Seu cadastro foi aprovado. Entre com seu e-mail e a senha que você escolheu:</p>
            <p><a href="${esc(new URL('/login/', request.url).toString())}">${esc(new URL('/login/', request.url).host)}/login</a></p></div>`,
        });
        aviso = '<p>Enviamos um e-mail avisando a pessoa.</p>';
      }catch(err){
        console.error('Falha ao avisar cliente:', err);
        aviso = '<p>Não foi possível avisar a pessoa por e-mail — avise diretamente.</p>';
      }
    }else{
      aviso = '<p>Avise a pessoa de que ela já pode entrar com o e-mail e a senha que escolheu.</p>';
    }
  }

  const titulo = decisao==='aprovado' ? 'Cadastro aprovado' : 'Cadastro recusado';
  return pagina(200, titulo, `<h1>${titulo}</h1>${dados(u)}${aviso}`);
}
