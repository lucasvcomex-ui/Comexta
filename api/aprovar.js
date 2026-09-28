// Link enviado por e-mail ao administrador a cada novo cadastro. GET mostra o cadastro com os botões
// para manter ou revogar o acesso; a decisão só vale no POST (assim, leitores de e-mail que abrem links sozinhos não aprovam nada).
import { verifyToken } from '../lib/auth.js';
import { lerUsuario } from '../lib/usuarios.js';
import { salvarUsuario } from '../lib/usuarios-escrita.js';
import { esc } from '../lib/email.js';
import { pagina } from '../lib/respostas.js';

const STATUS = { pendente:'Ativo', aprovado:'Ativo', recusado:'Acesso revogado' };

async function carregar(token){
  const data = await verifyToken(token, process.env.COMEXTA_SECRET);
  if(!data || data.t!=='a' || !data.e) return null;
  return lerUsuario(data.e);
}

function linkInvalido(){
  return pagina(400, 'Link inválido', `<h1>Link inválido ou expirado</h1>
    <p>Este link não é válido ou já expirou.</p>`);
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
  return pagina(200, 'Acesso ao ERP', `<h1>Acesso ao ERP</h1>
    <p>Revogar desconecta a pessoa na hora e impede novos logins. É possível reativar depois por este mesmo link.</p>
    ${dados(u)}
    <form method="POST" class="acoes">
      <input type="hidden" name="t" value="${esc(token)}">
      <button class="ok" name="decisao" value="aprovado">${u.status==='recusado' ? 'Reativar acesso' : 'Manter acesso'}</button>
      <button class="nao" name="decisao" value="recusado">${u.status==='recusado' ? 'Manter revogado' : 'Revogar acesso'}</button>
    </form>`);
}

export async function POST(request){
  const form = await request.formData().catch(()=>null);
  const token = form && form.get('t');
  const decisao = form && form.get('decisao');
  if(decisao!=='aprovado' && decisao!=='recusado') return linkInvalido();
  const u = await carregar(token);
  if(!u) return linkInvalido();

  const revogando = u.status!=='recusado' && decisao==='recusado';
  u.status = decisao;
  u.decididoEm = new Date().toISOString();
  if(revogando) u.versao = (u.versao||0)+1; // derruba sessões abertas
  await salvarUsuario(u);

  const titulo = decisao==='aprovado' ? 'Acesso ativo' : 'Acesso revogado';
  const nota = decisao==='aprovado'
    ? '<p>A pessoa pode entrar com o e-mail e a senha dela.</p>'
    : '<p>A pessoa foi desconectada e não consegue mais entrar. Os dados dela continuam guardados.</p>';
  return pagina(200, titulo, `<h1>${titulo}</h1>${dados(u)}${nota}`);
}
