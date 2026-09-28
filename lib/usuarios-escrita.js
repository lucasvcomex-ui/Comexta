import { put } from '@vercel/blob';
import { caminhoUsuario } from './usuarios.js';

export async function salvarUsuario(usuario){
  await put(await caminhoUsuario(usuario.email), JSON.stringify(usuario), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  return usuario;
}
