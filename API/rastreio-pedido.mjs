// Rastreio público de pedido — o cliente informa a REFERÊNCIA DO PEDIDO e o seu CNPJ (ou CPF).
// A busca do CNPJ é feita nos clientes cadastrados no Comexta. Só devolve dados quando a referência e o CNPJ
// pertencem ao mesmo cliente; nunca devolve custos, preços, observações internas nem dados de outros clientes.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY   (obrigatória) chave "service_role" do Supabase. É SECRETA: só existe no servidor.
//   SUPABASE_URL                (opcional) já vem com o padrão do projeto.

const SUPABASE_URL_PADRAO = 'https://oirmqirfhwaypfkkdvuy.supabase.co';
const CHAVES = ['clientes:list', 'vendasPed:list', 'processos:index', 'estoque:list', 'monitoramento:list'];
const PROC_STATUS = {
  aberto:'Aberto', producao:'Em Produção', transito_origem:'Em Trânsito Origem', warehouse_origem:'Warehouse Origem', desembaraco_origem:'Desembaraço Origem', porto_origem:'Porto Origem',
  transito_internacional:'Trânsito Internacional', porto_destino:'Porto Destino', desembaraco:'Desembaraço', desembaracado:'Desembaraçado', transito_destino:'Em Trânsito Destino', entregue:'Entregue', finalizado:'Finalizado', cancelado:'Cancelado',
};
const PROC_FLUXO = Object.keys(PROC_STATUS).filter(k=>k!=='cancelado');
const PROC_LEGADO = { transito:'transito_internacional', chegada:'porto_destino' };
const MODAIS = { maritimo:'Marítimo', aereo:'Aéreo', rodoviario:'Rodoviário', ferroviario:'Ferroviário', multimodal:'Multimodal' };
const STATUS_PEDIDO = { aberto:'Em aberto', aprovado:'Aprovado', faturado:'Faturado', enviado:'Enviado', entregue:'Entregue', cancelado:'Cancelado' };
const SIT_VIAGEM = { booked:'Reservado', not_arrived_at_port_of_loading:'Ainda não chegou ao porto de embarque', waiting_at_port_of_loading:'Aguardando no porto de embarque', underway_to_a_transhipment_port:'A caminho de um transbordo',
  waiting_at_a_transhipment_port:'Aguardando em transbordo', underway_to_port_of_discharge:'Em viagem ao porto de destino', waiting_at_port_of_discharge:'Aguardando no porto de destino', left_the_port_of_discharge:'Saiu do porto de destino', completed:'Concluído' };

const resposta = (res, status, corpo) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(corpo)); };
async function lerCorpo(req){
  if(req.body && typeof req.body==='object') return req.body;
  if(typeof req.body==='string'){ try{ return JSON.parse(req.body); }catch{ return {}; } }
  const partes = []; for await (const p of req) partes.push(p);
  try{ return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); }catch{ return {}; }
}
const norm = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const digitos = x => String(x ?? '').replace(/\D/g, '');
const statusProc = p => { const s = (p && p.status) || 'aberto'; return PROC_LEGADO[s] || s; };
const tiposDaEmpresa = e => { const l = Array.isArray(e && e.tiposCadastro) ? e.tiposCadastro : []; return l.length ? l : [(e && e.tipoCadastro) || 'cliente']; };

// Limite simples de tentativas por IP (frear tentativa de adivinhar CNPJ e referência)
const TENTATIVAS = new Map();
function limite(ip){
  const agora = Date.now(), janela = 10*60*1000, max = 20, l = (TENTATIVAS.get(ip) || []).filter(t=>agora - t < janela);
  l.push(agora); TENTATIVAS.set(ip, l);
  if(TENTATIVAS.size > 5000){ for(const [k, v] of TENTATIVAS) if(!v.some(t=>agora - t < janela)) TENTATIVAS.delete(k); }
  return l.length <= max;
}
async function lerDados(){
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL_PADRAO, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!chave) return { erro:'config' };
  const r = await fetch(`${url}/rest/v1/dados_empresa?select=*&chave=in.(${CHAVES.map(c=>encodeURIComponent(c)).join(',')})`, { headers:{ apikey:chave, Authorization:`Bearer ${chave}` } });
  if(!r.ok) return { erro:'banco', status:r.status };
  return { linhas: await r.json() };
}
function transporteDe(p){
  const lista = [p.transporte, ...(Array.isArray(p.transportes) ? p.transportes : [])].filter(Boolean);
  return lista.map(t=>({ modal:MODAIS[t.modal] || '', aereo:t.modal==='aereo', booking:t.booking || '', master:t.conhecimentoMaster || '', house:t.conhecimentoHouse || '', navio:t.navioVoo || '', origem:t.origem || '', destino:t.destino || '', etd:t.etd || '', eta:t.eta || '', chegada:t.chegada || '',
    containers:(t.containers || []).map(c=>c.numero).filter(Boolean) }));
}
function montarPedido(v, ctx){
  const grupos = new Map(), itens = (v.itens || []).filter(i=>i.descricao);
  const porProcesso = new Map(), estoque = [], semVinculo = [];
  itens.forEach(i=>{
    const num = x => Number(String(x ?? '0').replace(',', '.')) || 0, item = { descricao:i.descricao, sku:i.sku || '', quantidade:num(i.quantidade), un:i.un || '', precoVenda:num(i.precoUn) }, o = i.origem || {};
    if(o.tipo==='processo' && o.ref){ const pid = String(o.ref).split('|')[0]; if(!porProcesso.has(pid)) porProcesso.set(pid, []); porProcesso.get(pid).push(item); }
    else if(o.tipo==='estoque' && o.ref) estoque.push(item); else semVinculo.push(item);
  });
  const processos = [...porProcesso.entries()].map(([pid, its])=>{
    const p = ctx.processos.find(x=>x.id===pid); if(!p) return { id:pid, naoEncontrado:true, produtos:its };
    const st = statusProc(p), idx = PROC_FLUXO.indexOf(st);
    const mons = ctx.monitoramento.filter(m=>m.processoId===pid || m.referencia===pid).map(m=>({ container:m.container || '', situacao:m.rastreio && m.rastreio.situacao ? (SIT_VIAGEM[m.rastreio.situacao] || '') : '', atrasoDias:m.rastreio && m.rastreio.atrasoDias!=null ? m.rastreio.atrasoDias : null, atualizadoEm:(m.rastreio && m.rastreio.atualizadoEm) || '' }));
    return { id:pid, status:PROC_STATUS[st] || st, cancelado:st==='cancelado', passos:PROC_FLUXO.map((k, n)=>({ rotulo:PROC_STATUS[k], feito:idx>=0 && n<idx, atual:n===idx })), transportes:transporteDe(p), containers:mons, produtos:its };
  });
  return { id:v.id, referencia:v.numeroPedidoCliente || '', status:STATUS_PEDIDO[v.status] || v.status || '', dataPrevistaEntrega:v.dataPrevistaEntrega || '', processos, estoque, semVinculo };
}
export default async function handler(req, res){
  if(req.method!=='POST') return resposta(res, 405, { ok:false, erro:'metodo', mensagem:'Use POST.' });
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'ip');
  if(!limite(ip)) return resposta(res, 429, { ok:false, erro:'limite', mensagem:'Muitas consultas seguidas. Aguarde alguns minutos e tente de novo.' });
  const corpo = await lerCorpo(req), referencia = String(corpo.referencia || '').trim().slice(0, 80), doc = digitos(corpo.cnpj);
  if(norm(referencia).length < 3) return resposta(res, 400, { ok:false, erro:'dados', mensagem:'Informe a referência do pedido.' });
  if(doc.length!==14 && doc.length!==11) return resposta(res, 400, { ok:false, erro:'dados', mensagem:'Informe o CNPJ (14 números) ou CPF (11 números).' });
  let dados; try{ dados = await lerDados(); }catch(e){ return resposta(res, 502, { ok:false, erro:'banco', mensagem:'Não foi possível consultar agora. Tente novamente em instantes.' }); }
  if(dados.erro==='config') return resposta(res, 503, { ok:false, erro:'config', mensagem:'O rastreio de pedido ainda não foi ativado neste site (falta a variável SUPABASE_SERVICE_ROLE_KEY na Vercel).' });
  if(dados.erro) return resposta(res, 502, { ok:false, erro:'banco', mensagem:'Não foi possível consultar agora. Tente novamente em instantes.' });
  // agrupa as listas por empresa (cada empresa só enxerga os próprios dados)
  const porEmpresa = new Map();
  for(const l of dados.linhas){
    const emp = String(l.empresa_id ?? l.empresa ?? l.tenant_id ?? 'unica'); if(!porEmpresa.has(emp)) porEmpresa.set(emp, {});
    porEmpresa.get(emp)[l.chave] = Array.isArray(l.valor) ? l.valor : [];
  }
  const ref = norm(referencia), pedidos = [], diag = { linhas:dados.linhas.length, chaves:[...new Set(dados.linhas.map(l=>l.chave))], empresas:porEmpresa.size, clientesComDocumento:0, pedidosDoCliente:0, pedidosComReferencia:0 };
  let nomeCliente = '';
  for(const dadosEmp of porEmpresa.values()){
    const clientes = (dadosEmp['clientes:list'] || []).filter(c=>digitos(c.cnpjCpf)===doc && tiposDaEmpresa(c).includes('cliente'));
    if(!clientes.length) continue;
    diag.clientesComDocumento += clientes.length;
    const ctx = { processos:dadosEmp['processos:index'] || [], monitoramento:dadosEmp['monitoramento:list'] || [] };
    (dadosEmp['vendasPed:list'] || []).forEach(v=>{
      const doCliente = clientes.some(c=>v.clienteId===c.id || (v.cliente && norm(v.cliente)===norm(c.nomeFantasia || c.razaoSocial)));
      if(!doCliente || v.status==='cancelado') return;
      diag.pedidosDoCliente++;
      if([v.numeroPedidoCliente, v.id, v.idEcommerce, v.numeroCanal].some(x=>x && norm(x)===ref)){ diag.pedidosComReferencia++; pedidos.push(montarPedido(v, ctx)); nomeCliente = clientes[0].nomeFantasia || clientes[0].razaoSocial || ''; }
    });
  }
  // mesma resposta para "CNPJ não cadastrado" e "referência não encontrada": não revela qual dado existe
  if(!pedidos.length){ console.log('rastreio-pedido: nao encontrado', JSON.stringify(diag)); }   // sem dados pessoais: só contagens (Vercel → Logs)
  if(!pedidos.length) return resposta(res, 404, { ok:false, erro:'nao_encontrado', mensagem:'Não encontramos um pedido com essa referência para este CNPJ. Confira os dados e tente novamente.' });
  return resposta(res, 200, { ok:true, cliente:nomeCliente, pedidos });
}
