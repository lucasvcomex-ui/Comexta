export function json(status, body, headers = {}){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...headers },
  });
}

export async function lerJson(request){
  try{ return await request.json(); }
  catch(e){ return null; }
}

// Página HTML simples no visual da Comexta (usada na aprovação de cadastros).
export function pagina(status, titulo, corpo){
  return new Response(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex"><title>Comexta · ${titulo}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;box-sizing:border-box;
  font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#16222E;background:linear-gradient(165deg,#173A5E 0%,#0D2740 100%);}
.card{background:#fff;border-radius:16px;padding:32px 30px;max-width:460px;width:100%;box-shadow:0 24px 60px -20px rgba(13,39,64,.35);}
h1{font-size:21px;margin:0 0 10px;color:#0D2740;}
p{font-size:14px;line-height:1.55;color:#5B6B79;margin:0 0 14px;}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:14px;margin:18px 0 22px;}
dt{color:#5B6B79;} dd{margin:0;font-weight:600;word-break:break-word;}
.acoes{display:flex;gap:10px;flex-wrap:wrap;}
button,.btn{flex:1;border:none;border-radius:10px;padding:12px 16px;font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit;text-align:center;text-decoration:none;}
.ok{background:#2F6FC4;color:#fff;} .nao{background:#F6E1DF;color:#9B2C2C;}
.tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#EAF2FC;color:#173A5E;}
</style></head><body><div class="card">${corpo}</div></body></html>`, {
    status,
    headers: { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store', 'x-robots-tag':'noindex' },
  });
}
