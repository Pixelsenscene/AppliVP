/* VP – interface */
(() => {
'use strict';
const G = window.VPGeo;
let VPS = window.Parc.usable();                 // projecteurs cochés dans la page Projecteurs
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const fm = (v, n = 2) => (Math.abs(v) < 0.5 * 10 ** -n ? 0 : v).toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });   // jamais « −0,00 »
const fi = v => Math.round(v).toLocaleString('fr-FR');

/* ---------- État ---------- */
const S = { vp: 'VP1', sw: 4, sh: 2.25, x: 0, y: 9, z: 1.5, zoom: 50, sx: 0, sy: 0, oy: 0, rot: null };   // sx, sy : lens shift · oy : throw offset · rot : orientation manuelle {pan, tilt, roll}
const st = { chain: true, aspect: 16 / 9 };
// verrouillé = true. Par défaut : projecteur et écran figés, position + zoom libres.
const locks = { vp: true, sw: true, sh: true, x: false, y: false, z: false, zoom: false };

const PARAMS = {
  sw:   { label: 'Largeur',        min: 0.5, max: 20, step: 0.05, unit: 'm' },
  sh:   { label: 'Hauteur',        min: 0.3, max: 12, step: 0.05, unit: 'm' },
  y:    { label: 'Recul (y)',      min: 0.5, max: 30, step: 0.05, unit: 'm' },
  x:    { label: 'Centrage (x)',   min: -10, max: 10, step: 0.05, unit: 'm' },
  z:    { label: 'Hauteur (z)',    min: 0,   max: 10, step: 0.05, unit: 'm' },
  zoom: { label: 'Zoom',           min: 0,   max: 100, step: 1,   unit: '%' },
};
const GROUPS = [
  { id: 'vp',   title: 'Projecteur', short: 'VP',       keys: ['vp'] },
  { id: 'ecran', title: 'Écran',     short: 'Écran',    keys: ['sw', 'sh'] },
  { id: 'pos',  title: 'Position',   short: 'Position', keys: ['y', 'x', 'z'] },
  { id: 'zoom', title: 'Optique',    short: 'Zoom',     keys: ['zoom'] },
];
const ICON_L = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const ICON_U = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/></svg>';

const vpOf = () => VPS[S.vp];
const effChain = () => st.chain && !locks.sw && !locks.sh;
const clampP = (k, v) => Math.max(PARAMS[k].min, Math.min(PARAMS[k].max, v));
const groupState = g => {
  const n = g.keys.filter(k => locks[k]).length;
  return n === 0 ? 'free' : n === g.keys.length ? 'locked' : 'mixed';
};

const fillVpSelect = () => { const sel = $('vpsel_s'); sel.innerHTML = ''; Object.keys(VPS).forEach(n => sel.add(new Option(n, n))); };
/* au retour sur la page Calcul : relit le parc (sélection, fiches modifiées) */
function refreshVps() {
  VPS = window.Parc.usable();
  if (!VPS[S.vp]) S.vp = Object.keys(VPS)[0];
  adv._vp = null; fillVpSelect();
}

/* ---------- Panneau de réglages ---------- */
function buildParams() {
  const box = $('params'); box.innerHTML = '';
  for (const g of GROUPS) {
    const card = document.createElement('div'); card.className = 'card'; card.dataset.g = g.id;
    card.innerHTML = `<h2>${g.title}<span class="hsp"></span><button class="lk" data-g="${g.id}" title="Verrouiller / libérer le groupe"></button></h2>`;
    if (g.id === 'vp') {
      card.insertAdjacentHTML('beforeend', `<div class="vpsel" id="vpsel"><button class="sq" id="vprev">◀</button><select id="vpsel_s"></select><button class="sq" id="vnext">▶</button></div><div class="sub" id="vpinfo"></div>`);
    } else for (const k of g.keys) {
      const p = PARAMS[k];
      card.insertAdjacentHTML('beforeend', `<div class="row" data-k="${k}">
        <button class="lk" data-k="${k}"></button><label>${p.label}${k === 'zoom' ? ' · ratio <b id="o_ratio"></b>' : ''}</label><input class="val" id="o_${k}" data-k="${k}" type="text" inputmode="${k === 'x' ? 'text' : 'decimal'}" autocomplete="off" autocapitalize="off" spellcheck="false">
        <div class="ctl"><button data-s="${k}" data-d="-1">−</button><input type="range" id="${k}" min="${p.min}" max="${p.max}" step="${p.step}"><button data-s="${k}" data-d="1">+</button></div></div>`);
    }
    if (g.id === 'ecran') card.insertAdjacentHTML('beforeend', `<div class="chips"><button id="chain">🔗 Largeur / hauteur liées</button></div>`);
    box.append(card);
  }
  const sel = $('vpsel_s'); fillVpSelect();
  sel.onchange = () => { S.vp = sel.value; render(); };
  const cyc = d => { const k = Object.keys(VPS); S.vp = k[(k.indexOf(S.vp) + d + k.length) % k.length]; render(); };
  $('vprev').onclick = () => cyc(-1); $('vnext').onclick = () => cyc(1);

  box.querySelectorAll('input[type=range]').forEach(i => i.oninput = () => setParam(i.id, +i.value));
  box.querySelectorAll('.ctl button').forEach(b => b.onclick = () => {
    const k = b.dataset.s; setParam(k, S[k] + (+b.dataset.d) * PARAMS[k].step);
  });
  box.querySelectorAll('.val').forEach(inp => {
    const k = inp.dataset.k;
    inp.onfocus = () => { if (locks[k]) { inp.blur(); return; } inp.value = fm(S[k], k === 'zoom' ? 0 : 2); setTimeout(() => inp.select(), 0); };
    inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.dataset.cancel = 1; inp.blur(); } };
    inp.onblur = () => {
      const cancel = inp.dataset.cancel; delete inp.dataset.cancel;
      const v = parseFloat(inp.value.replace(/\s/g, '').replace(',', '.').replace('−', '-'));
      if (!cancel && isFinite(v)) setParam(k, v); else render();
    };
  });
  // un appui sur le libellé recentre le paramètre : recul = milieu du curseur, hauteur = centre de l'écran, centrage = dans l'axe
  const JUMP = { y: () => (PARAMS.y.min + PARAMS.y.max) / 2, z: () => S.sh / 2, x: () => 0 };
  Object.entries(JUMP).forEach(([k, fn]) => {
    const lab = box.querySelector(`.row[data-k=${k}] label`);
    lab.classList.add('jump'); lab.title = { y: 'Milieu de la course', z: "Centré sur l'écran", x: "Dans l'axe de l'écran" }[k];
    lab.onclick = () => setParam(k, fn());
  });
  box.querySelectorAll('.lk[data-k]').forEach(b => b.onclick = () => { locks[b.dataset.k] = !locks[b.dataset.k]; render(); });
  box.querySelectorAll('.lk[data-g]').forEach(b => b.onclick = () => toggleGroup(b.dataset.g));
  $('chain').onclick = () => { st.chain = !st.chain; if (st.chain) st.aspect = S.sw / S.sh; render(); };
  buildAdv(box);
}
function toggleGroup(id) {
  const g = GROUPS.find(x => x.id === id), lock = groupState(g) !== 'locked';
  g.keys.forEach(k => locks[k] = lock); render();
}
function setParam(k, v) {
  if (locks[k]) return;
  S[k] = clampP(k, v);
  if (effChain()) { if (k === 'sw') S.sh = clampP('sh', S.sw / st.aspect); if (k === 'sh') S.sw = clampP('sw', S.sh * st.aspect); }
  render();
}
function buildLockPills() {
  $('locks').innerHTML = GROUPS.map(g => `<button class="pill" data-g="${g.id}">${ICON_L}<span>${g.short}</span></button>`).join('');
  $('locks').onclick = e => { const b = e.target.closest('.pill'); if (b) toggleGroup(b.dataset.g); };
}
function syncLocks() {
  for (const g of GROUPS) {
    const s = groupState(g);
    const card = document.querySelector(`.card[data-g=${g.id}]`); card.dataset.st = s;
    const lk = card.querySelector('.lk[data-g]'); lk.dataset.l = s === 'locked' ? 1 : 0; lk.innerHTML = s === 'free' ? ICON_U : ICON_L;
    const pill = document.querySelector(`.pill[data-g=${g.id}]`); pill.dataset.st = s; pill.firstElementChild.outerHTML = s === 'free' ? ICON_U : ICON_L;
    for (const k of g.keys) {
      const row = card.querySelector(`.row[data-k=${k}]`); if (!row) continue;
      row.classList.toggle('locked', locks[k]);
      const b = row.querySelector('.lk'); b.dataset.l = locks[k] ? 1 : 0; b.innerHTML = locks[k] ? ICON_L : ICON_U;
    }
  }
  $('vpsel').classList.toggle('locked', locks.vp);
}

/* ---------- Optique avancée : A lens shift · B translation · C rotation · throw offset ---------- */
const adv = { lens: false, trans: false, rot: false, src: 'std', off: false, offV: 0, offEdited: false, drag: 'lens', _vp: null };
const LENS_FREE = { v: 2, h: 1 };                                   // course des curseurs en mode libre (fraction de l'image)
const lensRange = ax => { const L = G.lensLimits(vpOf(), adv.src); return L ? L[ax] : [-LENS_FREE[ax], LENS_FREE[ax]]; };
const HELP = {
  lens: "<b>Lens shift (décalage optique)</b> : l'objectif glisse dans le projecteur. L'image se déplace sur l'écran <u>sans se déformer</u>, le VP restant droit. La plage dépend du modèle ; elle s'exprime en % de la hauteur (vertical) ou de la largeur (horizontal) de l'image.",
  src: "<b>Constructeur</b> : plage donnée par la fiche du projecteur (si renseignée).<br><b>Standard</b> : moyenne courante, ±30 % en vertical et ±10 % en horizontal.<br><b>Libre</b> : aucune limite, pour tester un cas hors fiche.",
  trans: "<b>Translation du VP</b> : on déplace le projecteur (x, y, z) sans le faire pivoter. Son axe reste fixe : l'image suit le VP et le faisceau se <u>désaxe</u> de l'écran. Cocher cette case fige la visée automatique.",
  rot: "<b>Rotation du VP</b> : <i>pan</i> = gauche / droite, <i>tilt</i> = haut / bas, <i>roll</i> = autour de l'axe optique. L'image se déplace mais se <u>déforme en trapèze</u> (keystone). Les angles partent de la visée actuelle.",
  off: "<b>Throw offset</b> : décalage vertical <u>fixe</u> de l'image par rapport à l'axe de l'objectif, propre à chaque modèle. À +60 %, le bas de l'image est à 10 % de sa hauteur au-dessus de l'axe (VP posé sur une table). Il s'ajoute au lens shift ; en plafonnier retourné, il est négatif.",
};
const ADV_ROWS = [
  { id: 'sx', grp: 'lens', label: 'Horizontal', unit: '%', dp: 0, lens: 'h', step: 1, hard: 500, get: () => S.sx * 100, set: v => S.sx = v / 100 },
  { id: 'sy', grp: 'lens', label: 'Vertical',   unit: '%', dp: 0, lens: 'v', step: 1, hard: 500, get: () => S.sy * 100, set: v => S.sy = v / 100 },
  { id: 'oy', grp: 'off',  label: 'Décalage vertical', unit: '%', dp: 0, min: -100, max: 150, step: 1, hard: 300, get: () => adv.offV * 100, set: v => { adv.offV = v / 100; adv.offEdited = true; } },
  { id: 'pan',  grp: 'rot', label: 'Pan ↔ gauche / droite', unit: '°', dp: 1, min: -45, max: 45, step: 0.5, hard: 89,  get: () => S.rot ? S.rot.pan : 0,  set: v => S.rot.pan = v },
  { id: 'tilt', grp: 'rot', label: 'Tilt ↕ haut / bas',     unit: '°', dp: 1, min: -45, max: 45, step: 0.5, hard: 89,  get: () => S.rot ? S.rot.tilt : 0, set: v => S.rot.tilt = v },
  { id: 'roll', grp: 'rot', label: 'Roll ⟳ autour de l\'axe', unit: '°', dp: 1, min: -45, max: 45, step: 0.5, hard: 180, get: () => S.rot ? S.rot.roll : 0, set: v => S.rot.roll = v },
];
const advSlider = r => r.lens ? lensRange(r.lens).map(x => x * 100) : [r.min, r.max];
const advRowHtml = r => `<div class="row" data-a="${r.id}"><label>${r.label}</label><input class="val" id="a_o_${r.id}" type="text" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false">
  <div class="ctl"><button data-a="${r.id}" data-d="-1">−</button><input type="range" id="a_${r.id}" step="${r.step}"><button data-a="${r.id}" data-d="1">+</button></div><div class="rw" id="a_w_${r.id}"></div></div>`;
const optHtml = (id, tag, name, help) => `<div class="opt"><label><input type="checkbox" id="adv_${id}"><b>${tag}</b><span>${name}</span></label><button class="info" data-h="${help}" aria-label="Aide">i</button></div>`;

function buildAdv(box) {
  const rows = g => ADV_ROWS.filter(r => r.grp === g).map(advRowHtml).join('');
  const card = document.createElement('div'); card.className = 'card'; card.id = 'advCard';
  card.innerHTML = `<h2>Optique avancée</h2>
    ${optHtml('lens', 'A', 'Lens shift', 'lens')}
    <div class="grp" id="g_lens">
      <div class="radios" id="lensSrc">${[['maker', 'Constructeur'], ['std', 'Standard'], ['free', 'Libre']].map(([v, t]) => `<label><input type="radio" name="lsrc" value="${v}"><span>${t}</span></label>`).join('')}<button class="info" data-h="src" aria-label="Aide">i</button></div>
      <div class="sub" id="lensHint"></div>${rows('lens')}</div>
    ${optHtml('trans', 'B', 'Translation du VP', 'trans')}
    <div class="grp" id="g_trans"><div class="sub">Orientation figée : les curseurs x, y, z (et la vue de côté / dessus) déplacent l'image.</div></div>
    ${optHtml('rot', 'C', 'Rotation du VP', 'rot')}
    <div class="grp" id="g_rot">${rows('rot')}<div class="chips"><button id="aimBtn">⌖ Viser le centre de l'écran</button></div></div>
    ${optHtml('off', '', 'Throw offset', 'off')}
    <div class="grp" id="g_off"><div class="sub" id="offHint"></div>${rows('off')}</div>`;
  box.append(card);

  const chk = (id, fn) => $('adv_' + id).onchange = e => { fn(e.target.checked); render(); };
  chk('lens', on => { adv.lens = on; });
  chk('trans', on => { adv.trans = on; syncRot(); });
  chk('rot', on => { adv.rot = on; syncRot(); });
  chk('off', on => { adv.off = on; adv.offEdited = false; adv.offV = on ? G.throwOffsetOf(vpOf()).value : 0; });
  card.querySelectorAll('input[name=lsrc]').forEach(i => i.onchange = () => { adv.src = i.value; render(); });
  $('aimBtn').onclick = () => { S.rot = G.autoAim(S); render(); };

  const byId = id => ADV_ROWS.find(r => r.id === id);
  const apply = (r, v) => { const lim = r.lens && adv.src !== 'free' ? advSlider(r) : [-r.hard, r.hard]; r.set(Math.max(lim[0], Math.min(lim[1], v))); render(); };
  card.querySelectorAll('input[type=range]').forEach(i => i.oninput = () => apply(byId(i.id.slice(2)), +i.value));
  card.querySelectorAll('.ctl button').forEach(b => b.onclick = () => { const r = byId(b.dataset.a); apply(r, r.get() + (+b.dataset.d) * r.step); });
  card.querySelectorAll('.val').forEach(inp => {
    const r = byId(inp.id.slice(4));
    inp.onfocus = () => { inp.value = fm(r.get(), r.dp); setTimeout(() => inp.select(), 0); };
    inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.dataset.cancel = 1; inp.blur(); } };
    inp.onblur = () => {
      const cancel = inp.dataset.cancel; delete inp.dataset.cancel;
      const v = parseFloat(inp.value.replace(/\s/g, '').replace(',', '.').replace('−', '-').replace('%', '').replace('°', ''));
      if (!cancel && isFinite(v)) apply(r, v); else render();
    };
  });

  const pop = document.createElement('div'); pop.id = 'pop'; pop.className = 'pop hidden'; document.body.append(pop);
  document.addEventListener('click', e => {
    const b = e.target.closest('.info');
    if (!b) { if (!e.target.closest('#pop')) pop.classList.add('hidden'); return; }
    if (!pop.classList.contains('hidden') && pop._for === b) { pop.classList.add('hidden'); return; }
    pop._for = b; pop.innerHTML = HELP[b.dataset.h]; pop.classList.remove('hidden');
    const rc = b.getBoundingClientRect(), w = Math.min(320, innerWidth - 16);
    pop.style.width = w + 'px'; pop.style.left = Math.max(8, Math.min(rc.left - 8, innerWidth - w - 8)) + 'px';
    const h = pop.offsetHeight; pop.style.top = (rc.bottom + 8 + h > innerHeight ? Math.max(8, rc.top - h - 8) : rc.bottom + 8) + 'px';
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') pop.classList.add('hidden'); });
}
/* B et C reposent sur une orientation manuelle ; sans B ni C, la visée redevient automatique */
function syncRot() {
  if (adv.trans || adv.rot) { if (!S.rot) S.rot = G.autoAim(S); }
  else S.rot = null;
}
/* cohérence de l'état avant calcul : changement de VP, limites du lens shift, throw offset effectif */
function syncAdv() {
  const v = vpOf();
  if (adv._vp !== S.vp) {
    adv._vp = S.vp;
    if (adv.off) { adv.offV = G.throwOffsetOf(v).value; adv.offEdited = false; }
  }
  if (adv.src === 'maker' && !G.hasMakerLens(v)) adv.src = 'std';
  if (!adv.lens) { S.sx = 0; S.sy = 0; }
  else if (adv.src !== 'free') {
    const cl = (v, [a, b]) => Math.max(a, Math.min(b, v));
    S.sx = cl(S.sx, lensRange('h')); S.sy = cl(S.sy, lensRange('v'));
  }
  S.oy = adv.off ? adv.offV : 0;
}
function drawAdv() {
  const v = vpOf(), pct = x => fm(x * 100, 0);
  for (const id of ['lens', 'trans', 'rot', 'off']) { $('adv_' + id).checked = adv[id]; $('g_' + id).classList.toggle('hidden', !adv[id]); }
  document.querySelectorAll('#lensSrc input').forEach(i => {
    const nok = i.value === 'maker' && !G.hasMakerLens(v);
    i.checked = i.value === adv.src; i.disabled = nok; i.nextElementSibling.textContent = nok ? 'Constructeur (non renseigné)' : { maker: 'Constructeur', std: 'Standard', free: 'Libre' }[i.value];
  });
  const L = G.lensLimits(v, adv.src);
  $('lensHint').textContent = L ? `Plage ${adv.src === 'maker' ? 'constructeur' : 'standard'} : vertical ${pct(L.v[0])} à ${pct(L.v[1])} % · horizontal ${pct(L.h[0])} à ${pct(L.h[1])} %` : 'Aucune limite (mode libre).';
  const wl = $('lensHint'), wm = warns.filter(w => w.key === 'lensSrc').map(w => w.text).join(' ');
  wl.classList.toggle('warn', !!wm); if (wm) wl.textContent = wm;
  const T = G.throwOffsetOf(v);
  $('offHint').textContent = adv.offEdited ? `Valeur modifiée (fiche : ${T.standard ? 'standard ' : ''}${pct(T.value)} %)` : T.standard ? `Valeur standard (${pct(T.value)} %) : non renseignée pour ce projecteur` : 'Valeur de la fiche du projecteur';
  for (const r of ADV_ROWS) {
    const [lo, hi] = advSlider(r), i = $('a_' + r.id), o = $('a_o_' + r.id);
    i.min = lo; i.max = hi; i.value = r.get();
    if (document.activeElement !== o) o.value = fm(r.get(), r.dp) + ' ' + r.unit;
    $('a_w_' + r.id).textContent = warns.filter(w => w.key === r.id).map(w => w.text).join(' ');
  }
}

/* ---------- Glisser le faisceau dans la vue de face ---------- */
const DRAG_OPTS = [['lens', 'A · Lens shift'], ['trans', 'B · Translation'], ['rot', 'C · Rotation']];
const dragMode = () => { const on = DRAG_OPTS.map(o => o[0]).filter(k => adv[k]); return on.includes(adv.drag) ? adv.drag : on[0] || null; };
function drawDragSel() {
  const on = DRAG_OPTS.filter(o => adv[o[0]]), cur = dragMode();
  $('dragSel').innerHTML = on.map(([k, t]) => `<button data-m="${k}" class="${k === cur ? 'on' : ''}">${t}</button>`).join('');
  $('faceTag').textContent = cur ? 'Vue de face · glisser le faisceau' : 'Vue de face (écran)';
}
function attachFaceDrag() {
  const svg = $('svgFace'); let st0 = null;
  $('dragSel').onclick = e => { const b = e.target.closest('button'); if (b) { adv.drag = b.dataset.m; render(); } };
  const world = e => { const rc = svg.getBoundingClientRect(), F = frozen.svgFace; return [F.ix(e.clientX - rc.left), F.iy(e.clientY - rc.top)]; };
  svg.addEventListener('pointerdown', e => {
    if (!e.target.closest('.handle') || !lastR || !lastR.valid) return;
    e.preventDefault(); try { svg.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
    frozen.svgFace = svg._F;
    const q = lastR.q;
    st0 = { m: dragMode(), w: world(e), sx: S.sx, sy: S.sy, x: S.x, z: S.z, rot: S.rot && { ...S.rot },
      Wb: (q.sides.AB + q.sides.CD) / 2, Hb: (q.sides.BC + q.sides.DA) / 2, dist: lastR.B.dist };
  });
  svg.addEventListener('pointermove', e => {
    if (!st0 || !frozen.svgFace) return;
    const w = world(e), dx = w[0] - st0.w[0], dz = w[1] - st0.w[1], cl = (v, [a, b]) => Math.max(a, Math.min(b, v));
    if (st0.m === 'lens') {
      const lh = adv.src === 'free' ? [-5, 5] : lensRange('h'), lv = adv.src === 'free' ? [-5, 5] : lensRange('v');
      S.sx = Math.round(cl(st0.sx + dx / st0.Wb, lh) * 200) / 200; S.sy = Math.round(cl(st0.sy + dz / st0.Hb, lv) * 200) / 200;
    } else if (st0.m === 'trans') {
      if (!locks.x) S.x = clampP('x', Math.round((st0.x + dx) * 100) / 100);
      if (!locks.z) S.z = clampP('z', Math.round((st0.z + dz) * 100) / 100);
    } else if (st0.m === 'rot' && S.rot) {
      S.rot.pan = Math.round(cl(st0.rot.pan + deg(Math.atan2(dx, st0.dist)), [-89, 89]) * 10) / 10;
      S.rot.tilt = Math.round(cl(st0.rot.tilt + deg(Math.atan2(dz, st0.dist)), [-89, 89]) * 10) / 10;
    }
    render();
  });
  const end = () => { if (!st0) return; st0 = null; delete frozen.svgFace; render(); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}
const deg = r => r * 180 / Math.PI;

/* ---------- SVG ---------- */
function el(t, a, txt) { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; }
function frame(svg, minx, maxx, miny, maxy, pad = 0.6) {
  const rc = svg.getBoundingClientRect(), W = rc.width || 400, H = rc.height || 300, m = 30;
  const wx = (maxx - minx) + 2 * pad, wy = (maxy - miny) + 2 * pad;
  const k = Math.min((W - 2 * m) / wx, (H - 2 * m) / wy);
  const ox = W / 2 - k * (minx + maxx) / 2, oy = H / 2 + k * (miny + maxy) / 2;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  return { W, H, X: x => ox + k * x, Y: y => oy - k * y, ix: px => (px - ox) / k, iy: py => (oy - py) / k, k, b: [minx, maxx, miny, maxy] };
}
/* pendant un glisser, le repère est figé pour que la vue ne « fuie » pas sous le doigt */
const frozen = {};
function viewFrame(svg, b, pad) {
  let F = frozen[svg.id];
  if (F) { const rc = svg.getBoundingClientRect(); svg.setAttribute('viewBox', `0 0 ${rc.width} ${rc.height}`); svg.replaceChildren(); }
  else F = frame(svg, ...b, pad);
  svg._F = F; return F;
}
function gridLines(svg, F, minx, maxx, miny, maxy) {
  const step = (maxx - minx) > 14 || (maxy - miny) > 14 ? 5 : 1;
  for (let x = Math.ceil(minx / step) * step; x <= maxx; x += step) svg.append(el('line', { x1: F.X(x), x2: F.X(x), y1: F.Y(miny), y2: F.Y(maxy), stroke: '#1f262e' }));
  for (let y = Math.ceil(miny / step) * step; y <= maxy; y += step) svg.append(el('line', { y1: F.Y(y), y2: F.Y(y), x1: F.X(minx), x2: F.X(maxx), stroke: '#1f262e' }));
}
const pts = (F, poly) => poly.map(p => `${F.X(p[0])},${F.Y(p[1])}`).join(' ');
const COL = { ok: '#3ecf8e', warn: '#f5a524', bad: '#ff5d5d' };
const USEFUL = '#3ecf8e', LOST = '#ff5d5d';

/* ---------- État : couverture + pixels perdus ---------- */
const PX_SCALE = [[15, '#0aa81a'], [30, '#7ea80a'], [50, '#a89b0a'], [70, '#a8570a'], [Infinity, '#a81a0a']];
const pxColor = p => PX_SCALE.find(([max]) => p <= max)[1];
const COVER_OK = '#0aa81a', COVER_BAD = '#a81a0a';
function verdict(r) {
  if (!r.valid) return { lvl: 'bad', cover: false, text: 'Faisceau hors écran (VP mal placé)' };
  const cover = r.uncoveredPct <= 1;
  return { lvl: cover ? 'ok' : 'bad', cover, text: cover ? 'Écran couvert' : `Écran non couvert : ${fm(r.uncoveredPct, 1)} %` };
}
function statusHtml(r) {
  const v = verdict(r);
  let html = `<div class="stat"><i style="background:${v.cover ? COVER_OK : COVER_BAD}"></i><span>${v.text}</span></div>`;
  if (r.valid) {
    const c = pxColor(r.px.lostPct);
    html += `<div class="stat"><i style="background:${c}"></i><span>Pixels perdus : <b style="color:${c}">${fm(r.px.lostPct, 1)} %</b></span></div>`;
  }
  return html;
}
let warns = [], warnOpen = false;
function drawStatus(r) {
  const n = warns.length;
  $('status').innerHTML = statusHtml(r) + (n ? `<button class="stat warnPill ${warnOpen ? 'open' : ''}" id="warnBtn"><i></i><span>${n} alerte${n > 1 ? 's' : ''}</span></button>` : '');
  const box = $('warnBox'); box.classList.toggle('hidden', !n || !warnOpen);
  box.innerHTML = warnOpen ? warns.map(w => `<div><span>${w.text}</span>${w.key ? `<small>${({ sx: 'Lens shift H', sy: 'Lens shift V', lensSrc: 'Lens shift', oy: 'Throw offset', pan: 'Pan', tilt: 'Tilt', roll: 'Roll' })[w.key]}</small>` : ''}</div>`).join('') : '';
}
$('status').onclick = e => { if (e.target.closest('#warnBtn')) { warnOpen = !warnOpen; drawStatus(lastR); } };

/* ---------- Vue de face ---------- */
function drawFace(r) {
  const svg = $('svgFace'); if (!r.valid) { svg.replaceChildren(); return; }
  const Q = r.B.quad, xs = Q.map(p => p[0]).concat(-S.sw / 2, S.sw / 2), ys = Q.map(p => p[1]).concat(0, S.sh);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const F = viewFrame(svg, [x0, x1, y0, y1]); gridLines(svg, F, x0 - 1, x1 + 1, y0 - 1, y1 + 1);
  const sx = F.X(-S.sw / 2), sy = F.Y(S.sh), sW = F.X(S.sw / 2) - sx, sH = F.Y(0) - sy;
  const lvl = verdict(r).lvl;
  svg.append(el('defs', {}), (() => { const d = el('defs', {});
    d.innerHTML = `<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#12161b"/><line x1="0" y1="0" x2="0" y2="8" stroke="#2b3440" stroke-width="3"/></pattern><clipPath id="scrClip"><rect x="${sx}" y="${sy}" width="${sW}" height="${sH}"/></clipPath>`; return d; })());
  svg.append(el('rect', { x: sx, y: sy, width: sW, height: sH, fill: 'url(#hatch)' }));                       // écran non couvert
  svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(255,93,93,.28)' }));                             // faisceau (perdu)
  svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(62,207,142,.42)', 'clip-path': 'url(#scrClip)' })); // faisceau ∩ écran (utile)
  svg.append(el('rect', { x: sx, y: sy, width: sW, height: sH, fill: 'none', stroke: COL[lvl], 'stroke-width': 3 }));
  svg.append(el('polygon', { points: pts(F, Q), fill: 'none', stroke: '#4da3ff', 'stroke-width': 2 }));
  ['A', 'B', 'C', 'D'].forEach((n, i) => {
    const p = Q[i], ox = i === 0 || i === 3 ? -12 : 12, oy = i < 2 ? -8 : 16;
    svg.append(el('circle', { cx: F.X(p[0]), cy: F.Y(p[1]), r: 3.5, fill: '#4da3ff' }));
    svg.append(el('text', { x: F.X(p[0]) + ox, y: F.Y(p[1]) + oy, 'text-anchor': 'middle', fill: '#9cc9ff', 'font-size': 13, 'font-weight': 700 }, n));
  });
  const cx = F.X(r.B.T[0]), cy = F.Y(r.B.T[2]);                                                               // point visé par l'axe optique
  svg.append(el('path', { d: `M${cx - 7},${cy}H${cx + 7}M${cx},${cy - 7}V${cy + 7}`, stroke: '#fff', 'stroke-width': 1.5, opacity: .7 }));
  svg.append(el('text', { x: F.X(0), y: sy - 8, 'text-anchor': 'middle', fill: '#e8edf2', 'font-size': 13 }, `${fm(S.sw)} × ${fm(S.sh)} m`));
  const dm = dragMode();
  if (dm && !isThumb(svg)) {                                                       // poignée au centre de l'image : glisser = déplacer le faisceau
    const g = r.q.centroid, free = dm !== 'trans' || !locks.x || !locks.z, hx = F.X(g[0]), hy = F.Y(g[1]);
    svg.append(el('circle', { cx: hx, cy: hy, r: 17, fill: 'none', stroke: free ? '#fff' : '#b58cff', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: .85 }));
    if (free) svg.append(el('circle', { class: 'handle', cx: hx, cy: hy, r: 30, fill: 'transparent' }));
  }
  if (isThumb(svg)) {                                                            // petite vue : dimensions du faisceau + angles aux sommets
    const q = r.q, inw = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    ['A', 'B', 'C', 'D'].forEach((n, i) => val(svg, F.X(Q[i][0]) + inw[i][0] * 6, F.Y(Q[i][1]) + inw[i][1] * 16, `${fm(q.angles[n], 1)}°`, inw[i][0] > 0 ? 'start' : 'end', '#9cc9ff', 11));
    val(svg, F.X(0), F.Y(0) + 4 + 16 * 1, `faisceau ${fm(q.widthTrap)} × ${fm(q.heightTrap)} m`, 'middle', '#9cc9ff', 12);
  }
}

/* ---------- Vue de côté / dessus (le VP se déplace au doigt) ---------- */
function handle(svg, F, x, y, axes) {
  const free = axes.some(k => !locks[k]), cx = F.X(x), cy = F.Y(y);
  svg.append(el('circle', { cx, cy, r: 17, fill: 'none', stroke: free ? '#fff' : '#b58cff', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: .85 }));
  if (free) svg.append(el('circle', { class: 'handle', cx, cy, r: 30, fill: 'transparent' }));
}
const DIM = '#ffd166';
/* cote : trait + repères aux extrémités + valeur, décalés de `off` pixels ; lo = décalage du texte par rapport au milieu */
function dim(svg, F, A, B, label, off, lo, anchor = 'middle') {
  const x1 = F.X(A[0]) + off[0], y1 = F.Y(A[1]) + off[1], x2 = F.X(B[0]) + off[0], y2 = F.Y(B[1]) + off[1];
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l * 7, ny = dx / l * 7;
  svg.append(el('line', { x1, y1, x2, y2, stroke: DIM, 'stroke-width': 1.6 }));
  [[x1, y1], [x2, y2]].forEach(([x, y]) => svg.append(el('line', { x1: x - nx, y1: y - ny, x2: x + nx, y2: y + ny, stroke: DIM, 'stroke-width': 1.6 })));
  svg.append(el('text', { x: (x1 + x2) / 2 + lo[0], y: (y1 + y2) / 2 + lo[1], 'text-anchor': anchor, fill: DIM, 'font-size': 15, 'font-weight': 700,
    stroke: '#0f1216', 'stroke-width': 4, 'paint-order': 'stroke' }, label));
}
const isBig = svg => svg.closest('.card').classList.contains('full');
const isThumb = svg => !isBig(svg) && $('viz').classList.contains('fs');
/* valeur posée dans le graphique (sans trait de cote), avec un liseré sombre pour rester lisible sur la grille */
function val(svg, x, y, text, anchor = 'middle', color = DIM, size = 13) {
  svg.append(el('text', { x, y, 'text-anchor': anchor, fill: color, 'font-size': size, 'font-weight': 700, stroke: '#0f1216', 'stroke-width': 3.5, 'paint-order': 'stroke' }, text));
}
function drawSide(r) {
  const svg = $('svgSide'); if (!r.valid) { svg.replaceChildren(); return; }
  const top = G.rayHit(r.B, 0, 1), bot = G.rayHit(r.B, 0, -1);
  const maxz = Math.max(S.sh, S.z, top[1]) + 0.2, minz = Math.min(0, bot[1]);
  const F = viewFrame(svg, [-0.3, Math.max(S.y * 1.25, S.y + 2), minz - 0.2, maxz + Math.max(1, 0.2 * maxz)], 0.3);
  const [bx0, bx1] = F.b; gridLines(svg, F, ...F.b);
  svg.append(el('line', { x1: F.X(bx0), x2: F.X(bx1), y1: F.Y(0), y2: F.Y(0), stroke: '#556', 'stroke-width': 2 }));
  svg.append(el('polygon', { points: `${F.X(S.y)},${F.Y(S.z)} ${F.X(0)},${F.Y(top[1])} ${F.X(0)},${F.Y(bot[1])}`, fill: 'rgba(77,163,255,.16)', stroke: '#4da3ff' }));
  const seg = (a, b, c, w) => svg.append(el('line', { x1: F.X(0), x2: F.X(0), y1: F.Y(a), y2: F.Y(b), stroke: c, 'stroke-width': w }));
  seg(bot[1], top[1], LOST, 7);                                                                                  // empreinte du faisceau
  seg(Math.max(0, bot[1]), Math.min(S.sh, top[1]), USEFUL, 7);                                                   // partie utile
  svg.append(el('line', { x1: F.X(0), x2: F.X(0), y1: F.Y(0), y2: F.Y(S.sh), stroke: '#fff', 'stroke-width': 1.5, opacity: .6 }));
  svg.append(el('line', { x1: F.X(S.y), y1: F.Y(S.z), x2: F.X(0), y2: F.Y(r.B.T[2]), stroke: '#fff', 'stroke-dasharray': '4 4', opacity: .5 }));
  svg.append(el('rect', { x: F.X(S.y) - 8, y: F.Y(S.z) - 6, width: 16, height: 12, rx: 2, fill: '#4da3ff' }));
  if (isBig(svg)) {
    dim(svg, F, [0, 0], [S.y, 0], `y = ${fm(S.y)} m`, [0, 28], [0, 22]);
    dim(svg, F, [S.y, 0], [S.y, S.z], `z = ${fm(S.z)} m`, [34, 0], [10, 5], 'start');
  } else if (isThumb(svg)) {
    val(svg, F.X(S.y / 2), F.Y(0) + 18, `y = ${fm(S.y)} m`);
    val(svg, F.X(S.y), F.Y(S.z) - 26, `z = ${fm(S.z)} m`);
    val(svg, 10, F.H - 10, `x = ${fm(S.x)} m`, 'start', '#8b98a6');
  } else svg.append(el('text', { x: F.X(S.y / 2), y: F.Y(0) - 6, 'text-anchor': 'middle', fill: '#8b98a6', 'font-size': 12 }, `${fm(S.y)} m`));
  handle(svg, F, S.y, S.z, ['y', 'z']);
}
function drawTop(r) {
  const svg = $('svgTop'); if (!r.valid) { svg.replaceChildren(); return; }
  const L = G.rayHit(r.B, -1, 0), R = G.rayHit(r.B, 1, 0);
  const hx = Math.max(Math.abs(L[0]), Math.abs(R[0]), S.sw / 2, Math.abs(S.x)) * 1.15 + 0.5;
  const F = viewFrame(svg, [-hx, hx, -0.2, Math.max(S.y * 1.25, S.y + 2)], 0.3);
  gridLines(svg, F, ...F.b);
  svg.append(el('polygon', { points: `${F.X(S.x)},${F.Y(S.y)} ${F.X(L[0])},${F.Y(0)} ${F.X(R[0])},${F.Y(0)}`, fill: 'rgba(77,163,255,.16)', stroke: '#4da3ff' }));
  const seg = (a, b, c, w) => svg.append(el('line', { x1: F.X(a), x2: F.X(b), y1: F.Y(0), y2: F.Y(0), stroke: c, 'stroke-width': w }));
  seg(L[0], R[0], LOST, 7); seg(Math.max(L[0], -S.sw / 2), Math.min(R[0], S.sw / 2), USEFUL, 7);
  svg.append(el('line', { x1: F.X(-S.sw / 2), x2: F.X(S.sw / 2), y1: F.Y(0), y2: F.Y(0), stroke: '#fff', 'stroke-width': 1.5, opacity: .6 }));
  svg.append(el('line', { x1: F.X(S.x), y1: F.Y(S.y), x2: F.X(r.B.T[0]), y2: F.Y(0), stroke: '#fff', 'stroke-dasharray': '4 4', opacity: .5 }));
  svg.append(el('rect', { x: F.X(S.x) - 8, y: F.Y(S.y) - 6, width: 16, height: 12, rx: 2, fill: '#4da3ff' }));
  if (isBig(svg)) {
    dim(svg, F, [S.x, 0], [S.x, S.y], `y = ${fm(S.y)} m`, [34, 0], [10, 5], 'start');
    dim(svg, F, [0, 0], [S.x, 0], `x = ${fm(S.x)} m`, [0, 28], [0, 22]);
  } else if (isThumb(svg)) {
    val(svg, F.X(S.x) + 24, F.Y(S.y / 2) + 4, `y = ${fm(S.y)} m`, 'start');
    val(svg, F.X(S.x / 2), F.Y(0) + 18, `x = ${fm(S.x)} m`);
    val(svg, 10, F.H - 10, `z = ${fm(S.z)} m`, 'start', '#8b98a6');
  }
  handle(svg, F, S.x, S.y, ['x', 'y']);
}

/* glisser le VP : horizontal / vertical de la vue -> paramètres (les axes verrouillés ne bougent pas) */
let lastR = null;
function attachDrag(id, axes) {
  const svg = $(id); let off = null;
  const world = e => { const rc = svg.getBoundingClientRect(), F = frozen[id]; return [F.ix(e.clientX - rc.left), F.iy(e.clientY - rc.top)]; };
  svg.addEventListener('pointerdown', e => {
    if (!e.target.closest('.handle')) return;
    e.preventDefault(); try { svg.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
    frozen[id] = svg._F; const w = world(e); off = [S[axes[0]] - w[0], S[axes[1]] - w[1]];
  });
  svg.addEventListener('pointermove', e => {
    if (!off || !frozen[id]) return;
    const w = world(e), q = svg.closest('.card').classList.contains('full') ? 100 : 20;       // pas : 1 cm en plein écran, 5 cm sinon
    axes.forEach((k, i) => { if (!locks[k]) S[k] = clampP(k, Math.round((w[i] + off[i]) * q) / q); });
    render();
  });
  const end = () => { if (!off) return; off = null; delete frozen[id]; render(); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}
/* plein écran des vues face / côté / dessus */
function toggleFull(card, on) {
  const want = on ?? !card.classList.contains('full');
  document.querySelectorAll('.viz .card.full').forEach(c => { c.classList.remove('full'); c.querySelector('.expand').textContent = '⤢'; });
  const viz = $('viz'); viz.classList.remove('fs-side', 'fs-top', 'fs-face', 'fs');
  if (want) { viz.classList.add('fs'); card.classList.add('full'); card.querySelector('.expand').textContent = '✕'; viz.classList.add(card.classList.contains('side') ? 'fs-side' : card.classList.contains('face') ? 'fs-face' : 'fs-top'); }
  requestAnimationFrame(render);
}
function drawHud() {
  document.querySelectorAll('.card.full .hud').forEach(h => {
    h.innerHTML = ['y', 'x', 'z'].map(k => `<button class="chip ${locks[k] ? 'lockd' : ''}" data-k="${k}">${locks[k] ? ICON_L : ICON_U}${PARAMS[k].label} <b>${fm(S[k])} m</b></button>`).join('') + (lastR ? statusHtml(lastR) : '');
  });
}

/* ---------- Indicateurs ---------- */
function drawKpis(r) {
  if (!r.valid) { $('kpis').innerHTML = ''; return; }
  const lostCol = pxColor(r.px.lostPct);
  const items = [
    ['Pixels utiles', fm(r.px.usefulPct, 1), '%', 'ok', `${fi(r.px.useful)} px`],
    ['Pixels perdus', fm(r.px.lostPct, 1), '%', '', `${fi(r.px.lost)} px`, lostCol],
    ['Écran couvert', fm(100 - r.uncoveredPct, 1), '%', r.uncoveredPct > 1 ? 'bad' : 'ok', ''],
    ['Ratio utilisé', fm(r.ratio), ':1', '', ''],
    ['Éclairement', fi(r.lux), 'lx', '', ''],
    ['Forme', r.q.shape.split(' (')[0].replace('Quadrilatère quelconque', 'Quelconque'), '', 'shape', ''],
  ];
  $('kpis').innerHTML = items.map(i => `<div class="kpi ${i[3]}"><small>${i[0]}</small><b${i[5] ? ` style="color:${i[5]}"` : ''}>${i[1]}</b><span>${i[2]}</span><em>${i[4]}</em></div>`).join('');
}

/* ---------- Rendu principal ---------- */
function render() {
  syncAdv();
  const r = G.compute(vpOf(), S), v = vpOf();
  warns = G.checkSetup(v, S, { lens: adv.lens, src: adv.src, rot: adv.rot, off: adv.off }, r);
  for (const k of Object.keys(PARAMS)) {
    const i = $(k); if (+i.value !== S[k]) i.value = S[k];
    const o = $('o_' + k); o.readOnly = locks[k];
    if (document.activeElement !== o) o.value = k === 'zoom' ? Math.round(S[k]) + ' %' : fm(S[k]) + ' m';
  }
  $('vpsel_s').value = S.vp;
  $('vpinfo').textContent = `Ratio ${fm(v.rmin)}${v.zoomable ? ' – ' + fm(v.rmax) : ' (fixe)'} · ${v.fw}:${v.fh} · ${v.res} ${v.resW}×${v.resH} · ${fi(v.lm)} lm`;
  $('vpinfo').classList.toggle('warn', !!(v.stdFields && v.stdFields.length));
  if (v.stdFields && v.stdFields.length) $('vpinfo').textContent += ` · ⚠ valeurs standard : ${v.stdFields.join(', ').toLowerCase()}`;
  $('o_ratio').textContent = fm(G.ratioOf(v, S.zoom)) + ':1';
  document.querySelector('.row[data-k=zoom]').style.display = v.zoomable ? '' : 'none';
  $('chain').classList.toggle('on', effChain());
  $('chain').style.opacity = locks.sw || locks.sh ? .4 : 1;
  syncLocks(); drawAdv(); drawDragSel();
  drawStatus(r);
  const canAuto = G.autoProposals ? Object.keys(locks).some(k => !locks[k] && (k !== 'zoom' || v.zoomable) && (k !== 'vp' || true)) : false;
  $('auto').disabled = !canAuto;
  lastR = r;
  drawFace(r); drawSide(r); drawTop(r); drawKpis(r); drawHud();
  if ($('details').classList.contains('open')) renderDetails(r);
}

/* ---------- Auto : propositions ---------- */
let props = [], propIdx = -1, appliedSig = '', rot = 0;
const sig = () => JSON.stringify([S, locks, st.chain]);
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
$('auto').onclick = () => {
  if (propIdx >= 0 && sig() === appliedSig && props.length) propIdx = (propIdx + 1) % props.length;
  else {
    props = G.autoProposals(VPS, S, locks, effChain(), st.aspect, 3); propIdx = 0;
    if (!props.length) { toast('Rien à optimiser : tous les paramètres utiles sont verrouillés'); propIdx = -1; return; }
  }
  const p = props[propIdx];
  Object.assign(S, p.S);
  appliedSig = sig(); rot += 120; $('autoRot').style.transform = `rotate(${rot}deg)`;
  render();
  toast(`Recouvrement faisceau / écran : ${fm(p.score * 100, 1)} %`);
};

/* ---------- Fenêtre annexe : calculs détaillés ---------- */
let tab = 'quad', selRow = 0;
$('detBtn').onclick = () => { $('details').classList.toggle('open'); $('detBtn').classList.toggle('on'); render(); };
$('detClose').onclick = () => { $('details').classList.remove('open'); $('detBtn').classList.remove('on'); };

const dist2 = G.d2;
const HL = '#ffd166';
function drawPrim(svg, F, p) {
  const a = { stroke: HL, 'stroke-width': 4, 'stroke-linecap': 'round' };
  if (p.k === 'seg') svg.append(el('line', { x1: F.X(p.a[0]), y1: F.Y(p.a[1]), x2: F.X(p.b[0]), y2: F.Y(p.b[1]), ...a }));
  else if (p.k === 'poly') svg.append(el('polygon', { points: pts(F, p.p), fill: p.fill === false ? 'none' : 'rgba(255,209,102,.3)', ...a, 'stroke-linejoin': 'round' }));
  else if (p.k === 'pt') svg.append(el('circle', { cx: F.X(p.p[0]), cy: F.Y(p.p[1]), r: 7, fill: HL }));
  else if (p.k === 'arc' || p.k === 'bis') {
    const c = p.c, u1 = p.k === 'bis' ? p.u1 : [p.a[0] - c[0], p.a[1] - c[1]], u2 = p.k === 'bis' ? p.u2 : [p.b[0] - c[0], p.b[1] - c[1]];
    const a1 = Math.atan2(u1[1], u1[0]); let da = Math.atan2(u2[1], u2[0]) - a1;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const R = p.r, path = [];
    for (let i = 0; i <= 16; i++) { const t = a1 + da * i / 16; path.push([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]); }
    svg.append(el('polyline', { points: pts(F, path), fill: 'none', ...a }));
    if (p.k === 'bis') { const m = a1 + da / 2; svg.append(el('line', { x1: F.X(c[0]), y1: F.Y(c[1]), x2: F.X(c[0] + 2.2 * R * Math.cos(m)), y2: F.Y(c[1] + 2.2 * R * Math.sin(m)), ...a, 'stroke-dasharray': '6 5' })); }
  }
}
const lbl = (svg, F, p, t, dx = 0, dy = -8, c = '#9cc9ff') => svg.append(el('text', { x: F.X(p[0]) + dx, y: F.Y(p[1]) + dy, 'text-anchor': 'middle', fill: c, 'font-size': 12, 'font-weight': 700 }, t));

function buildDetails(r) {
  const v = vpOf(), Q = r.B.quad, q = r.q, N = ['A', 'B', 'C', 'D'], g = r.geo;
  const L = (n, f, val, hl = []) => ({ n, f, val, hl });
  const seg = (a, b, vw = 0) => ({ k: 'seg', a, b, vw });
  const poly = (p, fill, vw = 0) => ({ k: 'poly', p, fill, vw });
  const faceBounds = () => { const xs = Q.map(p => p[0]).concat(-S.sw / 2, S.sw / 2), ys = Q.map(p => p[1]).concat(0, S.sh); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; };
  const faceBase = (svg, F) => {
    svg.append(el('rect', { x: F.X(-S.sw / 2), y: F.Y(S.sh), width: F.k * S.sw, height: F.k * S.sh, fill: 'none', stroke: '#667', 'stroke-dasharray': '5 4' }));
    svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(77,163,255,.14)', stroke: '#4da3ff', 'stroke-width': 1.5 }));
  };
  const tabs = {};

  /* --- Quadrilatère --- */
  const sd = [['AB', 0, 1], ['BC', 1, 2], ['CD', 2, 3], ['DA', 3, 0]];
  tabs.quad = {
    label: 'Quadrilatère', views: [{ b: faceBounds(), draw: (svg, F) => { faceBase(svg, F); N.forEach((n, i) => lbl(svg, F, Q[i], n, i === 0 || i === 3 ? -11 : 11, i < 2 ? -8 : 16)); } }],
    rows: [
      { sec: 'Côtés' },
      ...sd.map(([n, i, j]) => L(n, `√((x${N[j]}−x${N[i]})² + (z${N[j]}−z${N[i]})²)`, fm(q.sides[n]) + ' m', [seg(Q[i], Q[j])])),
      { sec: 'Diagonales' },
      L('AC', 'diagonale', fm(q.diags.AC) + ' m', [seg(Q[0], Q[2])]),
      L('BD', 'diagonale', fm(q.diags.BD) + ' m', [seg(Q[1], Q[3])]),
      { sec: 'Angles et bissectrices' },
      ...N.map((n, i) => {
        const P = Q[i], a = Q[(i + 3) % 4], b = Q[(i + 1) % 4], R = 0.18 * Math.min(q.sides.AB, q.sides.BC);
        return L('∠' + n, `arccos(u·v / |u||v|) · bissectrice = moitié`, `${fm(q.angles[n], 1)}° · ${fm(q.angles[n] / 2, 1)}°`,
          [{ k: 'bis', c: P, u1: [a[0] - P[0], a[1] - P[1]], u2: [b[0] - P[0], b[1] - P[1]], r: R, vw: 0 }]);
      }),
      { sec: 'Hauteurs, médianes' },
      L('h', 'hauteur : milieu de AB → droite CD', fm(q.heightTrap) + ' m', [seg(q.mids.AB, q.heightFoot)]),
      L('l', 'largeur : milieu de BC → droite DA', fm(q.widthTrap) + ' m', [seg(q.mids.BC, q.widthFoot)]),
      L('m ↕', 'médiane : milieu AB → milieu CD', fm(q.medV) + ' m', [seg(q.mids.AB, q.mids.CD)]),
      L('m ↔', 'médiane : milieu BC → milieu DA', fm(q.medH) + ' m', [seg(q.mids.BC, q.mids.DA)]),
      { sec: 'Périmètre, surface' },
      L('P', 'AB + BC + CD + DA', fm(q.perimeter) + ' m', [poly(Q, false)]),
      L('S', 'formule du lacet (Gauss)', fm(q.area) + ' m²', [poly(Q)]),
      L('G', 'centre de gravité', `(${fm(q.centroid[0])} ; ${fm(q.centroid[1])})`, [{ k: 'pt', p: q.centroid }]),
      L('Forme', 'côtés opposés parallèles ?', q.shape, []),
    ]
  };

  /* --- Position / triangle VP --- */
  const T = [0, S.sh / 2], VPs = [g.dh, S.z], Rp = [g.dh, S.sh / 2];
  const T2 = [0, 0], V2 = [S.x, S.y], Fp = [S.x, 0];
  const mark = (svg, F, c, a, b) => { const s = 0.12, ux = Math.sign(a[0] - c[0]) * s, uy = Math.sign(a[1] - c[1]) * s, vx = Math.sign(b[0] - c[0]) * s, vy = Math.sign(b[1] - c[1]) * s;
    svg.append(el('polyline', { points: pts(F, [[c[0] + ux, c[1] + uy], [c[0] + ux + vx, c[1] + uy + vy], [c[0] + vx, c[1] + vy]]), fill: 'none', stroke: '#8b98a6' })); };
  tabs.pos = {
    label: 'Triangle VP', views: [
      { t: 'côté', b: [-0.3, g.dh + 0.3, Math.min(0, S.z), Math.max(S.sh, S.z)], draw: (svg, F) => {
        svg.append(el('line', { x1: F.X(-0.3), x2: F.X(g.dh + .3), y1: F.Y(0), y2: F.Y(0), stroke: '#556', 'stroke-width': 2 }));
        svg.append(el('line', { x1: F.X(0), x2: F.X(0), y1: F.Y(0), y2: F.Y(S.sh), stroke: '#fff', 'stroke-width': 3, opacity: .7 }));
        svg.append(el('polygon', { points: pts(F, [VPs, T, Rp]), fill: 'rgba(77,163,255,.12)', stroke: '#4da3ff' }));
        mark(svg, F, Rp, VPs, T); lbl(svg, F, VPs, 'VP', 0, -10); lbl(svg, F, T, 'cible', 22, 4);
      } },
      { t: 'dessus', b: [Math.min(-S.sw / 2, S.x), Math.max(S.sw / 2, S.x), -0.2, S.y], draw: (svg, F) => {
        svg.append(el('line', { x1: F.X(-S.sw / 2), x2: F.X(S.sw / 2), y1: F.Y(0), y2: F.Y(0), stroke: '#fff', 'stroke-width': 3, opacity: .7 }));
        svg.append(el('polygon', { points: pts(F, [V2, T2, Fp]), fill: 'rgba(77,163,255,.12)', stroke: '#4da3ff' }));
        mark(svg, F, Fp, V2, T2); lbl(svg, F, V2, 'VP', 0, -10);
      } }],
    rows: [
      { sec: 'Triangle rectangle VP → écran' },
      L('d', 'hypoténuse = √(dh² + Δz²)', fm(g.d) + ' m', [seg(VPs, T, 0)]),
      L('dh', 'distance horizontale = √(x² + y²)', fm(g.dh) + ' m', [seg(Rp, T, 0), seg(V2, T2, 1)]),
      L('y', 'projection perpendiculaire sur l’écran', fm(g.y) + ' m', [seg(V2, Fp, 1)]),
      L('x', 'décalage latéral', fm(g.x) + ' m', [seg(Fp, T2, 1)]),
      L('Δz', 'écart vertical = z − h/2', fm(g.dz) + ' m', [seg(VPs, Rp, 0)]),
      { sec: 'Angles de visée' },
      L('θ', 'site = arctan(Δz / dh)', fm(g.pitch, 1) + '°', [{ k: 'arc', c: T, a: Rp, b: VPs, r: 0.5, vw: 0 }]),
      L('ψ', 'azimut = arctan(x / y)', fm(g.yaw, 1) + '°', [{ k: 'arc', c: V2, a: Fp, b: T2, r: 0.9, vw: 1 }]),
      L('i', 'incidence sur l’écran = arccos(y / d)', fm(g.incidence, 1) + '°', [seg(VPs, T, 0)]),
      { sec: 'Faisceau' },
      L('Hfov', '2·arctan(1 / 2·ratio)', fm(g.fovH, 1) + '°', []),
      L('Vfov', '2·arctan(tanH·fh/fw)', fm(g.fovV, 1) + '°', []),
      L('Dfov', 'diagonale', fm(g.fovD, 1) + '°', []),
      L('Lf', 'largeur ⟂ axe = d / ratio', fm(g.beamW) + ' m', []),
      L('Hf', 'hauteur ⟂ axe', fm(g.beamH) + ' m', []),
    ]
  };

  /* --- Écran --- */
  const SC = [[-S.sw / 2, S.sh], [S.sw / 2, S.sh], [S.sw / 2, 0], [-S.sw / 2, 0]];
  tabs.scr = {
    label: 'Écran', views: [{ b: faceBounds(), draw: faceBase }],
    rows: [
      { sec: 'Dimensions' },
      L('Larg.', '', fm(S.sw) + ' m', [seg(SC[3], SC[2])]),
      L('Haut.', '', fm(S.sh) + ' m', [seg(SC[2], SC[1])]),
      L('Diag.', '√(l² + h²)', `${fm(r.scr.diag)} m · ${fm(r.scr.diag / 0.0254, 1)}″`, [seg(SC[3], SC[1])]),
      L('Format', 'l / h', fm(S.sw / S.sh) + ' : 1', []),
      L('P', '2·(l + h)', fm(r.scr.perimeter) + ' m', [poly(SC, false)]),
      L('S', 'l × h', fm(r.scr.area) + ' m²', [poly(SC)]),
      { sec: 'Faisceau et écran' },
      L('Sf', 'aire du faisceau', fm(q.area) + ' m²', [poly(Q)]),
      L('S∩', 'aire commune faisceau ∩ écran', fm(r.ov.ai) + ' m²', r.ov.inter.length > 2 ? [poly(r.ov.inter)] : []),
      L('Sécran−S∩', 'écran non couvert', `${fm(r.uncovered)} m² · ${fm(r.uncoveredPct, 1)} %`, [poly(SC)]),
      L('Sf−S∩', 'lumière hors écran', `${fm(q.area - r.ov.ai)} m² · ${fm(100 * (q.area - r.ov.ai) / q.area, 1)} %`, [poly(Q)]),
      L('IoU', 'S∩ / (Sf + Sécran − S∩) — critère de l’Auto', fm(r.ov.iou * 100, 1) + ' %', []),
      L('E', 'lumens / aire du faisceau', fi(r.lux) + ' lx', []),
    ]
  };

  /* --- Pixels --- */
  const P = r.panelOf, RW = v.resW, RH = v.resH;
  const sides = ['gauche', 'droite', 'haut', 'bas'];
  tabs.px = {
    label: 'Pixels', views: [{ b: [0, RW, 0, RH], draw: (svg, F) => {
      svg.append(el('rect', { x: F.X(0), y: F.Y(RH), width: F.k * RW, height: F.k * RH, fill: 'rgba(255,93,93,.35)', stroke: '#667' }));
      if (r.px.usefulPoly.length > 2) svg.append(el('polygon', { points: pts(F, r.px.usefulPoly), fill: 'rgba(62,207,142,.6)', stroke: USEFUL, 'stroke-width': 1.5 }));
      svg.append(el('text', { x: F.X(RW / 2), y: F.Y(RH) - 6, 'text-anchor': 'middle', fill: '#8b98a6', 'font-size': 12 }, `panneau ${RW} × ${RH}`));
    } }],
    rows: [
      { sec: 'Panneau du projecteur' },
      L('Rés.', v.res, `${RW} × ${RH}`, []),
      L('Total', 'largeur × hauteur', fi(r.px.total) + ' px', [poly([[0, 0], [RW, 0], [RW, RH], [0, RH]])]),
      { sec: 'Bilan' },
      L('Utiles', 'pixels projetés dans l’écran', `${fi(r.px.useful)} px · ${fm(r.px.usefulPct, 1)} %`, r.px.usefulPoly.length > 2 ? [poly(r.px.usefulPoly)] : []),
      L('Perdus', 'total − utiles', `${fi(r.px.lost)} px · ${fm(r.px.lostPct, 1)} %`, []),
      ...sides.map(s => L('↳ ' + s, 'perdus au-delà du bord ' + s, `${fi(r.px.byside[s].px)} px`, r.px.byside[s].poly.length > 2 ? [poly(r.px.byside[s].poly.map(P))] : [])),
      { sec: 'Image utile' },
      L('Zone', 'boîte englobante dans le panneau', `${fi(r.px.bbox.w)} × ${fi(r.px.bbox.h)} px`, []),
      L('Densité', 'pixels utiles / aire commune', fi(r.px.perM2) + ' px/m²', []),
      L('Pixel', '√(aire commune / pixels utiles)', fm(r.px.pixelMm) + ' mm', []),
    ]
  };
  return tabs;
}

function renderDetails(r) {
  const body = $('dbody'), tabsEl = $('dtabs');
  const note = S.rot && tab === 'pos' ? '<p class="sub warn">Orientation manuelle : ce triangle suppose une visée vers le centre de l’écran et ne décrit plus l’axe réel du VP (voir pan / tilt / roll).</p>' : '';
  if (!r || !r.valid) { body.innerHTML = '<p class="sub">Faisceau hors écran : aucun calcul.</p>'; return; }
  const tabs = buildDetails(r), T = tabs[tab] || tabs.quad;
  tabsEl.innerHTML = Object.entries(tabs).map(([k, t]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${t.label}</button>`).join('');
  tabsEl.onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; selRow = 1; renderDetails(G.compute(vpOf(), S)); } };
  const rows = T.rows;
  if (!rows[selRow] || rows[selRow].sec) selRow = rows.findIndex(x => !x.sec);
  body.innerHTML = note + `<div class="figs">${T.views.map(() => '<svg></svg>').join('')}</div>` +
    rows.map((x, i) => x.sec ? `<div class="sec">${x.sec}</div>` :
      `<button class="m ${i === selRow ? 'sel' : ''}" data-i="${i}"><span class="n">${x.n}</span><span class="f">${x.f}</span><b>${x.val}</b></button>`).join('');
  body.onclick = e => { const b = e.target.closest('.m'); if (b) { selRow = +b.dataset.i; renderDetails(r); } };
  body.querySelectorAll('.figs svg').forEach((svg, vi) => {
    const V = T.views[vi], [x0, x1, y0, y1] = V.b, F = frame(svg, x0, x1, y0, y1, Math.max(x1 - x0, y1 - y0) * 0.08 + 0.05);
    V.draw(svg, F);
    (rows[selRow].hl || []).filter(p => (p.vw || 0) === vi).forEach(p => drawPrim(svg, F, p));
  });
}

/* ---------- Navigation ---------- */
const titles = { calc: 'Calcul faisceau', vp: 'Projecteurs', ecran: 'Écrans', proj: 'Projets', set: 'Réglages' };
$('nav').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  for (const p in titles) $('p-' + p).classList.toggle('hidden', p !== b.dataset.p);
  $('title').textContent = titles[b.dataset.p];
  const calc = b.dataset.p === 'calc';
  ['locks', 'auto', 'detBtn'].forEach(id => $(id).style.display = calc ? '' : 'none');
  if (!calc) $('details').classList.remove('open');
  if (calc) { refreshVps(); render(); }
};
addEventListener('resize', render);

buildParams(); buildLockPills();
attachDrag('svgSide', ['y', 'z']); attachDrag('svgTop', ['x', 'y']); attachFaceDrag();
document.querySelectorAll('.expand').forEach(b => b.onclick = () => toggleFull(b.closest('.card')));
$('viz').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { locks[c.dataset.k] = !locks[c.dataset.k]; render(); } });
addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.card.full').forEach(c => toggleFull(c, false)); });
render();
/* aides de test : ?details=quad|pos|scr|px  ?auto=1  ?unlock=1  ?adv=lens,trans,rot,off  ?lens=sx,sy (en %)  ?pop=lens  ?scroll=1  ?simdrag=dx,dy (pixels, sur la poignée de la vue de face)  ?src=free|std|maker  ?rot=pan,tilt,roll  ?warn=1 (ouvre la liste des alertes) */
const qs = new URLSearchParams(location.search);
if (qs.get('unlock')) { Object.keys(locks).forEach(k => locks[k] = false); render(); }
if (qs.get('auto')) { for (let i = 0; i < +qs.get('auto'); i++) $('auto').click(); }
if (qs.get('adv')) qs.get('adv').split(',').forEach(id => { const c = $('adv_' + id); if (c) { c.checked = true; c.dispatchEvent(new Event('change')); } });
if (qs.get('src')) { adv.src = qs.get('src'); render(); }
if (qs.get('rot') && S.rot) { [S.rot.pan, S.rot.tilt, S.rot.roll] = qs.get('rot').split(',').map(Number); render(); }
if (qs.get('lens')) { const [a, b] = qs.get('lens').split(',').map(Number); S.sx = a / 100; S.sy = b / 100; render(); }
if (qs.get('pop')) document.querySelector(`.info[data-h=${qs.get('pop')}]`).click();
if (qs.get('scroll')) $('params').scrollTop = 1e5;
if (qs.get('simdrag')) {
  const [dx, dy] = qs.get('simdrag').split(',').map(Number), h = document.querySelector('#svgFace .handle'), svg = $('svgFace');
  if (h) {
    const rc = h.getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2, k = svg._F.k, c0 = lastR.q.centroid;
    const ev = (t, px, py) => new PointerEvent(t, { clientX: px, clientY: py, pointerId: 1, bubbles: true });
    h.dispatchEvent(ev('pointerdown', x, y)); svg.dispatchEvent(ev('pointermove', x + dx, y + dy));
    const c1 = lastR.q.centroid; svg.dispatchEvent(ev('pointerup', x + dx, y + dy));
    document.body.dataset.sim = JSON.stringify({ wantX: dx / k, wantZ: -dy / k, gotX: c1[0] - c0[0], gotZ: c1[1] - c0[1], sx: S.sx, sy: S.sy, x: S.x, z: S.z, rot: S.rot });
  } else document.body.dataset.sim = 'no handle';
}
if (qs.get('warn')) { warnOpen = true; render(); }
if (qs.get('full')) toggleFull(document.querySelector('.card.' + qs.get('full')), true);
if (qs.get('details')) { tab = qs.get('details'); selRow = +qs.get('row') || 1; $('detBtn').click(); }
})();
