// Rastreamento de containers — Kpler / MarineTraffic Container Tracking API v2
// (https://api.kpler.com/v2/container-tracking).
//
// A chave da API é secreta e fica SÓ aqui, no servidor: variável de ambiente KPLER_API_KEY (Vercel →
// Settings → Environment Variables). O navegador chama POST /api/rastreio com o token de login do usuário;
// esta função confere o login e a permissão (área Monitoramento de Carga), consulta a Kpler e devolve os dados já
// organizados para o ERP.
//
// Variáveis de ambiente:
//   KPLER_API_KEY                         (obrigatória) chave da Kpler — vai no cabeçalho "Authorization: Basic <chave>"
//   SUPABASE_URL e SUPABASE_ANON_KEY      (as mesmas das outras funções do projeto)

const KPLER = 'https://api.kpler.com/v2/container-tracking';
// URL e chave PÚBLICA (publishable) do Supabase: são os mesmos valores de supabase-client.js, que todo visitante do site já baixa.
// Servem de padrão para esta função funcionar sem configurar nada; as variáveis SUPABASE_URL / SUPABASE_ANON_KEY, se existirem, têm prioridade.
const SUPABASE_URL_PADRAO = 'https://oirmqirfhwaypfkkdvuy.supabase.co';
const SUPABASE_CHAVE_PUBLICA_PADRAO = 'sb_publishable_XK2kW6cm7y0EFzqgJ90Few_nCcaQwBD';
const CONTAINER_RE = /^[A-Z]{4}\d{7}$/;       // ISO 6346: 4 letras + 7 números (ex.: MSKU1234567)
const SCAC_RE = /^[A-Z0-9]{2,5}$/;            // "AUTO" deixa a Kpler descobrir o armador

const resposta = (res, status, corpo) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corpo));
};

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const partes = [];
  for await (const p of req) partes.push(p);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch { return {}; }
}

/* ------------------------------ login e permissão ------------------------------ */
async function verificarUsuario(token) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL_PADRAO;
  const chave = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_CHAVE_PUBLICA_PADRAO;
  if (!url || !chave) return { ok: false, status: 500, erro: 'config', mensagem: 'Configuração do Supabase ausente no servidor.' };
  if (!token) return { ok: false, status: 401, erro: 'sem_login' };
  const cab = { apikey: chave, Authorization: 'Bearer ' + token };
  const u = await fetch(url + '/auth/v1/user', { headers: cab, signal: AbortSignal.timeout(8000) });
  if (!u.ok) return { ok: false, status: 401, erro: 'sem_login' };
  const usuario = await u.json();
  const p = await fetch(url + '/rest/v1/perfis?select=papel,permissoes&user_id=eq.' + encodeURIComponent(usuario.id), { headers: cab, signal: AbortSignal.timeout(8000) });
  const perfil = p.ok ? (await p.json())[0] : null;
  if (!perfil) return { ok: false, status: 403, erro: 'sem_permissao' };
  // Área "Monitoramento de Carga"; quem ainda não a tem definida herda a permissão de Processos.
  const perms = perfil.permissoes || {};
  const area = perms.monitoramento || perms.processos || {};
  const pode = perfil.papel === 'admin' || !!area.criar || !!area.editar;
  return pode ? { ok: true, usuario } : { ok: false, status: 403, erro: 'sem_permissao' };
}

/* ---------------------------------- Kpler ---------------------------------- */
async function kpler(caminho, { method = 'GET', query, corpo } = {}) {
  const url = new URL(KPLER + caminho);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const r = await fetch(url, {
    method,
    headers: { Authorization: 'Basic ' + process.env.KPLER_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  let dados = null; try { dados = await r.json(); } catch { /* sem corpo */ }
  return { ok: r.ok, status: r.status, dados };
}
const mensagemKpler = k => ((k.dados && k.dados.errors) || []).map(e => e.description || e.code).filter(Boolean).join(' · ');

/* ---------------------- organização dos dados para o ERP ---------------------- */
// A Kpler manda horários em UTC + o deslocamento do porto; o ERP usa a data local do porto.
function dataLocal(d) {
  if (!d || !d.timestamp) return null;
  const ts = Date.parse(d.timestamp); if (Number.isNaN(ts)) return null;
  const desloc = Number(d.localTimeOffset) || 0;
  return { data: new Date(ts + desloc * 3600000).toISOString().slice(0, 10), real: d.status === 'actual', timestamp: d.timestamp };
}
const porto = p => (p && p.port) ? { nome: p.port.name || '', unlocode: p.port.unlocode || '', pais: p.port.country || '' } : null;

function eventosDaLinhaDoTempo(timeline) {
  const a = (((timeline || {}).data || {}).attributes) || {};
  const locais = new Map((a.locations || []).map(l => [l.id, l]));
  const navios = new Map((a.vessels || []).map(v => [v.id, v]));
  const dataDoEvento = (iso, loc) => {
    const ts = Date.parse(iso); if (Number.isNaN(ts)) return null;
    return new Date(ts + ((loc && Number(loc.localTimeOffset)) || 0) * 3600000).toISOString().slice(0, 10);
  };
  const dePorto = e => {
    const loc = locais.get(e.locationId);
    return { tipo: e.equipmentEventTypeName || e.transportEventTypeName, classificador: e.eventClassifierCode, data: dataDoEvento(e.eventDateTime, loc),
      momento: e.eventDateTime, local: loc ? [loc.name, loc.country].filter(Boolean).join(', ') : '', unlocode: loc ? (loc.unlocode || '') : '',
      navio: (navios.get(e.vesselId) || {}).name || '', vazio: e.equipmentEmptyIndicator || null, ordem: e.eventOrder || 0 };
  };
  const todos = [ ...(a.equipmentEvents || []).map(dePorto), ...(a.transportEvents || []).map(e => ({ ...dePorto(e), transporte: true })) ];
  return todos.filter(e => e.momento).sort((x, y) => Date.parse(x.momento) - Date.parse(y.momento) || x.ordem - y.ordem);
}

export function normalizarShipment(shipment, timeline) {
  const d = (shipment || {}).data || {}, a = d.attributes || {};
  const pol = a.portOfLoading || {}, pod = a.portOfDischarge || {};
  const eventos = eventosDaLinhaDoTempo(timeline);
  // Devolução do vazio: última entrada/devolução REAL do container vazio num terminal/depósito.
  const dev = [...eventos].reverse().find(e => !e.transporte && (e.tipo === 'gate_in' || e.tipo === 'drop_off') && e.vazio === 'empty' && e.classificador === 'actual');
  return {
    shipmentId: d.shipmentId || null,
    situacao: a.transportationStatus || null,
    containers: (a.containers || []).map(c => ({ numero: c.number, tipo: c.type || '', iso: c.isoCode || '' })),
    portoOrigem: porto(pol), portoDestino: porto(pod),
    etd: dataLocal(pol.departureDate), eta: dataLocal(pod.arrivalDate),
    navio: (a.currentVessel || {}).name || (pol.loadingVessel || {}).name || '', viagem: pol.voyageNumber || '',
    atrasoDias: (a.insights && a.insights.arrivalDelayDays != null) ? a.insights.arrivalDelayDays : null,
    etaInicialArmador: (a.insights && a.insights.initialCarrierEta) || null,
    transbordos: (a.portsOfTransshipment || []).map(t => ({ ...porto(t), chegada: dataLocal(t.arrivalDate), partida: dataLocal(t.departureDate) })),
    atualizadoNaApi: a.updated || null,
    link: ((shipment || {}).meta || {}).webViewLink || ((timeline || {}).meta || {}).webViewLink || '',
    eventos: eventos.slice(-30),
    devolucaoSugerida: dev ? dev.data : null,
  };
}
export const __testes = { dataLocal, eventosDaLinhaDoTempo };

/* ---------------------------------- rota ---------------------------------- */
export default async function handler(req, res) {
  // GET /api/rastreio → diagnóstico rápido (só mostra se as peças estão configuradas, nunca os valores).
  if (req.method === 'GET') return resposta(res, 200, { ok: true, funcao: 'rastreio', kplerConfigurada: !!process.env.KPLER_API_KEY, supabaseConfigurado: true,
    dica: process.env.KPLER_API_KEY ? 'Função publicada e chave da Kpler encontrada.' : 'Função publicada, mas falta a variável KPLER_API_KEY (Production) ou um novo deploy depois de criá-la.' });
  if (req.method !== 'POST') return resposta(res, 405, { ok: false, erro: 'metodo' });
  if (!process.env.KPLER_API_KEY) return resposta(res, 503, { ok: false, erro: 'sem_chave', mensagem: 'A API de rastreamento não está configurada (falta KPLER_API_KEY na Vercel).' });

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const quem = await verificarUsuario(token);
    if (!quem.ok) return resposta(res, quem.status, { ok: false, erro: quem.erro, mensagem: quem.mensagem });

    const corpo = await lerCorpo(req);
    const container = String(corpo.container || '').toUpperCase().replace(/[\s-]/g, '');
    const scac = String(corpo.scac || 'AUTO').toUpperCase().trim() || 'AUTO';
    const criar = corpo.criar !== false;
    if (!CONTAINER_RE.test(container)) return resposta(res, 400, { ok: false, erro: 'container_invalido', mensagem: 'Número de container inválido (use 4 letras + 7 números, ex.: MSKU1234567).' });
    if (scac !== 'AUTO' && !SCAC_RE.test(scac)) return resposta(res, 400, { ok: false, erro: 'scac_invalido', mensagem: 'Código do armador (SCAC) inválido. Use AUTO ou o código de 2 a 5 letras (ex.: MAEU).' });

    // 1) já existe pedido de rastreio para este container? (inclui os criados por outras pessoas da empresa)
    const lista = await kpler('/tracking-requests', { query: { 'filter[referenceNumber]': container, 'filter[inclOrgRecords]': 'true' } });
    if (lista.status === 401 || lista.status === 403) return resposta(res, 502, { ok: false, erro: 'chave_recusada', mensagem: 'A Kpler recusou a chave de API (KPLER_API_KEY).' });
    if (lista.status === 429) return resposta(res, 429, { ok: false, erro: 'limite', mensagem: 'Limite de consultas da Kpler atingido. Tente de novo em instantes.' });
    if (!lista.ok) return resposta(res, 502, { ok: false, erro: 'kpler', mensagem: mensagemKpler(lista) || ('Erro ' + lista.status + ' na Kpler.') });
    const existentes = ((lista.dados || {}).data || [])
      .filter(x => (x.attributes || {}).referenceNumberType === 'container' && String((x.attributes || {}).referenceNumber || '').toUpperCase() === container)
      .sort((p, q) => Date.parse((q.attributes || {}).created || 0) - Date.parse((p.attributes || {}).created || 0));
    let pedido = existentes.find(x => x.attributes.status !== 'request_failed' && x.attributes.status !== 'tracking_ended') || existentes.find(x => x.attributes.status === 'tracking_ended') || null;

    // 2) senão, cria (só quando permitido)
    let criado = false;
    if (!pedido) {
      if (!criar) {
        const falho = existentes[0];
        return resposta(res, 200, { ok: true, status: falho ? 'request_failed' : 'nao_encontrado', falha: falho ? (falho.attributes.failed_reason || null) : null, container });
      }
      const cr = await kpler('/tracking-requests', { method: 'POST', corpo: { data: [{ type: 'tracking_request', attributes: { referenceNumberType: 'container', referenceNumber: container, scac } }] } });
      if (cr.status === 429) return resposta(res, 429, { ok: false, erro: 'limite', mensagem: 'Limite de consultas da Kpler atingido. Tente de novo em instantes.' });
      if (!cr.ok) return resposta(res, cr.status === 400 || cr.status === 422 ? 422 : 502, { ok: false, erro: 'kpler', mensagem: mensagemKpler(cr) || ('A Kpler não aceitou o pedido (erro ' + cr.status + ').') });
      pedido = ((cr.dados || {}).data || [])[0];
      if (!pedido) return resposta(res, 502, { ok: false, erro: 'kpler', mensagem: 'Resposta inesperada da Kpler ao criar o rastreio.' });
      criado = true;
    }

    const at = pedido.attributes || {};
    const shipmentId = (((pedido.relationships || {}).shipment || {}).data || {}).shipmentId || null;
    const base = { ok: true, container, criado, trackingRequestId: pedido.trackingRequestId, status: at.status || null, falha: at.failed_reason || null,
      armador: at.carrier ? { scac: at.carrier.scac || '', nome: at.carrier.name || '' } : null };
    if (!shipmentId) return resposta(res, 200, base);

    // 3) dados da viagem + linha do tempo
    const [resumo, linha] = await Promise.all([ kpler('/shipments/' + encodeURIComponent(shipmentId)), kpler('/shipments/' + encodeURIComponent(shipmentId) + '/transportation-timeline') ]);
    if (!resumo.ok) return resposta(res, 502, { ok: false, erro: 'kpler', mensagem: mensagemKpler(resumo) || ('Erro ' + resumo.status + ' ao ler a viagem na Kpler.') });
    return resposta(res, 200, { ...base, ...normalizarShipment(resumo.dados, linha.ok ? linha.dados : null) });
  } catch (e) {
    const tempo = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return resposta(res, tempo ? 504 : 500, { ok: false, erro: tempo ? 'tempo_esgotado' : 'interno', mensagem: tempo ? 'A consulta demorou demais. Tente de novo.' : 'Falha ao consultar o rastreamento.' });
  }
}
