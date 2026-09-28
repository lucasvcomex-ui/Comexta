// Tudo fica no Vercel Blob privado (store "comexta-cadastros"):
//   usuarios/<id>.json          cadastro: { email, nome, empresa, telefone, salt, hash, status, versao, criadoEm, ... }
//   dados/<id>/<chave>.json     dados do ERP de cada usuário (cotações, cadastros, simulações...)
// <id> = sha256 do e-mail. status: 'aprovado' (ativo) ou 'recusado' (acesso revogado); cadastros antigos
// 'pendente' também contam como ativos, já que o cadastro não exige mais aprovação.
// A leitura usa fetch puro para funcionar também no middleware (Edge). A escrita fica em usuarios-escrita.js.
import { COOKIE_NAME, normalizeEmail, readCookie, sha256Hex, verifyToken } from './auth.js';

export function idUsuario(email){ return sha256Hex(normalizeEmail(email)); }
export async function caminhoUsuario(email){ return 'usuarios/' + await idUsuario(email) + '.json'; }

export function ativo(usuario){ return !!usuario && usuario.status!=='recusado'; }

function blobToken(){
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if(!token) throw new Error('BLOB_READ_WRITE_TOKEN não configurado');
  return token;
}

// Lê um JSON do Blob privado, sempre da origem (sem cache). null se não existir.
export async function lerBlobJson(caminho){
  const token = blobToken();
  const storeId = token.split('_')[3];
  const url = `https://${storeId}.private.blob.vercel-storage.com/${caminho}?cache=0`;
  const res = await fetch(url, { headers:{ authorization:`Bearer ${token}` } });
  if(res.status===404) return null;
  if(!res.ok) throw new Error(`Falha ao ler ${caminho}: ${res.status}`);
  return res.json();
}

export async function lerUsuario(email){
  return lerBlobJson(await caminhoUsuario(email));
}

// Retorna o usuário da sessão atual, se o cookie for válido, o acesso não foi revogado
// e a senha não foi trocada depois do login.
export async function usuarioDaSessao(request){
  const data = await verifyToken(readCookie(request, COOKIE_NAME), process.env.COMEXTA_SECRET);
  if(!data || data.t!=='s' || !data.e) return null;
  const usuario = await lerUsuario(data.e);
  if(!ativo(usuario) || (usuario.versao||0)!==data.v) return null;
  return { usuario, lembrar: !!data.l };
}
