const STORAGE_KEY = 'vai-e-vem-mvp-v1';
const STATUS_FLOW = ['requested','accepted','going_to_pickup','picked_up','delivering','delivered'];
const STATUS_LABEL = {
  requested: 'Solicitado',
  accepted: 'Aceito',
  going_to_pickup: 'Indo para coleta',
  picked_up: 'Pedido coletado',
  delivering: 'Em entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const initialState = {
  role: 'client',
  pricing: { minimumPrice: 7, includedKm: 3, pricePerExtraKm: 1.5 },
  pix: { key: '', holder: 'Vai e Vem', city: 'Caruaru' },
  driver: { name: 'Motorista', lat: null, lng: null, updatedAt: null },
  orders: [],
};

let state = loadState();
let geoWatchId = null;
let installPrompt = null;

function loadState() {
  try {
    return { ...initialState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return structuredClone(initialState);
  }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function money(v) { return Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
function dt(v) { return new Date(v).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }); }
function calcPrice(distanceKm) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const extra = Math.max(0, km - state.pricing.includedKm);
  return Math.max(state.pricing.minimumPrice, state.pricing.minimumPrice + extra * state.pricing.pricePerExtraKm);
}
function activeOrders() { return state.orders.filter(o => !['delivered','cancelled'].includes(o.status)); }
function latestClientOrder() { return [...state.orders].sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0] || null; }
function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function orderCode(id) { return `VV-${id.slice(-6).toUpperCase()}`; }
function mapUrl() {
  if (state.driver.lat == null || state.driver.lng == null) return '';
  return `https://maps.google.com/maps?q=${state.driver.lat},${state.driver.lng}&z=16&output=embed`;
}
function navUrl(address) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`; }

function appShell(content) {
  return `<main class="shell">
    <header class="topbar">
      <div class="brand"><div class="logo">VV</div><div><h1>Vai e Vem</h1><div class="muted">Entregas simples · Caruaru-PE</div></div></div>
      <button id="installBtn" class="btn ghost" ${installPrompt ? '' : 'hidden'}>Adicionar à tela inicial</button>
    </header>
    <nav class="tabs">
      ${tab('client','Estabelecimento')}${tab('driver','Motorista')}${tab('admin','Admin')}
    </nav>
    ${content}
  </main>`;
}
function tab(role,label) { return `<button class="tab ${state.role===role?'active':''}" data-role="${role}">${label}</button>`; }

function clientView() {
  const last = latestClientOrder();
  return `<section class="grid two">
    <div class="card">
      <h2>Solicitar entrega</h2>
      <form id="orderForm">
        <label>Estabelecimento</label><input name="clientName" required placeholder="Nome do estabelecimento" />
        <label>Endereço de coleta</label>
        <div class="row"><input id="pickupAddress" name="pickupAddress" required placeholder="Rua, número, bairro" /><button type="button" id="useLocation" class="btn ghost">Minha localização</button></div>
        <label>Endereço de entrega</label><input name="deliveryAddress" required placeholder="Rua, número, bairro" />
        <label>Distância estimada (km)</label><input id="distanceKm" name="distanceKm" type="number" min="0" step="0.1" required value="3" />
        <div class="small">MVP: a distância ainda é informada no formulário. Na próxima integração ela virá automaticamente do serviço de rotas.</div>
        <label>Pagamento</label><select name="paymentMethod"><option value="money">Dinheiro</option><option value="pix">Pix</option></select>
        <label>Observações</label><textarea name="notes" placeholder="Referência, nome do destinatário, telefone..."></textarea>
        <hr />
        <div class="muted">Preço estimado</div><div id="pricePreview" class="price">${money(calcPrice(3))}</div>
        <button class="btn primary" type="submit">Solicitar entrega</button>
      </form>
    </div>
    <div class="card">
      <h2>Acompanhar pedido</h2>
      ${last ? trackingCard(last, 'client') : '<div class="empty">Nenhuma entrega criada ainda.</div>'}
    </div>
  </section>`;
}

function trackingCard(order, context) {
  const idx = STATUS_FLOW.indexOf(order.status);
  const steps = STATUS_FLOW.map((s,i) => `<div class="step ${i<=idx && idx>=0 ? 'done':''}">${STATUS_LABEL[s]}</div>`).join('');
  const map = mapUrl();
  const pix = order.paymentMethod === 'pix' ? `<div class="order"><strong>Pagamento Pix</strong><p class="small">${state.pix.key ? `Chave: ${escapeHtml(state.pix.key)} · ${escapeHtml(state.pix.holder)}` : 'Chave Pix ainda não configurada no Admin.'}</p></div>` : '';
  return `<div class="order">
    <div class="order-head"><div><div class="order-code">${orderCode(order.id)}</div><div class="small">${dt(order.createdAt)}</div></div><span class="status ${order.status}">${STATUS_LABEL[order.status]}</span></div>
    <p><strong>${escapeHtml(order.clientName)}</strong><br><span class="small">${escapeHtml(order.pickupAddress)} → ${escapeHtml(order.deliveryAddress)}</span></p>
    <div class="row wrap"><span class="badge">${order.distanceKm.toFixed(1)} km</span><span class="badge">${money(order.price)}</span><span class="badge">${order.paymentMethod==='pix'?'Pix':'Dinheiro'}</span></div>
    <div class="timeline">${steps}</div>
    ${map ? `<iframe class="map" title="Localização do motorista" src="${map}" loading="lazy"></iframe><div class="small">Localização atualizada: ${state.driver.updatedAt ? dt(state.driver.updatedAt) : '—'}</div>` : '<div class="empty">A localização do motorista aparecerá aqui quando o compartilhamento de GPS estiver ativo.</div>'}
    ${pix}
    ${chatBox(order, context)}
  </div>`;
}

function chatBox(order, context) {
  const msgs = (order.messages || []).map(m => `<div class="msg ${m.sender===context?'me':''}"><strong>${m.sender==='driver'?'Motorista':m.sender==='admin'?'Admin':'Estabelecimento'}:</strong> ${escapeHtml(m.text)}<div class="small">${dt(m.createdAt)}</div></div>`).join('');
  return `<hr /><h3>Conversa do pedido</h3><div class="chat">${msgs || '<div class="small">Sem mensagens.</div>'}</div>
    <form class="chatForm row" data-order="${order.id}" data-sender="${context}"><input name="message" required placeholder="Digite uma mensagem" /><button class="btn ghost">Enviar</button></form>`;
}

function driverView() {
  const pending = state.orders.filter(o => o.status === 'requested');
  const current = state.orders.find(o => !['requested','delivered','cancelled'].includes(o.status));
  const delivered = state.orders.filter(o => o.status === 'delivered');
  const now = new Date();
  const day = delivered.filter(o => new Date(o.updatedAt).toDateString() === now.toDateString()).reduce((s,o)=>s+o.price,0);
  const weekStart = Date.now()-7*86400000;
  const week = delivered.filter(o => new Date(o.updatedAt).getTime() >= weekStart).reduce((s,o)=>s+o.price,0);
  const month = delivered.filter(o => { const d=new Date(o.updatedAt); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); }).reduce((s,o)=>s+o.price,0);
  return `<section class="grid">
    <div class="card">
      <div class="order-head"><div><h2>Operação do motorista</h2><div class="muted">Motorista único no MVP</div></div><button id="gpsBtn" class="btn ${geoWatchId!==null?'danger':'ok'}">${geoWatchId!==null?'Parar GPS':'Compartilhar GPS'}</button></div>
      <div class="kpis"><div class="kpi"><span class="muted">Hoje</span><strong>${money(day)}</strong></div><div class="kpi"><span class="muted">7 dias</span><strong>${money(week)}</strong></div><div class="kpi"><span class="muted">Mês</span><strong>${money(month)}</strong></div></div>
    </div>
    ${current ? `<div class="card"><h2>Entrega atual</h2>${driverOrder(current)}</div>` : ''}
    <div class="card"><h2>Novas solicitações</h2>${pending.length ? pending.map(driverOrder).join('') : '<div class="empty">Nenhuma solicitação pendente.</div>'}</div>
    <div class="card"><h2>Histórico</h2>${delivered.length ? [...delivered].reverse().slice(0,20).map(o=>compactOrder(o)).join('') : '<div class="empty">Nenhuma entrega concluída.</div>'}</div>
  </section>`;
}

function driverOrder(order) {
  const next = nextStatus(order.status);
  return `<div class="order">
    <div class="order-head"><div><div class="order-code">${orderCode(order.id)}</div><strong>${escapeHtml(order.clientName)}</strong></div><span class="status ${order.status}">${STATUS_LABEL[order.status]}</span></div>
    <p class="small">Coleta: ${escapeHtml(order.pickupAddress)}<br>Destino: ${escapeHtml(order.deliveryAddress)}</p>
    <div class="row wrap"><span class="badge">${order.distanceKm.toFixed(1)} km</span><span class="badge">${money(order.price)}</span><a class="btn ghost" target="_blank" rel="noreferrer" href="${navUrl(order.pickupAddress)}">Navegar coleta</a><a class="btn ghost" target="_blank" rel="noreferrer" href="${navUrl(order.deliveryAddress)}">Navegar destino</a></div>
    <div class="row wrap" style="margin-top:10px">
      ${order.status==='requested'?`<button class="btn primary orderAction" data-id="${order.id}" data-action="accept">Aceitar</button>`:''}
      ${next && order.status!=='requested'?`<button class="btn ok orderAction" data-id="${order.id}" data-action="advance">${STATUS_LABEL[next]}</button>`:''}
      ${!['delivered','cancelled'].includes(order.status)?`<button class="btn danger orderAction" data-id="${order.id}" data-action="cancel">Cancelar</button>`:''}
    </div>
    ${chatBox(order,'driver')}
  </div>`;
}
function compactOrder(order) { return `<div class="order"><div class="order-head"><span class="order-code">${orderCode(order.id)}</span><span>${money(order.price)}</span></div><div class="small">${escapeHtml(order.clientName)} · ${dt(order.updatedAt)}</div></div>`; }
function nextStatus(status) { const i=STATUS_FLOW.indexOf(status); return i>=0 && i<STATUS_FLOW.length-1 ? STATUS_FLOW[i+1] : null; }

function adminView() {
  const active = activeOrders();
  const delivered = state.orders.filter(o=>o.status==='delivered');
  const total = delivered.reduce((s,o)=>s+o.price,0);
  return `<section class="grid two">
    <div class="card"><h2>Painel operacional</h2><div class="kpis"><div class="kpi"><span class="muted">Ativas</span><strong>${active.length}</strong></div><div class="kpi"><span class="muted">Concluídas</span><strong>${delivered.length}</strong></div><div class="kpi"><span class="muted">Valor</span><strong>${money(total)}</strong></div></div><hr /><h3>Pedidos em andamento</h3>${active.length?active.map(compactOrder).join(''):'<div class="empty">Sem entregas ativas.</div>'}</div>
    <div class="card"><h2>Configuração simples</h2><form id="settingsForm">
      <label>Valor mínimo</label><input name="minimumPrice" type="number" step="0.01" value="${state.pricing.minimumPrice}" />
      <label>KM incluídos no mínimo</label><input name="includedKm" type="number" step="0.1" value="${state.pricing.includedKm}" />
      <label>Preço por KM excedente</label><input name="pricePerExtraKm" type="number" step="0.01" value="${state.pricing.pricePerExtraKm}" />
      <label>Chave Pix</label><input name="pixKey" value="${escapeHtml(state.pix.key)}" placeholder="Configurar depois" />
      <label>Nome do motorista</label><input name="driverName" value="${escapeHtml(state.driver.name)}" />
      <button class="btn primary" style="margin-top:12px">Salvar configurações</button>
    </form></div>
    <div class="card"><h2>Localização do motorista</h2>${mapUrl()?`<iframe class="map" src="${mapUrl()}" title="Mapa motorista"></iframe><p class="small">${state.driver.lat.toFixed(5)}, ${state.driver.lng.toFixed(5)} · ${state.driver.updatedAt?dt(state.driver.updatedAt):''}</p>`:'<div class="empty">GPS ainda não compartilhado.</div>'}</div>
    <div class="card"><h2>Todos os pedidos</h2>${state.orders.length?[...state.orders].reverse().map(compactOrder).join(''):'<div class="empty">Nenhum pedido.</div>'}<hr /><button id="resetDemo" class="btn danger">Limpar dados locais do MVP</button></div>
  </section>`;
}

function render() {
  const view = state.role==='driver' ? driverView() : state.role==='admin' ? adminView() : clientView();
  document.querySelector('#app').innerHTML = appShell(view);
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => { state.role=b.dataset.role; saveState(); render(); }));
  document.querySelector('#installBtn')?.addEventListener('click', async () => { if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; render(); } });
  const distance = document.querySelector('#distanceKm');
  distance?.addEventListener('input', () => { const p=document.querySelector('#pricePreview'); if(p) p.textContent=money(calcPrice(distance.value)); });
  document.querySelector('#useLocation')?.addEventListener('click', () => {
    if (!navigator.geolocation) return alert('Geolocalização não disponível neste aparelho.');
    navigator.geolocation.getCurrentPosition(pos => {
      const input=document.querySelector('#pickupAddress');
      input.value=`Localização atual (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`;
      input.dataset.lat=pos.coords.latitude; input.dataset.lng=pos.coords.longitude;
    }, err => alert(`Não foi possível obter localização: ${err.message}`), { enableHighAccuracy:true });
  });
  document.querySelector('#orderForm')?.addEventListener('submit', e => {
    e.preventDefault(); const fd=new FormData(e.currentTarget); const d=Number(fd.get('distanceKm'));
    const order={ id: crypto.randomUUID(), clientName:String(fd.get('clientName')).trim(), pickupAddress:String(fd.get('pickupAddress')).trim(), deliveryAddress:String(fd.get('deliveryAddress')).trim(), distanceKm:d, price:Number(calcPrice(d).toFixed(2)), paymentMethod:String(fd.get('paymentMethod')), notes:String(fd.get('notes')||''), status:'requested', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), messages:[] };
    state.orders.push(order); saveState(); render();
  });
  document.querySelector('#gpsBtn')?.addEventListener('click', toggleGps);
  document.querySelectorAll('.orderAction').forEach(b => b.addEventListener('click', () => actOnOrder(b.dataset.id,b.dataset.action)));
  document.querySelectorAll('.chatForm').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); const fd=new FormData(f); const text=String(fd.get('message')||'').trim(); if(!text)return; const o=state.orders.find(x=>x.id===f.dataset.order); o.messages=o.messages||[]; o.messages.push({sender:f.dataset.sender,text,createdAt:new Date().toISOString()}); o.updatedAt=new Date().toISOString(); saveState(); render(); }));
  document.querySelector('#settingsForm')?.addEventListener('submit', e => { e.preventDefault(); const fd=new FormData(e.currentTarget); state.pricing={minimumPrice:Number(fd.get('minimumPrice')),includedKm:Number(fd.get('includedKm')),pricePerExtraKm:Number(fd.get('pricePerExtraKm'))}; state.pix.key=String(fd.get('pixKey')||'').trim(); state.driver.name=String(fd.get('driverName')||'Motorista').trim(); saveState(); render(); });
  document.querySelector('#resetDemo')?.addEventListener('click', () => { if(confirm('Limpar pedidos e localização deste MVP local?')) { state={...structuredClone(initialState),pricing:state.pricing,pix:state.pix}; saveState(); render(); } });
}

function actOnOrder(id, action) {
  const o=state.orders.find(x=>x.id===id); if(!o)return;
  if(action==='accept' && o.status==='requested') o.status='accepted';
  if(action==='advance') { const n=nextStatus(o.status); if(n) o.status=n; }
  if(action==='cancel') o.status='cancelled';
  o.updatedAt=new Date().toISOString(); saveState(); render();
}

function toggleGps() {
  if (geoWatchId !== null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId=null; render(); return; }
  if (!navigator.geolocation) return alert('Geolocalização não disponível.');
  geoWatchId=navigator.geolocation.watchPosition(pos => {
    state.driver.lat=pos.coords.latitude; state.driver.lng=pos.coords.longitude; state.driver.updatedAt=new Date().toISOString(); saveState();
    if(state.role!=='driver') render();
  }, err => { alert(`Erro de GPS: ${err.message}`); if(geoWatchId!==null) navigator.geolocation.clearWatch(geoWatchId); geoWatchId=null; render(); }, { enableHighAccuracy:true, maximumAge:5000, timeout:15000 });
  render();
}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt=e; render(); });
window.addEventListener('storage', e => { if(e.key===STORAGE_KEY) { state=loadState(); render(); } });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
render();
