// Autenticação da Comexta — funções compartilhadas pelas rotas /api e pelo middleware.
// Usa apenas Web Crypto, para rodar tanto no Node (funções) quanto no Edge (middleware).
//
// Variáveis de ambiente (configuradas na Vercel):
//   COMEXTA_SECRET  chave aleatória usada para assinar o cookie de sessão
//   COMEXTA_USERS   usuários aprovados, separados por ";" ou quebra de linha,
//                   no formato  email:salt:hash  (gerado por scripts/aprovar-cadastro.mjs)

export const COOKIE_NAME = 'comexta_session';
const PBKDF2_ITERATIONS = 210000;
const enc = new TextEncoder();

function toB64url(bytes){
  let s = '';
  for(const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromB64url(str){
  const s = atob(str.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(s, c=>c.charCodeAt(0));
}
function toHex(bytes){ return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
function fromHex(hex){ return Uint8Array.from(hex.match(/../g)||[], h=>parseInt(h,16)); }

function timingSafeEqual(a, b){
  if(a.length!==b.length) return false;
  let diff = 0;
  for(let i=0;i<a.length;i++) diff |= a[i]^b[i];
  return diff===0;
}

export function normalizeEmail(email){ return String(email||'').trim().toLowerCase(); }

export function parseUsers(raw){
  const users = new Map();
  for(const entry of String(raw||'').split(/[;\n]/)){
    const parts = entry.trim().split(':');
    if(parts.length!==3) continue;
    const [email, salt, hash] = parts;
    if(email && salt && hash) users.set(normalizeEmail(email), { salt, hash });
  }
  return users;
}

export async function hashPassword(password, saltHex){
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', hash:'SHA-256', salt:fromHex(saltHex), iterations:PBKDF2_ITERATIONS }, key, 256);
  return toHex(bits);
}

export async function verifyPassword(users, email, password){
  const user = users.get(normalizeEmail(email));
  // Calcula o hash mesmo sem usuário, para não revelar pelo tempo de resposta quais e-mails existem.
  const salt = user ? user.salt : '00'.repeat(16);
  const hash = await hashPassword(String(password||''), salt);
  return !!user && timingSafeEqual(enc.encode(hash), enc.encode(user.hash));
}

async function hmacKey(secret){
  return crypto.subtle.importKey('raw', enc.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign','verify']);
}

export async function createSessionToken(email, secret, maxAgeSeconds){
  const payload = toB64url(enc.encode(JSON.stringify({ e:normalizeEmail(email), x:Math.floor(Date.now()/1000)+maxAgeSeconds })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return payload + '.' + toB64url(sig);
}

// Retorna o e-mail da sessão se o token for válido, não expirou e o usuário continua aprovado.
export async function verifySessionToken(token, secret, users){
  if(!token || !secret) return null;
  const [payload, sig] = token.split('.');
  if(!payload || !sig) return null;
  try{
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(payload));
    if(!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if(!data.e || !data.x || data.x < Math.floor(Date.now()/1000)) return null;
    if(!users.has(data.e)) return null;
    return data.e;
  }catch(e){ return null; }
}

export function readCookie(request, name){
  const header = request.headers.get('cookie') || '';
  for(const part of header.split(';')){
    const i = part.indexOf('=');
    if(i>-1 && part.slice(0,i).trim()===name) return decodeURIComponent(part.slice(i+1).trim());
  }
  return null;
}

export function sessionCookie(value, maxAgeSeconds){
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}
