/* VP – Parc de projecteurs : liste, fiches, import / export, sélection pour la page Calcul.
   Les fiches sont enregistrées dans le navigateur (localStorage). Toute donnée peut être inconnue ; seules les
   données « nécessaires aux calculs » déclenchent une alerte et une proposition de valeur standard. */
(() => {
'use strict';
const KEY = 'vp.parc.v1', UIKEY = 'vp.parc.ui';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const empty = v => v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v));
const numTxt = v => empty(v) ? '' : String(v).replace('.', ',');
const parseNum = s => { s = String(s).trim().replace(',', '.').replace(/\s/g, ''); if (s === '') return null; const n = Number(s); return isFinite(n) ? n : null; };
const gcd = (a, b) => b ? gcd(b, a % b) : a;

/* ---------- Valeurs standard ---------- */
const RATIOS = [[16, 9], [16, 10], [4, 3], [5, 4], [17, 9]];
const aspectOf = r => {
  if (r.resW > 0 && r.resH > 0) {
    const a = r.resW / r.resH, m = RATIOS.find(([w, h]) => Math.abs(a / (w / h) - 1) < 0.02);
    if (m) return m;
    const g = gcd(r.resW, r.resH); return [r.resW / g, r.resH / g];
  }
  return [16, 9];
};
const RES_LABELS = { '800x600': 'SVGA', '1024x768': 'XGA', '1280x720': 'HD 720p', '1280x800': 'WXGA', '1366x768': 'WXGA', '1280x1024': 'SXGA', '1400x1050': 'SXGA+',
  '1600x1200': 'UXGA', '1920x1080': 'Full HD', '1920x1200': 'WUXGA', '3840x2160': '4K UHD', '4096x2160': '4K DCI' };
const resLabel = (w, h) => RES_LABELS[w + 'x' + h] || (w && h ? `${w}×${h}` : '');

/* ---------- Définition des champs (une seule source pour la fiche, l'import et les contrôles) ---------- */
const TECH = ['DLP', '3LCD', 'LCoS', 'D-ILA', 'SXRD', 'Laser', 'LED'];
const FIELDS = [
  { sec: 'Identité', k: 'name', label: 'Nom', type: 'text', wide: true },
  { sec: 'Identité', k: 'maker', label: 'Fabricant', type: 'text', list: 'maker' },
  { sec: 'Identité', k: 'model', label: 'Modèle', type: 'text' },
  { sec: 'Identité', k: 'family', label: 'Famille', type: 'text', list: 'family', hint: 'ex. Installation laser, Ultra courte focale, Événementiel' },
  { sec: 'Identité', k: 'owner', label: 'Propriétaire', type: 'text', list: 'owner' },
  { sec: 'Identité', k: 'tech', label: 'Technologie', type: 'text', list: 'tech' },
  { sec: 'Identité', k: 'serial', label: 'N° de série', type: 'text' },
  { sec: 'Image', k: 'resW', label: 'Résolution native · largeur', type: 'num', unit: 'px', ess: true, std: () => 1920 },
  { sec: 'Image', k: 'resH', label: 'Résolution native · hauteur', type: 'num', unit: 'px', ess: true, std: () => 1080 },
  { sec: 'Image', k: 'fw', label: 'Format d\'image · largeur', type: 'num', ess: true, hint: 'ex. 16 pour 16:9',
    std: r => r.fh > 0 ? Math.round(r.fh * (r.resW / r.resH) * 10) / 10 : aspectOf(r)[0] },
  { sec: 'Image', k: 'fh', label: 'Format d\'image · hauteur', type: 'num', ess: true, hint: 'ex. 9 pour 16:9',
    std: r => r.fw > 0 ? Math.round(r.fw * (r.resH / r.resW) * 10) / 10 : aspectOf(r)[1] },
  { sec: 'Image', k: 'lm', label: 'Luminosité', type: 'num', unit: 'lm', ess: true, std: () => 5000 },
  { sec: 'Image', k: 'contrast', label: 'Contraste', type: 'num', unit: ': 1' },
  { sec: 'Optique', k: 'rmin', label: 'Ratio de projection (mini)', type: 'num', unit: ': 1', ess: true, hint: 'distance / largeur d\'image', std: () => 1.5 },
  { sec: 'Optique', k: 'zoomable', label: 'Zoom optique', type: 'tri', ess: true, std: r => r.rmax > r.rmin },
  { sec: 'Optique', k: 'rmax', label: 'Ratio de projection (maxi)', type: 'num', unit: ': 1', ess: r => r.zoomable !== false, hint: 'identique au mini si le zoom est fixe',
    std: r => r.zoomable ? Math.round(r.rmin * 1.3 * 100) / 100 : r.rmin },
  { sec: 'Optique', k: 'lensVmin', label: 'Lens shift vertical · mini', type: 'num', unit: '%', hint: 'ex. −50 (en % de la hauteur d\'image)' },
  { sec: 'Optique', k: 'lensVmax', label: 'Lens shift vertical · maxi', type: 'num', unit: '%', hint: 'ex. 50' },
  { sec: 'Optique', k: 'lensHmin', label: 'Lens shift horizontal · mini', type: 'num', unit: '%', hint: 'ex. −20 (en % de la largeur d\'image)' },
  { sec: 'Optique', k: 'lensHmax', label: 'Lens shift horizontal · maxi', type: 'num', unit: '%', hint: 'ex. 20' },
  { sec: 'Optique', k: 'throwOffset', label: 'Décalage vertical de l\'image (throw offset)', type: 'num', unit: '%', wide: true, hint: 'centre de l\'image au-dessus de l\'axe de l\'objectif, en % de la hauteur d\'image' },
  { sec: 'Divers', k: 'weight', label: 'Poids', type: 'num', unit: 'kg' },
  { sec: 'Divers', k: 'power', label: 'Consommation', type: 'num', unit: 'W' },
  { sec: 'Divers', k: 'noise', label: 'Bruit', type: 'num', unit: 'dB' },
  { sec: 'Divers', k: 'lifeH', label: 'Durée de vie de la source', type: 'num', unit: 'h' },
  { sec: 'Divers', k: 'connect', label: 'Connectique', type: 'text', wide: true },
  { sec: 'Divers', k: 'notes', label: 'Notes', type: 'area', wide: true },
];
const FBY = Object.fromEntries(FIELDS.map(f => [f.k, f]));
const isEss = (f, r) => f.ess === true || (typeof f.ess === 'function' && f.ess(r));
const missing = r => FIELDS.filter(f => f.ess && isEss(f, r) && empty(r[f.k]));
/* remplit les données nécessaires manquantes (dans l'ordre des champs) ; renvoie les clés remplies */
function fillStd(r, only) {
  const done = [];
  for (const f of FIELDS) {
    if (!f.ess || !isEss(f, r) || !empty(r[f.k]) || (only && !only.includes(f.k))) continue;
    r[f.k] = f.std(r); done.push(f.k);
  }
  r.std = [...new Set([...(r.std || []), ...done])];
  return done;
}

/* ---------- Données ---------- */
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const blank = () => ({ id: uid(), name: '', selected: false, std: [] });
function clean(o) {                                   // fiche issue d'un import : types forcés, champs inconnus ignorés
  const r = blank(); r.name = String(o.name ?? '').trim();
  for (const f of FIELDS) {
    if (f.k === 'name') continue;
    const v = o[f.k];
    r[f.k] = f.type === 'num' ? (typeof v === 'string' ? parseNum(v) : (typeof v === 'number' && isFinite(v) ? v : null))
      : f.type === 'tri' ? (typeof v === 'boolean' ? v : null)
      : (empty(v) ? null : String(v));
  }
  r.selected = o.selected === true; r.std = Array.isArray(o.std) ? o.std.filter(k => FBY[k]) : [];
  return r;
}
function fromLegacy(name, v) {                       // format de data.js / vp_data.json
  const ls = v.lensShift || {}, pc = x => typeof x === 'number' ? Math.round(x * 1000) / 10 : null;
  return clean({ name, resW: v.resW, resH: v.resH, fw: v.fw, fh: v.fh, lm: v.lm, rmin: v.rmin, rmax: v.rmax, zoomable: v.zoomable,
    lensVmin: pc(ls.v?.[0]), lensVmax: pc(ls.v?.[1]), lensHmin: pc(ls.h?.[0]), lensHmax: pc(ls.h?.[1]), throwOffset: pc(v.throwOffset),
    maker: /^(JVC|BenQ|Epson)\b/.exec(name)?.[1] ?? null, selected: true });
}
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible : le parc reste en mémoire */ } };
const seed = () => Object.entries(window.VP_DATA || {}).map(([n, v]) => fromLegacy(n, v));
let recs = (load(KEY, null)?.records || []).map(o => Object.assign(clean(o), { id: o.id || uid() }));
if (!recs.length && !load(KEY, null)) { recs = seed(); }
const ui = Object.assign({ group: 'family', sort: 'name', q: '' }, load(UIKEY, {}));
const persist = () => store(KEY, { version: 1, records: recs });
persist();

/* ---------- Interface avec la page Calcul ---------- */
function toVP(r) {
  const c = { ...r, std: [...(r.std || [])] }, filled = fillStd(c);
  const pc = k => c[k] / 100, lens = ['lensVmin', 'lensVmax', 'lensHmin', 'lensHmax'].every(k => typeof c[k] === 'number');
  const v = { rmin: c.rmin, rmax: c.zoomable ? c.rmax : c.rmin, fw: c.fw, fh: c.fh, resW: c.resW, resH: c.resH, res: resLabel(c.resW, c.resH), lm: c.lm,
    zoomable: !!c.zoomable, stdFields: filled.map(k => FBY[k].label) };
  if (lens) v.lensShift = { v: [pc('lensVmin'), pc('lensVmax')], h: [pc('lensHmin'), pc('lensHmax')] };
  if (typeof c.throwOffset === 'number') v.throwOffset = pc('throwOffset');
  return v;
}
function usable() {
  let list = recs.filter(r => r.selected);
  if (!list.length) list = recs;
  const out = {};
  list.forEach(r => { out[r.name || 'Sans nom'] = toVP(r); });
  if (!Object.keys(out).length) out['Projecteur standard'] = toVP({ name: 'Projecteur standard' });
  return out;
}
window.Parc = { usable };

/* ---------- Fenêtre modale, message ---------- */
function modal(title, html, buttons) {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="mbox"><h3>${title}</h3><div class="mbody">${html}</div><div class="mbtn"></div></div>`;
    buttons.forEach(([label, val, cls]) => {
      const b = document.createElement('button'); b.className = 'hbtn ' + (cls || ''); b.textContent = label;
      b.onclick = () => { m.remove(); res(val); }; m.querySelector('.mbtn').append(b);
    });
    document.body.append(m);
  });
}
let toastT;
function toast(msg) {
  const t = $('ptoast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Squelette ---------- */
const page = $('p-vp');
page.className = 'page parc hidden';
page.innerHTML = `
  <div class="plist">
    <div class="ptool">
      <input id="pq" type="search" placeholder="Rechercher (nom, fabricant, famille, propriétaire…)" autocomplete="off">
      <label>Grouper par <select id="pgroup">
        <option value="">— aucun —</option><option value="family">Famille</option><option value="maker">Fabricant</option>
        <option value="owner">Propriétaire</option><option value="tech">Technologie</option><option value="res">Résolution</option></select></label>
      <label>Trier par <select id="psort"><option value="name">Nom</option><option value="maker">Fabricant</option>
        <option value="lm">Luminosité</option><option value="res">Résolution</option></select></label>
    </div>
    <div class="pacts">
      <button class="hbtn primary" id="padd">＋ Ajouter</button>
      <button class="hbtn" id="pimp">Importer</button>
      <button class="hbtn" id="pexp">Exporter</button>
      <input type="file" id="pfile" accept=".json,application/json" hidden>
    </div>
    <div class="pbar" id="pbar"></div>
    <div class="pmiss hidden" id="pmiss"></div>
    <div class="pitems scroll" id="pitems"></div>
  </div>
  <div class="psheet" id="psheet"></div>
  <div class="ptoast" id="ptoast"></div>`;
const sheetEl = $('psheet');
$('pgroup').value = ui.group; $('psort').value = ui.sort; $('pq').value = ui.q;

/* ---------- Liste ---------- */
const keyOf = (r, g) => g === 'res' ? resLabel(r.resW, r.resH) : r[g];
const sortVal = {
  name: r => (r.name || '').toLowerCase(), maker: r => (r.maker || '￿').toLowerCase(),
  lm: r => -(r.lm || 0), res: r => -((r.resW || 0) * (r.resH || 0)),
};
const matches = r => {
  const q = ui.q.trim().toLowerCase(); if (!q) return true;
  return ['name', 'maker', 'model', 'family', 'owner', 'tech', 'serial', 'notes'].some(k => (r[k] || '').toLowerCase().includes(q));
};
function subLine(r) {
  const p = [[r.maker, r.model].filter(Boolean).join(' '), r.resW && r.resH ? resLabel(r.resW, r.resH) + (RES_LABELS[r.resW + 'x' + r.resH] ? ` ${r.resW}×${r.resH}` : '') : '',
    r.lm ? `${r.lm.toLocaleString('fr-FR')} lm` : '', r.rmin ? `ratio ${numTxt(r.rmin)}${r.zoomable && r.rmax ? '–' + numTxt(r.rmax) : ''}` : ''];
  return p.filter(Boolean).map(esc).join(' · ') || 'Aucune information';
}
function itemHtml(r) {
  const m = missing(r).length, on = sheetEl.dataset.id === r.id;
  return `<div class="pitem ${on ? 'on' : ''}" data-id="${r.id}">
    <label class="pchk" title="Utilisable dans la page Calcul"><input type="checkbox" data-sel="${r.id}" ${r.selected ? 'checked' : ''}></label>
    <div class="pmain" data-open="${r.id}"><b>${esc(r.name || 'Sans nom')}</b><span>${subLine(r)}</span></div>
    ${m ? `<span class="pbadge" title="Données nécessaires aux calculs manquantes">⚠ ${m}</span>` : ''}
    ${(r.std || []).length ? '<span class="pbadge std" title="Contient des valeurs standard">std</span>' : ''}</div>`;
}
function renderList() {
  const list = recs.filter(matches).sort((a, b) => { const x = sortVal[ui.sort](a), y = sortVal[ui.sort](b); return x < y ? -1 : x > y ? 1 : 0; });
  const groups = new Map();
  list.forEach(r => { const g = ui.group ? (keyOf(r, ui.group) || '') : ''; (groups.get(g) || groups.set(g, []).get(g)).push(r); });
  const names = [...groups.keys()].sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'fr'));
  $('pitems').innerHTML = !recs.length ? '<p class="pnone">Le parc est vide. Ajoute un projecteur ou importe un fichier.</p>'
    : !list.length ? '<p class="pnone">Aucun projecteur ne correspond à la recherche.</p>'
    : names.map(n => (ui.group ? `<h4>${n ? esc(n) : '— non renseigné —'} <i>${groups.get(n).length}</i></h4>` : '') + groups.get(n).map(itemHtml).join('')).join('');
  const sel = recs.filter(r => r.selected).length;
  $('pbar').innerHTML = `<span><b>${sel}</b> sur ${recs.length} utilisable${sel > 1 ? 's' : ''} dans Calcul${sel ? '' : ' <em>(aucune case cochée : tout le parc est proposé)</em>'}</span>
    <button class="lnk" data-all="1">Tout cocher</button><button class="lnk" data-all="0">Aucun</button>`;
  const inc = recs.filter(r => missing(r).length), box = $('pmiss');
  box.classList.toggle('hidden', !inc.length);
  box.innerHTML = inc.length ? `<div>⚠ ${inc.length} projecteur${inc.length > 1 ? 's ont' : ' a'} des données nécessaires aux calculs manquantes.</div>
    <button class="hbtn" data-fillall="1">Appliquer des valeurs standard pour les données manquantes</button>` : '';
}

/* ---------- Sélection pour Calcul ---------- */
async function setSelected(list, on) {
  if (on) {
    const inc = list.filter(r => missing(r).length);
    if (inc.length) {
      const detail = inc.map(r => `<li><b>${esc(r.name || 'Sans nom')}</b> : ${missing(r).map(f => f.label.toLowerCase()).join(', ')}</li>`).join('');
      const a = await modal('Données nécessaires manquantes',
        `<p>Ces données sont indispensables aux calculs de projection :</p><ul>${detail}</ul><p>Tu peux appliquer des valeurs standard (modifiables ensuite dans la fiche).</p>`,
        [['Annuler', 'no'], ['Utiliser sans enregistrer', 'use'], ['Appliquer les valeurs standard', 'fill', 'primary']]);
      if (a === 'no') { renderList(); return; }
      if (a === 'fill') inc.forEach(r => { fillStd(r); if (draft && draft.id === r.id) Object.assign(draft, { ...r }); });
    }
  }
  list.forEach(r => { r.selected = on; if (draft && draft.id === r.id) draft.selected = on; });
  persist(); renderList(); if (draft) { fill(); }
}
async function fillAll() {
  const inc = recs.filter(r => missing(r).length), n = inc.reduce((s, r) => s + missing(r).length, 0);
  const ok = await modal('Valeurs standard', `<p>${n} valeur${n > 1 ? 's' : ''} manquante${n > 1 ? 's' : ''} sur ${inc.length} projecteur${inc.length > 1 ? 's' : ''} seront remplies avec des valeurs standard
    (1920×1080, 16:9, 5000 lm, ratio 1,5 fixe…). Elles restent repérées « std » et modifiables dans chaque fiche.</p>`, [['Annuler', false], ['Appliquer', true, 'primary']]);
  if (!ok) return;
  inc.forEach(r => { fillStd(r); if (draft && draft.id === r.id) Object.assign(draft, { ...r }); });
  persist(); renderList(); if (draft) openSheet(draft.id, true);
  toast(`${n} valeur${n > 1 ? 's' : ''} standard appliquée${n > 1 ? 's' : ''}`);
}

/* ---------- Fiche ---------- */
let draft = null, isNew = false, dirty = false;
const distinct = k => [...new Set(recs.map(r => r[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
function inputHtml(f, d) {
  const v = d[f.k], a = `data-k="${f.k}" id="f_${f.k}"`;
  if (f.type === 'tri') return `<select ${a}><option value="">Inconnu</option><option value="1" ${v === true ? 'selected' : ''}>Oui</option><option value="0" ${v === false ? 'selected' : ''}>Non (fixe)</option></select>`;
  if (f.type === 'area') return `<textarea ${a} rows="3">${esc(v)}</textarea>`;
  const inp = `<input ${a} type="text" ${f.type === 'num' ? 'inputmode="decimal"' : ''} ${f.list ? `list="dl_${f.list}"` : ''} value="${esc(f.type === 'num' ? numTxt(v) : v)}" autocomplete="off">`;
  return f.unit ? `<span class="iw">${inp}<em>${f.unit}</em></span>` : inp;
}
function sheetHtml() {
  const secs = [...new Set(FIELDS.map(f => f.sec))];
  return `<div class="shead"><button class="hbtn" id="sback">‹ Liste</button><h3 id="stitle"></h3></div>
    <div class="smiss hidden" id="smiss"></div><div class="serr hidden" id="serr"></div>
    <label class="schk"><input type="checkbox" id="f_selected" ${draft.selected ? 'checked' : ''}> Utilisable dans la page Calcul</label>
    ${secs.map(s => `<section class="fsec"><h4>${s}</h4><div class="fgrid">${FIELDS.filter(f => f.sec === s).map(f =>
      `<div class="f ${f.wide ? 'wide' : ''}" data-f="${f.k}"><label for="f_${f.k}">${f.label}</label>${inputHtml(f, draft)}${f.hint ? `<small>${f.hint}</small>` : ''}<div class="fmiss"></div></div>`).join('')}</div></section>`).join('')}
    ${['maker', 'family', 'owner'].map(k => `<datalist id="dl_${k}">${distinct(k).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`).join('')}
    <datalist id="dl_tech">${TECH.map(x => `<option value="${x}">`).join('')}</datalist>
    <div class="sbar"><button class="hbtn primary" id="ssave">Enregistrer</button><button class="hbtn" id="srevert">Annuler les modifications</button>
      <span class="hsp"></span><button class="hbtn" id="sdup">Dupliquer</button><button class="hbtn danger" id="sdel">Supprimer</button></div>`;
}
/* alertes « donnée nécessaire » et repères « valeur standard » : mis à jour pendant la saisie, sans reconstruire la fiche */
function refreshMiss() {
  const miss = missing(draft);
  $('stitle').textContent = draft.name || (isNew ? 'Nouveau projecteur' : 'Sans nom');
  const box = $('smiss'); box.classList.toggle('hidden', !miss.length);
  box.innerHTML = miss.length ? `<div>⚠ ${miss.length} donnée${miss.length > 1 ? 's' : ''} nécessaire${miss.length > 1 ? 's' : ''} aux calculs ${miss.length > 1 ? 'sont' : 'est'} inconnue${miss.length > 1 ? 's' : ''} :
    ${miss.map(f => f.label.toLowerCase()).join(', ')}.</div><button class="hbtn" data-stdall="1">Appliquer des valeurs standard pour les données manquantes</button>` : '';
  FIELDS.forEach(f => {
    const el = sheetEl.querySelector(`.f[data-f="${f.k}"]`), m = el.querySelector('.fmiss'), bad = miss.includes(f);
    el.classList.toggle('miss', bad);
    if (bad) m.innerHTML = `⚠ Donnée nécessaire aux calculs. <button class="lnk" data-std="${f.k}">Utiliser la valeur standard : ${numTxt(f.type === 'tri' ? (f.std(draft) ? 'oui' : 'non') : f.std(draft))}</button>`;
    else m.innerHTML = (draft.std || []).includes(f.k) ? '<span class="stdchip">valeur standard — modifiable</span>' : '';
  });
}
function fill() {                                    // (re)construit la fiche à partir du brouillon
  sheetEl.innerHTML = sheetHtml(); refreshMiss();
}
function openSheet(id, keepDirty) {
  const r = id ? recs.find(x => x.id === id) : null;
  if (!keepDirty) { draft = r ? { ...r, std: [...(r.std || [])] } : blank(); isNew = !r; dirty = false; }
  sheetEl.dataset.id = draft.id; page.classList.add('sheet'); fill(); renderList();
}
function closeSheet() { draft = null; sheetEl.dataset.id = ''; sheetEl.innerHTML = '<p class="pnone">Choisis un projecteur dans la liste, ou ajoute-en un.</p>'; page.classList.remove('sheet'); renderList(); }
async function guard() {                              // modifications non enregistrées
  if (!draft || !dirty) return true;
  return (await modal('Modifications non enregistrées', '<p>La fiche en cours a été modifiée.</p>', [['Rester', false], ['Abandonner les modifications', true, 'danger']]));
}
function validate() {
  const d = draft, e = [];
  if (!d.name || !d.name.trim()) e.push('Le nom est obligatoire.');
  else if (recs.some(r => r.id !== d.id && r.name.trim().toLowerCase() === d.name.trim().toLowerCase())) e.push('Un projecteur porte déjà ce nom.');
  ['resW', 'resH', 'fw', 'fh', 'lm', 'rmin', 'rmax'].forEach(k => { if (!empty(d[k]) && !(d[k] > 0)) e.push(`${FBY[k].label} : valeur positive attendue.`); });
  if (!empty(d.rmin) && !empty(d.rmax) && d.rmax < d.rmin) e.push('Le ratio maxi doit être supérieur ou égal au ratio mini.');
  [['lensVmin', 'lensVmax'], ['lensHmin', 'lensHmax']].forEach(([a, b]) => { if (!empty(d[a]) && !empty(d[b]) && d[b] < d[a]) e.push(`${FBY[a].label} : le mini dépasse le maxi.`); });
  const lens = ['lensVmin', 'lensVmax', 'lensHmin', 'lensHmax'].filter(k => !empty(d[k])).length;
  if (lens && lens < 4) e.push('Lens shift : renseigne les 4 valeurs (ou aucune) pour qu\'il soit utilisé.');
  return e;
}
function save() {
  const e = validate(), box = $('serr');
  box.classList.toggle('hidden', !e.length); box.innerHTML = e.map(x => `<div>${esc(x)}</div>`).join('');
  if (e.length) { sheetEl.scrollTop = 0; return; }
  draft.name = draft.name.trim();
  const i = recs.findIndex(r => r.id === draft.id), rec = { ...draft, std: [...draft.std] };
  if (i < 0) recs.push(rec); else recs[i] = rec;
  isNew = false; dirty = false; persist(); renderList(); refreshMiss(); toast('Fiche enregistrée');
}

/* ---------- Import / export ---------- */
function exportParc() {
  const data = { app: 'VP', type: 'parc', version: 1, exportedAt: new Date().toISOString(), projecteurs: recs.map(({ id, ...r }) => r) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `parc-vp-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(`${recs.length} projecteur${recs.length > 1 ? 's' : ''} exporté${recs.length > 1 ? 's' : ''}`);
}
async function importFile(file) {
  let list;
  try {
    const j = JSON.parse(await file.text());
    if (Array.isArray(j.projecteurs)) list = j.projecteurs.map(clean);
    else if (j && typeof j === 'object' && Object.values(j).every(v => v && typeof v === 'object' && 'rmin' in v)) list = Object.entries(j).map(([n, v]) => fromLegacy(n, v));
    else throw new Error('format');
    list = list.filter(r => r.name);
    if (!list.length) throw new Error('vide');
  } catch (e) { await modal('Import impossible', '<p>Ce fichier n\'est pas un parc de projecteurs valide (JSON exporté par cette application, ou ancien format vp_data.json).</p>', [['Fermer', 0]]); return; }
  const a = await modal('Importer le parc', `<p><b>${list.length}</b> projecteur${list.length > 1 ? 's' : ''} dans « ${esc(file.name)} ».</p>
    <p><b>Fusionner</b> : ajoute les nouveaux et met à jour ceux qui portent le même nom.<br><b>Remplacer</b> : efface le parc actuel.</p>`,
    [['Annuler', 'no'], ['Remplacer le parc', 'replace', 'danger'], ['Fusionner', 'merge', 'primary']]);
  if (a === 'no') return;
  if (a === 'replace') recs = list;
  else list.forEach(n => { const o = recs.find(r => r.name.toLowerCase() === n.name.toLowerCase()); if (o) { n.id = o.id; recs[recs.indexOf(o)] = n; } else recs.push(n); });
  draft = null; persist(); closeSheet(); toast(`${list.length} projecteur${list.length > 1 ? 's' : ''} importé${list.length > 1 ? 's' : ''}`);
}

/* ---------- Événements ---------- */
$('pq').oninput = e => { ui.q = e.target.value; store(UIKEY, ui); renderList(); };
$('pgroup').onchange = e => { ui.group = e.target.value; store(UIKEY, ui); renderList(); };
$('psort').onchange = e => { ui.sort = e.target.value; store(UIKEY, ui); renderList(); };
$('padd').onclick = async () => { if (await guard()) { draft = null; openSheet(null); $('f_name').focus(); } };
$('pexp').onclick = exportParc;
$('pimp').onclick = () => $('pfile').click();
$('pfile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
$('pmiss').onclick = e => { if (e.target.closest('[data-fillall]')) fillAll(); };
$('pbar').onclick = e => { const b = e.target.closest('[data-all]'); if (b) setSelected(recs.filter(r => r.selected !== (b.dataset.all === '1')), b.dataset.all === '1'); };
$('pitems').onclick = async e => {
  const cb = e.target.closest('[data-sel]');
  if (cb) { e.stopPropagation(); setSelected([recs.find(r => r.id === cb.dataset.sel)], cb.checked); return; }
  const o = e.target.closest('[data-open]');
  if (o && o.dataset.open !== sheetEl.dataset.id && await guard()) { draft = null; openSheet(o.dataset.open); }
  else if (o && !draft) openSheet(o.dataset.open);
};
sheetEl.addEventListener('input', e => {
  const t = e.target; if (!draft) return;
  if (t.id === 'f_selected') return;
  const f = FBY[t.dataset.k]; if (!f) return;
  draft[f.k] = f.type === 'num' ? parseNum(t.value) : f.type === 'tri' ? (t.value === '' ? null : t.value === '1') : (t.value.trim() === '' && f.k !== 'name' ? null : t.value);
  draft.std = draft.std.filter(k => k !== f.k); dirty = true; refreshMiss();
});
sheetEl.addEventListener('change', e => {
  if (e.target.id === 'f_selected') {
    const rec = recs.find(r => r.id === draft.id);
    if (rec) { setSelected([rec], e.target.checked).then(() => { if (draft) $('f_selected').checked = draft.selected; }); }
    else draft.selected = e.target.checked;
  } else if (e.target.tagName === 'SELECT') refreshMiss();
});
sheetEl.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t || !draft) return;
  if (t.dataset.std) {
    fillStd(draft, [t.dataset.std]); dirty = true; fill();
  } else if (t.dataset.stdall) { fillStd(draft); dirty = true; fill(); toast('Valeurs standard appliquées (non enregistrées)'); }
  else if (t.id === 'ssave') save();
  else if (t.id === 'sback') { if (await guard()) closeSheet(); }
  else if (t.id === 'srevert') { if (!dirty || await guard()) { const id = isNew ? null : draft.id; draft = null; id ? openSheet(id) : closeSheet(); } }
  else if (t.id === 'sdup') {
    if (isNew || !(await guard())) return;
    const c = { ...recs.find(r => r.id === draft.id), id: uid(), selected: false }; c.std = [...(c.std || [])];
    let n = c.name + ' (copie)'; while (recs.some(r => r.name === n)) n += ' +';
    c.name = n; recs.push(c); persist(); draft = null; openSheet(c.id); toast('Fiche dupliquée');
  } else if (t.id === 'sdel') {
    if (isNew) { draft = null; closeSheet(); return; }
    if (await modal('Supprimer ce projecteur ?', `<p><b>${esc(draft.name)}</b> sera retiré du parc.</p>`, [['Annuler', false], ['Supprimer', true, 'danger']])) {
      recs = recs.filter(r => r.id !== draft.id); persist(); draft = null; closeSheet(); toast('Projecteur supprimé');
    }
  }
});
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

closeSheet();
})();
