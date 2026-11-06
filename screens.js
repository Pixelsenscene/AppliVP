/* VP – Bibliothèque d'écrans : liste, fiches, import / export, sélection pour la page Calcul. Même principe que parc.js (projecteurs).
   Les fiches sont enregistrées dans le navigateur (localStorage). Données nécessaires aux calculs : largeur et hauteur de l'image visible (en mètres).
   Base volontairement simple : l'inclinaison de l'écran, les formes spéciales, etc. viendront plus tard. */
(() => {
'use strict';
const KEY = 'vp.screens.v1', UIKEY = 'vp.screens.ui';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const empty = v => v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v));
const numTxt = v => empty(v) ? '' : String(v).replace('.', ',');
const m2 = v => (Math.round(v * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseNum = s => { s = String(s).trim().replace(',', '.').replace(/\s/g, ''); if (s === '') return null; const n = Number(s); return isFinite(n) ? n : null; };
const gcd = (a, b) => b ? gcd(b, a % b) : a;

/* format d'image : 16:9, 16:10, 4:3, 21:9… sinon le rapport décimal */
const FORMATS = [[16, 9], [16, 10], [4, 3], [5, 4], [21, 9], [1, 1], [2, 1], [17, 9]];
const formatOf = r => {
  if (!(r.sw > 0 && r.sh > 0)) return '';
  const a = r.sw / r.sh, f = FORMATS.find(([w, h]) => Math.abs(a / (w / h) - 1) < 0.02);
  return f ? `${f[0]}:${f[1]}` : `${numTxt(Math.round(a * 100) / 100)}:1`;
};

const FIELDS = [
  { sec: 'Identité', k: 'name', label: 'Nom', type: 'text', wide: true },
  { sec: 'Identité', k: 'maker', label: 'Fabricant', type: 'text', list: 'maker' },
  { sec: 'Identité', k: 'model', label: 'Modèle', type: 'text' },
  { sec: 'Identité', k: 'family', label: 'Type', type: 'text', list: 'family', hint: 'ex. Cadre fixe, Enrouleur, Écran LED, Rétroprojection' },
  { sec: 'Identité', k: 'owner', label: 'Propriétaire', type: 'text', list: 'owner' },
  { sec: 'Identité', k: 'serial', label: 'N° de série', type: 'text' },
  { sec: 'Image visible', k: 'sw', label: 'Largeur', type: 'num', unit: 'm', ess: true },
  { sec: 'Image visible', k: 'sh', label: 'Hauteur', type: 'num', unit: 'm', ess: true },
  { sec: 'Surface', k: 'surface', label: 'Type de surface', type: 'text', list: 'surface' },
  { sec: 'Surface', k: 'gain', label: 'Gain', type: 'num', hint: '1 = blanc de référence' },
  { sec: 'Divers', k: 'weight', label: 'Poids', type: 'num', unit: 'kg' },
  { sec: 'Divers', k: 'notes', label: 'Notes', type: 'area', wide: true },
];
const FBY = Object.fromEntries(FIELDS.map(f => [f.k, f]));
const SURFACES = ['Toile mate', 'Toile grise', 'Toile perlée', 'Rétroprojection', 'Écran LED'];

/* ---------- Données ---------- */
const uid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const blank = () => ({ id: uid(), name: '', selected: false });
function clean(o) {                                    // fiche issue d'un import : types forcés, champs inconnus ignorés
  const r = blank(); r.name = String(o.name ?? '').trim();
  for (const f of FIELDS) {
    if (f.k === 'name') continue;
    const v = o[f.k];
    r[f.k] = f.type === 'num' ? (typeof v === 'string' ? parseNum(v) : (typeof v === 'number' && isFinite(v) ? v : null)) : (empty(v) ? null : String(v));
  }
  r.selected = o.selected === true;
  return r;
}
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible : la bibliothèque reste en mémoire */ } };
const seed = () => (window.SCREEN_DATA || []).map(p => clean({ name: p.name, sw: p.sw, sh: p.sh, family: 'Cadre fixe', selected: true }));      // liste de départ de la page Calcul
let recs = (load(KEY, null)?.records || []).map(o => Object.assign(clean(o), { id: o.id || uid() }));
if (!recs.length && !load(KEY, null)) recs = seed();
const ui = Object.assign({ group: 'family', sort: 'name', q: '' }, load(UIKEY, {}));
const persist = () => store(KEY, { version: 1, records: recs });
persist();
const valid = r => r.sw > 0 && r.sh > 0;
const missing = r => FIELDS.filter(f => f.ess && empty(r[f.k]));

/* ---------- Interface avec la page Calcul ---------- */
function usable() {
  let list = recs.filter(r => r.selected && valid(r));
  if (!list.length) list = recs.filter(valid);
  const out = list.map(r => ({ id: r.id, name: r.name || 'Sans nom', sw: r.sw, sh: r.sh }));
  return out.length ? out : [{ id: 'std', name: '16:9', sw: 4, sh: 2.25 }];
}

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
function toast(msg) { const t = $('etoast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- Squelette ---------- */
const page = $('p-ecran');
page.className = 'page parc hidden';
page.innerHTML = `
  <div class="plist">
    <div class="ptool">
      <input id="eq" type="search" placeholder="Rechercher (nom, fabricant, type, propriétaire…)" autocomplete="off">
      <label>Grouper par <select id="egroup"><option value="">— aucun —</option><option value="family">Type</option><option value="maker">Fabricant</option>
        <option value="owner">Propriétaire</option><option value="format">Format</option></select></label>
      <label>Trier par <select id="esort"><option value="name">Nom</option><option value="maker">Fabricant</option><option value="sw">Largeur</option></select></label>
    </div>
    <div class="pacts"><button class="hbtn primary" id="eadd">＋ Ajouter</button><button class="hbtn" id="eimp">Importer</button><button class="hbtn" id="eexp">Exporter</button></div>
    <div class="pbar" id="ebar"></div>
    <div class="pitems scroll" id="eitems"></div>
  </div>
  <div class="psheet" id="esheet"></div>
  <div class="ptoast" id="etoast"></div>`;
const sheetEl = $('esheet');
$('egroup').value = ui.group; $('esort').value = ui.sort; $('eq').value = ui.q;

/* ---------- Liste ---------- */
const keyOf = (r, g) => g === 'format' ? formatOf(r) : r[g];
const sortVal = { name: r => (r.name || '').toLowerCase(), maker: r => (r.maker || '￿').toLowerCase(), sw: r => r.sw || 0 };
const matches = r => { const q = ui.q.trim().toLowerCase(); return !q || ['name', 'maker', 'model', 'family', 'owner', 'serial', 'notes'].some(k => (r[k] || '').toLowerCase().includes(q)); };
const dims = r => valid(r) ? `${m2(r.sw)} × ${m2(r.sh)} m` : '';
const subLine = r => [dims(r), r.name === formatOf(r) ? '' : formatOf(r), [r.maker, r.model].filter(Boolean).join(' '), r.surface].filter(Boolean).map(esc).join(' · ') || 'Aucune information';
function itemHtml(r) {
  const m = missing(r).length, on = sheetEl.dataset.id === r.id;
  return `<div class="pitem ${on ? 'on' : ''}" data-id="${r.id}">
    <label class="pchk" title="Utilisable dans la page Calcul"><input type="checkbox" data-sel="${r.id}" ${r.selected ? 'checked' : ''}></label>
    <div class="pmain" data-open="${r.id}"><b>${esc(r.name || 'Sans nom')}</b><span>${subLine(r)}</span></div>
    ${m ? `<span class="pbadge" title="Dimensions manquantes : cet écran ne peut pas être utilisé dans Calcul">⚠ ${m}</span>` : ''}</div>`;
}
function renderList() {
  const list = recs.filter(matches).sort((a, b) => { const x = sortVal[ui.sort](a), y = sortVal[ui.sort](b); return x < y ? -1 : x > y ? 1 : 0; });
  const groups = new Map();
  list.forEach(r => { const g = ui.group ? (keyOf(r, ui.group) || '') : ''; (groups.get(g) || groups.set(g, []).get(g)).push(r); });
  const names = [...groups.keys()].sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'fr'));
  $('eitems').innerHTML = !recs.length ? '<p class="pnone">La bibliothèque est vide. Ajoute un écran ou importe un fichier.</p>'
    : !list.length ? '<p class="pnone">Aucun écran ne correspond à la recherche.</p>'
    : names.map(n => (ui.group ? `<h4>${n ? esc(n) : '— non renseigné —'} <i>${groups.get(n).length}</i></h4>` : '') + groups.get(n).map(itemHtml).join('')).join('');
  const sel = recs.filter(r => r.selected).length;
  $('ebar').innerHTML = `<span><b>${sel}</b> sur ${recs.length} utilisable${sel > 1 ? 's' : ''} dans Calcul${sel ? '' : ' <em>(aucune case cochée : toute la bibliothèque est proposée)</em>'}</span>
    <button class="lnk" data-all="1">Tout cocher</button><button class="lnk" data-all="0">Aucun</button>`;
}
function setSelected(list, on) { list.forEach(r => { r.selected = on; if (draft && draft.id === r.id) draft.selected = on; }); persist(); renderList(); if (draft) fill(); }

/* ---------- Fiche ---------- */
let draft = null, isNew = false, dirty = false;
const distinct = k => [...new Set(recs.map(r => r[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
function inputHtml(f, d) {
  const v = d[f.k], a = `data-k="${f.k}" id="e_${f.k}"`;
  if (f.type === 'area') return `<textarea ${a} rows="3">${esc(v)}</textarea>`;
  const inp = `<input ${a} type="text" ${f.type === 'num' ? 'inputmode="decimal"' : ''} ${f.list ? `list="edl_${f.list}"` : ''} value="${esc(f.type === 'num' ? numTxt(v) : v)}" autocomplete="off">`;
  return f.unit ? `<span class="iw">${inp}<em>${f.unit}</em></span>` : inp;
}
function sheetHtml() {
  const secs = [...new Set(FIELDS.map(f => f.sec))];
  return `<div class="shead"><button class="hbtn" id="eback">‹ Liste</button><h3 id="etitle"></h3></div>
    <div class="smiss hidden" id="emiss"></div><div class="serr hidden" id="eerr"></div>
    <label class="schk"><input type="checkbox" id="e_selected" ${draft.selected ? 'checked' : ''}> Utilisable dans la page Calcul</label>
    ${secs.map(s => `<section class="fsec"><h4>${s}</h4><div class="fgrid">${FIELDS.filter(f => f.sec === s).map(f =>
      `<div class="f ${f.wide ? 'wide' : ''}" data-f="${f.k}"><label for="e_${f.k}">${f.label}</label>${inputHtml(f, draft)}${f.hint ? `<small>${f.hint}</small>` : ''}</div>`).join('')}${s === 'Image visible' ? '<div class="f wide"><small id="efmt"></small></div>' : ''}</div></section>`).join('')}
    ${['maker', 'family', 'owner'].map(k => `<datalist id="edl_${k}">${distinct(k).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`).join('')}
    <datalist id="edl_surface">${SURFACES.map(x => `<option value="${x}">`).join('')}</datalist>
    <div class="sbar"><button class="hbtn primary" id="esave">Enregistrer</button><button class="hbtn" id="erevert">Annuler les modifications</button>
      <span class="hsp"></span><button class="hbtn" id="edup">Dupliquer</button><button class="hbtn danger" id="edel">Supprimer</button></div>`;
}
function refreshMiss() {
  $('etitle').textContent = draft.name || (isNew ? 'Nouvel écran' : 'Sans nom');
  const miss = missing(draft), box = $('emiss'); box.classList.toggle('hidden', !miss.length);
  box.innerHTML = miss.length ? `<div>⚠ Dimensions nécessaires aux calculs manquantes : ${miss.map(f => f.label.toLowerCase()).join(', ')}.</div>` : '';
  const fm = $('efmt'); if (fm) fm.textContent = valid(draft) ? `Format : ${formatOf(draft)} · surface ${m2(draft.sw * draft.sh)} m²` : '';
}
const fill = () => { sheetEl.innerHTML = sheetHtml(); refreshMiss(); };
function openSheet(id, keepDirty) {
  const r = id ? recs.find(x => x.id === id) : null;
  if (!keepDirty) { draft = r ? { ...r } : blank(); isNew = !r; dirty = false; }
  sheetEl.dataset.id = draft.id; page.classList.add('sheet'); fill(); renderList();
}
function closeSheet() { draft = null; sheetEl.dataset.id = ''; sheetEl.innerHTML = '<p class="pnone">Choisis un écran dans la liste, ou ajoute-en un.</p>'; page.classList.remove('sheet'); renderList(); }
async function guard() {
  if (!draft || !dirty) return true;
  return (await modal('Modifications non enregistrées', '<p>La fiche en cours a été modifiée.</p>', [['Rester', false], ['Abandonner les modifications', true, 'danger']]));
}
function validate() {
  const d = draft, e = [];
  if (!d.name || !d.name.trim()) e.push('Le nom est obligatoire.');
  ['sw', 'sh'].forEach(k => { if (empty(d[k])) e.push(`${FBY[k].label} : obligatoire (en mètres).`); else if (!(d[k] > 0)) e.push(`${FBY[k].label} : valeur positive attendue.`); });
  if (!empty(d.gain) && !(d.gain > 0)) e.push('Gain : valeur positive attendue.');
  return e;
}
function save() {
  const e = validate(), box = $('eerr');
  box.classList.toggle('hidden', !e.length); box.innerHTML = e.map(x => `<div>${esc(x)}</div>`).join('');
  if (e.length) { sheetEl.scrollTop = 0; return; }
  draft.name = draft.name.trim();
  const i = recs.findIndex(r => r.id === draft.id), rec = { ...draft };
  if (i < 0) recs.push(rec); else recs[i] = rec;
  isNew = false; dirty = false; persist(); renderList(); refreshMiss(); toast('Fiche enregistrée');
}

/* ---------- Import / export (fenêtre commune io.js) ---------- */
const sameScreen = (a, b) => a.name.toLowerCase() === b.name.toLowerCase() && a.sw === b.sw && a.sh === b.sh;
function ioSpec() {
  return {
    title: 'Parc écrans : importer / exporter', noun: ['écran', 'écrans'], file: 'ecrans-vp',
    list: () => recs.map(r => ({ id: r.id, label: r.name || 'Sans nom', sub: dims(r) })),
    presets: [{ id: 'all', label: 'Tous les écrans', ids: () => recs.map(r => r.id) }],
    build: ids => ({ app: 'VP', type: 'ecrans', version: 1, exportedAt: new Date().toISOString(), ecrans: recs.filter(r => ids.includes(r.id)).map(({ id, ...r }) => r) }),
    parse(text) {
      let j; try { j = JSON.parse(text); } catch (e) { throw new Error('Ce fichier n\'est pas un fichier JSON lisible.'); }
      if (!j || !Array.isArray(j.ecrans)) throw new Error('Ce fichier ne contient pas d\'écrans (fichier « écrans » exporté par VP attendu).');
      const list = j.ecrans.map(clean).filter(r => r.name && valid(r));
      if (!list.length) throw new Error('Aucun écran valide dans ce fichier (nom, largeur et hauteur requis).');
      return {
        entries: list.map((r, i) => ({ key: String(i), label: r.name, sub: dims(r) + (recs.some(o => sameScreen(o, r)) ? ' · remplace l\'écran identique' : ' · nouveau') })),
        async apply(keys) {
          if (!(await guard())) return 0;
          keys.forEach(k => { const n = list[+k], o = recs.find(x => sameScreen(x, n)); if (o) { n.id = o.id; recs[recs.indexOf(o)] = n; } else recs.push(n); });
          draft = null; persist(); closeSheet(); toast(`${keys.length} écran${keys.length > 1 ? 's' : ''} importé${keys.length > 1 ? 's' : ''}`); return keys.length;
        },
      };
    },
  };
}

/* ---------- Événements ---------- */
$('eq').oninput = e => { ui.q = e.target.value; store(UIKEY, ui); renderList(); };
$('egroup').onchange = e => { ui.group = e.target.value; store(UIKEY, ui); renderList(); };
$('esort').onchange = e => { ui.sort = e.target.value; store(UIKEY, ui); renderList(); };
$('eadd').onclick = async () => { if (await guard()) { draft = null; openSheet(null); $('e_name').focus(); } };
$('eexp').onclick = () => window.VPIO.open(ioSpec(), 'export');
$('eimp').onclick = () => window.VPIO.open(ioSpec(), 'import');
$('ebar').onclick = e => { const b = e.target.closest('[data-all]'); if (b) setSelected(recs.filter(r => r.selected !== (b.dataset.all === '1')), b.dataset.all === '1'); };
$('eitems').onclick = async e => {
  const cb = e.target.closest('[data-sel]');
  if (cb) { e.stopPropagation(); setSelected([recs.find(r => r.id === cb.dataset.sel)], cb.checked); return; }
  const o = e.target.closest('[data-open]');
  if (o && o.dataset.open !== sheetEl.dataset.id && await guard()) { draft = null; openSheet(o.dataset.open); }
  else if (o && !draft) openSheet(o.dataset.open);
};
sheetEl.addEventListener('input', e => {
  const t = e.target; if (!draft || t.id === 'e_selected') return;
  const f = FBY[t.dataset.k]; if (!f) return;
  draft[f.k] = f.type === 'num' ? parseNum(t.value) : (t.value.trim() === '' && f.k !== 'name' ? null : t.value);
  dirty = true; refreshMiss();
});
sheetEl.addEventListener('change', e => {
  if (e.target.id !== 'e_selected') return;
  const rec = recs.find(r => r.id === draft.id);
  if (rec) setSelected([rec], e.target.checked); else draft.selected = e.target.checked;
});
sheetEl.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t || !draft) return;
  if (t.id === 'esave') save();
  else if (t.id === 'eback') { if (await guard()) closeSheet(); }
  else if (t.id === 'erevert') { if (!dirty || await guard()) { const id = isNew ? null : draft.id; draft = null; id ? openSheet(id) : closeSheet(); } }
  else if (t.id === 'edup') {
    if (isNew || !(await guard())) return;
    const c = { ...recs.find(r => r.id === draft.id), id: uid(), selected: false };
    let n = c.name + ' (copie)'; while (recs.some(r => r.name === n)) n += ' +';
    c.name = n; recs.push(c); persist(); draft = null; openSheet(c.id); toast('Fiche dupliquée');
  } else if (t.id === 'edel') {
    if (isNew) { draft = null; closeSheet(); return; }
    if (await modal('Supprimer cet écran ?', `<p><b>${esc(draft.name)}</b> sera retiré de la bibliothèque.</p>`, [['Annuler', false], ['Supprimer', true, 'danger']])) {
      recs = recs.filter(r => r.id !== draft.id); persist(); draft = null; closeSheet(); toast('Écran supprimé');
    }
  }
});
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

window.Screens = { usable, openIO: tab => window.VPIO.open(ioSpec(), tab) };
closeSheet();
})();
