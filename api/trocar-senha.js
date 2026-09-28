import { createSessionToken, novaSenhaHash, sessionCookie, sessionMaxAge, validarSenha, verifyPassword } from '../lib/auth.js';
import { usuarioDaSessao } from '../lib/usuarios.js';
import { salvarUsuario } from '../lib/usuarios-escrita.js';
import { json, lerJson } from '../lib/respostas.js';

export async function POST(request){
  const sessao = await usuarioDaSessao(request);
  if(!sessao) return json(401, { ok:false, erro:'Sua sessão expirou. Entre novamente.' });

  const body = await lerJson(request);
  if(!body) return json(400, { ok:false, erro:'Requisição inválida.' });
  const { senhaAtual, novaSenha } = body;

  const { usuario, lembrar } = sessao;
  if(!(await verifyPassword(usuario, senhaAtual))){
    await new Promise(r=>setTimeout(r, 400));
    return json(400, { ok:false, erro:'A senha atual está incorreta.' });
  }
  const erro = validarSenha(novaSenha);
  if(erro) return json(400, { ok:false, erro });
  if(novaSenha===senhaAtual) return json(400, { ok:false, erro:'A nova senha precisa ser diferente da atual.' });

  Object.assign(usuario, await novaSenhaHash(novaSenha));
  usuario.versao = (usuario.versao||0)+1; // encerra as sessões abertas em outros aparelhos
  usuario.senhaAlteradaEm = new Date().toISOString();
  await salvarUsuario(usuario);

  const token = await createSessionToken(usuario, process.env.COMEXTA_SECRET, lembrar);
  return json(200, { ok:true }, { 'set-cookie': sessionCookie(token, sessionMaxAge(lembrar)) });
}
