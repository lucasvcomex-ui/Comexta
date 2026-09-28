// Aprova um cadastro: gera uma senha provisória e a linha para a variável COMEXTA_USERS da Vercel.
//
// Uso:  node scripts/aprovar-cadastro.mjs cliente@empresa.com
//
// Depois: Vercel → projeto comexta → Settings → Environment Variables → COMEXTA_USERS,
// acrescente a linha gerada (separando usuários com ";") e faça Redeploy.
// Envie a senha provisória ao cliente por um canal seguro.
import { randomBytes } from 'node:crypto';
import { hashPassword, normalizeEmail } from '../lib/auth.js';

const email = normalizeEmail(process.argv[2]);
if(!/^[^\s@:;]+@[^\s@:;]+\.[^\s@:;]+$/.test(email)){
  console.error('Uso: node scripts/aprovar-cadastro.mjs cliente@empresa.com');
  process.exit(1);
}

const senha = randomBytes(9).toString('base64url');
const salt = randomBytes(16).toString('hex');
const hash = await hashPassword(senha, salt);

console.log('\nE-mail:           ' + email);
console.log('Senha provisória: ' + senha);
console.log('\nAcrescente em COMEXTA_USERS (Vercel):\n');
console.log(`${email}:${salt}:${hash}\n`);
