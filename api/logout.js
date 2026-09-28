import { sessionCookie } from '../lib/auth.js';

export function GET(request){
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL('/login/', request.url).toString(),
      'set-cookie': sessionCookie('', 0),
      'cache-control': 'no-store',
    },
  });
}
