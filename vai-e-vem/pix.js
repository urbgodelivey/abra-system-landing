const QR_VERSION = '1.5.4';
let qrPromise = null;

function cleanText(value, max) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 $%*+\-./:]/g, '')
    .toUpperCase()
    .slice(0, max);
}

function emv(id, value) {
  const text = String(value);
  return `${id}${String(text.length).padStart(2, '0')}${text}`;
}

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildPixPayload({ key, holder, city = 'Caruaru', amount }) {
  const pixKey = String(key || '').trim();
  if (!pixKey) return '';

  const merchantAccount = emv('00', 'BR.GOV.BCB.PIX') + emv('01', pixKey);
  const safeHolder = cleanText(holder || 'VAI E VEM', 25) || 'VAI E VEM';
  const safeCity = cleanText(city || 'CARUARU', 15) || 'CARUARU';
  const numericAmount = Number(amount);

  let payload = '';
  payload += emv('00', '01');
  payload += emv('26', merchantAccount);
  payload += emv('52', '0000');
  payload += emv('53', '986');
  if (Number.isFinite(numericAmount) && numericAmount > 0) {
    payload += emv('54', numericAmount.toFixed(2));
  }
  payload += emv('58', 'BR');
  payload += emv('59', safeHolder);
  payload += emv('60', safeCity);
  payload += emv('62', emv('05', '***'));
  payload += '6304';
  return payload + crc16(payload);
}

function parseMoney(text) {
  const normalized = String(text || '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return Number(normalized);
}

function findPixData(block) {
  const line = block.querySelector('p.small')?.textContent || '';
  const match = line.match(/Chave:\s*(.*?)\s*·\s*(.*)$/);
  if (!match) return null;
  const root = block.parentElement;
  const amountBadge = [...(root?.querySelectorAll('.badge') || [])].find(el => el.textContent.includes('R$'));
  return {
    key: match[1].trim(),
    holder: match[2].trim(),
    city: 'Caruaru',
    amount: parseMoney(amountBadge?.textContent),
  };
}

async function qrModule() {
  if (!qrPromise) qrPromise = import(`https://esm.sh/qrcode@${QR_VERSION}?bundle`);
  return qrPromise;
}

async function enhanceBlock(block) {
  if (block.dataset.pixEnhanced === '1') return;
  const data = findPixData(block);
  if (!data?.key) return;
  const payload = buildPixPayload(data);
  if (!payload) return;

  block.dataset.pixEnhanced = '1';
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <canvas class="pix-qr" aria-label="QR Code Pix"></canvas>
    <label>Pix copia e cola</label>
    <textarea class="pix-payload" readonly rows="4"></textarea>
    <button type="button" class="btn ghost pix-copy">Copiar Pix</button>
    <div class="small pix-copy-status"></div>
  `;
  block.appendChild(wrap);
  wrap.querySelector('.pix-payload').value = payload;

  wrap.querySelector('.pix-copy').addEventListener('click', async () => {
    const status = wrap.querySelector('.pix-copy-status');
    try {
      await navigator.clipboard.writeText(payload);
      status.textContent = 'Pix copiado.';
    } catch {
      wrap.querySelector('.pix-payload').select();
      status.textContent = 'Selecione e copie o código acima.';
    }
  });

  try {
    const QRCode = await qrModule();
    await QRCode.toCanvas(wrap.querySelector('.pix-qr'), payload, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  } catch (error) {
    console.error('Falha ao renderizar QR Pix', error);
    wrap.querySelector('.pix-qr').hidden = true;
  }
}

function enhancePix() {
  document.querySelectorAll('.order').forEach(block => {
    const strong = block.querySelector(':scope > strong');
    if (strong?.textContent.trim() === 'Pagamento Pix') enhanceBlock(block);
  });
}

const observer = new MutationObserver(() => enhancePix());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', enhancePix);
enhancePix();
