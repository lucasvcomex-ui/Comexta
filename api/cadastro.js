// Criar conta: não exige aprovação. A pessoa já entra no ERP; o administrador recebe um aviso
// por e-mail (se o envio falhar, o cadastro continua valendo) com link para revogar o acesso.
import { DAY, createSessionToken, isEmail, normalizeEmail, novaSenhaHash, sessionCookie, sessionMaxAge, signToken, validarSenha } from '../lib/auth.js';
import { ativo, lerUsuario } from '../lib/usuarios.js';
import { salvarUsuario } from '../lib/usuarios-escrita.js';
import { ADMIN_EMAIL, emailConfigurado, enviarEmail, esc } from '../lib/email.js';
import { json, lerJson } from '../lib/respostas.js';

const campo = (v, max) => String(v ?? '').trim().slice(0, max);

export async function POST(request){
  const secret = process.env.COMEXTA_SECRET;
  if(!secret || !process.env.BLOB_READ_WRITE_TOKEN){
    return json(503, { ok:false, erro:'O cadastro online ainda não está disponível. Fale com a equipe da Comexta.' });
  }

  const body = await lerJson(request);
  if(!body) return json(400, { ok:false, erro:'Requisição inválida.' });
  if(body.site) return json(400, { ok:false, erro:'Requisição inválida.' }); // campo invisível preenchido: robô

  const nome = campo(body.nome, 120);
  const empresa = campo(body.empresa, 120);
  const telefone = campo(body.telefone, 40);
  const email = normalizeEmail(body.email);
  if(!nome || !empresa || !email) return json(400, { ok:false, erro:'Preencha nome, empresa e e-mail.' });
  if(!isEmail(email)) return json(400, { ok:false, erro:'Informe um e-mail válido.' });
  const erroSenha = validarSenha(body.senha);
  if(erroSenha) return json(400, { ok:false, erro:erroSenha });

  const existente = await lerUsuario(email);
  if(existente){
    return json(409, { ok:false, erro: ativo(existente)
      ? 'Este e-mail já tem cadastro. Use o botão Entrar ou "Esqueci minha senha".'
      : 'Este e-mail não pode ser cadastrado. Fale com a equipe da Comexta.' });
  }

  const usuario = await salvarUsuario({
    email, nome, empresa, telefone,
    ...(await novaSenhaHash(body.senha)),
    status: 'aprovado',
    versao: 0,
    criadoEm: new Date().toISOString(),
  });

  if(emailConfigurado()){
    try{
      const token = await signToken({ t:'a', e:email }, secret, 90*DAY);
      const link = new URL('/api/aprovar?t=' + encodeURIComponent(token), request.url).toString();
      await enviarEmail({
        to: ADMIN_EMAIL(),
        replyTo: email,
        subject: `Novo cadastro na Comexta — ${nome} (${empresa})`,
        html: `
          <div style="font-family:Arial,sans-serif;font-size:15px;color:#16222E;max-width:520px">
            <h2 style="color:#0D2740;margin:0 0 12px">Novo cadastro no ERP</h2>
            <p>Uma nova conta foi criada e já tem acesso ao ERP da Comexta:</p>
            <table style="border-collapse:collapse;margin:12px 0 20px">
              <tr><td style="padding:4px 14px 4px 0;color:#5B6B79">Nome</td><td><b>${esc(nome)}</b></td></tr>
              <tr><td style="padding:4px 14px 4px 0;color:#5B6B79">Empresa</td><td><b>${esc(empresa)}</b></td></tr>
              <tr><td style="padding:4px 14px 4px 0;color:#5B6B79">E-mail</td><td><b>${esc(email)}</b></td></tr>
              <tr><td style="padding:4px 14px 4px 0;color:#5B6B79">Telefone</td><td><b>${esc(telefone || 'não informado')}</b></td></tr>
            </table>
            <p style="color:#5B6B79;font-size:13px">Se não reconhecer este cadastro, você pode
            <a href="${esc(link)}">revogar o acesso</a> (link válido por 90 dias; não encaminhe este e-mail).</p>
          </div>`,
      });
    }catch(err){
      console.error('Aviso de novo cadastro não enviado:', err);
    }
  }

  const sessao = await createSessionToken(usuario, secret, false);
  return json(200, { ok:true, redirect:'/erp/' }, { 'set-cookie': sessionCookie(sessao, sessionMaxAge(false)) });
}
