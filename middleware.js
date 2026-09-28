import { next } from '@vercel/functions';
import { usuarioDaSessao } from './lib/usuarios.js';

// O ERP e a área da conta só abrem com sessão válida; sem ela, volta para o login.
export const config = {
  matcher: ['/erp', '/erp/:path*', '/conta', '/conta/:path*'],
};

export default async function middleware(request){
  let sessao = null;
  try{ sessao = await usuarioDaSessao(request); }
  catch(err){ console.error('Falha ao validar sessão:', err); }
  if(sessao) return next({ headers: { 'cache-control': 'private, no-store' } });
  return Response.redirect(new URL('/login/', request.url), 302);
}
