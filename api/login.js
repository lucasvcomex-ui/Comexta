import { createSessionToken, normalizeEmail, sessionCookie, sessionMaxAge, verifyPassword } from '../lib/auth.js';
import { lerUsuario } from '../lib/usuarios.js';
import { json, lerJson } from '../lib/respostas.js';

export async function POST(request){
  const secret = process.env.COMEXTA_SECRET;
  if(!secret || !process.env.BLOB_READ_WRITE_TOKEN){
    return json(503, { ok:false, erro:'Login ainda não configurado. Fale com a equipe da Comexta.' });
  }

  const body = await lerJson(request);
  if(!body) return json(400, { ok:false, erro:'Requisição inválida.' });
  const { email, senha, lembrar } = body;
  if(!email || !senha) return json(400, { ok:false, erro:'Informe e-mail e senha.' });

  const usuario = await lerUsuario(normalizeEmail(email));
  if(!(await verifyPassword(usuario, senha)) || usuario.status==='recusado'){
    await new Promise(r=>setTimeout(r, 400)); // desacelera tentativas repetidas
    return json(401, { ok:false, erro:'E-mail ou senha incorretos.' });
  }
  if(usuario.status!=='aprovado'){
    return json(403, { ok:false, erro:'Seu cadastro ainda está aguardando aprovação da equipe Comexta.' });
  }

  const token = await createSessionToken(usuario, secret, lembrar);
  return json(200, { ok:true, redirect:'/erp/' }, { 'set-cookie': sessionCookie(token, sessionMaxAge(lembrar)) });
}
