/* Roadcase – Bandinventar. Alle Daten bleiben im Browser (IndexedDB). */
'use strict';

/* ---------------------------------------------------------------- Helfer */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => new Date().toISOString().slice(0, 10);
const deDate = iso => iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—';
const deStamp = iso => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('de-DE') + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
const money = n => (n === '' || n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2200);
}

const STATUS = {
  verfuegbar: { label: 'Verfügbar', cls: 'ok' },
  verliehen: { label: 'Verliehen', cls: 'out' },
  reparatur: { label: 'In Reparatur', cls: 'fix' },
  defekt: { label: 'Defekt', cls: 'bad' },
  ausgemustert: { label: 'Ausgemustert', cls: '' }
};
const CONDITIONS = ['Neu', 'Sehr gut', 'Gut', 'Gebraucht', 'Beschädigt'];
const ENTRY_TYPES = {
  notiz: 'Notiz', schaden: 'Schaden', reparatur: 'Reparatur',
  wartung: 'Wartung', verleih: 'Ausgabe', rueckgabe: 'Rückgabe'
};

/* ---------------------------------------------------------------- Datenbank */
const DBN = 'roadcase', DBV = 1, STORES = ['groups', 'items', 'entries', 'photos', 'loans'];
let db;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, DBV);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
    };
    r.onsuccess = e => { db = e.target.result; res(db); };
    r.onerror = () => rej(r.error);
  });
}
const idbReal = {
  all: store => new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }),
  get: (store, id) => new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).get(id);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }),
  put: (store, obj) => new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(obj);
    t.oncomplete = () => res(obj); t.onerror = () => rej(t.error);
  }),
  del: (store, id) => new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite'); t.objectStore(store).delete(id);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  }),
  clear: store => new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite'); t.objectStore(store).clear();
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  })
};

/* Ersatzspeicher, falls IndexedDB gesperrt ist (Vorschau, privater Modus) */
const MEM = {};
STORES.forEach(s2 => MEM[s2] = new Map());
const idbMem = {
  all: store => Promise.resolve([...MEM[store].values()]),
  get: (store, id) => Promise.resolve(MEM[store].get(id)),
  put: (store, obj) => { MEM[store].set(obj.id, obj); return Promise.resolve(obj); },
  del: (store, id) => { MEM[store].delete(id); return Promise.resolve(); },
  clear: store => { MEM[store].clear(); return Promise.resolve(); }
};

let idb = idbReal;

/* Zustand im Speicher (Fotos werden nur bei Bedarf geladen) */
const S = { groups: [], items: [], entries: [], loans: [], filterGroup: 'alle', q: '', sort: 'inv' };

async function loadAll() {
  [S.groups, S.items, S.entries, S.loans] = await Promise.all(
    ['groups', 'items', 'entries', 'loans'].map(idb.all)
  );
  S.groups.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

const groupOf = id => S.groups.find(g => g.id === id);
const itemOf = id => S.items.find(i => i.id === id);
const entriesOf = id => S.entries.filter(e => e.itemId === id)
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const openDamages = id => entriesOf(id).filter(e => e.type === 'schaden' && !e.resolved);

/* ---------------------------------------------------------------- Fotos */
const photoCache = new Map();
async function photoData(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const p = await idb.get('photos', id);
  const d = p ? p.data : '';
  photoCache.set(id, d);
  return d;
}
async function photosData(ids = []) {
  const out = [];
  for (const id of ids) { const d = await photoData(id); if (d) out.push({ id, data: d }); }
  return out;
}
function compress(file, max = 1400, q = 0.72) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        const sc = Math.min(1, max / Math.max(w, h));
        w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = rej; img.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}
/* Fotoaufnahme: liefert Array neuer Foto-IDs */
function pickPhotos() {
  return new Promise(resolve => {
    const inp = $('#photo-input');
    inp.value = '';
    const done = async () => {
      inp.removeEventListener('change', done);
      const files = Array.from(inp.files || []);
      if (!files.length) return resolve([]);
      toast(files.length > 1 ? files.length + ' Fotos werden gespeichert …' : 'Foto wird gespeichert …');
      const ids = [];
      for (const f of files) {
        try {
          const data = await compress(f);
          const id = uid();
          await idb.put('photos', { id, data, createdAt: new Date().toISOString() });
          photoCache.set(id, data); ids.push(id);
        } catch (e) { console.error(e); toast('Ein Foto konnte nicht gelesen werden.'); }
      }
      resolve(ids);
    };
    inp.addEventListener('change', done);
    inp.click();
  });
}
async function renderGallery(el, ids, { editable = false, onAdd, onRemove } = {}) {
  const shots = await photosData(ids);
  el.innerHTML = shots.map(p => `<img src="${p.data}" data-pid="${p.id}" alt="Zustandsfoto">`).join('')
    + (editable ? `<button class="add" data-add="1">Foto<br>aufnehmen</button>` : '');
  el.onclick = async ev => {
    const add = ev.target.closest('[data-add]');
    if (add && onAdd) { const ids2 = await pickPhotos(); if (ids2.length) onAdd(ids2); return; }
    const img = ev.target.closest('img[data-pid]');
    if (img) viewPhoto(img.dataset.pid, editable ? () => onRemove && onRemove(img.dataset.pid) : null);
  };
}
function viewPhoto(pid, onDelete) {
  photoData(pid).then(d => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:#000d;display:flex;flex-direction:column';
    ov.innerHTML = `<div style="padding:calc(10px + env(safe-area-inset-top)) 14px 10px;display:flex;justify-content:space-between">
        <button class="btn small" data-x>Schließen</button>
        ${onDelete ? '<button class="btn small danger" data-del>Foto löschen</button>' : ''}
      </div>
      <img src="${d}" style="flex:1;min-height:0;object-fit:contain" alt="Foto groß">`;
    ov.onclick = e => {
      if (e.target.closest('[data-x]') || e.target === ov) ov.remove();
      if (e.target.closest('[data-del]')) { onDelete(); ov.remove(); }
    };
    document.body.appendChild(ov);
  });
}

/* ---------------------------------------------------------------- Inventarnummern */
function nextInvNo(groupId) {
  const g = groupOf(groupId);
  const code = (g && g.code) || 'INV';
  const used = S.items.filter(i => i.groupId === groupId)
    .map(i => { const m = /(\d+)\s*$/.exec(i.invNo || ''); return m ? parseInt(m[1], 10) : 0; });
  const n = (used.length ? Math.max(...used) : 0) + 1;
  return code + '-' + String(n).padStart(3, '0');
}


/* ---------------------------------------------------------------- Codes und Etiketten */
const LABEL_SIZES = {
  klein: { w: 40, h: 25, name: '40 × 25 mm' },
  mittel: { w: 60, h: 35, name: '60 × 35 mm' },
  gross: { w: 90, h: 50, name: '90 × 50 mm' }
};

/* Inhalt des QR-Codes: Link auf das Gerät, damit jede Kamera-App direkt die Seite öffnet.
   Ohne Webserver (Datei geöffnet) bleibt nur die Inventarnummer. */
function itemLink(item) {
  const code = item.invNo || item.id;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return location.origin + location.pathname + '#/i/' + encodeURIComponent(code);
  }
  return code;
}

function labelSVG(item, opts) {
  opts = opts || {};
  const size = LABEL_SIZES[opts.size || 'mittel'];
  const w = size.w, h = size.h;
  const showQR = opts.qr !== false, showBar = opts.bar !== false, showName = opts.name !== false;
  const pad = Math.max(1.4, h * 0.07);
  const inv = item.invNo || item.id;
  const g = groupOf(item.groupId);

  /* Barcode über die volle Breite: sonst werden die Striche auf kleinen Etiketten zu fein */
  const barH = showBar ? h * 0.2 : 0;
  const barY = h - pad - barH;
  const upperH = (showBar ? barY - pad * 1.4 : h - 2 * pad);
  const qrSide = showQR ? Math.min(upperH, w * 0.34) : 0;
  const x0 = pad + (showQR ? qrSide + pad : 0);
  const textW = w - x0 - pad;

  let out = `<rect width="${w}" height="${h}" fill="#fff"/>`;

  if (showQR) {
    const q = QR.svg(itemLink(item), { level: 'M', quiet: 1 });
    const vb = /viewBox="0 0 (\d+) /.exec(q)[1];
    out += `<svg x="${pad.toFixed(2)}" y="${(pad + (upperH - qrSide) / 2).toFixed(2)}" width="${qrSide.toFixed(2)}" height="${qrSide.toFixed(2)}" viewBox="0 0 ${vb} ${vb}">` +
      q.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + `</svg>`;
  }

  /* Inventarnummer, darunter Bezeichnung mit einfachem Zeilenumbruch */
  const invSize = Math.min(h * 0.17, textW / (inv.length * 0.62));
  let y = pad + invSize * 0.9;
  out += `<text x="${x0.toFixed(2)}" y="${y.toFixed(2)}" font-family="monospace" font-weight="700" font-size="${invSize.toFixed(2)}" fill="#000">${esc(inv)}</text>`;

  if (showName) {
    const nSize = h * 0.1, perLine = Math.max(6, Math.floor(textW / (nSize * 0.52)));
    const lines = [];
    let line = '';
    for (const word of String(item.name).split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (test.length <= perLine) line = test;
      else { if (line) lines.push(line); line = word.length > perLine ? word.slice(0, perLine - 1) + '…' : word; }
      if (lines.length === 2) break;
    }
    if (line && lines.length < 2) lines.push(line);
    for (const l of lines) {
      y += nSize * 1.18;
      out += `<text x="${x0.toFixed(2)}" y="${y.toFixed(2)}" font-family="sans-serif" font-size="${nSize.toFixed(2)}" fill="#000">${esc(l)}</text>`;
    }
    if (g && y + h * 0.1 < pad + upperH) {
      y += h * 0.1;
      out += `<text x="${x0.toFixed(2)}" y="${y.toFixed(2)}" font-family="sans-serif" font-size="${(h * 0.082).toFixed(2)}" fill="#555">${esc(g.name)}</text>`;
    }
  }

  if (showBar) {
    const bar = Code128.svg(inv, { height: 30, quiet: 2 });
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(bar);
    out += `<svg x="${pad.toFixed(2)}" y="${barY.toFixed(2)}" width="${(w - 2 * pad).toFixed(2)}" height="${barH.toFixed(2)}" viewBox="0 0 ${vb[1]} ${vb[2]}" preserveAspectRatio="none">` +
      bar.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + `</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${out}</svg>`;
}

/* Etikettenbogen für eine Auswahl, mit Schnittrahmen */
function buildLabelSheet(items, opts) {
  if (!items.length) return toast('Keine Geräte in der Auswahl.');
  const size = LABEL_SIZES[opts.size || 'mittel'];
  const copies = Math.max(1, Math.min(20, opts.copies || 1));
  let cells = '';
  for (const i of items) {
    const svg = labelSVG(i, opts);
    for (let c = 0; c < copies; c++) {
      cells += `<div class="p-label" style="width:${size.w}mm;height:${size.h}mm">${svg}</div>`;
    }
  }
  const html = `<h1>Etiketten</h1>
    <div class="doc-meta">${items.length} Gerät(e) · ${copies}× je Gerät · ${size.name} · Stand ${new Date().toLocaleDateString('de-DE')}</div>
    <div class="p-labels">${cells}</div>`;
  showPreview(html, 'etiketten-' + todayISO());
}

/* Codeansicht im Gerätedetail */
function codesSection(item) {
  const link = itemLink(item);
  return `<div class="codes">
      <div class="codes-qr">${QR.svg(link, { level: 'M', quiet: 2 })}</div>
      <div class="codes-bar">${Code128.svg(item.invNo || item.id, { height: 26 })}
        <div class="codes-cap">${esc(item.invNo || '—')}</div>
      </div>
    </div>
    <p class="lede" style="margin-top:8px">${location.protocol.startsWith('http')
      ? 'Der QR-Code öffnet dieses Gerät direkt in der App, auch über die normale Kamera-App.'
      : 'Ohne Webserver enthält der QR-Code nur die Inventarnummer. Über GitHub Pages wird daraus ein direkter Link.'}</p>
    <div class="btnrow" style="margin-top:10px">
      <button class="btn small" data-label-print="1">Etikett drucken</button>
      <button class="btn small" data-label-file="1">Etikett als SVG</button>
    </div>`;
}

/* ---------------------------------------------------------------- Scannen */
let scanStop = null;
function stopScan() { if (scanStop) { const f = scanStop; scanStop = null; f(); } }

function openItemByCode(raw) {
  if (!raw) return false;
  let code = String(raw).trim();
  const hash = code.indexOf('#/i/');
  if (hash >= 0) code = decodeURIComponent(code.slice(hash + 4));
  const it = S.items.find(i => (i.invNo || '').toLowerCase() === code.toLowerCase()) ||
    S.items.find(i => i.id === code);
  if (!it) { toast('Kein Gerät mit „' + code + '" gefunden.'); return false; }
  stopScan(); closeSheetAll(); itemDetail(it.id);
  return true;
}

async function scanSheet() {
  stopScan();
  const supported = 'BarcodeDetector' in window;
  openSheet('Code scannen', `
    ${supported ? '<div class="scanbox"><video id="sc-video" playsinline muted></video><div class="scanframe"></div></div>' : ''}
    <p class="lede" id="sc-msg">${supported
      ? 'Kamera auf QR-Code oder Barcode halten.'
      : 'Dieser Browser kann nicht in der App scannen, unter iOS betrifft das alle Browser. Nimm die normale Kamera-App: sie liest den QR-Code und öffnet damit direkt das Gerät. Oder gib die Nummer hier ein.'}</p>
    <label class="field"><span>Inventarnummer eingeben</span><input type="text" id="sc-manual" placeholder="z. B. KAB-001" autocapitalize="characters"></label>
    <div class="btnrow" style="margin-top:0"><button class="btn primary" id="sc-go">Gerät öffnen</button></div>`,
    '', () => { stopScan(); closeSheetAll(); });

  $('#sc-go').onclick = () => openItemByCode($('#sc-manual').value);
  $('#sc-manual').onkeydown = e => { if (e.key === 'Enter') openItemByCode($('#sc-manual').value); };
  if (!supported) return;

  const video = $('#sc-video');
  let stream, raf, stopped = false;
  scanStop = () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(t => t.stop());
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.warn(err);
    const m = $('#sc-msg'); if (m) m.textContent = 'Kein Kamerazugriff. Erlaube die Kamera in den Browsereinstellungen oder gib die Nummer ein.';
    return;
  }
  const det = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39'] });
  const tick = async () => {
    if (stopped) return;
    try {
      const found = await det.detect(video);
      if (found.length && openItemByCode(found[0].rawValue)) return;
    } catch (err) { /* einzelne Frames dürfen fehlschlagen */ }
    raf = requestAnimationFrame(tick);
  };
  tick();
}

/* Direktaufruf über #/i/<Inventarnummer> */
function handleHash() {
  const m = /^#\/i\/(.+)$/.exec(location.hash);
  if (!m) return;
  const code = decodeURIComponent(m[1]);
  const it = S.items.find(i => (i.invNo || '').toLowerCase() === code.toLowerCase()) || S.items.find(i => i.id === code);
  history.replaceState(null, '', location.pathname + location.search);
  if (it) itemDetail(it.id); else toast('Kein Gerät mit „' + code + '" gefunden.');
}

/* ---------------------------------------------------------------- Ansicht: Inventar */
function filteredItems() {
  const q = S.q.trim().toLowerCase();
  let list = S.items.filter(i => {
    if (S.filterGroup !== 'alle' && i.groupId !== S.filterGroup) return false;
    if (!q) return true;
    return [i.name, i.invNo, i.serial, i.brand, i.model, i.location, i.notes]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });
  const ord = ['verliehen', 'reparatur', 'defekt', 'verfuegbar', 'ausgemustert'];
  list.sort((a, b) => {
    if (S.sort === 'name') return a.name.localeCompare(b.name, 'de');
    if (S.sort === 'new') return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    if (S.sort === 'status') return ord.indexOf(a.status) - ord.indexOf(b.status) || a.name.localeCompare(b.name, 'de');
    return (a.invNo || '').localeCompare(b.invNo || '', 'de', { numeric: true });
  });
  return list;
}

function renderStats() {
  const total = S.items.length;
  const out = S.items.filter(i => i.status === 'verliehen').length;
  const fix = S.items.filter(i => i.status === 'reparatur' || i.status === 'defekt').length;
  const dmg = S.items.filter(i => openDamages(i.id).length).length;
  $('#stats').innerHTML = `
    <div class="stat"><b>${total}</b><span>Geräte</span></div>
    <div class="stat is-out"><b>${out}</b><span>verliehen</span></div>
    <div class="stat"><b>${S.groups.length}</b><span>Gruppen</span></div>
    <div class="stat is-bad"><b>${dmg}</b><span>offene Schäden</span></div>`;
  void fix;
}

function renderGroupFilter() {
  const counts = {}; S.items.forEach(i => counts[i.groupId] = (counts[i.groupId] || 0) + 1);
  $('#groupfilter').innerHTML =
    `<button class="chip ${S.filterGroup === 'alle' ? 'is-on' : ''}" data-g="alle">Alle<span class="n">${S.items.length}</span></button>` +
    S.groups.map(g => `<button class="chip ${S.filterGroup === g.id ? 'is-on' : ''}" data-g="${g.id}">${esc(g.name)}<span class="n">${counts[g.id] || 0}</span></button>`).join('');
}

async function renderItems() {
  const list = filteredItems(), box = $('#itemlist');
  if (!list.length) {
    box.innerHTML = S.items.length
      ? `<div class="empty"><b>Nichts gefunden</b>Suche oder Gruppenfilter anpassen.</div>`
      : `<div class="empty"><b>Noch kein Gerät erfasst</b>Erst eine Produktgruppe anlegen, dann Geräte über das Plus hinzufügen.</div>`;
    return;
  }
  box.innerHTML = list.map(i => {
    const g = groupOf(i.groupId), st = STATUS[i.status] || STATUS.verfuegbar;
    const dmg = openDamages(i.id).length;
    const cls = i.status === 'verliehen' ? 'is-out' : (i.status === 'reparatur' ? 'is-fix'
      : (i.status === 'defekt' || i.status === 'ausgemustert') ? 'is-dead' : '');
    const sub = [g ? g.name : 'ohne Gruppe', [i.brand, i.model].filter(Boolean).join(' '), st.label]
      .filter(Boolean).join(' · ');
    return `<button class="row ${cls}" data-item="${i.id}">
      <span class="row-tag">${esc(i.invNo || '—')}</span>
      <span class="row-main"><span class="row-name">${esc(i.name)}</span><span class="row-sub">${esc(sub)}</span></span>
      <span class="row-flags">${dmg ? '<i class="flag bad" title="offener Schaden"></i>' : ''}${i.photos && i.photos.length ? `<img class="thumb" data-lazy="${i.photos[0]}" alt="">` : ''}</span>
    </button>`;
  }).join('');
  for (const img of $$('#itemlist img[data-lazy]')) img.src = await photoData(img.dataset.lazy);
}

function renderGroups() {
  const counts = {}; S.items.forEach(i => counts[i.groupId] = (counts[i.groupId] || 0) + 1);
  $('#grouplist').innerHTML = S.groups.length ? S.groups.map(g => `
    <button class="grouprow" data-group="${g.id}" style="border-left-color:${esc(g.color || '#f5c542')}">
      <span class="code">${esc(g.code)}</span>
      <span>${esc(g.name)}${g.note ? `<br><small style="color:var(--muted)">${esc(g.note)}</small>` : ''}</span>
      <span class="cnt">${counts[g.id] || 0}</span>
    </button>`).join('')
    : `<div class="empty"><b>Keine Gruppen</b>Typisch sind Kabel, Licht, Mikrofone, Backline, Cases.</div>`;
}

/* ---------------------------------------------------------------- Sheet-Rahmen */
let sheetBack = null;
function openSheet(title, html, actionHTML = '', back = null) {
  if (typeof stopScan === 'function') stopScan();
  sheetBack = back;
  $('#sheet-title').textContent = title;
  $('#sheet-action').innerHTML = actionHTML;
  $('#sheet-body').innerHTML = html;
  $('#sheet-body').onclick = null;
  $('#sheet').hidden = false;
  $('#sheet-body').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  const back = sheetBack; sheetBack = null;
  if (back) return back();
  closeSheetAll();
}
function closeSheetAll() {
  sheetBack = null;
  $('#sheet').hidden = true; $('#sheet-body').innerHTML = '';
  document.body.style.overflow = '';
}
$('#sheet-close').onclick = closeSheet;

/* ---------------------------------------------------------------- Gruppe: Formular */
function groupForm(g) {
  const isNew = !g;
  g = g || { id: uid(), name: '', code: '', color: '#f5c542', note: '' };
  openSheet(isNew ? 'Neue Produktgruppe' : 'Gruppe bearbeiten', `
    <label class="field"><span>Name</span><input type="text" id="g-name" value="${esc(g.name)}" placeholder="z. B. Kabel"></label>
    <div class="grid2">
      <label class="field"><span>Kürzel für Inventarnummern</span><input type="text" id="g-code" value="${esc(g.code)}" maxlength="6" placeholder="KAB"></label>
      <label class="field"><span>Farbe</span><input type="color" id="g-color" value="${esc(g.color || '#f5c542')}" style="height:44px;padding:4px"></label>
    </div>
    <label class="field"><span>Beschreibung</span><input type="text" id="g-note" value="${esc(g.note || '')}" placeholder="optional"></label>
    <div class="btnrow">
      <button class="btn primary" id="g-save">Gruppe speichern</button>
      ${isNew ? '' : '<button class="btn danger" id="g-del">Löschen</button>'}
    </div>`);
  $('#g-save').onclick = async () => {
    const name = $('#g-name').value.trim();
    if (!name) return toast('Name fehlt.');
    let code = $('#g-code').value.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) code = name.slice(0, 3).toUpperCase();
    Object.assign(g, { name, code, color: $('#g-color').value, note: $('#g-note').value.trim() });
    await idb.put('groups', g);
    await loadAll(); renderGroups(); renderGroupFilter(); renderItems(); renderStats();
    closeSheetAll(); toast('Gruppe gespeichert');
  };
  if (!isNew) $('#g-del').onclick = async () => {
    const n = S.items.filter(i => i.groupId === g.id).length;
    if (n && !confirm(`${n} Gerät(e) hängen an dieser Gruppe. Sie bleiben erhalten, verlieren aber die Zuordnung. Gruppe löschen?`)) return;
    if (!n && !confirm('Gruppe löschen?')) return;
    await idb.del('groups', g.id);
    await loadAll(); renderGroups(); renderGroupFilter(); renderItems(); renderStats();
    closeSheetAll(); toast('Gruppe gelöscht');
  };
}

/* ---------------------------------------------------------------- Gerät: Formular */
function itemForm(item, back = null) {
  const isNew = !item;
  const i = item || {
    id: uid(), groupId: (S.groups[0] || {}).id || '', name: '', brand: '', model: '', serial: '',
    invNo: '', qty: 1, purchaseDate: '', price: '', condition: 'Gut', status: 'verfuegbar',
    location: '', notes: '', photos: [], createdAt: new Date().toISOString()
  };
  if (isNew && i.groupId) i.invNo = nextInvNo(i.groupId);

  openSheet(isNew ? 'Neues Gerät' : 'Gerät bearbeiten', `
    <label class="field"><span>Bezeichnung</span><input type="text" id="i-name" value="${esc(i.name)}" placeholder="z. B. XLR-Kabel 10 m"></label>
    <div class="grid2">
      <label class="field"><span>Produktgruppe</span><select id="i-group">
        ${S.groups.map(g => `<option value="${g.id}" ${g.id === i.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('') || '<option value="">— keine —</option>'}
      </select></label>
      <label class="field"><span>Inventarnummer</span><input type="text" id="i-inv" value="${esc(i.invNo)}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Hersteller</span><input type="text" id="i-brand" value="${esc(i.brand)}"></label>
      <label class="field"><span>Modell</span><input type="text" id="i-model" value="${esc(i.model)}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Seriennummer</span><input type="text" id="i-serial" value="${esc(i.serial)}"></label>
      <label class="field"><span>Anzahl</span><input type="number" id="i-qty" min="1" value="${i.qty || 1}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Angeschafft am</span><input type="date" id="i-date" value="${esc(i.purchaseDate)}"></label>
      <label class="field"><span>Wert (€)</span><input type="number" id="i-price" step="0.01" value="${i.price ?? ''}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Zustand</span><select id="i-cond">
        ${CONDITIONS.map(c => `<option ${c === i.condition ? 'selected' : ''}>${c}</option>`).join('')}
      </select></label>
      <label class="field"><span>Status</span><select id="i-status">
        ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === i.status ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select></label>
    </div>
    <label class="field"><span>Lagerort</span><input type="text" id="i-loc" value="${esc(i.location)}" placeholder="z. B. Case 2, Probenraum"></label>
    <label class="field"><span>Bemerkung</span><textarea id="i-notes" placeholder="Zubehör, Besonderheiten …">${esc(i.notes)}</textarea></label>

    <div class="section-title">Fotos zum Gerät</div>
    <div class="gallery" id="i-gallery"></div>

    <div class="btnrow">
      <button class="btn primary" id="i-save">Gerät speichern</button>
      ${isNew ? '' : '<button class="btn danger" id="i-del">Löschen</button>'}
    </div>`, '', back);

  i.photos = i.photos || [];
  const paint = () => renderGallery($('#i-gallery'), i.photos, {
    editable: true,
    onAdd: ids => { i.photos.push(...ids); paint(); },
    onRemove: pid => { i.photos = i.photos.filter(x => x !== pid); idb.del('photos', pid); paint(); }
  });
  paint();

  $('#i-group').onchange = e => {
    const inv = $('#i-inv');
    if (isNew || !inv.value.trim()) inv.value = nextInvNo(e.target.value);
  };
  $('#i-save').onclick = async () => {
    const name = $('#i-name').value.trim();
    if (!name) return toast('Bezeichnung fehlt.');
    Object.assign(i, {
      name, groupId: $('#i-group').value, invNo: $('#i-inv').value.trim(),
      brand: $('#i-brand').value.trim(), model: $('#i-model').value.trim(),
      serial: $('#i-serial').value.trim(), qty: Number($('#i-qty').value) || 1,
      purchaseDate: $('#i-date').value, price: $('#i-price').value,
      condition: $('#i-cond').value, status: $('#i-status').value,
      location: $('#i-loc').value.trim(), notes: $('#i-notes').value.trim(),
      updatedAt: new Date().toISOString()
    });
    if (!i.invNo) i.invNo = nextInvNo(i.groupId);
    await idb.put('items', i);
    await loadAll(); renderStats(); renderGroupFilter(); renderItems(); renderGroups();
    closeSheet(); toast('Gerät gespeichert');
  };
  if (!isNew) $('#i-del').onclick = async () => {
    if (!confirm(`„${i.name}" mit Historie und Fotos löschen?`)) return;
    for (const e of entriesOf(i.id)) {
      for (const p of e.photos || []) await idb.del('photos', p);
      await idb.del('entries', e.id);
    }
    for (const p of i.photos || []) await idb.del('photos', p);
    await idb.del('items', i.id);
    await loadAll(); renderStats(); renderGroupFilter(); renderItems(); renderGroups();
    closeSheetAll(); toast('Gerät gelöscht');
  };
}

/* ---------------------------------------------------------------- Gerät: Detail */
async function itemDetail(id) {
  const i = itemOf(id); if (!i) return;
  const g = groupOf(i.groupId), st = STATUS[i.status] || STATUS.verfuegbar;
  const log = entriesOf(id);
  const loan = S.loans.find(l => l.status === 'offen' && l.items.some(x => x.itemId === id));

  openSheet(i.name, `
    <div class="detail-head">
      <span class="detail-tag">${esc(i.invNo || '—')}</span>
      <div><h2>${esc(i.name)}</h2>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge ${st.cls}">${st.label}</span>
          <span class="badge">${esc(i.condition || '—')}</span>
          ${g ? `<span class="badge">${esc(g.name)}</span>` : ''}
        </div>
      </div>
    </div>
    ${loan ? `<div class="empty" style="text-align:left;border-style:solid">Aktuell verliehen an <b style="display:inline">${esc(loan.borrower)}</b>${loan.dueDate ? ', zurück bis ' + deDate(loan.dueDate) : ''}.</div>` : ''}

    <dl class="facts">
      ${fact('Hersteller / Modell', [i.brand, i.model].filter(Boolean).join(' ') || '—')}
      ${fact('Seriennummer', i.serial || '—')}
      ${fact('Anzahl', i.qty || 1)}
      ${fact('Angeschafft', deDate(i.purchaseDate))}
      ${fact('Wert', money(i.price))}
      ${fact('Lagerort', i.location || '—')}
    </dl>
    ${i.notes ? `<p style="font-size:14px;white-space:pre-wrap;color:var(--muted)">${esc(i.notes)}</p>` : ''}

    <div class="section-title">Fotos</div>
    <div class="gallery" id="d-gallery"></div>

    <div class="section-title">Etikett und Codes</div>
    ${codesSection(i)}

    <div class="section-title">Historie &amp; Kommentare</div>
    <div class="btnrow" style="margin-top:0">
      <button class="btn small" data-add-entry="notiz">Notiz</button>
      <button class="btn small" data-add-entry="schaden">Schaden</button>
      <button class="btn small" data-add-entry="reparatur">Reparatur</button>
      <button class="btn small" data-add-entry="wartung">Wartung</button>
    </div>
    <div class="log" id="d-log" style="margin-top:14px">
      ${log.length ? '' : '<div class="empty">Noch keine Einträge. Schäden, Reparaturen und Notizen landen hier – mit Datum und Fotos.</div>'}
    </div>`,
    `<button class="btn small" id="d-edit">Bearbeiten</button>`);

  $('#d-edit').onclick = () => itemForm(i, () => itemDetail(id));

  const paint = () => renderGallery($('#d-gallery'), i.photos || [], {
    editable: true,
    onAdd: async ids => { i.photos = (i.photos || []).concat(ids); i.updatedAt = new Date().toISOString(); await idb.put('items', i); paint(); renderItems(); },
    onRemove: async pid => { i.photos = (i.photos || []).filter(x => x !== pid); await idb.del('photos', pid); await idb.put('items', i); paint(); renderItems(); }
  });
  paint();

  const logBox = $('#d-log');
  for (const e of log) {
    const div = document.createElement('div');
    div.className = 'logitem t-' + e.type;
    div.innerHTML = `
      <div class="when">${deStamp(e.date)}</div>
      <div class="what">${ENTRY_TYPES[e.type] || e.type}${e.type === 'schaden' ? (e.resolved ? ' · behoben' : ' · offen') : ''}</div>
      ${e.text ? `<p>${esc(e.text)}</p>` : ''}
      <div class="gallery"></div>
      <div class="log-actions">
        ${e.type === 'schaden' ? `<button class="link" data-resolve="${e.id}">${e.resolved ? 'wieder als offen markieren' : 'als behoben markieren'}</button> · ` : ''}
        <button class="link" data-delentry="${e.id}">Eintrag löschen</button>
      </div>`;
    logBox.appendChild(div);
    renderGallery(div.querySelector('.gallery'), e.photos || [], {
      editable: true,
      onAdd: async ids => { e.photos = (e.photos || []).concat(ids); await idb.put('entries', e); itemDetail(id); },
      onRemove: async pid => { e.photos = (e.photos || []).filter(x => x !== pid); await idb.del('photos', pid); await idb.put('entries', e); itemDetail(id); }
    });
  }

  $('#sheet-body').onclick = async ev => {
    if (ev.target.closest('[data-label-print]')) return buildLabelSheet([i], { size: 'mittel', copies: 1 });
    if (ev.target.closest('[data-label-file]')) {
      download(labelSVG(i, { size: 'mittel' }), 'etikett-' + (i.invNo || i.id) + '.svg', 'image/svg+xml');
      return toast('Etikett gespeichert');
    }
    const add = ev.target.closest('[data-add-entry]');
    if (add) return entryForm(id, add.dataset.addEntry);
    const res = ev.target.closest('[data-resolve]');
    if (res) {
      const e = S.entries.find(x => x.id === res.dataset.resolve);
      e.resolved = !e.resolved; await idb.put('entries', e); await loadAll(); itemDetail(id); renderItems(); renderStats(); return;
    }
    const del = ev.target.closest('[data-delentry]');
    if (del) {
      if (!confirm('Eintrag löschen?')) return;
      const e = S.entries.find(x => x.id === del.dataset.delentry);
      for (const p of e.photos || []) await idb.del('photos', p);
      await idb.del('entries', e.id); await loadAll(); itemDetail(id); renderStats(); renderItems();
    }
  };
}
const fact = (k, v) => `<div class="fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>`;

/* Eintrag anlegen */
function entryForm(itemId, type) {
  const e = { id: uid(), itemId, type, date: new Date().toISOString(), text: '', photos: [], resolved: false };
  const i = itemOf(itemId);
  openSheet(ENTRY_TYPES[type] + ' erfassen', `
    <p class="lede">${esc(i.invNo)} · ${esc(i.name)}</p>
    <label class="field"><span>Datum</span><input type="date" id="e-date" value="${todayISO()}"></label>
    <label class="field"><span>Beschreibung</span><textarea id="e-text" placeholder="${type === 'schaden' ? 'z. B. Klinkenbuchse wackelt, Gehäuse angeschlagen' : 'Was wurde gemacht?'}"></textarea></label>
    ${type === 'schaden' ? `<label class="check"><input type="checkbox" id="e-status"><span>Gerät zugleich auf „Defekt" setzen</span></label>` : ''}
    ${type === 'reparatur' ? `<label class="check"><input type="checkbox" id="e-fixed" checked><span>Offene Schäden als behoben markieren und Gerät auf „Verfügbar" setzen</span></label>` : ''}
    <div class="section-title">Fotos</div>
    <div class="gallery" id="e-gallery"></div>
    <div class="btnrow"><button class="btn primary" id="e-save">Eintrag speichern</button></div>`, '', () => itemDetail(itemId));

  const paint = () => renderGallery($('#e-gallery'), e.photos, {
    editable: true,
    onAdd: ids => { e.photos.push(...ids); paint(); },
    onRemove: pid => { e.photos = e.photos.filter(x => x !== pid); idb.del('photos', pid); paint(); }
  });
  paint();

  $('#e-save').onclick = async () => {
    e.text = $('#e-text').value.trim();
    const d = $('#e-date').value;
    if (d) e.date = new Date(d + 'T12:00:00').toISOString();
    if (!e.text && !e.photos.length) return toast('Text oder Foto hinzufügen.');
    await idb.put('entries', e);
    if (type === 'schaden' && $('#e-status') && $('#e-status').checked) { i.status = 'defekt'; i.condition = 'Beschädigt'; await idb.put('items', i); }
    if (type === 'reparatur' && $('#e-fixed') && $('#e-fixed').checked) {
      for (const d2 of openDamages(itemId)) { d2.resolved = true; await idb.put('entries', d2); }
      if (i.status !== 'verliehen') { i.status = 'verfuegbar'; await idb.put('items', i); }
    }
    await loadAll(); renderItems(); renderStats(); closeSheet(); toast('Eintrag gespeichert');
  };
}

/* ---------------------------------------------------------------- Verleih */
function renderLoans() {
  const box = $('#loanlist');
  const list = [...S.loans].sort((a, b) => (b.outDate || '').localeCompare(a.outDate || ''));
  if (!list.length) {
    box.innerHTML = `<div class="empty"><b>Kein Verleih erfasst</b>Beim Anlegen wählst du die Geräte aus und hältst den Zustand mit Fotos fest.</div>`;
    return;
  }
  box.innerHTML = list.map(l => {
    const late = l.status === 'offen' && l.dueDate && l.dueDate < todayISO();
    const cls = l.status === 'offen' ? (late ? 'late' : 'open') : 'done';
    const dmg = l.items.filter(x => x.damaged).length;
    return `<button class="loancard ${cls}" data-loan="${l.id}">
      <h3>${esc(l.borrower || 'Verleih')}</h3>
      <div class="meta">${l.items.length} Gerät(e) · ausgegeben ${deDate(l.outDate)}${l.status === 'offen'
        ? (l.dueDate ? ` · zurück bis ${deDate(l.dueDate)}${late ? ' (überfällig)' : ''}` : '')
        : ` · zurück ${deDate(l.returnDate)}`}${dmg ? ` · ${dmg}× Schaden` : ''}</div>
    </button>`;
  }).join('');
}

function loanForm(loan, back = null) {
  const isNew = !loan;
  const l = loan || {
    id: uid(), borrower: '', contact: '', purpose: '', outDate: todayISO(), dueDate: '',
    returnDate: '', status: 'offen', items: [], note: '', createdAt: new Date().toISOString()
  };
  const chosen = new Set(l.items.map(x => x.itemId));
  const avail = S.items.filter(i => i.status !== 'ausgemustert' && (chosen.has(i.id) || i.status === 'verfuegbar'));

  openSheet(isNew ? 'Neuer Verleih' : 'Verleih bearbeiten', `
    <label class="field"><span>Entleiher</span><input type="text" id="l-borrower" value="${esc(l.borrower)}" placeholder="Band, Verein, Name"></label>
    <label class="field"><span>Kontakt</span><input type="text" id="l-contact" value="${esc(l.contact)}" placeholder="Telefon oder E-Mail"></label>
    <div class="grid2">
      <label class="field"><span>Ausgabe</span><input type="date" id="l-out" value="${esc(l.outDate)}"></label>
      <label class="field"><span>Rückgabe bis</span><input type="date" id="l-due" value="${esc(l.dueDate)}"></label>
    </div>
    <label class="field"><span>Anlass</span><input type="text" id="l-purpose" value="${esc(l.purpose || '')}" placeholder="z. B. Sommerfest Grafing"></label>
    <div class="section-title">Geräte auswählen</div>
    <div id="l-picks">
      ${avail.length ? avail.map(i => `<div class="pick">
        <input type="checkbox" id="p-${i.id}" value="${i.id}" ${chosen.has(i.id) ? 'checked' : ''}>
        <span class="tagmini">${esc(i.invNo)}</span>
        <label for="p-${i.id}">${esc(i.name)}</label>
      </div>`).join('') : '<div class="empty">Kein verfügbares Gerät.</div>'}
    </div>
    <label class="field" style="margin-top:14px"><span>Notiz zur Ausgabe</span><textarea id="l-note">${esc(l.note || '')}</textarea></label>
    <div class="btnrow">
      <button class="btn primary" id="l-save">${isNew ? 'Verleih anlegen' : 'Änderungen speichern'}</button>
      ${isNew ? '' : '<button class="btn danger" id="l-del">Verleih löschen</button>'}
    </div>`, '', back);

  $('#l-save').onclick = async () => {
    const picked = $$('#l-picks input:checked').map(c => c.value);
    if (!picked.length) return toast('Mindestens ein Gerät wählen.');
    Object.assign(l, {
      borrower: $('#l-borrower').value.trim() || 'Ohne Namen',
      contact: $('#l-contact').value.trim(), purpose: $('#l-purpose').value.trim(),
      outDate: $('#l-out').value || todayISO(), dueDate: $('#l-due').value,
      note: $('#l-note').value.trim()
    });
    const old = new Map(l.items.map(x => [x.itemId, x]));
    l.items = picked.map(id => old.get(id) || ({
      itemId: id, outCondition: (itemOf(id) || {}).condition || 'Gut', outNote: '', outPhotos: [],
      inCondition: '', inNote: '', inPhotos: [], damaged: false
    }));
    for (const [id] of old) if (!picked.includes(id)) { const it = itemOf(id); if (it && it.status === 'verliehen') { it.status = 'verfuegbar'; await idb.put('items', it); } }
    for (const id of picked) { const it = itemOf(id); if (it && l.status === 'offen' && it.status === 'verfuegbar') { it.status = 'verliehen'; await idb.put('items', it); } }
    await idb.put('loans', l);
    await loadAll(); renderLoans(); renderItems(); renderStats();
    closeSheetAll(); loanDetail(l.id);
  };
  if (!isNew) $('#l-del').onclick = async () => {
    if (!confirm('Verleih löschen? Die Geräte werden wieder auf verfügbar gesetzt.')) return;
    for (const x of l.items) { const it = itemOf(x.itemId); if (it && it.status === 'verliehen') { it.status = 'verfuegbar'; await idb.put('items', it); } }
    await idb.del('loans', l.id);
    await loadAll(); renderLoans(); renderItems(); renderStats(); closeSheetAll(); toast('Verleih gelöscht');
  };
}

async function loanDetail(id) {
  const l = S.loans.find(x => x.id === id); if (!l) return;
  const offen = l.status === 'offen';
  openSheet(l.borrower, `
    <div class="detail-head">
      <div><h2>${esc(l.borrower)}</h2>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge ${offen ? 'out' : 'ok'}">${offen ? 'läuft' : 'abgeschlossen'}</span>
          <span class="badge">${l.items.length} Gerät(e)</span>
        </div>
      </div>
    </div>
    <dl class="facts">
      ${fact('Ausgabe', deDate(l.outDate))}
      ${fact('Rückgabe bis', deDate(l.dueDate))}
      ${l.returnDate ? fact('Zurückgegeben', deDate(l.returnDate)) : ''}
      ${fact('Kontakt', l.contact || '—')}
      ${fact('Anlass', l.purpose || '—')}
    </dl>
    ${l.note ? `<p style="font-size:14px;color:var(--muted);white-space:pre-wrap">${esc(l.note)}</p>` : ''}

    <div class="btnrow">
      <button class="btn small" id="l-proto">Übergabeprotokoll</button>
      ${offen ? '<button class="btn small" id="l-edit">Bearbeiten</button>' : ''}
      ${offen ? '<button class="btn small primary" id="l-return">Rückgabe erfassen</button>' : '<button class="btn small danger" id="l-del2">Löschen</button>'}
    </div>

    <div class="section-title">Geräte im Verleih</div>
    <div id="l-items"></div>`);

  const box = $('#l-items');
  for (const x of l.items) {
    const it = itemOf(x.itemId) || { name: 'gelöschtes Gerät', invNo: '—' };
    const d = document.createElement('div');
    d.style.cssText = 'border:1px solid var(--line-soft);border-radius:4px;padding:12px;margin-bottom:10px';
    d.innerHTML = `
      <div style="display:flex;gap:10px;align-items:baseline">
        <span class="detail-tag" style="font-size:11px">${esc(it.invNo)}</span>
        <b style="flex:1">${esc(it.name)}</b>
        ${x.damaged ? '<span class="badge bad">Schaden</span>' : ''}
      </div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:6px">Zustand bei Ausgabe: ${esc(x.outCondition || '—')}${x.outNote ? ' · ' + esc(x.outNote) : ''}</div>
      ${!offen ? `<div style="font-size:12.5px;color:var(--muted)">Zustand bei Rückgabe: ${esc(x.inCondition || '—')}${x.inNote ? ' · ' + esc(x.inNote) : ''}</div>` : ''}
      <div class="compare">
        <div><h4>Ausgabe</h4><div class="gallery" data-out></div></div>
        <div><h4>Rückgabe</h4><div class="gallery" data-in></div></div>
      </div>`;
    box.appendChild(d);
    renderGallery(d.querySelector('[data-out]'), x.outPhotos || [], {
      editable: offen,
      onAdd: async ids => { x.outPhotos = (x.outPhotos || []).concat(ids); await idb.put('loans', l); loanDetail(id); },
      onRemove: async pid => { x.outPhotos = x.outPhotos.filter(p => p !== pid); await idb.del('photos', pid); await idb.put('loans', l); loanDetail(id); }
    });
    renderGallery(d.querySelector('[data-in]'), x.inPhotos || []);
  }

  $('#l-proto').onclick = () => buildLoanDoc(l, offen ? 'ausgabe' : 'rueckgabe');
  if ($('#l-edit')) $('#l-edit').onclick = () => loanForm(l, () => loanDetail(l.id));
  if ($('#l-return')) $('#l-return').onclick = () => returnForm(l);
  if ($('#l-del2')) $('#l-del2').onclick = async () => {
    if (!confirm('Abgeschlossenen Verleih löschen?')) return;
    await idb.del('loans', l.id); await loadAll(); renderLoans(); closeSheetAll(); toast('Verleih gelöscht');
  };
}

/* Rückgabe mit Gegencheck */
function returnForm(l) {
  openSheet('Rückgabe erfassen', `
    <p class="lede">Zustand je Gerät prüfen. Bei Schaden entsteht automatisch ein Historieneintrag mit den Rückgabefotos.</p>
    <label class="field"><span>Rückgabedatum</span><input type="date" id="r-date" value="${todayISO()}"></label>
    <div id="r-items"></div>
    <div class="btnrow"><button class="btn primary wide" id="r-save">Rückgabe abschließen</button></div>`, '', () => loanDetail(l.id));

  const box = $('#r-items');
  l.items.forEach((x, idx) => {
    const it = itemOf(x.itemId) || { name: 'gelöschtes Gerät', invNo: '—', condition: '' };
    const d = document.createElement('fieldset');
    d.innerHTML = `<legend>${esc(it.invNo)} · ${esc(it.name)}</legend>
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">Bei Ausgabe: ${esc(x.outCondition || '—')}</div>
      <div class="compare" style="margin-bottom:10px"><div><h4>Fotos Ausgabe</h4><div class="gallery" data-out></div></div><div></div></div>
      <div class="grid2">
        <label class="field"><span>Zustand jetzt</span><select data-cond="${idx}">
          ${CONDITIONS.map(c => `<option ${c === x.outCondition ? 'selected' : ''}>${c}</option>`).join('')}
        </select></label>
        <label class="field"><span>&nbsp;</span><label class="check"><input type="checkbox" data-dmg="${idx}"><span>Schaden</span></label></label>
      </div>
      <label class="field"><span>Bemerkung</span><input type="text" data-note="${idx}" placeholder="optional"></label>
      <div class="gallery" data-in></div>`;
    box.appendChild(d);
    renderGallery(d.querySelector('[data-out]'), x.outPhotos || []);
    const paint = () => renderGallery(d.querySelector('[data-in]'), x.inPhotos || [], {
      editable: true,
      onAdd: ids => { x.inPhotos = (x.inPhotos || []).concat(ids); paint(); },
      onRemove: pid => { x.inPhotos = x.inPhotos.filter(p => p !== pid); idb.del('photos', pid); paint(); }
    });
    paint();
  });

  $('#r-save').onclick = async () => {
    const date = $('#r-date').value || todayISO();
    for (let idx = 0; idx < l.items.length; idx++) {
      const x = l.items[idx], it = itemOf(x.itemId);
      x.inCondition = $(`[data-cond="${idx}"]`).value;
      x.inNote = $(`[data-note="${idx}"]`).value.trim();
      x.damaged = $(`[data-dmg="${idx}"]`).checked;
      if (!it) continue;
      it.condition = x.inCondition;
      it.status = x.damaged ? 'defekt' : 'verfuegbar';
      it.updatedAt = new Date().toISOString();
      await idb.put('items', it);
      await idb.put('entries', {
        id: uid(), itemId: it.id, type: x.damaged ? 'schaden' : 'rueckgabe',
        date: new Date(date + 'T12:00:00').toISOString(),
        text: `${x.damaged ? 'Schaden bei Rückgabe von ' : 'Zurück von '}${l.borrower}. Zustand: ${x.inCondition}${x.inNote ? '. ' + x.inNote : ''}`,
        photos: (x.inPhotos || []).slice(), resolved: false
      });
    }
    l.status = 'zurueck'; l.returnDate = date;
    await idb.put('loans', l);
    await loadAll(); renderLoans(); renderItems(); renderStats();
    closeSheetAll(); loanDetail(l.id); toast('Rückgabe erfasst');
  };
}

/* ---------------------------------------------------------------- Ausgabe / Export */
function renderExport() {
  $('#exportui').innerHTML = `
    <fieldset>
      <legend>Umfang</legend>
      <label class="check"><input type="checkbox" id="x-all" checked><span>Gesamtes Inventar</span></label>
      <div id="x-groups" style="margin-top:6px"></div>
      <div style="margin-top:8px"><button class="btn small" id="x-pick">Einzelne Geräte wählen …</button>
        <span id="x-pickinfo" style="font-size:12.5px;color:var(--muted);margin-left:8px"></span></div>
    </fieldset>

    <fieldset>
      <legend>Detailgrad</legend>
      <label class="field"><span>Darstellung</span><select id="x-layout">
        <option value="liste">Kompakte Tabelle</option>
        <option value="karten" selected>Ausführlich je Gerät</option>
      </select></label>
      <label class="check"><input type="checkbox" id="x-tech" checked><span>Technische Daten<small>Hersteller, Modell, Seriennummer, Anzahl</small></span></label>
      <label class="check"><input type="checkbox" id="x-value"><span>Anschaffung und Wert<small>Kaufdatum, Preis, Gesamtsumme</small></span></label>
      <label class="check"><input type="checkbox" id="x-state" checked><span>Zustand, Status und Lagerort</span></label>
      <label class="field" style="margin-top:10px"><span>Historie</span><select id="x-hist">
        <option value="keine">ohne Historie</option>
        <option value="offen" selected>nur offene Schäden</option>
        <option value="alle">vollständige Historie</option>
      </select></label>
      <label class="field"><span>Fotos</span><select id="x-photos">
        <option value="keine">ohne Fotos</option>
        <option value="titel" selected>ein Titelfoto je Gerät</option>
        <option value="alle">alle Fotos, auch aus der Historie</option>
      </select></label>
      <label class="check"><input type="checkbox" id="x-group" checked><span>Nach Produktgruppen gliedern</span></label>
    </fieldset>

    <fieldset>
      <legend>Kopf</legend>
      <label class="field"><span>Titel</span><input type="text" id="x-title" value="Inventarliste"></label>
      <label class="field"><span>Zusatz</span><input type="text" id="x-sub" placeholder="z. B. Stand Probenraum, Übergabe an …"></label>
    </fieldset>

    <fieldset>
      <legend>Etiketten</legend>
      <div class="grid2">
        <label class="field"><span>Größe</span><select id="x-lsize">
          <option value="klein">40 × 25 mm</option>
          <option value="mittel" selected>60 × 35 mm</option>
          <option value="gross">90 × 50 mm</option>
        </select></label>
        <label class="field"><span>Stück je Gerät</span><input type="number" id="x-lcopies" min="1" max="20" value="1"></label>
      </div>
      <label class="check"><input type="checkbox" id="x-lqr" checked><span>QR-Code<small>öffnet das Gerät in der App</small></span></label>
      <label class="check"><input type="checkbox" id="x-lbar" checked><span>Barcode (Code 128) mit Inventarnummer</span></label>
      <label class="check"><input type="checkbox" id="x-lname" checked><span>Bezeichnung und Gruppe</span></label>
      <div class="btnrow"><button class="btn" id="x-labels">Etiketten erzeugen</button></div>
    </fieldset>

    <div class="btnrow">
      <button class="btn primary" id="x-run">Vorschau &amp; Drucken</button>
      <button class="btn" id="x-csv">CSV</button>
    </div>
    <p class="lede" style="margin-top:14px">Aus der Vorschau heraus über „Drucken" als PDF sichern, oder mit „Datei" eine HTML-Datei mit eingebetteten Fotos speichern.</p>`;

  const counts = {}; S.items.forEach(i => counts[i.groupId] = (counts[i.groupId] || 0) + 1);
  $('#x-groups').innerHTML = S.groups.map(g => `<label class="check"><input type="checkbox" class="x-g" value="${g.id}"><span>${esc(g.name)} <small>${counts[g.id] || 0} Gerät(e)</small></span></label>`).join('');

  const sync = () => { const all = $('#x-all').checked; $$('.x-g').forEach(c => { c.disabled = all; if (all) c.checked = false; }); };
  $('#x-all').onchange = sync; sync();

  $('#x-pick').onclick = () => pickItemsDialog();
  $('#x-run').onclick = () => buildInventoryDoc(readExportOpts());
  $('#x-csv').onclick = () => exportCSV(readExportOpts());
  $('#x-labels').onclick = () => buildLabelSheet(selectedItems(readExportOpts()), {
    size: $('#x-lsize').value, copies: Number($('#x-lcopies').value) || 1,
    qr: $('#x-lqr').checked, bar: $('#x-lbar').checked, name: $('#x-lname').checked
  });
  updatePickInfo();
}

let manualPick = [];
function updatePickInfo() {
  const el = $('#x-pickinfo'); if (!el) return;
  el.textContent = manualPick.length ? `${manualPick.length} Gerät(e) fest gewählt` : '';
}
function pickItemsDialog() {
  const sel = new Set(manualPick);
  openSheet('Geräte für die Ausgabe', `
    <p class="lede">Eine Auswahl hier überschreibt Umfang und Gruppenfilter.</p>
    <div class="btnrow" style="margin-top:0"><button class="btn small" id="pk-none">Auswahl leeren</button></div>
    <div id="pk-list" style="margin-top:12px">
      ${S.items.map(i => `<div class="pick">
        <input type="checkbox" value="${i.id}" ${sel.has(i.id) ? 'checked' : ''} id="pk-${i.id}">
        <span class="tagmini">${esc(i.invNo)}</span>
        <label for="pk-${i.id}">${esc(i.name)}</label></div>`).join('')}
    </div>
    <div class="btnrow"><button class="btn primary wide" id="pk-ok">Übernehmen</button></div>`);
  $('#pk-none').onclick = () => $$('#pk-list input').forEach(c => c.checked = false);
  $('#pk-ok').onclick = () => {
    manualPick = $$('#pk-list input:checked').map(c => c.value);
    closeSheetAll(); renderExport(); toast(manualPick.length ? 'Auswahl übernommen' : 'Auswahl geleert');
  };
}
function readExportOpts() {
  const groups = $$('.x-g:checked').map(c => c.value);
  return {
    all: $('#x-all').checked, groups, manual: manualPick.slice(),
    layout: $('#x-layout').value, tech: $('#x-tech').checked, value: $('#x-value').checked,
    state: $('#x-state').checked, hist: $('#x-hist').value, photos: $('#x-photos').value,
    byGroup: $('#x-group').checked, title: $('#x-title').value.trim() || 'Inventarliste',
    sub: $('#x-sub').value.trim()
  };
}
function selectedItems(o) {
  if (o.manual && o.manual.length) return S.items.filter(i => o.manual.includes(i.id));
  if (!o.all && o.groups.length) return S.items.filter(i => o.groups.includes(i.groupId));
  return S.items.slice();
}

async function buildInventoryDoc(o) {
  let list = selectedItems(o).sort((a, b) => (a.invNo || '').localeCompare(b.invNo || '', 'de', { numeric: true }));
  if (!list.length) return toast('Keine Geräte in der Auswahl.');
  toast('Dokument wird aufgebaut …');

  const sum = list.reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 1), 0);
  let html = `<h1>${esc(o.title)}</h1>
    <div class="doc-meta">${esc(o.sub ? o.sub + ' · ' : '')}Stand ${new Date().toLocaleDateString('de-DE')} · ${list.length} Gerät(e)${o.value ? ' · Gesamtwert ' + money(sum) : ''}</div>`;

  const groupsUsed = o.byGroup
    ? [...new Set(list.map(i => i.groupId))].sort((a, b) => ((groupOf(a) || {}).name || 'zzz').localeCompare((groupOf(b) || {}).name || 'zzz', 'de'))
    : [null];

  for (const gid of groupsUsed) {
    const part = gid === null ? list : list.filter(i => i.groupId === gid);
    if (!part.length) continue;
    if (gid !== null) html += `<h2>${esc((groupOf(gid) || {}).name || 'Ohne Gruppe')} (${part.length})</h2>`;

    if (o.layout === 'liste') {
      html += `<table><thead><tr><th>Inv.-Nr.</th><th>Bezeichnung</th>${o.tech ? '<th>Hersteller / Modell</th><th>Serien-Nr.</th>' : ''}${o.state ? '<th>Zustand</th><th>Status</th>' : ''}${o.value ? '<th>Wert</th>' : ''}</tr></thead><tbody>`;
      for (const i of part) {
        html += `<tr><td>${esc(i.invNo)}</td><td>${esc(i.name)}${(i.qty || 1) > 1 ? ' (' + i.qty + '×)' : ''}</td>` +
          (o.tech ? `<td>${esc([i.brand, i.model].filter(Boolean).join(' ') || '—')}</td><td>${esc(i.serial || '—')}</td>` : '') +
          (o.state ? `<td>${esc(i.condition || '—')}</td><td>${esc((STATUS[i.status] || {}).label || '—')}</td>` : '') +
          (o.value ? `<td>${esc(money(i.price))}</td>` : '') + `</tr>`;
      }
      html += `</tbody></table>`;
      if (o.hist !== 'keine' || o.photos !== 'keine') html += await extras(part, o);
    } else {
      for (const i of part) {
        const facts = [];
        if (o.tech) {
          const t = [i.brand, i.model].filter(Boolean).join(' ');
          if (t) facts.push(t);
          if (i.serial) facts.push('S/N ' + i.serial);
          if ((i.qty || 1) > 1) facts.push('Anzahl ' + i.qty);
        }
        if (o.state) {
          facts.push('Zustand: ' + (i.condition || '—'));
          facts.push('Status: ' + ((STATUS[i.status] || {}).label || '—'));
          if (i.location) facts.push('Lagerort: ' + i.location);
        }
        if (o.value) { if (i.purchaseDate) facts.push('gekauft ' + deDate(i.purchaseDate)); facts.push('Wert ' + money(i.price)); }
        html += `<div class="p-item">
          <div class="p-head"><span class="p-inv">${esc(i.invNo)}</span><span class="p-name">${esc(i.name)}</span></div>
          ${facts.length ? `<div class="p-facts">${esc(facts.join(' · '))}</div>` : ''}
          ${i.notes ? `<div class="p-facts">${esc(i.notes)}</div>` : ''}
          ${await itemLogHTML(i, o)}
          ${await itemPhotosHTML(i, o)}
        </div>`;
      }
    }
  }
  showPreview(html, (o.title || 'inventar').toLowerCase().replace(/\W+/g, '-'));
}

async function extras(part, o) {
  let h = '';
  for (const i of part) {
    const l = await itemLogHTML(i, o), p = await itemPhotosHTML(i, o);
    if (l || p) h += `<div class="p-item"><div class="p-head"><span class="p-inv">${esc(i.invNo)}</span><span class="p-name">${esc(i.name)}</span></div>${l}${p}</div>`;
  }
  return h;
}
async function itemLogHTML(i, o) {
  if (o.hist === 'keine') return '';
  let log = entriesOf(i.id);
  if (o.hist === 'offen') log = log.filter(e => e.type === 'schaden' && !e.resolved);
  if (!log.length) return '';
  let h = `<div class="p-log">`;
  for (const e of log) {
    h += `<div><b>${deDate(e.date)} · ${ENTRY_TYPES[e.type] || e.type}${e.type === 'schaden' ? (e.resolved ? ' (behoben)' : ' (offen)') : ''}</b>${e.text ? ' – ' + esc(e.text) : ''}</div>`;
    if (o.photos === 'alle' && (e.photos || []).length) {
      const ph = await photosData(e.photos);
      h += `<div class="p-photos">${ph.map(p => `<img src="${p.data}" alt="">`).join('')}</div>`;
    }
  }
  return h + `</div>`;
}
async function itemPhotosHTML(i, o) {
  if (o.photos === 'keine' || !(i.photos || []).length) return '';
  const ids = o.photos === 'titel' ? i.photos.slice(0, 1) : i.photos;
  const ph = await photosData(ids);
  return `<div class="p-photos">${ph.map(p => `<img src="${p.data}" alt="">`).join('')}</div>`;
}

async function buildLoanDoc(l, mode) {
  const rueck = mode === 'rueckgabe';
  let html = `<h1>${rueck ? 'Rückgabeprotokoll' : 'Übergabeprotokoll'}</h1>
    <div class="doc-meta">Verleiher: Bandinventar · Entleiher: ${esc(l.borrower)}${l.contact ? ' (' + esc(l.contact) + ')' : ''} · Ausgabe ${deDate(l.outDate)}${l.dueDate ? ' · Rückgabe bis ' + deDate(l.dueDate) : ''}${l.returnDate ? ' · zurück am ' + deDate(l.returnDate) : ''}</div>
    ${l.purpose ? `<div class="note">Anlass: ${esc(l.purpose)}</div>` : ''}
    <table><thead><tr><th>Inv.-Nr.</th><th>Gerät</th><th>Zustand Ausgabe</th>${rueck ? '<th>Zustand Rückgabe</th><th>Schaden</th>' : ''}</tr></thead><tbody>`;
  for (const x of l.items) {
    const it = itemOf(x.itemId) || { name: 'gelöschtes Gerät', invNo: '—' };
    html += `<tr><td>${esc(it.invNo)}</td><td>${esc(it.name)}${it.serial ? '<br><small>S/N ' + esc(it.serial) + '</small>' : ''}</td>
      <td>${esc(x.outCondition || '—')}${x.outNote ? '<br><small>' + esc(x.outNote) + '</small>' : ''}</td>
      ${rueck ? `<td>${esc(x.inCondition || '—')}${x.inNote ? '<br><small>' + esc(x.inNote) + '</small>' : ''}</td><td>${x.damaged ? 'ja' : 'nein'}</td>` : ''}</tr>`;
  }
  html += `</tbody></table>`;
  if (l.note) html += `<div class="note">${esc(l.note)}</div>`;

  for (const x of l.items) {
    const it = itemOf(x.itemId) || { name: '—', invNo: '—' };
    const out = await photosData(x.outPhotos || []), inn = await photosData(x.inPhotos || []);
    if (!out.length && !inn.length) continue;
    html += `<div class="p-item"><div class="p-head"><span class="p-inv">${esc(it.invNo)}</span><span class="p-name">${esc(it.name)}</span></div>
      ${out.length ? `<div class="p-facts">Fotos bei Ausgabe</div><div class="p-photos">${out.map(p => `<img src="${p.data}" alt="">`).join('')}</div>` : ''}
      ${inn.length ? `<div class="p-facts">Fotos bei Rückgabe</div><div class="p-photos">${inn.map(p => `<img src="${p.data}" alt="">`).join('')}</div>` : ''}
    </div>`;
  }
  html += `<div class="sign"><div>Ort, Datum, Unterschrift Verleiher</div><div>Ort, Datum, Unterschrift Entleiher</div></div>`;
  showPreview(html, (rueck ? 'rueckgabe-' : 'uebergabe-') + l.borrower.toLowerCase().replace(/\W+/g, '-'));
}

function exportCSV(o) {
  const list = selectedItems(o);
  if (!list.length) return toast('Keine Geräte in der Auswahl.');
  const head = ['Inventarnummer', 'Bezeichnung', 'Gruppe', 'Hersteller', 'Modell', 'Seriennummer', 'Anzahl', 'Zustand', 'Status', 'Lagerort', 'Angeschafft', 'Wert', 'Offene Schäden', 'Bemerkung'];
  const rows = list.map(i => [
    i.invNo, i.name, (groupOf(i.groupId) || {}).name || '', i.brand, i.model, i.serial, i.qty || 1,
    i.condition, (STATUS[i.status] || {}).label || '', i.location, i.purchaseDate,
    (i.price ?? '').toString().replace('.', ','), openDamages(i.id).length, (i.notes || '').replace(/\n/g, ' ')
  ]);
  const csv = [head, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download('\uFEFF' + csv, 'inventar-' + todayISO() + '.csv', 'text/csv;charset=utf-8');
  toast('CSV gespeichert');
}

function showPreview(inner, filename) {
  $('#print-area').innerHTML = inner;
  $('#preview').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#preview-print').onclick = () => window.print();
  $('#preview-download').onclick = () => {
    const doc = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${esc(filename)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 18px;color:#111;font-size:13px;line-height:1.5}
h1{font-size:20px;margin:0 0 2px}.doc-meta{color:#555;font-size:11.5px;margin-bottom:18px;border-bottom:1px solid #111;padding-bottom:8px}
h2{font-size:14px;margin:20px 0 6px;border-bottom:1px solid #bbb;padding-bottom:3px}
.p-item{padding:8px 0;border-bottom:1px solid #e3e3e3}.p-head{display:flex;gap:10px;align-items:baseline}
.p-inv{font-family:monospace;font-weight:700;font-size:12px;background:#f5c542;padding:1px 5px;border-radius:2px}
.p-name{font-weight:700}.p-facts{color:#333;font-size:12px;margin-top:2px}
.p-log{margin-top:5px;font-size:12px;color:#333;padding-left:10px;border-left:2px solid #ddd}
.p-photos{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.p-photos img{width:150px;height:150px;object-fit:cover;border:1px solid #999}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}
.sign{margin-top:26px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:11px;color:#444}
.note{background:#f4f4f4;border-left:3px solid #f5c542;padding:7px 9px;margin:10px 0;font-size:12px}
.p-labels{display:flex;flex-wrap:wrap;gap:4mm}
.p-label{border:0.2mm dashed #aaa;padding:0;overflow:hidden;break-inside:avoid}
.p-label svg{display:block;width:100%;height:100%}
@media print{@page{margin:10mm}.p-item{break-inside:avoid}.p-label{break-inside:avoid}}</style></head><body>${inner}</body></html>`;
    download(doc, filename + '.html', 'text/html;charset=utf-8');
    toast('Datei gespeichert');
  };
}
$('#preview-close').onclick = () => { $('#preview').hidden = true; $('#print-area').innerHTML = ''; document.body.style.overflow = ''; };

function download(text, name, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------------------------------------------------------------- Daten */
async function renderDaten() {
  const photos = await idb.all('photos');
  let quota = '';
  if (navigator.storage && navigator.storage.estimate) {
    const e = await navigator.storage.estimate();
    quota = `${(e.usage / 1048576).toFixed(1)} MB belegt von rund ${(e.quota / 1048576 / 1024).toFixed(1)} GB`;
  }
  $('#datenui').innerHTML = `
    <p class="lede">Alles liegt lokal in diesem Browser. Kein Server, kein Konto. Sicherung deshalb regelmäßig exportieren.</p>
    <dl class="facts">
      ${fact('Geräte', S.items.length)}
      ${fact('Gruppen', S.groups.length)}
      ${fact('Historieneinträge', S.entries.length)}
      ${fact('Fotos', photos.length)}
      ${fact('Verleihvorgänge', S.loans.length)}
    </dl>
    ${quota ? `<p class="lede">${quota}</p>` : ''}
    <div class="btnrow">
      <button class="btn primary" id="d-backup">Sicherung mit Fotos</button>
      <button class="btn" id="d-backup-light">Sicherung ohne Fotos</button>
    </div>
    <div class="btnrow">
      <button class="btn" id="d-restore">Sicherung einlesen</button>
      <button class="btn danger" id="d-wipe">Alles löschen</button>
    </div>
    <div class="section-title">App auf dem Handy</div>
    <button class="btn small" id="d-install">Installation erklären</button>
    <p class="lede" style="margin-top:8px">Zum Startbildschirm hinzufügen: eigenes Icon, Vollbild ohne Browserleiste, offline nutzbar.</p>

    <div class="section-title">Beispieldaten</div>
    <button class="btn small" id="d-demo">Startgruppen anlegen</button>
    <p class="lede" style="margin-top:8px">Legt Kabel, Licht, Mikrofone, Backline, Cases und Zubehör an, falls noch keine Gruppen existieren.</p>`;

  $('#d-install').onclick = installHelp;
  $('#d-backup').onclick = () => backup(true);
  $('#d-backup-light').onclick = () => backup(false);
  $('#d-restore').onclick = () => $('#restore-input').click();
  $('#d-wipe').onclick = async () => {
    if (!confirm('Wirklich das komplette Inventar löschen?')) return;
    if (!confirm('Letzte Warnung: Alle Geräte, Fotos und Verleihvorgänge werden gelöscht.')) return;
    for (const s of STORES) await idb.clear(s);
    photoCache.clear(); await loadAll(); refreshAll(); toast('Alles gelöscht');
  };
  $('#d-demo').onclick = async () => {
    if (S.groups.length) return toast('Es gibt bereits Gruppen.');
    const seed = [['Kabel', 'KAB', '#f5c542'], ['Licht', 'LIC', '#e8a33d'], ['Mikrofone', 'MIC', '#7cb2d8'],
    ['Backline', 'BAK', '#63bf8d'], ['Cases', 'CAS', '#97a3ac'], ['Zubehör', 'ZUB', '#e5604a']];
    for (const [name, code, color] of seed) await idb.put('groups', { id: uid(), name, code, color, note: '' });
    await loadAll(); refreshAll(); toast('Gruppen angelegt');
  };
}
function installHelp() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const https = location.protocol === 'https:' || location.hostname === 'localhost';
  openSheet('Installation', `
    ${standalone ? '<div class="empty" style="text-align:left"><b>Läuft bereits als App</b>Du hast Roadcase vom Startbildschirm geöffnet.</div>' : ''}
    ${https ? '' : '<div class="notice"><b>Ohne HTTPS keine Installation</b>Diese Seite läuft gerade über ' + esc(location.protocol) + ' Erst über eine https-Adresse, etwa GitHub Pages, lässt sie sich installieren und die Kamera nutzen.</div>'}
    <div class="section-title">iPhone und iPad, Safari</div>
    <ol style="font-size:14px;padding-left:20px;margin:0">
      <li>Seite in <b>Safari</b> öffnen, nicht in Chrome.</li>
      <li>Unten auf das Teilen-Symbol tippen.</li>
      <li>„Zum Home-Bildschirm" wählen, dann „Hinzufügen".</li>
    </ol>
    <div class="section-title">Android, Chrome</div>
    <ol style="font-size:14px;padding-left:20px;margin:0">
      <li>Menü mit den drei Punkten öffnen.</li>
      <li>„App installieren" oder „Zum Startbildschirm zufügen" wählen.</li>
      <li>Bestätigen. Alternativ erscheint oben in der Leiste der Pfeil ↓.</li>
    </ol>
    <p class="lede" style="margin-top:16px">Die Daten hängen an der Adresse, unter der du die App öffnest. Bleib deshalb bei einer Adresse${ios ? ' und öffne sie auf dem iPhone immer über das Symbol auf dem Home-Bildschirm' : ''}, sonst startet die App mit leerem Inventar.</p>
    ${deferred ? '<div class="btnrow"><button class="btn primary wide" id="ih-now">Jetzt installieren</button></div>' : ''}`, '', () => { closeSheetAll(); });
  if ($('#ih-now')) $('#ih-now').onclick = async () => { deferred.prompt(); await deferred.userChoice; deferred = null; closeSheetAll(); };
}

async function backup(withPhotos) {
  const data = {
    app: 'roadcase', version: 1, exportedAt: new Date().toISOString(), withPhotos,
    groups: S.groups, items: S.items, entries: S.entries, loans: S.loans,
    photos: withPhotos ? await idb.all('photos') : []
  };
  download(JSON.stringify(data), `roadcase-sicherung-${todayISO()}${withPhotos ? '' : '-ohne-fotos'}.json`, 'application/json');
  toast('Sicherung gespeichert');
}
$('#restore-input').onchange = async ev => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.items || !data.groups) throw new Error('Format');
    if (!confirm('Sicherung einlesen? Vorhandene Einträge mit gleicher Kennung werden überschrieben.')) return;
    for (const g of data.groups) await idb.put('groups', g);
    for (const i of data.items) await idb.put('items', i);
    for (const e of data.entries || []) await idb.put('entries', e);
    for (const l of data.loans || []) await idb.put('loans', l);
    for (const p of data.photos || []) await idb.put('photos', p);
    photoCache.clear(); await loadAll(); refreshAll(); toast('Sicherung eingelesen');
  } catch (err) { console.error(err); toast('Datei konnte nicht gelesen werden.'); }
  ev.target.value = '';
};

/* ---------------------------------------------------------------- Router */
function show(view) {
  $$('.view').forEach(v => v.hidden = v.id !== 'view-' + view);
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === view));
  if (view === 'gruppen') renderGroups();
  if (view === 'verleih') renderLoans();
  if (view === 'export') renderExport();
  if (view === 'daten') renderDaten();
  window.scrollTo(0, 0);
}
function refreshAll() { renderStats(); renderGroupFilter(); renderItems(); renderGroups(); renderLoans(); }

$('#tabbar').onclick = e => { const b = e.target.closest('.tab'); if (b) show(b.dataset.view); };
$('#btn-scan').onclick = scanSheet;
window.addEventListener('hashchange', handleHash);
$('#btn-search-toggle').onclick = () => {
  const b = $('#searchbar'); b.hidden = !b.hidden;
  if (!b.hidden) $('#search').focus(); else { $('#search').value = ''; S.q = ''; renderItems(); }
};
$('#search').oninput = e => { S.q = e.target.value; renderItems(); };
$('#sort').onchange = e => { S.sort = e.target.value; renderItems(); };
$('#groupfilter').onclick = e => {
  const c = e.target.closest('.chip'); if (!c) return;
  S.filterGroup = c.dataset.g; renderGroupFilter(); renderItems();
};
$('#itemlist').onclick = e => { const b = e.target.closest('[data-item]'); if (b) itemDetail(b.dataset.item); };
$('#grouplist').onclick = e => { const b = e.target.closest('[data-group]'); if (b) groupForm(groupOf(b.dataset.group)); };
$('#loanlist').onclick = e => { const b = e.target.closest('[data-loan]'); if (b) loanDetail(b.dataset.loan); };
$('#btn-new-item').onclick = () => {
  if (!S.groups.length) { toast('Erst eine Produktgruppe anlegen.'); show('gruppen'); return groupForm(); }
  itemForm();
};
$('#btn-new-group').onclick = () => groupForm();
$('#btn-new-loan').onclick = () => {
  if (!S.items.filter(i => i.status === 'verfuegbar').length) return toast('Kein verfügbares Gerät.');
  loanForm();
};
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#preview').hidden) return $('#preview-close').click();
  if (!$('#sheet').hidden) closeSheet();
});

/* ---------------------------------------------------------------- PWA */
let deferred;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#btn-install').hidden = false; });
$('#btn-install').onclick = async () => {
  if (!deferred) return installHelp();
  deferred.prompt(); await deferred.userChoice; deferred = null; $('#btn-install').hidden = true;
};
if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone) $('#btn-install').hidden = false;
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));

/* ---------------------------------------------------------------- Start */
(async function init() {
  try {
    await openDB();
  } catch (e) {
    console.warn('IndexedDB nicht verfügbar, Ersatzspeicher aktiv', e);
    idb = idbMem;
    const b = document.createElement('div');
    b.className = 'notice';
    b.innerHTML = '<b>Testmodus</b> Dieser Browser blockiert den lokalen Speicher, z.\u00a0B. in einer Vorschau oder im privaten Fenster. Alles ist bedienbar, aber beim Neuladen sind die Daten weg. Auf der installierten Seite wird dauerhaft gespeichert.';
    document.querySelector('main').prepend(b);
  }
  await loadAll();
  refreshAll();
  show('inventar');
  handleHash();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
})();
