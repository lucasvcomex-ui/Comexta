import { DAY, isEmail, normalizeEmail, novaSenhaHash, signToken, validarSenha } from '../lib/auth.js';
import { lerUsuario } from '../lib/usuarios.js';
import { salvarUsuario } from '../lib/usuarios-escrita.js';
import { ADMIN_EMAIL, emailConfigurado, enviarEmail, esc } from '../lib/email.js';
import { json, lerJson } from '../lib/respostas.js';

const campo = (v, max) => String(v ?? '').trim().slice(0, max);

export async function POST(request){
  const secret = process.env.COMEXTA_SECRET;
  if(!secret || !process.env.BLOB_READ_WRITE_TOKEN || !emailConfigurado()){
    return json(503, { ok:false, erro:'O cadastro online ainda não está disponível. Fale com a equipe da Comexta.' });
  }

  const body = await lerJson(request);
  if(!body) return json(400, { ok:false, erro:'Requisição inválida.' });
  if(body.site) return json(200, { ok:true }); // campo invisível preenchido: robô

  const nome = campo(body.nome, 120);
  const empresa = campo(body.empresa, 120);
  const telefone = campo(body.telefone, 40);
  const email = normalizeEmail(body.email);
  if(!nome || !empresa || !email) return json(400, { ok:false, erro:'Preencha nome, empresa e e-mail.' });
  if(!isEmail(email)) return json(400, { ok:false, erro:'Informe um e-mail válido.' });
  const erroSenha = validarSenha(body.senha);
  if(erroSenha) return json(400, { ok:false, erro:erroSenha });

  const existente = await lerUsuario(email);
  if(existente && existente.status==='aprovado'){
    return json(409, { ok:false, erro:'Este e-mail já tem cadastro aprovado. Use o botão Entrar.' });
  }

  const usuario = await salvarUsuario({
    email, nome, empresa, telefone,
    ...(await novaSenhaHash(body.senha)),
    status: 'pendente',
    versao: existente ? (existente.versao||0)+1 : 0,
    criadoEm: new Date().toISOString(),
  });

  const token = await signToken({ t:'a', e:email }, secret, 14*DAY);
  const link = new URL('/api/aprovar?t=' + encodeURIComponent(token), request.url).toString();
  try{
    await enviarEmail({
      to: ADMIN_EMAIL(),
      replyTo: email,
      subject: `Novo cadastro para aprovar — ${nome} (${empresa})`,
      html: `
        <div style="font-family:Arial,sans-serif;font-size:15px;color:#16222E;max-width:520px">
          <h2 style="color:#0D2740;margin:0 0 12px">Nova solicitação de cadastro</h2>
          <p>Alguém pediu acesso ao ERP da Comexta:</p>
          <table style="border-collapse:collapse;margin:12px 0 20px">
            <tr><td style="padding:4px 14px 4px 0;color:#5B6B79">Nome</td><td><b>${esc(nome)}</b></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#5B6B79">Empresa</td><td><b>${esc(empresa)}</b></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#5B6B79">E-mail</td><td><b>${esc(email)}</b></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#5B6B79">Telefone</td><td><b>${esc(telefone || 'não informado')}</b></td></tr>
          </table>
          <p><a href="${esc(link)}" style="display:inline-block;background:#2F6FC4;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">Revisar e aprovar cadastro</a></p>
          <p style="color:#5B6B79;font-size:13px">O link abre uma página para aprovar ou recusar e vale por 14 dias.
          Não encaminhe este e-mail: quem tiver o link pode aprovar o cadastro.</p>
        </div>`,
    });
  }catch(err){
    console.error('Falha ao enviar e-mail de cadastro:', err);
    return json(502, { ok:false, erro:'Não foi possível enviar sua solicitação agora. Tente novamente em alguns minutos.' });
  }

  return json(200, { ok:true, usuario:{ email:usuario.email } });
}
