import { getSupabase, remoteConfigured } from './supabase-client.js';

const STORAGE_KEY = 'vai-e-vem-mvp-v2';
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
  profile: null,
  session: null,
  pricing: { minimumPrice: 7, includedKm: 3, pricePerExtraKm: 1.5 },
  pix: { key: '', holder: 'Vai e Vem', city: 'Caruaru' },
  driver: { id: null, name: 'Motorista', lat: null, lng: null, updatedAt: null },
  orders: [],
  authMessage: '',
  busy: false,
};

let state = loadLocalState();
let supabase = null;
let geoWatchId = null;
let installPrompt = null;
let realtimeChannel = null;
let refreshTimer = null;

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...structuredClone(initialState),
      ...saved,
      pricing: { ...initialState.pricing, ...(saved.pricing || {}) },
      pix: { ...initialState.pix, ...(saved.pix || {}) },
      driver: { ...initialState.driver, ...(saved.driver || {}) },
      profile: null,
      session: null,
      busy: false,
    };
  } catch {
    return structuredClone(initialState);
  }
}

function saveLocalState() {
  const copy = {
    role: state.role,
    pricing: state.pricing,
    pix: state.pix,
    driver: state.driver,
    orders: state.orders,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
}

function money(v) { return Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
function dt(v) { return v ? new Date(v).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '—'; }
function calcPrice(distanceKm) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const extra = Math.max(0, km - state.pricing.includedKm);
  return Number((state.pricing.minimumPrice + extra * state.pricing.pricePerExtraKm).toFixed(2));
}
function activeOrders() { return state.orders.filter(o => !['delivered','cancelled'].includes(o.status)); }
function latestClientOrder() { return [...state.orders].sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0] || null; }
function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function orderCode(id) { return `VV-${String(id).slice(-6).toUpperCase()}`; }
function mapUrl() {
  if (state.driver.lat == null || state.driver.lng == null) return '';
  return `https://maps.google.com/maps?q=${state.driver.lat},${state.driver.lng}&z=16&output=embed`;
}
function navUrl(address) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`; }
function nextStatus(status) { const i=STATUS_FLOW.indexOf(status); return i>=0 && i<STATUS_FLOW.length-1 ? STATUS_FLOW[i+1] : null; }
function currentUserId() { return state.session?.user?.id || null; }
function isRemote() { return Boolean(remoteConfigured && supabase); }
function roleFromProfile(profile) {
  if (!profile) return 'client';
  if (profile.role === 'driver') return 'driver';
  if (profile.role === 'admin') return state.role === 'driver' ? 'driver' : 'admin';
  return 'client';
}
function allowedTabs() {
  if (!isRemote()) return ['client','driver','admin'];
  if (state.profile?.role === 'admin') return ['driver','admin'];
  if (state.profile?.role === 'driver') return ['driver'];
  return ['client'];
}
function paymentDb(value) { return value === 'money' ? 'cash' : value; }
function paymentUi(value) { return value === 'cash' ? 'money' : value; }

function appShell(content) {
  const mode = isRemote() ? 'Sincronizado' : 'Demonstração local';
  return `<main class="shell">
    <header class="topbar">
      <div class="brand"><div class="logo">VV</div><div><h1>Vai e Vem</h1><div class="muted">Entregas simples · Caruaru-PE · ${mode}</div></div></div>
      <div class="row wrap">
        <button id="installBtn" class="btn ghost" ${installPrompt ? '' : 'hidden'}>Adicionar à tela inicial</button>
        ${isRemote() && state.session ? '<button id="logoutBtn" class="btn ghost">Sair</button>' : ''}
      </div>
    </header>
    ${state.authMessage ? `<div class="card"><div class="small">${escapeHtml(state.authMessage)}</div></div>` : ''}
    ${state.busy ? '<div class="card"><div class="small">Atualizando...</div></div>' : ''}
    ${state.session || !isRemote() ? `<nav class="tabs">${allowedTabs().map(r => tab(r, r==='client'?'Estabelecimento':r==='driver'?'Motorista':'Admin')).join('')}</nav>` : ''}
    ${content}
  </main>`;
}
function tab(role,label) { return `<button class="tab ${state.role===role?'active':''}" data-role="${role}">${label}</button>`; }

function authView() {
  return `<section class="grid two">
    <div class="card">
      <h2>Entrar</h2>
      <form id="loginForm">
        <label>E-mail</label><input name="email" type="email" autocomplete="email" required />
        <label>Senha</label><input name="password" type="password" autocomplete="current-password" required minlength="6" />
        <button class="btn primary" type="submit">Entrar</button>
      </form>
    </div>
    <div class="card">
      <h2>Cadastrar estabelecimento</h2>
      <form id="signupForm">
        <label>Nome do responsável</label><input name="fullName" required />
        <label>Estabelecimento</label><input name="businessName" required />
        <label>Telefone</label><input name="phone" inputmode="tel" />
        <label>E-mail</label><input name="email" type="email" autocomplete="email" required />
        <label>Senha</label><input name="password" type="password" autocomplete="new-password" required minlength="6" />
        <button class="btn primary" type="submit">Criar acesso</button>
      </form>
      <p class="small">Novos cadastros entram somente como estabelecimento. Perfis de motorista e administrador são promovidos de forma administrativa no backend.</p>
    </div>
  </section>`;
}

function clientView() {
  const last = latestClientOrder();
  const clientName = state.profile?.business_name || state.profile?.full_name || '';
  const pickup = state.profile?.pickup_address || '';
  return `<section class="grid two">
    <div class="card">
      <h2>Solicitar entrega</h2>
      <form id="orderForm">
        <label>Estabelecimento</label><input name="clientName" required value="${escapeHtml(clientName)}" ${isRemote()?'readonly':''} placeholder="Nome do estabelecimento" />
        <label>Endereço de coleta</label>
        <div class="row"><input id="pickupAddress" name="pickupAddress" required value="${escapeHtml(pickup)}" placeholder="Rua, número, bairro" /><button type="button" id="useLocation" class="btn ghost">Minha localização</button></div>
        <label>Endereço de entrega</label><input name="deliveryAddress" required placeholder="Rua, número, bairro" />
        <label>Distância estimada (km)</label><input id="distanceKm" name="distanceKm" type="number" min="0" step="0.1" required value="3" />
        <div class="small">Nesta etapa a distância é informada no formulário. A próxima integração calculará a rota automaticamente.</div>
        <label>Pagamento</label><select name="paymentMethod"><option value="money">Dinheiro</option><option value="pix">Pix</option></select>
        <label>Nome do destinatário</label><input name="recipientName" />
        <label>Telefone do destinatário</label><input name="recipientPhone" inputmode="tel" />
        <label>Observações</label><textarea name="notes" placeholder="Referência, complemento, instruções..."></textarea>
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
  const canCancel = context === 'client' && order.status === 'requested';
  return `<div class="order">
    <div class="order-head"><div><div class="order-code">${orderCode(order.id)}</div><div class="small">${dt(order.createdAt)}</div></div><span class="status ${order.status}">${STATUS_LABEL[order.status]}</span></div>
    <p><strong>${escapeHtml(order.clientName || 'Estabelecimento')}</strong><br><span class="small">${escapeHtml(order.pickupAddress)} → ${escapeHtml(order.deliveryAddress)}</span></p>
    <div class="row wrap"><span class="badge">${Number(order.distanceKm).toFixed(1)} km</span><span class="badge">${money(order.price)}</span><span class="badge">${order.paymentMethod==='pix'?'Pix':'Dinheiro'}</span></div>
    <div class="timeline">${steps}</div>
    ${map ? `<iframe class="map" title="Localização do motorista" src="${map}" loading="lazy"></iframe><div class="small">Localização atualizada: ${dt(state.driver.updatedAt)}</div>` : '<div class="empty">A localização do motorista aparecerá aqui quando o compartilhamento de GPS estiver ativo.</div>'}
    ${pix}
    ${canCancel ? `<button class="btn danger orderAction" data-id="${order.id}" data-action="cancel">Cancelar solicitação</button>` : ''}
    ${chatBox(order, context)}
  </div>`;
}

function chatBox(order, context) {
  const msgs = (order.messages || []).map(m => `<div class="msg ${m.sender===context?'me':''}"><strong>${m.sender==='driver'?'Motorista':m.sender==='admin'?'Admin':'Estabelecimento'}:</strong> ${escapeHtml(m.text)}<div class="small">${dt(m.createdAt)}</div></div>`).join('');
  return `<hr /><h3>Conversa do pedido</h3><div class="chat">${msgs || '<div class="small">Sem mensagens.</div>'}</div>
    <form class="chatForm row" data-order="${order.id}" data-sender="${context}"><input name="message" required maxlength="2000" placeholder="Digite uma mensagem" /><button class="btn ghost">Enviar</button></form>`;
}

function driverView() {
  const pending = state.orders.filter(o => o.status === 'requested');
  const current = state.orders.find(o => !['requested','delivered','cancelled'].includes(o.status));
  const delivered = state.orders.filter(o => o.status === 'delivered');
  const now = new Date();
  const day = delivered.filter(o => new Date(o.updatedAt).toDateString() === now.toDateString()).reduce((s,o)=>s+Number(o.price),0);
  const weekStart = Date.now()-7*86400000;
  const week = delivered.filter(o => new Date(o.updatedAt).getTime() >= weekStart).reduce((s,o)=>s+Number(o.price),0);
  const month = delivered.filter(o => { const d=new Date(o.updatedAt); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); }).reduce((s,o)=>s+Number(o.price),0);
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
  const canCancel = ['accepted','going_to_pickup'].includes(order.status) || (!isRemote() && !['delivered','cancelled'].includes(order.status));
  return `<div class="order">
    <div class="order-head"><div><div class="order-code">${orderCode(order.id)}</div><strong>${escapeHtml(order.clientName || 'Estabelecimento')}</strong></div><span class="status ${order.status}">${STATUS_LABEL[order.status]}</span></div>
    <p class="small">Coleta: ${escapeHtml(order.pickupAddress)}<br>Destino: ${escapeHtml(order.deliveryAddress)}</p>
    <div class="row wrap"><span class="badge">${Number(order.distanceKm).toFixed(1)} km</span><span class="badge">${money(order.price)}</span><a class="btn ghost" target="_blank" rel="noreferrer" href="${navUrl(order.pickupAddress)}">Navegar coleta</a><a class="btn ghost" target="_blank" rel="noreferrer" href="${navUrl(order.deliveryAddress)}">Navegar destino</a></div>
    <div class="row wrap" style="margin-top:10px">
      ${order.status==='requested'?`<button class="btn primary orderAction" data-id="${order.id}" data-action="accept">Aceitar</button>`:''}
      ${next && order.status!=='requested'?`<button class="btn ok orderAction" data-id="${order.id}" data-action="advance">${STATUS_LABEL[next]}</button>`:''}
      ${canCancel?`<button class="btn danger orderAction" data-id="${order.id}" data-action="cancel">Cancelar</button>`:''}
    </div>
    ${chatBox(order,'driver')}
  </div>`;
}
function compactOrder(order) { return `<div class="order"><div class="order-head"><span class="order-code">${orderCode(order.id)}</span><span>${money(order.price)}</span></div><div class="small">${escapeHtml(order.clientName || 'Estabelecimento')} · ${dt(order.updatedAt)}</div></div>`; }

function adminView() {
  const active = activeOrders();
  const delivered = state.orders.filter(o=>o.status==='delivered');
  const total = delivered.reduce((s,o)=>s+Number(o.price),0);
  return `<section class="grid two">
    <div class="card"><h2>Painel operacional</h2><div class="kpis"><div class="kpi"><span class="muted">Ativas</span><strong>${active.length}</strong></div><div class="kpi"><span class="muted">Concluídas</span><strong>${delivered.length}</strong></div><div class="kpi"><span class="muted">Valor</span><strong>${money(total)}</strong></div></div><hr /><h3>Pedidos em andamento</h3>${active.length?active.map(compactOrder).join(''):'<div class="empty">Sem entregas ativas.</div>'}</div>
    <div class="card"><h2>Configuração simples</h2><form id="settingsForm">
      <label>Valor mínimo</label><input name="minimumPrice" type="number" min="0" step="0.01" value="${state.pricing.minimumPrice}" />
      <label>KM incluídos no mínimo</label><input name="includedKm" type="number" min="0" step="0.1" value="${state.pricing.includedKm}" />
      <label>Preço por KM excedente</label><input name="pricePerExtraKm" type="number" min="0" step="0.01" value="${state.pricing.pricePerExtraKm}" />
      <label>Chave Pix</label><input name="pixKey" value="${escapeHtml(state.pix.key)}" placeholder="Configurar depois" />
      <label>Titular Pix</label><input name="pixHolder" value="${escapeHtml(state.pix.holder)}" />
      <label>Cidade Pix</label><input name="pixCity" value="${escapeHtml(state.pix.city)}" />
      <button class="btn primary" style="margin-top:12px">Salvar configurações</button>
    </form></div>
    <div class="card"><h2>Localização do motorista</h2>${mapUrl()?`<iframe class="map" src="${mapUrl()}" title="Mapa motorista"></iframe><p class="small">${Number(state.driver.lat).toFixed(5)}, ${Number(state.driver.lng).toFixed(5)} · ${dt(state.driver.updatedAt)}</p>`:'<div class="empty">GPS ainda não compartilhado.</div>'}</div>
    <div class="card"><h2>Todos os pedidos</h2>${state.orders.length?[...state.orders].reverse().map(compactOrder).join(''):'<div class="empty">Nenhum pedido.</div>'}${!isRemote()?'<hr /><button id="resetDemo" class="btn danger">Limpar dados locais do MVP</button>':''}</div>
  </section>`;
}

function render() {
  if (isRemote() && !state.session) {
    document.querySelector('#app').innerHTML = appShell(authView());
    bindEvents();
    return;
  }
  const view = state.role==='driver' ? driverView() : state.role==='admin' ? adminView() : clientView();
  document.querySelector('#app').innerHTML = appShell(view);
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
    const target = b.dataset.role;
    if (!allowedTabs().includes(target)) return;
    state.role = target;
    if (!isRemote()) saveLocalState();
    render();
  }));

  document.querySelector('#installBtn')?.addEventListener('click', async () => {
    if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; render(); }
  });
  document.querySelector('#logoutBtn')?.addEventListener('click', logout);
  document.querySelector('#loginForm')?.addEventListener('submit', login);
  document.querySelector('#signupForm')?.addEventListener('submit', signup);

  const distance = document.querySelector('#distanceKm');
  distance?.addEventListener('input', () => {
    const p=document.querySelector('#pricePreview');
    if(p) p.textContent=money(calcPrice(distance.value));
  });

  document.querySelector('#useLocation')?.addEventListener('click', () => {
    if (!navigator.geolocation) return alert('Geolocalização não disponível neste aparelho.');
    navigator.geolocation.getCurrentPosition(pos => {
      const input=document.querySelector('#pickupAddress');
      input.value=`Localização atual (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`;
      input.dataset.lat=String(pos.coords.latitude);
      input.dataset.lng=String(pos.coords.longitude);
    }, err => alert(`Não foi possível obter localização: ${err.message}`), { enableHighAccuracy:true });
  });

  document.querySelector('#orderForm')?.addEventListener('submit', submitOrder);
  document.querySelector('#gpsBtn')?.addEventListener('click', toggleGps);
  document.querySelectorAll('.orderAction').forEach(b => b.addEventListener('click', () => actOnOrder(b.dataset.id,b.dataset.action)));
  document.querySelectorAll('.chatForm').forEach(f => f.addEventListener('submit', e => submitMessage(e, f)));
  document.querySelector('#settingsForm')?.addEventListener('submit', saveSettings);
  document.querySelector('#resetDemo')?.addEventListener('click', () => {
    if(confirm('Limpar pedidos e localização deste MVP local?')) {
      state={...structuredClone(initialState),pricing:state.pricing,pix:state.pix};
      saveLocalState();
      render();
    }
  });
}

async function setBusy(value, message='') {
  state.busy = value;
  if (message) state.authMessage = message;
  render();
}

async function login(e) {
  e.preventDefault();
  if (!supabase) return;
  const fd = new FormData(e.currentTarget);
  await setBusy(true);
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get('email')).trim(),
    password: String(fd.get('password')),
  });
  if (error) {
    state.busy=false;
    state.authMessage=`Falha ao entrar: ${error.message}`;
    render();
  }
}

async function signup(e) {
  e.preventDefault();
  if (!supabase) return;
  const fd = new FormData(e.currentTarget);
  await setBusy(true);
  const { data, error } = await supabase.auth.signUp({
    email: String(fd.get('email')).trim(),
    password: String(fd.get('password')),
    options: {
      data: {
        full_name: String(fd.get('fullName')).trim(),
        business_name: String(fd.get('businessName')).trim(),
        phone: String(fd.get('phone') || '').trim(),
      },
    },
  });
  state.busy=false;
  if (error) state.authMessage=`Falha no cadastro: ${error.message}`;
  else if (!data.session) state.authMessage='Cadastro criado. Verifique o e-mail para confirmar o acesso.';
  else state.authMessage='Cadastro criado com sucesso.';
  render();
}

async function logout() {
  if (!supabase) return;
  stopRealtime();
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  await supabase.auth.signOut();
}

async function submitOrder(e) {
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const d=Number(fd.get('distanceKm'));
  const pickupInput = document.querySelector('#pickupAddress');

  if (!isRemote()) {
    const order={
      id: crypto.randomUUID(),
      clientName:String(fd.get('clientName')).trim(),
      pickupAddress:String(fd.get('pickupAddress')).trim(),
      deliveryAddress:String(fd.get('deliveryAddress')).trim(),
      distanceKm:d,
      price:calcPrice(d),
      paymentMethod:String(fd.get('paymentMethod')),
      recipientName:String(fd.get('recipientName')||''),
      recipientPhone:String(fd.get('recipientPhone')||''),
      notes:String(fd.get('notes')||''),
      status:'requested',
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      messages:[],
    };
    state.orders.push(order);
    saveLocalState();
    render();
    return;
  }

  await setBusy(true);
  const payload = {
    establishment_id: currentUserId(),
    pickup_address: String(fd.get('pickupAddress')).trim(),
    pickup_lat: pickupInput?.dataset.lat ? Number(pickupInput.dataset.lat) : state.profile?.pickup_lat ?? null,
    pickup_lng: pickupInput?.dataset.lng ? Number(pickupInput.dataset.lng) : state.profile?.pickup_lng ?? null,
    delivery_address: String(fd.get('deliveryAddress')).trim(),
    distance_km: d,
    payment_method: paymentDb(String(fd.get('paymentMethod'))),
    recipient_name: String(fd.get('recipientName')||'').trim() || null,
    recipient_phone: String(fd.get('recipientPhone')||'').trim() || null,
    notes: String(fd.get('notes')||'').trim() || null,
  };
  const { error } = await supabase.from('deliveries').insert(payload);
  state.busy=false;
  if (error) state.authMessage=`Não foi possível solicitar a entrega: ${error.message}`;
  else state.authMessage='Entrega solicitada.';
  await hydrateRemote();
}

async function actOnOrder(id, action) {
  const o=state.orders.find(x=>x.id===id);
  if(!o)return;

  if (!isRemote()) {
    if(action==='accept' && o.status==='requested') o.status='accepted';
    if(action==='advance') { const n=nextStatus(o.status); if(n) o.status=n; }
    if(action==='cancel') o.status='cancelled';
    o.updatedAt=new Date().toISOString();
    saveLocalState();
    render();
    return;
  }

  await setBusy(true);
  let query;
  if (action === 'accept' && o.status === 'requested') {
    query = supabase.from('deliveries')
      .update({ driver_id: currentUserId(), status: 'accepted' })
      .eq('id', id)
      .eq('status', 'requested')
      .is('driver_id', null)
      .select('id');
  } else if (action === 'advance') {
    const n = nextStatus(o.status);
    if (!n) { state.busy=false; render(); return; }
    query = supabase.from('deliveries').update({ status: n }).eq('id', id).select('id');
  } else if (action === 'cancel') {
    query = supabase.from('deliveries').update({ status: 'cancelled' }).eq('id', id).select('id');
  } else {
    state.busy=false;
    render();
    return;
  }

  const { data, error } = await query;
  state.busy=false;
  if (error) state.authMessage=`Ação não concluída: ${error.message}`;
  else if (!data?.length) state.authMessage='A entrega mudou antes desta ação. Os dados foram atualizados.';
  await hydrateRemote();
}

async function submitMessage(e, form) {
  e.preventDefault();
  const fd=new FormData(form);
  const text=String(fd.get('message')||'').trim();
  if(!text)return;
  const o=state.orders.find(x=>x.id===form.dataset.order);
  if (!o) return;

  if (!isRemote()) {
    o.messages=o.messages||[];
    o.messages.push({sender:form.dataset.sender,text,createdAt:new Date().toISOString()});
    o.updatedAt=new Date().toISOString();
    saveLocalState();
    render();
    return;
  }

  const { error } = await supabase.from('delivery_messages').insert({
    delivery_id: o.id,
    sender_id: currentUserId(),
    body: text,
  });
  if (error) state.authMessage=`Mensagem não enviada: ${error.message}`;
  await hydrateRemote();
}

async function saveSettings(e) {
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const pricing={
    minimumPrice:Number(fd.get('minimumPrice')),
    includedKm:Number(fd.get('includedKm')),
    pricePerExtraKm:Number(fd.get('pricePerExtraKm')),
  };
  const pix={
    key:String(fd.get('pixKey')||'').trim(),
    holder:String(fd.get('pixHolder')||'Vai e Vem').trim(),
    city:String(fd.get('pixCity')||'Caruaru').trim(),
  };

  if (!isRemote()) {
    state.pricing=pricing;
    state.pix=pix;
    saveLocalState();
    render();
    return;
  }

  await setBusy(true);
  const uid = currentUserId();
  const [p, a] = await Promise.all([
    supabase.from('pricing_config').update({
      minimum_price: pricing.minimumPrice,
      included_km: pricing.includedKm,
      price_per_extra_km: pricing.pricePerExtraKm,
      updated_by: uid,
    }).eq('id', 1),
    supabase.from('app_config').update({
      pix_key: pix.key || null,
      pix_holder: pix.holder,
      pix_city: pix.city,
      updated_by: uid,
    }).eq('id', 1),
  ]);
  state.busy=false;
  const error = p.error || a.error;
  state.authMessage = error ? `Configuração não salva: ${error.message}` : 'Configuração salva.';
  await hydrateRemote();
}

function toggleGps() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId=null;
    if (isRemote()) clearRemoteDeliveryLocation();
    render();
    return;
  }
  if (!navigator.geolocation) return alert('Geolocalização não disponível.');
  geoWatchId=navigator.geolocation.watchPosition(async pos => {
    state.driver.lat=pos.coords.latitude;
    state.driver.lng=pos.coords.longitude;
    state.driver.updatedAt=new Date().toISOString();

    if (isRemote()) {
      const current = state.orders.find(o => o.driverId === currentUserId() && !['delivered','cancelled'].includes(o.status));
      const { error } = await supabase.from('driver_locations').upsert({
        driver_id: currentUserId(),
        delivery_id: current?.id || null,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy ?? null,
        heading: pos.coords.heading ?? null,
        speed_mps: pos.coords.speed ?? null,
      }, { onConflict: 'driver_id' });
      if (error) console.error('GPS sync error', error);
    } else {
      saveLocalState();
    }
    if(state.role!=='driver') render();
  }, err => {
    alert(`Erro de GPS: ${err.message}`);
    if(geoWatchId!==null) navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId=null;
    render();
  }, { enableHighAccuracy:true, maximumAge:5000, timeout:15000 });
  render();
}

async function clearRemoteDeliveryLocation() {
  if (!isRemote() || !currentUserId()) return;
  await supabase.from('driver_locations').update({ delivery_id: null }).eq('driver_id', currentUserId());
}

function normalizeDelivery(row, profiles, messages) {
  const establishment = profiles.get(row.establishment_id);
  const orderMessages = messages
    .filter(m => m.delivery_id === row.id)
    .map(m => ({
      sender: m.sender_id === row.establishment_id ? 'client' : m.sender_id === row.driver_id ? 'driver' : 'admin',
      text: m.body,
      createdAt: m.created_at,
    }));
  return {
    id: row.id,
    clientName: establishment?.business_name || establishment?.full_name || 'Estabelecimento',
    establishmentId: row.establishment_id,
    driverId: row.driver_id,
    pickupAddress: row.pickup_address,
    deliveryAddress: row.delivery_address,
    distanceKm: Number(row.distance_km),
    price: Number(row.price),
    paymentMethod: paymentUi(row.payment_method),
    paymentStatus: row.payment_status,
    status: row.status,
    recipientName: row.recipient_name || '',
    recipientPhone: row.recipient_phone || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: orderMessages,
  };
}

async function hydrateRemote() {
  if (!isRemote() || !state.session) return;
  const uid = currentUserId();
  const [profileRes, pricingRes, appRes, deliveriesRes, profilesRes, messagesRes, locationsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).single(),
    supabase.from('pricing_config').select('*').eq('id', 1).single(),
    supabase.from('app_config').select('*').eq('id', 1).single(),
    supabase.from('deliveries').select('*').order('created_at', { ascending: true }),
    supabase.from('profiles').select('id,role,full_name,business_name,phone'),
    supabase.from('delivery_messages').select('*').order('created_at', { ascending: true }),
    supabase.from('driver_locations').select('*').limit(5),
  ]);

  const firstError = [profileRes, pricingRes, appRes, deliveriesRes, profilesRes, messagesRes, locationsRes].find(r => r.error)?.error;
  if (firstError) {
    state.authMessage=`Falha ao carregar dados: ${firstError.message}`;
    render();
    return;
  }

  state.profile = profileRes.data;
  state.pricing = {
    minimumPrice: Number(pricingRes.data.minimum_price),
    includedKm: Number(pricingRes.data.included_km),
    pricePerExtraKm: Number(pricingRes.data.price_per_extra_km),
  };
  state.pix = {
    key: appRes.data.pix_key || '',
    holder: appRes.data.pix_holder || 'Vai e Vem',
    city: appRes.data.pix_city || 'Caruaru',
  };

  const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
  state.orders = (deliveriesRes.data || []).map(d => normalizeDelivery(d, profileMap, messagesRes.data || []));

  const location = (locationsRes.data || [])[0];
  if (location) {
    state.driver.id = location.driver_id;
    state.driver.lat = location.lat;
    state.driver.lng = location.lng;
    state.driver.updatedAt = location.updated_at;
    const p = profileMap.get(location.driver_id);
    state.driver.name = p?.full_name || 'Motorista';
  } else {
    state.driver.lat = null;
    state.driver.lng = null;
    state.driver.updatedAt = null;
  }

  state.role = roleFromProfile(state.profile);
  state.busy = false;
  render();
}

function scheduleRemoteRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => hydrateRemote(), 120);
}

function startRealtime() {
  if (!isRemote() || !state.session || realtimeChannel) return;
  realtimeChannel = supabase
    .channel(`vai-e-vem-${currentUserId()}`)
    .on('postgres_changes', { event:'*', schema:'public', table:'deliveries' }, scheduleRemoteRefresh)
    .on('postgres_changes', { event:'*', schema:'public', table:'driver_locations' }, scheduleRemoteRefresh)
    .on('postgres_changes', { event:'*', schema:'public', table:'delivery_messages' }, scheduleRemoteRefresh)
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        state.authMessage = 'Conexão em tempo real instável. Os dados continuam disponíveis por atualização normal.';
        render();
      }
    });
}

function stopRealtime() {
  if (supabase && realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
}

async function applySession(session) {
  state.session = session;
  if (!session) {
    state.profile = null;
    state.orders = [];
    state.driver = structuredClone(initialState.driver);
    state.busy = false;
    stopRealtime();
    render();
    return;
  }
  await hydrateRemote();
  startRealtime();
}

async function boot() {
  if (remoteConfigured) {
    try {
      supabase = await getSupabase();
      const { data, error } = await supabase.auth.getSession();
      if (error) state.authMessage=`Falha ao restaurar sessão: ${error.message}`;
      await applySession(data.session);
      supabase.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => applySession(session), 0);
      });
    } catch (error) {
      state.authMessage=`Supabase indisponível; usando modo local: ${error.message}`;
      supabase = null;
      render();
    }
  } else {
    render();
  }
}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt=e; render(); });
window.addEventListener('storage', e => {
  if(!isRemote() && e.key===STORAGE_KEY) {
    state=loadLocalState();
    render();
  }
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));

boot();
