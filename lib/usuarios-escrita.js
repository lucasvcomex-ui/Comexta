import { put } from '@vercel/blob';
import { caminhoUsuario } from './usuarios.js';

export async function salvarBlobJson(caminho, conteudoJson){
  await put(caminho, conteudoJson, {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
}

export async function salvarUsuario(usuario){
  await salvarBlobJson(await caminhoUsuario(usuario.email), JSON.stringify(usuario));
  return usuario;
}
