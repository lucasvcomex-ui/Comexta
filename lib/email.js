// Envio de e-mail pelo Resend (https://resend.com).
// Variáveis de ambiente (Vercel):
//   RESEND_API_KEY  chave da API do Resend (obrigatória)
//   RESEND_FROM     remetente; sem domínio verificado no Resend, use o padrão abaixo,
//                   que só entrega para o e-mail dono da conta Resend
//   ADMIN_EMAIL     quem aprova os cadastros (padrão: lucas.comexta@gmail.com)

export const ADMIN_EMAIL = () => process.env.ADMIN_EMAIL || 'lucas.comexta@gmail.com';
const FROM = () => process.env.RESEND_FROM || 'Comexta <onboarding@resend.dev>';

export function emailConfigurado(){ return !!process.env.RESEND_API_KEY; }

// Remetente com domínio próprio verificado permite avisar o cliente; o remetente de teste não.
export function podeAvisarCliente(){ return !!process.env.RESEND_FROM; }

export async function enviarEmail({ to, subject, html, replyTo }){
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from:FROM(), to:[to], subject, html, ...(replyTo ? { reply_to:replyTo } : {}) }),
  });
  if(!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

export function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
