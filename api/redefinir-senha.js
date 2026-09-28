// Recebe o token do link de redefinição e a nova senha; em caso de sucesso já entra no ERP.
import { createSessionToken, novaSenhaHash, sessionCookie, sessionMaxAge, validarSenha, verifyToken } from '../lib/auth.js';
import { lerUsuario } from '../lib/usuarios.js';
import { salvarUsuario } from '../lib/usuarios-escrita.js';
import { json, lerJson } from '../lib/respostas.js';

const LINK_INVALIDO = 'Este link de redefinição é inválido, expirou ou já foi usado. Peça um novo em "Esqueci minha senha".';

export async function POST(request){
  const secret = process.env.COMEXTA_SECRET;
  const body = await lerJson(request);
  if(!body) return json(400, { ok:false, erro:'Requisição inválida.' });

  const data = await verifyToken(body.t, secret);
  if(!data || data.t!=='r' || !data.e) return json(400, { ok:false, erro:LINK_INVALIDO });
  const usuario = await lerUsuario(data.e);
  if(!usuario || usuario.status!=='aprovado' || (usuario.versao||0)!==data.v){
    return json(400, { ok:false, erro:LINK_INVALIDO });
  }

  const erro = validarSenha(body.novaSenha);
  if(erro) return json(400, { ok:false, erro });

  Object.assign(usuario, await novaSenhaHash(body.novaSenha));
  usuario.versao = (usuario.versao||0)+1; // invalida este link e as sessões abertas
  usuario.senhaAlteradaEm = new Date().toISOString();
  delete usuario.resetPedidoEm;
  await salvarUsuario(usuario);

  const token = await createSessionToken(usuario, secret, false);
  return json(200, { ok:true, redirect:'/erp/' }, { 'set-cookie': sessionCookie(token, sessionMaxAge(false)) });
}
