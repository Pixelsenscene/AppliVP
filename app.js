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
const S = { vp: 'VP1', sw: 4, sh: 2.25, x: 0, y: 9, z: 1.5, zoom: 50, sx: 0, sy: 0, oy: 0, rot: null, aim: null };   // sx, sy : lens shift · oy : throw offset · rot : orientation manuelle {pan, tilt, roll} · aim : point visé sur l'écran [x, z] (null = centre)
const st = { chain: true, aspect: 16 / 9 };
// verrouillé = true. Par défaut : projecteur et écran figés, position + zoom libres.
const locks = { vp: true, sw: true, sh: true, x: false, y: false, z: false, zoom: false };

/* blocs déployés au démarrage */
const OPEN = { vp: true, ecran: true, pos: true, zoom: true, adv: true };
const PARAMS = {
  sw:   { label: 'Largeur',        min: 0.5, max: 20, step: 0.05, unit: 'm' },
  sh:   { label: 'Hauteur',        min: 0.3, max: 12, step: 0.05, unit: 'm' },
  y:    { label: 'Recul (y)',      min: 0.5, max: 30, step: 0.05, unit: 'm' },
  x:    { label: 'Centrage (x)',   min: -10, max: 10, step: 0.05, unit: 'm' },
  z:    { label: 'Hauteur (z)',    min: -3,  max: 10, step: 0.05, unit: 'm' },
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
/* appui maintenu 1 s sur n'importe quel bloc : tous les blocs se réduisent (si le bloc pressé est déployé) ou se déploient (s'il est réduit) */
let suppressFold = false;
function attachFoldAll(card) {
  let timer = 0, p0 = null;
  const stop = () => { clearTimeout(timer); timer = 0; };
  card.addEventListener('pointerdown', e => {
    if (e.target.closest('button, select, input, option, label')) return;      // pas sur les commandes
    p0 = [e.clientX, e.clientY];
    timer = setTimeout(() => {
      timer = 0; suppressFold = true; setTimeout(() => suppressFold = false, 600);
      const collapse = !card.classList.contains('collapsed');      // d'après le bloc pressé
      document.querySelectorAll('#params .card').forEach(c => c.classList.toggle('collapsed', collapse));
    }, 1000);
  });
  card.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - p0[0], e.clientY - p0[1]) > 10) stop(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => card.addEventListener(t, stop));
  card.addEventListener('contextmenu', e => { if (timer || suppressFold) e.preventDefault(); });
}
function buildParams() {
  const box = $('params'); box.innerHTML = '';
  const colL = document.createElement('div'), colR = document.createElement('div'); colL.className = colR.className = 'pcol';      // 2 piles en affichage réglages, transparentes sinon
  for (const g of GROUPS) {
    const card = document.createElement('div'); card.className = 'card'; card.dataset.g = g.id;
    card.innerHTML = `<h2><span class="chev"></span>${g.title}<span class="hsp"></span>${g.id === 'ecran' ? '<button class="lk chainBtn" id="chain" title="Largeur / hauteur liées">🔗</button>' : ''}<button class="lk" data-g="${g.id}" title="Verrouiller / libérer le groupe"></button></h2>`;
    if (g.id === 'ecran') card.insertAdjacentHTML('beforeend', `<div class="vpsel" id="scrsel"><button class="sq" id="sprev">◀</button><select id="scrsel_s"></select><button class="sq" id="snext">▶</button></div>`);
    if (g.id === 'vp') {
      card.insertAdjacentHTML('beforeend', `<div class="vpsel" id="vpsel"><button class="sq" id="vprev">◀</button><select id="vpsel_s"></select><button class="sq" id="vnext">▶</button></div><div class="sub" id="vpinfo"></div>`);
    } else for (const k of g.keys) {
      const p = PARAMS[k];
      card.insertAdjacentHTML('beforeend', `<div class="row" data-k="${k}">
        <div class="rt"><label>${p.label}${k === 'zoom' ? ' · ratio <b id="o_ratio"></b>' : ''}</label><input class="val" id="o_${k}" data-k="${k}" type="text" inputmode="${k === 'x' ? 'text' : 'decimal'}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="ctl"><button class="lk" data-k="${k}"></button><button data-s="${k}" data-d="-1">−</button><input type="range" id="${k}" min="${p.min}" max="${p.max}" step="${p.step}"><button data-s="${k}" data-d="1">+</button></div></div>`);
    }
    if (!OPEN[g.id]) card.classList.add('collapsed');
    /* bloc réduit / déployé ; le chemin de l'événement est lu tel quel car le bouton cadenas redessine son icône pendant le clic (la cible n'est alors plus dans la page) */
    card.querySelector('h2').onclick = e => {
      if (suppressFold) { suppressFold = false; return; }
      if (!e.composedPath().some(n => n.tagName === 'BUTTON')) card.classList.toggle('collapsed');
    };
    attachFoldAll(card);
    (g.id === 'vp' || g.id === 'ecran' ? colL : colR).append(card);
  }
  box.append(colL, colR);
  const sel = $('vpsel_s'); fillVpSelect();
  sel.onchange = () => { S.vp = sel.value; render(); };
  const cyc = d => { const k = Object.keys(VPS); S.vp = k[(k.indexOf(S.vp) + d + k.length) % k.length]; render(); };
  $('vprev').onclick = () => cyc(-1); $('vnext').onclick = () => cyc(1);
  /* écran : liste de départ ; modifier largeur / hauteur ensuite le fait passer en « Personnalisé » */
  const ssel = $('scrsel_s'), SCR = window.SCREEN_DATA || [];
  ssel.innerHTML = '<option value="">Personnalisé</option>' + SCR.map(p => `<option value="${p.id}">${p.name} · ${fm(p.sw)} × ${fm(p.sh)} m</option>`).join('');
  const pickScr = id => {
    const p = SCR.find(x => x.id === id); if (!p) { render(); return; }
    S.sw = clampP('sw', p.sw); S.sh = clampP('sh', p.sh); if (st.chain) st.aspect = S.sw / S.sh; render();
  };
  ssel.onchange = () => pickScr(ssel.value);
  const scyc = d => { const i = SCR.findIndex(p => p.id === ssel.value); pickScr(SCR[(i < 0 ? (d > 0 ? 0 : SCR.length - 1) : (i + d + SCR.length) % SCR.length)].id); };
  $('sprev').onclick = () => scyc(-1); $('snext').onclick = () => scyc(1);

  box.querySelectorAll('input[type=range]').forEach(i => i.oninput = () => setParam(i.id, +i.value));
  box.querySelectorAll('.ctl button[data-s]').forEach(b => b.onclick = () => {
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
  /* toucher un réglage verrouillé (curseur, valeur, libellé, listes) : message sous les icônes de la vue de face */
  box.addEventListener('pointerdown', e => { if (e.target.closest('.row.locked') && !e.target.closest('.lk') || e.target.closest('.vpsel.locked')) lockMsg(); });
}
function toggleGroup(id) {
  const g = GROUPS.find(x => x.id === id), lock = groupState(g) !== 'locked';
  g.keys.forEach(k => locks[k] = lock); render();
}
function setParam(k, v) {
  if (locks[k]) { lockMsg(); render(); return; }          // le curseur revient à sa place
  S[k] = clampP(k, v);
  if (effChain()) { if (k === 'sw') S.sh = clampP('sh', S.sw / st.aspect); if (k === 'sh') S.sw = clampP('sw', S.sh * st.aspect); }
  reaim(); render();
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
  $('scrsel').classList.toggle('locked', locks.sw || locks.sh);
}

/* ---------- Optique avancée : A lens shift · B translation · C rotation · throw offset ---------- */
const adv = { ref: 'auto', zoom: false, lens: false, trans: false, rot: false, src: 'std', off: false, offV: 0, offEdited: false, drag: null, _vp: null };
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
const advRowHtml = r => `<div class="row" data-a="${r.id}"><div class="rt"><label>${r.label}</label><input class="val" id="a_o_${r.id}" type="text" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
  <div class="ctl"><button data-a="${r.id}" data-d="-1">−</button><input type="range" id="a_${r.id}" step="${r.step}"><button data-a="${r.id}" data-d="1">+</button></div><div class="rw" id="a_w_${r.id}"></div></div>`;
const AIM_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>';
const optHtml = (id, tag, name, help) => `<div class="opt"><label><input type="checkbox" id="adv_${id}"><span>${name}</span></label>${id === 'rot' ? `<button class="aimMini" data-t="Viser le centre de l’écran" aria-label="Viser le centre de l’écran">${AIM_ICON}</button>` : ''}<button class="info" data-h="${help}" aria-label="Aide">i</button></div>`;

function buildAdv(box) {
  const rows = g => ADV_ROWS.filter(r => r.grp === g).map(advRowHtml).join('');
  const card = document.createElement('div'); card.className = 'card'; card.id = 'advCard';
  card.innerHTML = `<h2><span class="chev"></span>Optique avancée</h2>
    <div class="advItem">${optHtml('lens', 'A', 'Lens shift', 'lens')}
    <div class="grp" id="g_lens">
      <div class="radios" id="lensSrc">${[['maker', 'Constructeur'], ['std', 'Standard'], ['free', 'Libre']].map(([v, t]) => `<label><input type="radio" name="lsrc" value="${v}"><span>${t}</span></label>`).join('')}<button class="info" data-h="src" aria-label="Aide">i</button></div>
      <div class="sub" id="lensHint"></div>${rows('lens')}</div></div>
    <div class="advItem">${optHtml('trans', 'B', 'Translation du VP', 'trans')}
    <div class="grp" id="g_trans"><div class="sub">Orientation figée : les curseurs x, y, z (et la vue de côté / dessus) déplacent l'image.</div></div></div>
    <div class="advItem">${optHtml('rot', 'C', 'Rotation du VP', 'rot')}
    <div class="grp" id="g_rot">${rows('rot')}</div></div>
    <div class="advItem">${optHtml('off', '', 'Throw offset', 'off')}
    <div class="grp" id="g_off"><div class="sub" id="offHint"></div>${rows('off')}</div></div>`;
  if (!OPEN.adv) card.classList.add('collapsed');
  card.querySelector('h2').onclick = () => { if (suppressFold) { suppressFold = false; return; } card.classList.toggle('collapsed'); };
  attachFoldAll(card);
  box.append(card);

  const chk = (id, fn) => $('adv_' + id).onchange = e => { fn(e.target.checked); render(); };
  chk('lens', on => setOpt('lens', on));
  chk('trans', on => setOpt('trans', on));
  chk('rot', on => setOpt('rot', on));
  chk('off', on => { adv.off = on; adv.offEdited = false; adv.offV = on ? G.throwOffsetOf(vpOf()).value : 0; });
  card.querySelectorAll('input[name=lsrc]').forEach(i => i.onchange = () => { adv.src = i.value; render(); });
  card.querySelector('.aimMini').onclick = () => { S.aim = null; if (adv.trans || adv.rot) S.rot = G.autoAim(S); render(); };

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
/* Coche / décoche A, B ou C (cases de la vue de face et du menu) ; ne change pas l'option agissante, sauf pour la retirer si on la décoche. */
function setOpt(k, on) {
  if (adv[k] === on) return;
  adv[k] = on;
  if (!on && adv.drag === k) adv.drag = null;
  syncRot();
}
/* Visée : automatique (centrée sur l'écran) tant que ni B ni C n'est cochée ; sinon orientation manuelle, figée à la première activation */
/* vues de côté / dessus et curseurs x, y, z : le VP pivote pour continuer à viser le même point de l'écran
   (le centre de l'écran, ou le point où l'axe tombait après un réglage manuel dans la vue de face) */
function reaim() { if (S.rot) S.rot = { ...G.autoAim(S), roll: S.rot.roll || 0 }; }
function syncRot() {
  if (adv.trans || adv.rot) { if (!S.rot) S.rot = G.autoAim(S); }      // B ou C cochée : la visée est figée (réglage « brut »)
  else { S.rot = null; S.aim = null; }                                 // ni B ni C : visée automatique, le VP pivote pour garder le faisceau centré sur l'écran
}
/* cohérence de l'état avant calcul : changement de VP, limites du lens shift, throw offset effectif */
function syncAdv() {
  const v = vpOf();
  if (adv._vp !== S.vp) {
    adv._vp = S.vp;
    if (adv.off) { adv.offV = G.throwOffsetOf(v).value; adv.offEdited = false; }
  }
  if (adv.src === 'maker' && !G.hasMakerLens(v)) adv.src = 'std';
  if (adv.lens && adv.src !== 'free') {
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
const DRAG_OPTS = [   // [id, nom, icône, couleur]
  ['lens', 'Lens Shift', '<path opacity=".5" d="M8.5 9.5H7.3a1.8 1.8 0 0 0-1.8 1.8v3.9A1.8 1.8 0 0 0 7.3 17h6.4a1.8 1.8 0 0 0 1.8-1.8v-.9"/><rect x="8.5" y="6.8" width="10" height="7.5" rx="1.8"/><path d="M12 4.4V1.8M10.4 3.4 12 1.8l1.6 1.6M12 19.6v2.6M10.4 20.8 12 22.4l1.6-1.6M4.4 12H1.8M3.2 10.4 1.6 12l1.6 1.6M19.6 12h2.6M20.8 10.4 22.4 12l-1.6 1.6"/>', '#0fbcd6'],
  ['trans', 'Translation', '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>', '#0fd683'],
  ['rot', 'Rotation', '<circle cx="12" cy="12" r="9.5"/><ellipse cx="12" cy="12" rx="4.4" ry="9.5"/><path d="M2.5 12A9.5 4 0 0 1 9.6 8.2M21.5 12A9.5 4 0 0 0 14.4 8.2M2.5 12A9.5 4 0 0 0 9.6 15.8M21.5 12A9.5 4 0 0 1 14.4 15.8"/><path fill="currentColor" stroke-width=".6" d="M11.2 7.9 14.6 6.3v3.2zM12.8 16.1 9.4 14.5v3.2z"/>', '#d6620f'],
  ['zoom', 'Zoom', '<circle cx="12" cy="12" r="9.5"/><path d="M8.7 17.6V9.2M15.3 6.4v8.4"/><path fill="currentColor" stroke-width=".8" d="M8.7 5.4 5.6 9.4h6.2zM15.3 18.6l-3.1-4h6.2z"/>', '#f2c94c']];
const dragMode = () => adv.drag && adv[adv.drag] && (adv.drag !== 'zoom' || vpOf().zoomable) ? adv.drag : null;   // option agissant au glisser : une seule, toujours cochée, ou aucune
let dmT = 0;
const lockMsg = () => dragMsg('Ce paramètre a été verrouillé', true);
function dragMsg(text, lock) {        /* petit message centré sous les icônes de la vue de face */
  const m = $('dragSel').querySelector('.dmsg'); if (!m) return; m.textContent = text; m.classList.add('show'); m.classList.toggle('lock', !!lock);
  clearTimeout(dmT); dmT = setTimeout(() => m.classList.remove('show'), 2800);
}
function drawDragSel(r) {
  const cur = dragMode(), box = $('dragSel');
  if (box.querySelectorAll('button[data-m]').length !== DRAG_OPTS.length)      /* construit une fois : l'icône active doit survivre aux rafraîchissements pendant le glisser */
    box.innerHTML = '<button class="aimBtn" data-t="Viser le centre de l’écran" aria-label="Viser le centre de l’écran"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></button>' + DRAG_OPTS.map(([k, t, ic, c]) => `<button data-m="${k}" data-t="${t}" style="--c:${c}" aria-label="${t}"><svg viewBox="0 0 24 24">${ic}</svg><span class="arws"><i></i><i></i><i></i><i></i></span></button>`).join('') + '<div class="dmsg"></div>';
  /* mire : grisée quand l'axe du faisceau tombe déjà sur le centre de l'écran */
  const centered = r && r.valid && Math.abs(r.B.T[0]) < 0.01 && Math.abs(r.B.T[2] - S.sh / 2) < 0.01;
  box.querySelector('.aimBtn').classList.toggle('idle', !!centered);
  document.querySelectorAll('.aimMini').forEach(b => b.classList.toggle('idle', !!centered));
  box.querySelectorAll('button[data-m]').forEach(b => {
    const k = b.dataset.m;
    b.className = (k === cur ? 'on' : adv[k] && (k !== 'zoom' || vpOf().zoomable) ? 'chk' : 'off')
      ;
    if (k === 'zoom') {                                   // flèches jaunes (0, 1 ou 2 par sens) selon la course restante
      const lvl = r => locks.zoom || r <= 0 ? 0 : r < 0.5 ? 1 : 2;
      b.dataset.zu = lvl(S.zoom / 100); b.dataset.zd = lvl((100 - S.zoom) / 100);
    }
  });
  $('refSel').dataset.r = adv.ref;
  $('refSel').textContent = 'Référence = ' + { vp: 'VP', ecran: 'écran', auto: 'auto' }[adv.ref];
  $('faceTag').textContent = cur ? 'Vue de face · glisser l’icône active' : 'Vue de face (écran)';
}
/* Mouvement du faisceau : on appuie sur une icône (ou sur le cercle clignotant) et on glisse. Appui sur une icône = l'active et coche l'option ; double clic = la désélectionne et décoche l'option. */
function attachFaceDrag() {
  const box = $('dragSel'), fsvg = $('svgFace'); let st0 = null, p0 = null, F = null, moved = false;
  const begin = (e, k, freezeFace) => {
    const ok = lastR && lastR.valid && fsvg._F;
    F = fsvg._F; p0 = [e.clientX, e.clientY]; moved = false;
    if (ok && freezeFace) frozen.svgFace = F;          /* glisser le cercle : le repère de la vue de face reste figé sous le doigt (pas avec les icônes) */
    const q = ok ? lastR.q : null;
    dragNow = k; render();
    st0 = { m: k, ok, zoom: S.zoom, sx: S.sx, sy: S.sy, x: S.x, z: S.z, rot: S.rot && { ...S.rot },
      Wb: q ? (q.sides.AB + q.sides.CD) / 2 : 1, Hb: q ? (q.sides.BC + q.sides.DA) / 2 : 1, dist: ok ? lastR.B.dist : 1 };
  };
  const move = e => {
    if (!st0) return;
    const px = e.clientX - p0[0], py = e.clientY - p0[1];
    if (!moved && Math.hypot(px, py) < 6) return;
    moved = true;
    if (!st0.ok || !F) return;
    const g = adv.ref === 'vp' ? -1 : 1;                 // référence VP : la main tient l'écran, qui bouge par rapport au faisceau fixe → effet inverse sur le faisceau
    const dx = g * px / F.k, dz = -g * py / F.k, cl = (v, [a, b]) => Math.max(a, Math.min(b, v));       // pixels → mètres dans le plan de l'écran
    if (st0.m === 'lens') {
      const lh = adv.src === 'free' ? [-5, 5] : lensRange('h'), lv = adv.src === 'free' ? [-5, 5] : lensRange('v');
      S.sx = Math.round(cl(st0.sx + dx / st0.Wb, lh) * 200) / 200; S.sy = Math.round(cl(st0.sy + dz / st0.Hb, lv) * 200) / 200;
    } else if (st0.m === 'zoom') {                                       // glisser vers la droite = faisceau plus grand (zoom % plus faible)
      if (locks.zoom) { if (Math.abs(px) > 4) lockMsg(); } else S.zoom = clampP('zoom', Math.round(st0.zoom - px * 0.5));
    } else if (st0.m === 'trans') {
      if (!locks.x) S.x = clampP('x', Math.round((st0.x + dx) * 100) / 100); else if (Math.abs(dx) > 0.02) lockMsg();
      if (!locks.z) S.z = clampP('z', Math.round((st0.z + dz) * 100) / 100); else if (Math.abs(dz) > 0.02) lockMsg();
    } else if (st0.m === 'rot' && S.rot) {
      S.rot.pan = Math.round(cl(st0.rot.pan + deg(Math.atan2(dx, st0.dist)), [-89, 89]) * 10) / 10;
      S.rot.tilt = Math.round(cl(st0.rot.tilt + deg(Math.atan2(dz, st0.dist)), [-89, 89]) * 10) / 10;
    }
    render();
  };
  const end = () => { if (!st0) return; st0 = null; dragNow = null; delete frozen.svgFace; render(); };
  $('refSel').onclick = () => { adv.ref = { vp: 'ecran', ecran: 'auto', auto: 'vp' }[adv.ref]; render(); };      /* VP → écran → auto → VP */
  box.addEventListener('click', e => {      /* mire : la visée revient au centre de l'écran (comme « Viser le centre de l'écran » de l'option C) */
    if (!e.target.closest('.aimBtn') || e.target.closest('.aimBtn.idle')) return;
    S.aim = null; if (adv.trans || adv.rot) S.rot = G.autoAim(S); render();
  });
  box.ondblclick = e => { const b = e.target.closest('button[data-m]'); if (b) { setOpt(b.dataset.m, false); render(); } };
  box.addEventListener('pointerdown', e => {
    const b = e.target.closest('button[data-m]'); if (!b) return;
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
    const k = b.dataset.m;
    if (k === 'zoom' && !vpOf().zoomable) { dragMsg('Focale fixe : zoom indisponible pour ce VP'); return; }
    setOpt(k, true); adv.drag = k; render();
    begin(e, k, false);
  });
  fsvg.addEventListener('pointerdown', e => {
    const k = dragMode();
    if (!k || !e.target.closest('.handle') || !lastR || !lastR.valid) return;
    e.preventDefault(); try { fsvg.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
    begin(e, k, false);       /* le cadrage suit la taille faisceau + écran pendant le glisser : rien ne sort de la vue */
  });
  for (const t of [box, fsvg]) { t.addEventListener('pointermove', move); t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end); }
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
/* affichage réglages : les autres indicateurs, sous forme de pastilles à la suite de l'état */
function cfgInfoHtml(r) {
  const pill = (c, label, val) => `<div class="stat"><i style="background:${c}"></i><span>${label} : <b>${val}</b></span></div>`;
  return pill(COVER_OK, 'Pixels utiles', `${fm(r.px.usefulPct, 1)} % · ${fi(r.px.useful)} px`)
    + pill('#3a4654', 'Ratio', fm(r.ratio) + ':1') + pill('#3a4654', 'Éclairement', fi(r.lux) + ' lx')
    + pill('#3a4654', 'Forme', r.q.shape.split(' (')[0].replace('Quadrilatère quelconque', 'Quelconque'));
}
function drawStatus(r) {
  const n = warns.length;
  $('status').innerHTML = statusHtml(r) + (r.valid && $('p-calc').classList.contains('cfg') ? cfgInfoHtml(r) : '') + (n ? `<button class="stat warnPill ${warnOpen ? 'open' : ''}" id="warnBtn"><i></i><span>${n} alerte${n > 1 ? 's' : ''}</span></button>` : '');
  const box = $('warnBox'); box.classList.toggle('hidden', !n || !warnOpen);
  box.innerHTML = warnOpen ? warns.map(w => `<div><span>${w.text}</span>${w.key ? `<small>${({ sx: 'Lens shift H', sy: 'Lens shift V', lensSrc: 'Lens shift', oy: 'Throw offset', pan: 'Pan', tilt: 'Tilt', roll: 'Roll' })[w.key]}</small>` : ''}</div>`).join('') : '';
}
$('status').onclick = e => { if (e.target.closest('#warnBtn')) { warnOpen = !warnOpen; drawStatus(lastR); } };

/* ---------- Vue de face ---------- */
function drawFace(r) {
  const svg = $('svgFace'); if (!r.valid) { svg.replaceChildren(); return; }
  const Q = r.B.quad, xs = Q.map(p => p[0]).concat(-S.sw / 2, S.sw / 2), ys = Q.map(p => p[1]).concat(0, S.sh);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (!isThumb(svg) && !$('p-calc').classList.contains('cfg')) y1 += 0.3 * (y1 - y0);      // réserve de la place en haut pour les icônes de mouvement (en petit elles sont en bas à gauche)
  if (adv.ref !== 'auto') {      /* référence VP : le faisceau reste au centre de la vue, l'écran bouge · référence écran : l'écran reste au centre, le faisceau bouge */
    const c = adv.ref === 'vp' ? r.q.centroid : [0, S.sh / 2];
    const hx = Math.max(c[0] - x0, x1 - c[0]), hy = Math.max(c[1] - y0, y1 - c[1]);
    [x0, x1, y0, y1] = [c[0] - hx, c[0] + hx, c[1] - hy, c[1] + hy];
  }
  const F = viewFrame(svg, [x0, x1, y0, y1]); gridLines(svg, F, x0 - 1, x1 + 1, y0 - 1, y1 + 1);
  const sx = F.X(-S.sw / 2), sy = F.Y(S.sh), sW = F.X(S.sw / 2) - sx, sH = F.Y(0) - sy;
  const lvl = verdict(r).lvl;
  svg.append(el('defs', {}), (() => { const d = el('defs', {});
    d.innerHTML = `<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#12161b"/><line x1="0" y1="0" x2="0" y2="8" stroke="#2b3440" stroke-width="3"/></pattern><clipPath id="scrClip"><rect x="${sx}" y="${sy}" width="${sW}" height="${sH}"/></clipPath>`; return d; })());
  svg.append(el('rect', { x: sx, y: sy, width: sW, height: sH, fill: 'url(#hatch)' }));                       // écran non couvert
  svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(255,93,93,.28)' }));                             // faisceau (perdu)
  svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(62,207,142,.42)', 'clip-path': 'url(#scrClip)' })); // faisceau ∩ écran (utile)
  svg.append(el('rect', { x: sx, y: sy, width: sW, height: sH, fill: 'none', stroke: COL[lvl], 'stroke-width': 3 }));
  svg.append(el('polygon', { points: pts(F, Q), fill: 'none', stroke: '#4da3ff', 'stroke-width': 2, class: 'bglow' }));
  ['A', 'B', 'C', 'D'].forEach((n, i) => {
    const p = Q[i], ox = i === 0 || i === 3 ? -12 : 12, oy = i < 2 ? -8 : 16;
    svg.append(el('circle', { cx: F.X(p[0]), cy: F.Y(p[1]), r: 3.5, fill: '#4da3ff' }));
    svg.append(el('text', { x: F.X(p[0]) + ox, y: F.Y(p[1]) + oy, 'text-anchor': 'middle', fill: '#9cc9ff', 'font-size': 13, 'font-weight': 700 }, n));
  });
  const cx = F.X(r.B.T[0]), cy = F.Y(r.B.T[2]);                                                               // point visé par l'axe optique
  svg.append(el('path', { d: `M${cx - 7},${cy}H${cx + 7}M${cx},${cy - 7}V${cy + 7}`, stroke: '#fff', 'stroke-width': 1.5, opacity: .7 }));
  if (sW > 130 && sy > 34) svg.append(el('text', { x: F.X(0), y: sy - 8, 'text-anchor': 'middle', fill: '#e8edf2', 'font-size': 13 }, `${fm(S.sw)} × ${fm(S.sh)} m`));   // pas de cote si elle chevauche les lettres A/B ou le titre de la vue
  const dm = dragMode();
  if (dm && !isThumb(svg)) {                                                       // poignée au centre de l'image : glisser = déplacer le faisceau
    const g = r.q.centroid, free = dm !== 'trans' || !locks.x || !locks.z, hx = F.X(g[0]), hy = F.Y(g[1]);
    svg.append(el('circle', { cx: hx, cy: hy, r: 17, fill: 'none', stroke: free ? DRAG_OPTS.find(o => o[0] === dm)[3] : '#b58cff', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: .85, class: 'blink', 'pointer-events': 'none' }));
    if (free) svg.append(el('circle', { class: 'handle', cx: hx, cy: hy, r: 30, fill: 'transparent' }));
  }
  if (isThumb(svg)) {                                                            // petite vue : dimensions du faisceau + angles aux sommets
    const q = r.q, inw = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    ['A', 'B', 'C', 'D'].forEach((n, i) => val(svg, F.X(Q[i][0]) + inw[i][0] * 6, F.Y(Q[i][1]) + inw[i][1] * 16, `${fm(q.angles[n], 1)}°`, inw[i][0] > 0 ? 'start' : 'end', '#9cc9ff', 11));
    val(svg, F.X(0), F.Y(0) + 4 + 16 * 1, `faisceau ${fm(q.widthTrap)} × ${fm(q.heightTrap)} m`, 'middle', '#9cc9ff', 12);
  }
  if (dragNow) { const o = DRAG_OPTS.find(o => o[0] === dragNow);      // nom du mouvement, tant que l'icône est tenue
    svg.append(el('text', { x: F.X(0), y: Math.min(F.H - 8, F.Y(0) + (isThumb(svg) ? 44 : 24)), 'text-anchor': 'middle', fill: o[3], 'font-size': 14, 'font-weight': 700, stroke: '#0f1216', 'stroke-width': 4, 'paint-order': 'stroke' }, o[1])); }
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
/* carré du VP pivoté de l'angle donné (degrés) quand l'orientation est manuelle (B ou C) ; droit en visée automatique */
const vpTilt = (cx, cy, deg) => S.rot ? { transform: `rotate(${deg} ${cx} ${cy})` } : {};
function drawSide(r) {
  const svg = $('svgSide'); if (!r.valid) { svg.replaceChildren(); return; }
  const top = G.rayHit(r.B, 0, 1), bot = G.rayHit(r.B, 0, -1);
  const maxz = Math.max(S.sh, S.z, top[1]) + 0.2, minz = Math.min(0, bot[1], S.z);          // le VP peut passer sous la ligne du sol (z < 0)
  const F = viewFrame(svg, [-0.3, Math.max(S.y * 1.25, S.y + 2), minz - 0.2, maxz + Math.max(1, 0.2 * maxz)], 0.3);
  const [bx0, bx1] = F.b; gridLines(svg, F, ...F.b);
  svg.append(el('line', { x1: F.X(bx0), x2: F.X(bx1), y1: F.Y(0), y2: F.Y(0), stroke: '#556', 'stroke-width': 2 }));
  svg.append(el('polygon', { points: `${F.X(S.y)},${F.Y(S.z)} ${F.X(0)},${F.Y(top[1])} ${F.X(0)},${F.Y(bot[1])}`, fill: 'rgba(77,163,255,.16)', stroke: '#4da3ff', class: 'bglow' }));
  const seg = (a, b, c, w) => svg.append(el('line', { x1: F.X(0), x2: F.X(0), y1: F.Y(a), y2: F.Y(b), stroke: c, 'stroke-width': w }));
  seg(bot[1], top[1], LOST, 7);                                                                                  // empreinte du faisceau
  seg(Math.max(0, bot[1]), Math.min(S.sh, top[1]), USEFUL, 7);                                                   // partie utile
  svg.append(el('line', { x1: F.X(0), x2: F.X(0), y1: F.Y(0), y2: F.Y(S.sh), stroke: '#fff', 'stroke-width': 1.5, opacity: .6 }));
  svg.append(el('line', { x1: F.X(S.y), y1: F.Y(S.z), x2: F.X(0), y2: F.Y(r.B.T[2]), stroke: '#fff', 'stroke-dasharray': '4 4', opacity: .5 }));
  svg.append(el('rect', { x: F.X(S.y) - 8, y: F.Y(S.z) - 6, width: 16, height: 12, rx: 2, fill: '#4da3ff', ...vpTilt(F.X(S.y), F.Y(S.z), Math.atan2(-r.B.w[2], r.B.w[1]) * 180 / Math.PI - 180) }));      // le VP suit son tilt
  if (isBig(svg)) {
    dim(svg, F, [0, 0], [S.y, 0], `y = ${fm(S.y)} m`, [0, 28], [0, 22]);
    dim(svg, F, [S.y, 0], [S.y, S.z], `z = ${fm(S.z)} m`, [34, 0], [10, 5], 'start');
  } else {                                           // hors grand écran : dimensions en gris discret
    val(svg, F.X(S.y / 2), F.Y(0) + 16, `y = ${fm(S.y)} m`, 'middle', '#8b98a6', 11);
    val(svg, F.X(S.y), F.Y(S.z) - 22, `z = ${fm(S.z)} m`, 'middle', '#8b98a6', 11);
    val(svg, 10, F.H - 10, `x = ${fm(S.x)} m`, 'start', '#8b98a6', 11);
  }
  handle(svg, F, S.y, S.z, ['y', 'z']);
}
function drawTop(r) {
  const svg = $('svgTop'); if (!r.valid) { svg.replaceChildren(); return; }
  const L = G.rayHit(r.B, -1, 0), R = G.rayHit(r.B, 1, 0);
  const hx = Math.max(Math.abs(L[0]), Math.abs(R[0]), S.sw / 2, Math.abs(S.x)) * 1.15 + 0.5;
  const F = viewFrame(svg, [-hx, hx, -0.2, Math.max(S.y * 1.25, S.y + 2)], 0.3);
  gridLines(svg, F, ...F.b);
  svg.append(el('polygon', { points: `${F.X(S.x)},${F.Y(S.y)} ${F.X(L[0])},${F.Y(0)} ${F.X(R[0])},${F.Y(0)}`, fill: 'rgba(77,163,255,.16)', stroke: '#4da3ff', class: 'bglow' }));
  const seg = (a, b, c, w) => svg.append(el('line', { x1: F.X(a), x2: F.X(b), y1: F.Y(0), y2: F.Y(0), stroke: c, 'stroke-width': w }));
  seg(L[0], R[0], LOST, 7); seg(Math.max(L[0], -S.sw / 2), Math.min(R[0], S.sw / 2), USEFUL, 7);
  svg.append(el('line', { x1: F.X(-S.sw / 2), x2: F.X(S.sw / 2), y1: F.Y(0), y2: F.Y(0), stroke: '#fff', 'stroke-width': 1.5, opacity: .6 }));
  svg.append(el('line', { x1: F.X(S.x), y1: F.Y(S.y), x2: F.X(r.B.T[0]), y2: F.Y(0), stroke: '#fff', 'stroke-dasharray': '4 4', opacity: .5 }));
  svg.append(el('rect', { x: F.X(S.x) - 8, y: F.Y(S.y) - 6, width: 16, height: 12, rx: 2, fill: '#4da3ff', ...vpTilt(F.X(S.x), F.Y(S.y), Math.atan2(-r.B.w[1], r.B.w[0]) * 180 / Math.PI - 90) }));      // le VP suit son pan
  if (isBig(svg)) {
    dim(svg, F, [S.x, 0], [S.x, S.y], `y = ${fm(S.y)} m`, [34, 0], [10, 5], 'start');
    dim(svg, F, [0, 0], [S.x, 0], `x = ${fm(S.x)} m`, [0, 28], [0, 22]);
  } else {                                           // hors grand écran : dimensions en gris discret
    const xe = Math.max((S.x + L[0]) / 2, (S.x + R[0]) / 2);                  // bord du faisceau à mi-distance : le texte reste à côté, pas dessus
    val(svg, F.X(xe) + 10, F.Y(S.y / 2) + 4, `y = ${fm(S.y)} m`, 'start', '#8b98a6', 11);
    val(svg, F.X(S.x / 2), F.Y(0) + 22, `x = ${fm(S.x)} m`, 'middle', '#8b98a6', 11);
    val(svg, 10, F.H - 10, `z = ${fm(S.z)} m`, 'start', '#8b98a6', 11);
  }
  handle(svg, F, S.x, S.y, ['x', 'y']);
}

/* glisser le VP : horizontal / vertical de la vue -> paramètres (les axes verrouillés ne bougent pas) */
let lastR = null, dragNow = null;      // dragNow : icône en cours de glisser (son nom s'affiche sous l'écran)
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
    axes.forEach((k, i) => { if (!locks[k]) S[k] = clampP(k, Math.round((w[i] + off[i]) * q) / q); else if (Math.abs(w[i] + off[i] - S[k]) > 0.05) lockMsg(); });
    reaim(); render();
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
  if (S.rot && r.valid) S.aim = [r.B.T[0], r.B.T[2]];          // mémorise le point visé (référence pour les déplacements en vue de côté / dessus)
  warns = G.checkSetup(v, S, { lens: adv.lens, src: adv.src, rot: adv.rot, off: adv.off }, r);
  for (const k of Object.keys(PARAMS)) {
    const i = $(k); if (+i.value !== S[k]) i.value = S[k];
    const o = $('o_' + k); o.readOnly = locks[k];
    if (document.activeElement !== o) o.value = k === 'zoom' ? Math.round(S[k]) + ' %' : fm(S[k]) + ' m';
  }
  $('vpsel_s').value = S.vp;
  { const cur = (window.SCREEN_DATA || []).find(p => Math.abs(p.sw - S.sw) < 0.005 && Math.abs(p.sh - S.sh) < 0.005), o = $('scrsel_s');
    o.options[0].textContent = `Personnalisé · ${fm(S.sw)} × ${fm(S.sh)} m`; o.value = cur ? cur.id : ''; }
  $('vpinfo').textContent = `Ratio ${fm(v.rmin)}${v.zoomable ? ' – ' + fm(v.rmax) : ' (fixe)'} · ${v.fw}:${v.fh} · ${v.res} ${v.resW}×${v.resH} · ${fi(v.lm)} lm`;
  $('vpinfo').classList.toggle('warn', !!(v.stdFields && v.stdFields.length));
  if (v.stdFields && v.stdFields.length) $('vpinfo').textContent += ` · ⚠ valeurs standard : ${v.stdFields.join(', ').toLowerCase()}`;
  $('o_ratio').textContent = fm(G.ratioOf(v, S.zoom)) + ':1';
  document.querySelector('.row[data-k=zoom]').style.display = v.zoomable ? '' : 'none';
  $('chain').classList.toggle('on', effChain());
  $('chain').style.opacity = locks.sw || locks.sh ? .4 : 1;
  syncLocks(); drawAdv(); drawDragSel(r);
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
  Object.assign(S, p.S); reaim();
  appliedSig = sig(); rot += 120; $('autoRot').style.transform = `rotate(${rot}deg)`;
  render();
  toast(`Recouvrement faisceau / écran : ${fm(p.score * 100, 1)} %`);
};

/* ---------- Fenêtre annexe : calculs détaillés ---------- */
let tab = 'quad', selRow = 0, triIdx = 0;
const TRI = '#a855f7', TRI_FILL = 'rgba(168,85,247,.28)', SCREEN = '#ff5d5d', BEAM = '#4da3ff';
/* affichage réglages : réglages en grand sur 2 colonnes, les 3 vues en petit sur une ligne au-dessus, bandeau d'indicateurs réduit */
$('cfgBtn').onclick = () => {
  document.querySelectorAll('.viz .card.full').forEach(c => toggleFull(c, false));
  const on = $('p-calc').classList.toggle('cfg'); $('cfgBtn').textContent = on ? 'Vue principale' : 'vue compacte';
  requestAnimationFrame(render);
};
$('detBtn').onclick = () => { $('details').classList.toggle('open'); $('detBtn').classList.toggle('on'); render(); };
document.addEventListener('pointerdown', e => {
  if ($('details').classList.contains('open') && !e.target.closest('#details, #detBtn')) { $('details').classList.remove('open'); $('detBtn').classList.remove('on'); }
});
$('detFull').onclick = () => { const f = $('details').classList.toggle('full'); $('detFull').textContent = f ? '⤡' : '⤢'; $('detFull').title = f ? 'Quitter le plein écran' : 'Plein écran'; renderDetails(G.compute(vpOf(), S)); };
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
    svg.append(el('rect', { x: F.X(-S.sw / 2), y: F.Y(S.sh), width: F.k * S.sw, height: F.k * S.sh, fill: 'rgba(255,93,93,.10)', stroke: '#ff5d5d', 'stroke-width': 1.5 }));
    svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(77,163,255,.14)', stroke: '#4da3ff', class: 'bglow', 'stroke-width': 1.5 }));
  };
  const tabs = {};

  /* --- Faisceau (quadrilatère) --- */
  const sd = [['AB', 0, 1], ['BC', 1, 2], ['CD', 2, 3], ['DA', 3, 0]];
  tabs.quad = {
    label: 'Faisceau', views: [{ b: faceBounds(), draw: (svg, F) => { faceBase(svg, F); N.forEach((n, i) => lbl(svg, F, Q[i], n, i === 0 || i === 3 ? -11 : 11, i < 2 ? -8 : 16)); } }],
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

  /* --- Triangles rectangles : toujours montrés en contexte (écran rouge, faisceau bleu, triangle violet) --- */
  const hp = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
  const P3 = (x, y, z) => [x, y, z];
  const proj = { face: p => [p[0], p[2]], side: p => [p[1], p[2]], top: p => [p[0], -p[1]] };   /* dessus : y inversé → écran en haut, VP en bas */
  const kindName = { face: 'face', side: 'côté', top: 'dessus' };
  const Qx = Q.map(p => p[0]), Qz = Q.map(p => p[1]);
  const triView = (kind, T) => {
    const pp = T.map(t => proj[kind](t.p));
    const base = { face: [[-S.sw / 2, 0], [S.sw / 2, S.sh], ...Q], side: [[0, 0], [0, S.sh], ...Q.map(p => [0, p[1]])], top: [[-S.sw / 2, 0], [S.sw / 2, 0], [Math.min(...Qx), 0], [Math.max(...Qx), 0]] }[kind];
    const all = base.concat(pp), xs = all.map(a => a[0]), ys = all.map(a => a[1]);
    return { t: kind, b: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], draw: (svg, F) => {
      const ln = (x1, y1, x2, y2, c, w = 3) => svg.append(el('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': w, 'stroke-linecap': 'butt', class: c === BEAM ? 'bglow' : '' }));
      if (kind !== 'top') ln(F.X(F.b[0]), F.Y(0), F.X(F.b[1]), F.Y(0), '#556', 1.5);
      if (kind === 'face') {
        svg.append(el('rect', { x: F.X(-S.sw / 2), y: F.Y(S.sh), width: F.k * S.sw, height: F.k * S.sh, fill: 'rgba(255,93,93,.12)', stroke: SCREEN, 'stroke-width': 2 }));
        svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(77,163,255,.18)', stroke: BEAM, class: 'bglow', 'stroke-width': 2 }));
      } else if (kind === 'side') {
        ln(F.X(0) - 1.5, F.Y(0), F.X(0) - 1.5, F.Y(S.sh), SCREEN); ln(F.X(0) + 1.5, F.Y(Math.min(...Qz)), F.X(0) + 1.5, F.Y(Math.max(...Qz)), BEAM);
      } else {
        ln(F.X(-S.sw / 2), F.Y(0) - 1.5, F.X(S.sw / 2), F.Y(0) - 1.5, SCREEN); ln(F.X(Math.min(...Qx)), F.Y(0) + 1.5, F.X(Math.max(...Qx)), F.Y(0) + 1.5, BEAM);
      }
      svg.append(el('polygon', { points: pts(F, pp), fill: TRI_FILL, stroke: TRI, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      T.forEach((t, i) => lbl(svg, F, proj[kind](t.p), t.n, 0, i === 1 ? 17 : -9, '#e2ccff'));
    } };
  };
  /* T = [A, P, C] avec l'angle droit en P (= T[1]) */
  const triangle = (title, note, T, kinds, [d01, d12, d02]) => {
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const ang = (i) => { const o = T[i].p, u = T[(i + 1) % 3].p, w = T[(i + 2) % 3].p, a = u.map((c, k) => c - o[k]), b = w.map((c, k) => c - o[k]);
      return Math.acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b))) * 180 / Math.PI; };
    const side = (i, j, d) => L(`${T[i].n}–${T[j].n}`, d, fm(dist(T[i].p, T[j].p)) + ' m', kinds.map((k, vi) => seg(proj[k](T[i].p), proj[k](T[j].p), vi)));
    const corner = i => L('∠' + T[i].n, 'angle en ' + T[i].n, fm(ang(i), 1) + '°', kinds.map((k, vi) => ({ k: 'pt', p: proj[k](T[i].p), vw: vi })));
    return { label: 'Triangle', title, ok: dist(T[0].p, T[1].p) > 1e-3 && dist(T[1].p, T[2].p) > 1e-3, views: kinds.map(k => triView(k, T)), rows: [
      { sec: title },
      L(T[1].n, note, '90°', kinds.map((k, vi) => ({ k: 'pt', p: proj[k](T[1].p), vw: vi }))),
      side(0, 1, d01), side(1, 2, d12), side(0, 2, d02),
      { sec: 'Angles' }, corner(0), corner(2),
    ] };
  };
  const VP3 = P3(S.x, S.y, S.z), F3 = P3(S.x, 0, S.z), VPn = { n: 'VP', p: VP3 }, Pn = { n: 'P', p: F3 };
  const noteP = 'P = point de l’écran juste en face du VP (la perpendiculaire VP→écran y arrive à angle droit)';
  const far = (pts2, f) => pts2.reduce((m, p, i) => hp([S.x, S.z], p) > hp([S.x, S.z], pts2[m]) ? i : m, 0);
  const toP = (name, p2, desc) => triangle(`VP · P · ${desc}`, noteP, [VPn, Pn, { n: name, p: P3(p2[0], 0, p2[1]) }], ['side', 'face', 'top'],
    ['distance du VP à l’écran (perpendiculaire)', 'dans le plan de l’écran : de P à ' + desc, 'distance du VP à ' + desc]);
  const nQ = Q.reduce((m, p, i) => hp([S.x, S.z], p) < hp([S.x, S.z], Q[m]) ? i : m, 0), iQ = far(Q), iS = far(SC), cornerName = ['HG', 'HD', 'BD', 'BG'];
  const variants = [
    triangle('VP · sol sous le VP · base de l’écran', 'sol = point du sol à la verticale du VP (angle droit)', [VPn, { n: 'sol', p: P3(S.x, S.y, 0) }, { n: 'base', p: P3(0, 0, 0) }], ['side', 'face', 'top'],
      ['hauteur du VP', 'distance horizontale du sol à la base de l’écran', 'distance du VP à la base de l’écran']),
    toP('centre', [0, S.sh / 2], 'centre de l’écran'),
    toP('G', q.centroid, 'centre du faisceau'),
    toP(N[iQ], Q[iQ], `coin ${N[iQ]} du faisceau (le plus éloigné)`),
    toP(cornerName[iS], SC[iS], `coin ${cornerName[iS]} de l’écran (le plus éloigné)`),
    toP(N[nQ], Q[nQ], `coin ${N[nQ]} du faisceau (le plus proche)`),
    toP('haut', [0, S.sh], 'haut de l’écran (milieu)'),
    toP('bas', [0, 0], 'base de l’écran (milieu)'),
    toP(S.x >= 0 ? 'bordG' : 'bordD', [S.x >= 0 ? -S.sw / 2 : S.sw / 2, S.z], `bord ${S.x >= 0 ? 'gauche' : 'droit'} de l’écran (à la hauteur du VP)`),
    triangle('Sol : sol sous le VP · pied de l’écran · base de l’écran', 'pied = point du sol au pied de l’écran, juste en face du VP (angle droit)', [{ n: 'sol', p: P3(S.x, S.y, 0) }, { n: 'pied', p: P3(S.x, 0, 0) }, { n: 'base', p: P3(0, 0, 0) }], ['side', 'face', 'top'],
      ['distance du sol sous le VP à l’écran', 'décalage latéral du VP par rapport au milieu de l’écran', 'distance du sol sous le VP à la base de l’écran']),
  ].filter(v => v.ok);
  variants.forEach((v, i) => { v.num = `${i + 1}/${variants.length} · ${v.title}`; });
  tabs.pos = variants[triIdx % variants.length];

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
  return { quad: tabs.quad, scr: tabs.scr, pos: tabs.pos, px: tabs.px };
}

function renderDetails(r) {
  const body = $('dbody'), tabsEl = $('dtabs');
  scrollKeep = body.scrollTop;
  const note = '';
  if (!r || !r.valid) { body.innerHTML = '<p class="sub">Faisceau hors écran : aucun calcul.</p>'; return; }
  const tabs = buildDetails(r), T = tabs[tab] || tabs.quad;
  tabsEl.innerHTML = Object.entries(tabs).map(([k, t]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${t.label}</button>`).join('');
  if (tab === 'pos' && T.num) tabsEl.insertAdjacentHTML('beforeend', `<span class="ttl" title="Clic sur l’onglet Triangle : triangle suivant">${T.num}</span>`);
  tabsEl.onclick = e => { const b = e.target.closest('button'); if (b) { if (b.dataset.t === 'pos' && tab === 'pos') triIdx++;
    else if (b.dataset.t === tab) { const R = tabs[tab].rows, ok = R.map((x, i) => x.hl && x.hl.length ? i : -1).filter(i => i >= 0); selRow = ok[(ok.indexOf(selRow) + 1) % ok.length]; renderDetails(r); scrollToRow(selRow); return; }
    tab = b.dataset.t; selRow = 1; renderDetails(G.compute(vpOf(), S)); $('dbody').scrollTop = 0; } };
  const rows = T.rows;
  if (!rows[selRow] || rows[selRow].sec) selRow = rows.findIndex(x => !x.sec);
  body.innerHTML = note + `<div class="figs">${T.views.map(() => '<svg></svg>').join('')}<div class="tleg"><span><i style="background:${SCREEN}"></i>écran</span><span><i style="background:${BEAM}"></i>faisceau</span>${tab === 'pos' ? `<span><i style="background:${TRI}"></i>triangle</span>` : ''}</div></div>` +
    rows.map((x, i) => x.sec ? `<div class="sec">${x.sec}</div>` :
      `<button class="m ${i === selRow ? 'sel' : ''}" data-i="${i}"><span class="n">${x.n}</span><span class="f">${x.f}</span><b>${x.val}</b></button>`).join('');
  body.onclick = e => { const b = e.target.closest('.m'); if (b) { selRow = +b.dataset.i; renderDetails(r); } };
  const frames = [];
  body.querySelectorAll('.figs svg').forEach((svg, vi) => {
    const V = T.views[vi], [x0, x1, y0, y1] = V.b, F = frame(svg, x0, x1, y0, y1, Math.max(x1 - x0, y1 - y0) * 0.08 + 0.05);
    frames[vi] = F; V.draw(svg, F);
    if (V.t) svg.append(el('text', { x: 8, y: F.H - 8, fill: '#8b98a6', 'font-size': 10.5 }, { face: 'vue de face', side: 'vue de côté', top: 'vue de dessus' }[V.t] || V.t));
    (rows[selRow].hl || []).filter(p => (p.vw || 0) === vi).forEach(p => drawPrim(svg, F, p));
    svg.onclick = ev => {
      const rc = svg.getBoundingClientRect(), hit = hitRows(rows, vi, F, ev.clientX - rc.left, ev.clientY - rc.top);
      if (!hit.length) return;
      const k = hit.indexOf(selRow);          /* clics successifs : ligne suivante parmi celles qui touchent ce point */
      selRow = hit[(k + 1) % hit.length];
      renderDetails(r); scrollToRow(selRow);
    };
  });
  if (scrollKeep != null) { body.scrollTop = scrollKeep; scrollKeep = null; }
}
let scrollKeep = null;

/* ---------- Clic dans la figure → ligne correspondante ---------- */
const HIT_PX = 7, TIE_PX = 3, FILL = 1000;
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const polyDist = (p, P) => Math.min(...P.map((a, i) => segDist(p, a, P[(i + 1) % P.length])));
function inPoly(p, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++)
    if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c;
}
/* distance (px) du clic à une primitive, ou Infinity si non touchée ; remplissage = 40 px de « poids » pour passer après les traits */
function primHit(p, F, m) {
  const X = q => [F.X(q[0]), F.Y(q[1])];
  if (p.k === 'seg') return segDist(m, X(p.a), X(p.b));
  if (p.k === 'pt') return Math.hypot(m[0] - F.X(p.p[0]), m[1] - F.Y(p.p[1]));
  if (p.k === 'poly') {
    const P = p.p.map(X), d = polyDist(m, P);
    return d <= HIT_PX ? d : (p.fill !== false && inPoly(m, P) ? FILL : Infinity);
  }
  if (p.k === 'arc' || p.k === 'bis') {
    const c = p.c, u1 = p.k === 'bis' ? p.u1 : [p.a[0] - c[0], p.a[1] - c[1]], u2 = p.k === 'bis' ? p.u2 : [p.b[0] - c[0], p.b[1] - c[1]];
    const a1 = Math.atan2(u1[1], u1[0]); let da = Math.atan2(u2[1], u2[0]) - a1;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const path = []; for (let i = 0; i <= 16; i++) { const t = a1 + da * i / 16; path.push(X([c[0] + p.r * Math.cos(t), c[1] + p.r * Math.sin(t)])); }
    let d = Math.min(...path.slice(1).map((q, i) => segDist(m, path[i], q)));
    if (p.k === 'bis') { const t = a1 + da / 2; d = Math.min(d, segDist(m, X(c), X([c[0] + 2.2 * p.r * Math.cos(t), c[1] + 2.2 * p.r * Math.sin(t)]))); }
    /* secteur : la zone entre le centre et l'arc compte aussi, avec le poids des surfaces */
    return d <= HIT_PX ? d : (inPoly(m, [X(c), ...path]) ? FILL : Infinity);
  }
  return Infinity;
}
/* lignes (indices) touchées en m : s'il y a des traits à moins de HIT_PX, seuls les plus proches (à TIE_PX du meilleur) comptent ;
   sinon, les surfaces contenant le point. Ordre = ordre de la liste, pour un défilement stable. */
function hitRows(rows, vi, F, mx, my) {
  const hits = [];
  rows.forEach((x, i) => {
    if (x.sec || !x.hl) return;
    let best = Infinity;
    x.hl.filter(p => (p.vw || 0) === vi).forEach(p => { const d = primHit(p, F, [mx, my]); if (d < best) best = d; });
    if (best < Infinity) hits.push({ i, d: best });
  });
  const lines = hits.filter(h => h.d < FILL);
  if (lines.length) { const m = Math.min(...lines.map(h => h.d)); return lines.filter(h => h.d <= m + TIE_PX).map(h => h.i); }
  return hits.map(h => h.i);
}
/* fait défiler la liste pour amener la ligne juste sous la figure fixe */
function scrollToRow(i) {
  const body = $('dbody'), row = body.querySelector(`.m[data-i="${i}"]`), fig = body.querySelector('.figs');
  if (!row) return;
  const top = body.scrollTop + row.getBoundingClientRect().top - body.getBoundingClientRect().top - (fig ? fig.offsetHeight : 0) - 4;
  body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/* ---------- Navigation ---------- */
const titles = { calc: 'Calcul faisceau', vp: 'Projecteurs', ecran: 'Écrans', proj: 'Projets', set: 'Réglages' };
$('nav').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  for (const p in titles) $('p-' + p).classList.toggle('hidden', p !== b.dataset.p);
  $('title').textContent = titles[b.dataset.p];
  const calc = b.dataset.p === 'calc';
  $('title').style.display = calc ? 'none' : '';      // pas de titre sur la page Calcul
  ['locks', 'auto', 'cfgBtn', 'detBtn'].forEach(id => $(id).style.display = calc ? '' : 'none');
  if (!calc) $('details').classList.remove('open');
  if (calc) { refreshVps(); render(); }
};
addEventListener('resize', render);

buildParams(); buildLockPills(); syncRot();
$('title').style.display = 'none';                 // page Calcul au démarrage
attachDrag('svgSide', ['y', 'z']); attachDrag('svgTop', ['x', 'y']); attachFaceDrag();
document.querySelectorAll('.expand').forEach(b => b.onclick = () => toggleFull(b.closest('.card')));
$('viz').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { locks[c.dataset.k] = !locks[c.dataset.k]; render(); } });
addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.card.full').forEach(c => toggleFull(c, false)); });
render();
/* aides de test : ?details=quad|pos|scr|px  ?auto=1  ?unlock=1  ?adv=lens,trans,rot,off  ?lens=sx,sy (en %)  ?pop=lens  ?scroll=1  ?simdrag=dx,dy (pixels, sur la poignée de la vue de face)  ?src=free|std|maker  ?rot=pan,tilt,roll  ?warn=1 (ouvre la liste des alertes) */
const qs = new URLSearchParams(location.search);
if (qs.get('dragnow')) { dragNow = qs.get('dragnow'); render(); }      // aide de test : affiche le nom du mouvement
if (qs.get('open')) document.querySelectorAll('#params .card').forEach(c => c.classList.remove('collapsed'));      // aide de test : déploie tous les blocs
if (qs.get('cfg')) $('cfgBtn').click();
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
