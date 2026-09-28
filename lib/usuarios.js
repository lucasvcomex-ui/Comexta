// Cadastros ficam no Vercel Blob privado (store "comexta-cadastros"), um arquivo JSON por usuário:
//   usuarios/<sha256 do e-mail>.json
//   { email, nome, empresa, telefone, salt, hash, status: 'pendente'|'aprovado'|'recusado', versao, criadoEm, decididoEm }
// A leitura usa fetch puro para funcionar também no middleware (Edge). A escrita fica em usuarios-escrita.js.
import { COOKIE_NAME, normalizeEmail, readCookie, sha256Hex, verifyToken } from './auth.js';

export async function caminhoUsuario(email){
  return 'usuarios/' + await sha256Hex(normalizeEmail(email)) + '.json';
}

function blobToken(){
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if(!token) throw new Error('BLOB_READ_WRITE_TOKEN não configurado');
  return token;
}

export async function lerUsuario(email){
  const token = blobToken();
  const storeId = token.split('_')[3];
  const url = `https://${storeId}.private.blob.vercel-storage.com/${await caminhoUsuario(email)}?cache=0`;
  const res = await fetch(url, { headers:{ authorization:`Bearer ${token}` } });
  if(res.status===404) return null;
  if(!res.ok) throw new Error('Falha ao ler cadastro: ' + res.status);
  return res.json();
}

// Retorna o usuário da sessão atual, se o cookie for válido, o cadastro estiver aprovado
// e a senha não tiver sido trocada depois do login.
export async function usuarioDaSessao(request){
  const data = await verifyToken(readCookie(request, COOKIE_NAME), process.env.COMEXTA_SECRET);
  if(!data || data.t!=='s' || !data.e) return null;
  const usuario = await lerUsuario(data.e);
  if(!usuario || usuario.status!=='aprovado' || (usuario.versao||0)!==data.v) return null;
  return { usuario, lembrar: !!data.l };
}
