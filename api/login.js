import { parseUsers, verifyPassword, createSessionToken, sessionCookie } from '../lib/auth.js';

const DAY = 60*60*24;

function json(status, body, headers = {}){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...headers },
  });
}

export async function POST(request){
  const secret = process.env.COMEXTA_SECRET;
  const users = parseUsers(process.env.COMEXTA_USERS);
  if(!secret || users.size===0){
    return json(503, { ok:false, erro:'Login ainda não configurado. Fale com a equipe da Comexta.' });
  }

  let body;
  try{ body = await request.json(); }
  catch(e){ return json(400, { ok:false, erro:'Requisição inválida.' }); }

  const { email, senha, lembrar } = body || {};
  if(!email || !senha) return json(400, { ok:false, erro:'Informe e-mail e senha.' });

  if(!(await verifyPassword(users, email, senha))){
    await new Promise(r=>setTimeout(r, 400)); // desacelera tentativas repetidas
    return json(401, { ok:false, erro:'E-mail ou senha incorretos, ou cadastro ainda não aprovado.' });
  }

  const maxAge = lembrar ? 30*DAY : DAY;
  const token = await createSessionToken(email, secret, maxAge);
  return json(200, { ok:true, redirect:'/erp/' }, { 'set-cookie': sessionCookie(token, maxAge) });
}
