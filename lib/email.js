// Envio de e-mail pelo Resend (https://resend.com).
// Variáveis de ambiente (Vercel):
//   RESEND_API_KEY  chave da API do Resend (obrigatória)
//   RESEND_FROM     remetente com domínio verificado no Resend, ex. "Comexta <nao-responda@comexta.com.br>".
//                   Necessário para enviar e-mails aos clientes (aprovação, redefinição de senha).
//   ADMIN_EMAIL     quem aprova os cadastros (padrão: lucas.comexta@gmail.com)

export const ADMIN_EMAIL = () => process.env.ADMIN_EMAIL || 'lucas.comexta@gmail.com';
// Remetente de teste do Resend: só entrega para o e-mail dono da conta Resend.
const FROM_TESTE = 'Comexta <onboarding@resend.dev>';

export function emailConfigurado(){ return !!process.env.RESEND_API_KEY; }
export function podeAvisarCliente(){ return !!process.env.RESEND_FROM; }

async function enviarVia(from, { to, subject, html, replyTo }){
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to:[to], subject, html, ...(replyTo ? { reply_to:replyTo } : {}) }),
  });
  if(!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// E-mails para o administrador caem para o remetente de teste se o domínio de RESEND_FROM
// ainda não estiver verificado — assim os pedidos de cadastro nunca deixam de chegar.
export async function enviarEmail(msg){
  const from = process.env.RESEND_FROM || FROM_TESTE;
  try{
    return await enviarVia(from, msg);
  }catch(err){
    if(from===FROM_TESTE || msg.to!==ADMIN_EMAIL()) throw err;
    console.error('Falha com RESEND_FROM, usando remetente de teste para o administrador:', err);
    return enviarVia(FROM_TESTE, msg);
  }
}

export function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
