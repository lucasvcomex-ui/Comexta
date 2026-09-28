// Dados do ERP de cada usuário. Só a própria sessão acessa a própria pasta (dados/<id do usuário>/).
//   GET    /api/dados?chaves=a,b,c   -> { valores: { a: ..., b: null, ... } }
//   PUT    /api/dados?chave=a        (corpo: o valor em JSON)
//   DELETE /api/dados?chave=a
import { idUsuario, lerBlobJson, usuarioDaSessao } from '../lib/usuarios.js';
import { salvarBlobJson } from '../lib/usuarios-escrita.js';
import { json } from '../lib/respostas.js';

// Somente estas chaves ficam no servidor; rascunhos continuam no navegador.
const CHAVES = new Set([
  'cotacoes:index', 'cotacoesFormal:index', 'simulacoes:index',
  'clientes:list', 'fornecedores:list', 'produtos:list',
  'filtrosTodas:fixado',
]);
const TAMANHO_MAXIMO = 4_400_000; // a Vercel aceita até 4,5 MB por requisição

const caminho = (id, chave) => `dados/${id}/${chave.replace(':', '_')}.json`;

async function autenticar(request){
  const sessao = await usuarioDaSessao(request);
  return sessao ? idUsuario(sessao.usuario.email) : null;
}

function chaveDaUrl(request){
  const chave = new URL(request.url).searchParams.get('chave');
  return CHAVES.has(chave) ? chave : null;
}

export async function GET(request){
  const id = await autenticar(request);
  if(!id) return json(401, { ok:false, erro:'Sessão expirada.' });
  const chaves = (new URL(request.url).searchParams.get('chaves') || '').split(',').filter(c=>CHAVES.has(c));
  const lidos = await Promise.all(chaves.map(c => lerBlobJson(caminho(id, c))));
  return json(200, { ok:true, valores: Object.fromEntries(chaves.map((c, i) => [c, lidos[i]])) });
}

export async function PUT(request){
  const id = await autenticar(request);
  if(!id) return json(401, { ok:false, erro:'Sessão expirada.' });
  const chave = chaveDaUrl(request);
  if(!chave) return json(400, { ok:false, erro:'Chave inválida.' });
  const texto = await request.text();
  if(texto.length > TAMANHO_MAXIMO){
    return json(413, { ok:false, erro:'Os dados ficaram grandes demais para salvar. Remova anexos ou fotos muito pesados.' });
  }
  try{ JSON.parse(texto); }
  catch(e){ return json(400, { ok:false, erro:'Conteúdo inválido.' }); }
  await salvarBlobJson(caminho(id, chave), texto);
  return json(200, { ok:true });
}

export async function DELETE(request){
  const id = await autenticar(request);
  if(!id) return json(401, { ok:false, erro:'Sessão expirada.' });
  const chave = chaveDaUrl(request);
  if(!chave) return json(400, { ok:false, erro:'Chave inválida.' });
  await salvarBlobJson(caminho(id, chave), 'null');
  return json(200, { ok:true });
}
