// Autenticação da Comexta — funções compartilhadas pelas rotas /api e pelo middleware.
// Usa apenas Web Crypto, para rodar tanto no Node (funções) quanto no Edge (middleware).
//
// Variável de ambiente (Vercel): COMEXTA_SECRET — chave aleatória que assina sessões e links de aprovação.

export const COOKIE_NAME = 'comexta_session';
export const DAY = 60*60*24;
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
export function isEmail(email){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length<=200; }

export async function sha256Hex(text){
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export function randomHex(bytes = 16){
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function hashPassword(password, saltHex){
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', hash:'SHA-256', salt:fromHex(saltHex), iterations:PBKDF2_ITERATIONS }, key, 256);
  return toHex(bits);
}

// Confere a senha de um usuário salvo ({ salt, hash }). Sem usuário, calcula mesmo assim
// para não revelar pelo tempo de resposta quais e-mails existem.
export async function verifyPassword(usuario, password){
  const hash = await hashPassword(String(password||''), usuario ? usuario.salt : '00'.repeat(16));
  return !!usuario && timingSafeEqual(enc.encode(hash), enc.encode(usuario.hash));
}

export async function novaSenhaHash(password){
  const salt = randomHex(16);
  return { salt, hash: await hashPassword(password, salt) };
}

export function validarSenha(senha){
  if(typeof senha!=='string' || senha.length<8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if(senha.length>200) return 'A senha é longa demais.';
  return null;
}

async function hmacKey(secret){
  return crypto.subtle.importKey('raw', enc.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign','verify']);
}

// Token assinado genérico: payload JSON + HMAC. `x` = expiração (segundos unix).
export async function signToken(data, secret, maxAgeSeconds){
  const payload = toB64url(enc.encode(JSON.stringify({ ...data, x:Math.floor(Date.now()/1000)+maxAgeSeconds })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return payload + '.' + toB64url(sig);
}

export async function verifyToken(token, secret){
  if(!token || !secret) return null;
  const [payload, sig] = String(token).split('.');
  if(!payload || !sig) return null;
  try{
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(payload));
    if(!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if(!data.x || data.x < Math.floor(Date.now()/1000)) return null;
    return data;
  }catch(e){ return null; }
}

// Sessão: { t:'s', e: email, v: versão da senha, l: lembrar }
export function createSessionToken(usuario, secret, lembrar){
  return signToken({ t:'s', e:usuario.email, v:usuario.versao||0, l:lembrar?1:0 }, secret, sessionMaxAge(lembrar));
}
export function sessionMaxAge(lembrar){ return lembrar ? 30*DAY : DAY; }

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
