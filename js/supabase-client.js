// Client do Supabase compartilhado pelas páginas (login, ERP, troca e redefinição de senha).
// Carregar antes: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js
// A chave publishable é pública por natureza: quem protege os dados são as regras (RLS) do banco
// — veja supabase/schema.sql.
(function(){
  const SUPABASE_URL = 'https://oirmqirfhwaypfkkdvuy.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XK2kW6cm7y0EFzqgJ90Few_nCcaQwBD';

  window.comextaSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // "implicit": o link de redefinição de senha funciona mesmo aberto em outro aparelho.
      flowType: 'implicit',
      storageKey: 'comexta-auth',
    },
  });

  // Mensagens do Supabase Auth em português.
  window.comextaErroAuth = function(error){
    const msg = (error && (error.message || error.msg)) || '';
    const code = (error && error.code) || '';
    if(code==='invalid_credentials' || /invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if(code==='email_not_confirmed' || /email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar: abra o link que enviamos para sua caixa de entrada.';
    if(code==='user_already_exists' || /already registered/i.test(msg)) return 'Este e-mail já tem cadastro. Use o botão Entrar ou "Esqueci minha senha".';
    if(code==='weak_password' || /password should be/i.test(msg)) return 'Senha fraca: use pelo menos 8 caracteres.';
    if(code==='same_password' || /should be different/i.test(msg)) return 'A nova senha precisa ser diferente da atual.';
    if(code==='over_email_send_rate_limit' || /rate limit/i.test(msg)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    if(code==='email_address_invalid' || /invalid.*email|email.*invalid/i.test(msg)) return 'Informe um e-mail válido.';
    if(code==='signup_disabled') return 'O cadastro de novas contas está desativado.';
    if(/fetch|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
    return 'Não foi possível concluir. Tente novamente.';
  };
})();
