import { next } from '@vercel/functions';
import { COOKIE_NAME, parseUsers, readCookie, verifySessionToken } from './lib/auth.js';

// O ERP só abre com sessão válida; sem ela, volta para o login.
export const config = {
  matcher: ['/erp', '/erp/:path*'],
};

export default async function middleware(request){
  const email = await verifySessionToken(
    readCookie(request, COOKIE_NAME),
    process.env.COMEXTA_SECRET,
    parseUsers(process.env.COMEXTA_USERS),
  );
  if(email) return next({ headers: { 'cache-control': 'private, no-store' } });
  return Response.redirect(new URL('/login/', request.url), 302);
}
