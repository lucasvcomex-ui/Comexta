// Acrescenta o botão "Rastreio de Pedido" na tela de login (sem mexer no restante da página).
// O botão leva para /rastreio/, onde o cliente informa a referência do pedido e o CNPJ.
(function(){
  if(document.getElementById('rastreio-pedido-btn')) return;
  function criar(){
    var a = document.createElement('a');
    a.id = 'rastreio-pedido-btn'; a.href = '/rastreio/';
    a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>Rastreio de Pedido</span>';
    a.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;margin:16px auto 0;padding:12px 16px;width:100%;box-sizing:border-box;border:1.5px solid #173A5E;border-radius:12px;background:#fff;color:#173A5E;font:600 14.5px Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;';
    a.onmouseenter = function(){ a.style.background = '#EAF2FC'; }; a.onmouseleave = function(){ a.style.background = '#fff'; };
    return a;
  }
  function inserir(){
    if(document.getElementById('rastreio-pedido-btn')) return;
    var btn = criar(), alvo = null, nos = document.querySelectorAll('a,button,span,p,div');
    // 1) logo abaixo de "Ainda não tem conta? Criar nova conta"
    for(var i = 0; i < nos.length; i++){
      if(/criar nova conta/i.test(nos[i].textContent || '') && nos[i].children.length <= 2 && (nos[i].textContent || '').length < 120){ alvo = nos[i].tagName==='A' || nos[i].tagName==='BUTTON' ? (nos[i].parentElement || nos[i]) : nos[i]; break; }
    }
    if(alvo && alvo.parentNode){ alvo.parentNode.insertBefore(btn, alvo.nextSibling); return; }
    // 2) depois do formulário de login
    var f = document.querySelector('form');
    if(f && f.parentNode){ f.parentNode.insertBefore(btn, f.nextSibling); return; }
    // 3) botão fixo no rodapé da tela
    btn.style.cssText += 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);width:auto;max-width:320px;margin:0;';
    document.body.appendChild(btn);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', inserir); else inserir();
})();
