// Dados do usuário logado, usados pelo ERP (saudação e separação dos rascunhos locais).
import { idUsuario, usuarioDaSessao } from '../lib/usuarios.js';
import { json } from '../lib/respostas.js';

export async function GET(request){
  const sessao = await usuarioDaSessao(request);
  if(!sessao) return json(401, { ok:false, erro:'Sessão expirada.' });
  const { email, nome, empresa } = sessao.usuario;
  return json(200, { ok:true, id: await idUsuario(email), email, nome, empresa });
}
