// "Esqueci minha senha": envia ao e-mail da pessoa um link de redefinição válido por 1 hora.
// A resposta é a mesma exista ou não o cadastro, para não revelar quais e-mails estão registrados.
import { isEmail, normalizeEmail, signToken } from '../lib/auth.js';
import { ativo, lerUsuario } from '../lib/usuarios.js';
import { salvarUsuario } from '../lib/usuarios-escrita.js';
import { emailConfigurado, enviarEmail, esc } from '../lib/email.js';
import { json, lerJson } from '../lib/respostas.js';

const VALIDADE = 60*60;          // 1 hora
const INTERVALO_MINIMO = 2*60*1000; // evita encher a caixa de alguém com pedidos seguidos
const RESPOSTA = { ok:true, mensagem:'Se este e-mail tiver cadastro, você vai receber em instantes um link para criar uma nova senha. Confira também a caixa de spam.' };

export async function POST(request){
  const secret = process.env.COMEXTA_SECRET;
  if(!secret || !process.env.BLOB_READ_WRITE_TOKEN || !emailConfigurado()){
    return json(503, { ok:false, erro:'A redefinição de senha ainda não está disponível. Fale com a equipe da Comexta.' });
  }

  const body = await lerJson(request);
  const email = normalizeEmail(body && body.email);
  if(!isEmail(email)) return json(400, { ok:false, erro:'Informe um e-mail válido.' });

  const usuario = await lerUsuario(email);
  if(!ativo(usuario)) return json(200, RESPOSTA);
  if(usuario.resetPedidoEm && Date.now()-Date.parse(usuario.resetPedidoEm) < INTERVALO_MINIMO) return json(200, RESPOSTA);

  usuario.resetPedidoEm = new Date().toISOString();
  await salvarUsuario(usuario);

  // O token leva a versão atual da senha: depois de usado (ou se a senha mudar), deixa de valer.
  const token = await signToken({ t:'r', e:usuario.email, v:usuario.versao||0 }, secret, VALIDADE);
  // Token no fragmento (#): não vai para o servidor nem no cabeçalho Referer.
  const link = new URL('/conta/redefinir/#t=' + token, request.url).toString();
  try{
    await enviarEmail({
      to: usuario.email,
      subject: 'Redefinição de senha — Comexta',
      html: `
        <div style="font-family:Arial,sans-serif;font-size:15px;color:#16222E;max-width:520px">
          <h2 style="color:#0D2740;margin:0 0 12px">Redefinir sua senha</h2>
          <p>Olá, ${esc(usuario.nome)}! Recebemos um pedido para criar uma nova senha para <b>${esc(usuario.email)}</b> no ERP da Comexta.</p>
          <p><a href="${esc(link)}" style="display:inline-block;background:#2F6FC4;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">Criar nova senha</a></p>
          <p style="color:#5B6B79;font-size:13px">O link vale por 1 hora e só pode ser usado uma vez.
          Se você não pediu a redefinição, ignore este e-mail — sua senha atual continua valendo.</p>
        </div>`,
    });
  }catch(err){
    console.error('Falha ao enviar e-mail de redefinição:', err);
    return json(502, { ok:false, erro:'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.' });
  }
  return json(200, RESPOSTA);
}
