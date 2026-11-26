/* VP – mise en page de la page « VP » (trois présentations des mêmes éléments, qui sont déplacés dans le DOM et jamais recréés) :

   • normale  : mosaïque — la scène 3D (sans titre, point d'ancrage) et deux fenêtres VUES (face, côté, dessus) et RÉGLAGES (curseurs), glissables n'importe où autour de la 3D ou de l'ensemble, redimensionnables, au contenu adaptatif ; défaut : 3D + Vues à droite ;
                un onglet par fenêtre au bord où elle a été posée (même fermée). Le bandeau DONNÉES flotte en bas de la scène et se replie vers la gauche.
   • compacte : de haut en bas — barre des fenêtres (cadenas = ligne des vues épinglée ; boutons qui ouvrent / ferment / amènent la fenêtre à l'écran ; séparateur entre la ligne des vues et les autres),
                la ligne des vues (4 fenêtres graphiques en mosaïque : déplaçables, redimensionnables, fermables), puis les lignes AFFICHAGE, DONNÉES et RÉGLAGES (rétractables sans disparaître,
                réordonnables en hauteur) ; AFFICHAGE et DONNÉES peuvent aussi entrer dans la ligne des vues par glisser (elles y deviennent des fenêtres de la mosaïque) ; RÉGLAGES sur 2 colonnes.
   • vues élargies : une grande fenêtre à gauche, les 3 autres en colonne à droite (mosaïque, mêmes réglages libres) ; le bandeau DONNÉES reste en bas, repliable ;
                AFFICHAGE et RÉGLAGES sortent par des onglets au bord droit.
   Dans toutes les présentations, un double-clic (double appui) sur la barre du haut d'une fenêtre l'agrandit au centre, au-dessus du reste (winzoom.js) ; tout changement de présentation la remet à sa place.
   Le module ne calcule rien : il range les éléments fournis par index.html (cartes de vue, scène, curseurs, indicateurs). Le dessin et les gestes restent dans view3d.js / app.js. */
(function (root) {
'use strict';

const $ = id => document.getElementById(id);
const mk = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = cls; return e; };
const KP = ['util', 'perdus', 'couvert', 'ratio', 'lux', 'forme'];
const NAMES = { views: 'Vues', face: 'Face', side: 'Côté', top: 'Dessus', v3d: '3D', params: 'Réglages', data: 'Données' };
/* L'affichage (éléments de chaque vue, cases du bandeau données) se règle dans la fenêtre AFFICHAGE (bouton œil de la barre du haut, display.js) ; les verrous dans la fenêtre VERROUS (cadenas). */
const TITLES = { face: 'Vue de face', side: 'Vue de côté', top: 'Vue de dessus', v3d: 'Vue 3D' };
const GFX = ['face', 'side', 'top', 'v3d'];

let cb = null, inited = false, on = false;
let mode = 'normal', prevMode = 'normal';
let calc, main, stage, side, colOut, viz, params, status, warnBox, simVals, kpis, band, dbIn, dragSel, tabs, root3, bar, scroll, fmain, mdata;
let nWrap = null, nHost = null, nStrip = {}, mzN = null, roN = null, fWrap = null, fStrip = {};
let cards = {}, home = {}, park = null, mzC = null, mzF = null, rowEl = {}, dataBox = null, gfxWrap = null, ro = null, kickRaf = 0;
const store = (() => { try { return JSON.parse(localStorage.getItem('vp3dl') || '{}'); } catch (_) { return {}; } })();
const legacy = (() => { try { return JSON.parse(localStorage.getItem('vp3d') || '{}'); } catch (_) { return {}; } })();      // anciennes préférences : fenêtres Vues / Réglages
const pref = { kpi: Object.assign({ util: 1, perdus: 1, couvert: 1, ratio: 1, lux: 1, forme: 1 }, store.kpi) };
const save = () => { try { localStorage.setItem('vp3dl', JSON.stringify(pref)); } catch (_) { /* stockage indisponible */ } };
const cpt = { tree: null, rows: ['gfx', 'data', 'params'], gfxH: 0, fold: {}, pin: false };      // présentation compacte (gardée en mémoire pendant la session) ; fold : fenêtres rétractées ; pin : ligne des vues toujours visible
const fl = { main: 'v3d', tree: null, dock: { params: 'r' }, frac: {} };      // vues élargies ; dock / frac : comme en vue principale, côté où Réglages est posée (leur onglet y reste, même fermées) et leur dernière taille
const FWIN = ['params'];                                                                          // vues élargies : fenêtres qui se chargent par leur onglet (bord de la zone), comme en vue principale
/* vue principale : la 3D et les fenêtres Vues / Réglages / Affichage en mosaïque ; dock : côté (l, r, t, b) où chaque fenêtre est posée par rapport à la 3D, qui y garde son bouton même fermée ; frac : sa dernière taille (part de la zone) */
const NWIN = ['views', 'params'];
const nav = { tree: null, dock: { views: 'r', params: 'r' }, frac: {} };
let bandOpen = true, lastSw = null, activeView = null;                                                      // activeView : identifiant de la vue utilisateur chargée (userviews.js), sinon null

/* ---------- Dispositions par défaut ---------- */
const viewsH = () => Math.round(Math.min(380, Math.max(190, innerHeight * 0.36)));      // hauteur par défaut (px) de la ligne des vues
const defCompact = () => ({ dir: 'h', kids: [{ id: 'face', w: 1 }, { id: 'side', w: 1 }, { id: 'top', w: 1 }, { id: 'v3d', w: 1.35 }] });      // la ligne des vues ; Affichage et Données peuvent y entrer par glisser
function defFull(m) {
  const others = GFX.filter(k => k !== m).map(id => ({ id, w: 1 })), portrait = innerWidth < 900 || innerHeight > innerWidth;
  return portrait ? { dir: 'v', kids: [{ id: m, w: 2.2 }, { dir: 'h', w: 1, kids: others }] } : { dir: 'h', kids: [{ id: m, w: 2.2 }, { dir: 'v', w: 1, kids: others }] };
}
const defGfxH = viewsH;
const nArea = () => Math.max(500, innerWidth - 76 - 30), nW = id => Math.min(id === 'disp' ? 260 : 360, Math.max(id === 'disp' ? 210 : 260, innerWidth * (id === 'disp' ? .16 : .21)));
const defNormal = () => { const v = nW('views'), p = nW('params'), rest = Math.max(160, nArea() - v - p); return { dir: 'h', kids: [{ id: 'v3d', w: 1 }, { id: 'views', w: v / rest }, { id: 'params', w: p / rest }] }; };      // 3D + fenêtres Vues et Réglages à droite ; Affichage fermée, ouvrable à droite
const nShare = (id, target, zone) => target === 'v3d' ? .3 : target == null ? (zone === 'l' || zone === 'r' ? .24 : .3) : .5;      // part prise par une fenêtre qui arrive
function dockSide(tree, id, ref = 'v3d') {                                  // côté où se trouve la fenêtre par rapport à la 3D (vue principale) ou à la grande fenêtre (vues élargies) : dernier niveau où leurs chemins se séparent
  const path = (n, t, acc) => { if (n.id === t) return acc; if (n.id != null) return null; for (let i = 0; i < n.kids.length; i++) { const r = path(n.kids[i], t, [...acc, { n, i }]); if (r) return r; } return null; };
  const a = path(tree, id, []), b = path(tree, ref, []); if (!a || !b) return null;
  let k = 0; while (k < a.length && k < b.length && a[k].n === b[k].n && a[k].i === b[k].i) k++;
  if (k >= a.length || k >= b.length) return null;
  const g = a[k].n; return g.dir === 'h' ? (a[k].i < b[k].i ? 'l' : 'r') : (a[k].i < b[k].i ? 't' : 'b');
}
const placeDock = (tree, id, dock, frac) => {                              // une fenêtre rouverte revient du côté où elle avait été posée, avec sa dernière taille
  const side = dock[id] || 'r', hz = side === 'l' || side === 'r', f = Math.max(.12, Math.min(.5, frac[id] || (hz ? nW(id) / nArea() : .3))), w = f / (1 - f), before = side === 'l' || side === 't';
  return { dir: hz ? 'h' : 'v', w: 1, kids: before ? [{ id, w }, { ...tree, w: 1 }] : [{ ...tree, w: 1 }, { id, w }] };
};
const placeN = (tree, id) => placeDock(tree, id, nav.dock, nav.frac);       // vue principale
const placeF = (tree, id) => FWIN.includes(id) ? placeDock(tree, id, fl.dock, fl.frac) : placeInLastGroup(tree, id);      // vues élargies : Réglages / Affichage par leur onglet, les vues rejoignent la colonne des petites
const placeInViews = (tree, id) => {                                         // compacte : une vue rouverte rejoint la ligne des vues
  let hit = null;
  (function w(n, p) { if (!n || hit) return; if (n.id != null) { if (GFX.includes(n.id)) hit = { n, p }; } else n.kids.forEach(k => w(k, n)); })(tree, null);
  if (hit && hit.p) {
    const { n, p } = hit;
    if (p.dir === 'h') p.kids.push({ id, w: p.kids.reduce((a, g) => a + (g.w || 1), 0) / p.kids.length || 1 });
    else p.kids[p.kids.indexOf(n)] = { dir: 'h', w: n.w || 1, kids: [{ ...n, w: 1 }, { id, w: 1 }] };
    return true;
  }
  if (tree.kids) { tree.kids.unshift({ id, w: viewsH() }); return true; }              // plus aucune vue : la nouvelle prend la première place
  return false;
};
const isFwin = n => n.id != null && FWIN.includes(n.id);
const placeInLastGroup = (tree, id) => {                                    // vues élargies : une vue rouverte rejoint la colonne (ou la ligne) des petites ; Réglages / Affichage posées sur un bord ne comptent pas
  let n = tree;
  while (n.id == null) { const rest = n.kids.filter(k => !isFwin(k)); if (rest.length === 1 && rest[0].id == null) n = rest[0]; else break; }      // Réglages / Affichage posées au-dessus ou au-dessous : la mosaïque des vues est l'enfant restant
  if (n.id != null || n.kids.length < 2) return false;
  const cand = n.kids.filter(k => !isFwin(k)), last = cand[cand.length - 1]; if (!last || cand.length < 2 || last.id != null) return false;
  last.kids.push({ id, w: last.kids.reduce((a, g) => a + (g.w || 1), 0) / last.kids.length || 1 }); return true;
};

/* ---------- Lignes de la présentation compacte : la ligne des vues (mosaïque), Affichage, Données, Réglages (empilées, réordonnables) ---------- */
/* Affichage et Données sont soit une ligne, soit une fenêtre de la ligne des vues (mosaïque) où on les glisse ; Réglages reste une ligne. */
const ROWABLE = ['data'];
const docked = id => ROWABLE.includes(id) && mzC.has(id);
function mkWin(title, o = {}) {
  const el = mk('mw mwRow' + (o.cls ? ' ' + o.cls : '')), head = mk('mwh'), body = mk('mwb'), t = mk('mwt', 'b');
  t.textContent = title; head.append(t, mk('mwsp', 'span'));
  for (const b of o.btns || []) { const e = mk('mwb2' + (b.cls ? ' ' + b.cls : ''), 'button'); e.type = 'button'; e.dataset.k = b.k; e.title = b.title; e.setAttribute('aria-label', b.title); e.textContent = b.t; head.append(e); }
  el.append(head, body);
  return { el, head, body };
}
const rowContent = id => id === 'data' ? dataBox : params;
function rowDrag(e, id) {                                                   // glisser la barre de titre d'une ligne : la remonter / descendre, ou (Affichage, Données) la lâcher dans la ligne des vues
  if (e.target.closest('button') || (e.button && e.button !== 0) || rowEl[id].el.classList.contains('wz')) return;      // ligne agrandie (winzoom.js) : elle ne se déplace pas
  const x0 = e.clientX, y0 = e.clientY, row = rowEl[id].el; let active = false, hit = null, ghost = null;
  const mv = ev => {
    if (!active) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
      active = true; row.classList.add('mwLift'); document.body.classList.add('mzDrag'); ghost = mk('mzGhost'); ghost.textContent = NAMES[id]; document.body.append(ghost);
    }
    ghost.style.transform = `translate(${ev.clientX + 12}px,${ev.clientY + 12}px)`;
    const gr = gfxWrap.getBoundingClientRect();
    if (ROWABLE.includes(id) && ev.clientX >= gr.left && ev.clientX <= gr.right && ev.clientY >= gr.top && ev.clientY <= gr.bottom) { hit = mzC.probe(ev.clientX, ev.clientY); return; }
    hit = null; mzC.unprobe();
    const others = cpt.rows.filter(r => r !== id && !docked(r)), ys = others.map(r => { const b = rowEl[r].el.getBoundingClientRect(); return b.top + b.height / 2; });
    const at = ys.filter(y => y < ev.clientY).length, want = others.slice(); want.splice(at, 0, id);
    const next = cpt.rows.filter(r => docked(r)).concat(want);
    if (next.join() !== cpt.rows.join()) { cpt.rows = next; layoutRows(); }
  };
  const up = ev => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('keydown', esc, true);
    row.classList.remove('mwLift'); document.body.classList.remove('mzDrag'); mzC.unprobe(); if (ghost) ghost.remove();
    if (active && hit && ev.type === 'pointerup') mzC.insert(id, hit.id, hit.zone);
  };
  const esc = ev => { if (ev.key === 'Escape') { hit = null; up({ type: 'cancel' }); } };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('keydown', esc, true);
}
function dropOut(id, x, y) {                                                // Affichage / Données lâchée hors de la ligne des vues : elle redevient une ligne, à l'endroit lâché
  const sr = scroll.getBoundingClientRect(), gr = gfxWrap.getBoundingClientRect();
  if (x < sr.left || x > sr.right || y < sr.top || y > sr.bottom || (x >= gr.left && x <= gr.right && y >= gr.top && y <= gr.bottom)) return;
  const others = cpt.rows.filter(r => r !== id && !docked(r)), ys = others.map(r => { const b = rowEl[r].el.getBoundingClientRect(); return b.top + b.height / 2; });
  const want = others.slice(); want.splice(ys.filter(v => v < y).length, 0, id);
  mzC.close(id); cpt.rows = cpt.rows.filter(r => docked(r)).concat(want); layoutRows();
}
/* Réglages « saute » sous la ligne des vues pendant un glisser dans un graphique (présentation compacte) : le graphique manipulé reste visible avec le curseur qui bouge.
   Temporaire : la ligne reprend sa place (et le défilement d'avant) dès que le geste est relâché. cpt.rows n'est jamais modifié. */
let floatP = null, floatRaf = 0;                                            // floatP : { top } = défilement d'avant le saut
const rowsOrder = () => {                                                   // ordre d'empilement : celui des lignes, avec Réglages juste après la ligne des vues tant qu'elle « saute »
  if (!floatP) return cpt.rows;
  const o = cpt.rows.filter(r => r !== 'params'); o.splice(o.indexOf('gfx') + 1, 0, 'params'); return o;
};
function floatParams(on) {
  if (mode !== 'compact') return;
  cancelAnimationFrame(floatRaf); floatRaf = 0;
  if (on) {
    if (floatP) return;
    floatP = { top: scroll.scrollTop };
    gfxWrap.classList.add('pin');                                           // la ligne des vues reste en haut, quel que soit le défilement
    rowEl.params.el.classList.add('mwFloat');
    scroll.insertBefore(rowEl.params.el, gfxWrap.nextSibling);              // on ne déplace que Réglages : les vues (cibles du geste en cours) ne quittent jamais le document
    scroll.scrollTop = 0;
  } else if (floatP) {
    floatRaf = requestAnimationFrame(() => {                                // après la fin du geste
      floatRaf = 0; if (!floatP) return;
      const t = floatP.top; floatP = null; rowEl.params.el.classList.remove('mwFloat');
      layoutRows(); scroll.scrollTop = t;
    });
  }
}
function layoutRows() {
  scroll.replaceChildren();
  for (const r of rowsOrder()) {
    if (r === 'gfx') { scroll.append(gfxWrap); continue; }
    if (docked(r)) continue;                                                // dans la ligne des vues : la mosaïque l'a rangée
    scroll.append(rowEl[r].el); rowEl[r].body.append(rowContent(r));
  }
  for (const r of ['data', 'params']) {
    rowEl[r].el.classList.toggle('mwFold', !!cpt.fold[r]);
    rowEl[r].head.querySelector('[data-k=fold]').textContent = cpt.fold[r] ? '▸' : '▾';
  }
  gfxWrap.classList.toggle('pin', !!cpt.pin || !!floatP);
  renderBar(); kick();
}
function buildRows() {
  const foldBtn = { k: 'fold', t: '▾', title: 'Rétracter / déployer la fenêtre' };
  rowEl.params = mkWin('Réglages', { cls: 'mwPar', btns: [foldBtn] });
  rowEl.data = mkWin('Données', { cls: 'mw-data', btns: [foldBtn] });
  for (const r of ['params', 'data']) {
    rowEl[r].head.addEventListener('pointerdown', e => rowDrag(e, r));
    rowEl[r].head.addEventListener('click', e => { if (e.target.closest('[data-k=fold]')) setFold(r, !cpt.fold[r]); });
  }
  rowEl.gfx = {};
  gfxWrap = mk('c3Gfx'); rowEl.gfx.el = gfxWrap; const host = mk('mzHost'), grip = mk('c3Grip'); grip.title = 'Tirer pour changer la hauteur des fenêtres'; grip.append(mk('', 'i')); gfxWrap.append(host, grip);
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
    const y0 = e.clientY, h0 = cpt.gfxH; grip.classList.add('on');
    const mv = ev => { cpt.gfxH = Math.max(130, Math.min(innerHeight * 0.9, h0 + ev.clientY - y0)); gfxWrap.style.height = cpt.gfxH + 'px'; };
    const up = () => { grip.classList.remove('on'); grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  return host;
}
function setFold(id, v) { cpt.fold[id] = !!v; if (docked(id)) mzC.render(); else layoutRows(); }

/* ---------- Mosaïques (compacte : une ligne ; vues élargies : grande + colonne) ---------- */
/* kind : 'n' vue principale · 'c' compacte · 'f' vues élargies. Aucun bouton d'agrandissement : une fenêtre s'agrandit par double-clic sur sa barre (winzoom.js). */
function winDefs(kind) {
  if (kind === 'n') return {                                                 // vue principale : la 3D (sans barre de titre, point d'ancrage) et les fenêtres Vues et Réglages
    v3d: { title: 'Vue 3D', el: stage, bare: true, closable: false, buttons: [] },
    views: { title: 'Vues', el: $('win3dViews'), buttons: [] }, params: { title: 'Réglages', el: $('win3dParams'), buttons: [] },
  };
  const def = id => ({ title: TITLES[id], el: id === 'v3d' ? stage : cards[id], buttons: [], closable: kind === 'f' });
  const o = Object.fromEntries(GFX.map(id => [id, def(id)]));
  if (kind === 'f') o.params = { title: 'Réglages', el: $('win3dParams'), buttons: [] };      // vues élargies : Réglages, fenêtre de la mosaïque chargée par son onglet (comme en vue principale)
  if (kind === 'c') {                                                        // compacte : Données peut aussi entrer dans la ligne des vues (rétractable, jamais fermée)
    o.data = { title: 'Données', el: dataBox, closable: false, foldable: true, rowable: true, buttons: [] };
  }
  return o;
}
/* Grande fenêtre (vues élargies : la plus grande) : id de la vue (v3d, face, side, top), ou null hors vues élargies. Elle reçoit la barre HUD (chips verrouillables). */
function bigView() {
  if (!on || mode !== 'full') return null;
  let best = fl.main, ba = -1, ma = -1;
  for (const id of GFX) {
    if (!mzF.has(id)) continue;
    const r = mzF.shell(id).el.getBoundingClientRect(), a = r.width * r.height;
    if (id === fl.main) ma = a;
    if (a > ba) { ba = a; best = id; }
  }
  return ma >= ba * .98 ? fl.main : best;                                    // à surface (presque) égale, la fenêtre principale prévue
}
/* Arrivée dans les vues élargies : la fenêtre Affichage bascule sur la grande fenêtre, avec « Réglages supplémentaires » cochés
   (vue 3D et vue de face ; les vues de côté et de dessus n'ont pas cette option). Pas appliqué quand on recharge une vue utilisateur : elle garde ce qui a été enregistré. */
let restoring = false;
function syncBig() {
  if (restoring || mode !== 'full' || !cb || !cb.getShow || !cb.setShow) return;
  const b = fl.main, w = b === 'v3d' ? '3d' : b, sh = cb.getShow(), f = sh.v && sh.v[w]; if (!f) return;
  const hasAdv = 'adv' in f;
  if (sh.sel === w && (!hasAdv || f.adv)) return;
  sh.sel = w; if (hasAdv) f.adv = true;
  cb.setShow(sh);
}

/* ---------- Barre des fenêtres (compacte, vues élargies) ---------- */
const FOLD = ['data', 'params'];                                      // fenêtres qui se rétractent sans disparaître (les autres se ferment)
const curMz = () => mode === 'compact' ? mzC : mzF;
function isOn(id) { return FOLD.includes(id) ? !cpt.fold[id] : curMz().has(id); }
const winEl = id => id === 'params' ? rowEl.params.el : docked(id) || !FOLD.includes(id) ? curMz().shell(id).el : rowEl[id].el;
function chipTitle(id, on) {
  const one = FOLD.includes(id);
  return on ? (one ? 'Déployée : cliquer pour la rétracter (ou pour l\'amener à l\'écran si elle est hors du cadre)' : 'Ouverte : cliquer pour la fermer (ou pour l\'amener à l\'écran si elle est hors du cadre)')
            : (one ? 'Rétractée : cliquer pour la déployer' : 'Fermée : cliquer pour la rouvrir');
}
/* la ligne des vues épinglée masque le haut du cadre : les fenêtres qui défilent dessous doivent se montrer en dessous d'elle */
const topInset = el => (cpt.pin || floatP) && mode === 'compact' && !gfxWrap.contains(el) ? gfxWrap.offsetHeight + 8 : 0;
const scrollInset = box => mode === 'compact' && box === scroll ? topInset(rowEl.params.el) : 0;      // hauteur de la ligne des vues épinglée (ou Réglages qui a « sauté ») qui masque le haut de la zone qui défile
function visibleIn(el) {
  const sr = scroll.getBoundingClientRect(), r = el.getBoundingClientRect(), top = sr.top + topInset(el), v = Math.min(r.bottom, sr.bottom) - Math.max(r.top, top);
  return v >= Math.min(r.height, sr.bottom - top) - 4;
}
function reveal(id) {
  if (mode !== 'compact') return;
  requestAnimationFrame(() => {
    const el = winEl(id); if (!el || !el.isConnected) return;
    const sr = scroll.getBoundingClientRect(), r = el.getBoundingClientRect(), top = sr.top + topInset(el);
    let d = 0; if (r.top < top + 4) d = r.top - top - 8; else if (r.bottom > sr.bottom - 4) d = Math.min(r.bottom - sr.bottom + 8, r.top - top - 8);
    if (d) scroll.scrollBy({ top: d, behavior: 'smooth' });
    el.classList.remove('mwFlash'); void el.offsetWidth; el.classList.add('mwFlash'); setTimeout(() => el.classList.remove('mwFlash'), 1100);
  });
}
function chipAct(id) {
  const on = isOn(id), seen = mode !== 'compact' || (() => { const el = winEl(id); return el && el.isConnected && visibleIn(el); })();
  if (on && !seen) { reveal(id); return; }                                    // déjà ouverte mais hors du cadre : on la montre, sans la refermer
  if (FOLD.includes(id)) setFold(id, on);
  else { const mz = curMz(); if (on) mz.close(id); else mz.open(id); }
  if (!on) reveal(id);
}
const LOCK_ON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z"/></svg>';
const LOCK_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M17 10h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9V8a3 3 0 0 0-5.8-1.1l-1.9-.7A5 5 0 0 1 17 8v2z"/></svg>';
function renderBar() {
  if (mode === 'normal') return;
  const chip = id => `<button type="button" class="m3chip${isOn(id) ? ' on' : ''}" data-o="${id}" title="${chipTitle(id, isOn(id))}" aria-pressed="${isOn(id)}">${NAMES[id]}</button>`;
  let html = `<span class="m3lab">Fenêtres</span>`;
  if (mode === 'compact') {                                                   // [cadenas] boutons de la ligne des vues | boutons des autres fenêtres
    const line = [...GFX, ...ROWABLE.filter(docked)], rest = cpt.rows.filter(r => r !== 'gfx' && !docked(r));
    html += `<button type="button" class="m3pin${cpt.pin ? ' on' : ''}" data-pin="1" aria-pressed="${!!cpt.pin}" title="${cpt.pin ? 'La ligne des vues reste toujours visible : cliquer pour la laisser défiler' : 'Garder la ligne des vues toujours visible (même quand on fait défiler)'}" aria-label="Garder la ligne des vues visible">${cpt.pin ? LOCK_ON : LOCK_OFF}</button>`
      + line.map(chip).join('') + `<span class="m3bsep" aria-hidden="true"></span>` + rest.map(chip).join('');
  } else {
    html += GFX.map(chip).join('');                                           // vues élargies : Réglages n'est pas dans la barre, elles se chargent par leur onglet au bord de la zone
  }
  html += `<span class="m3sp"></span><button type="button" class="m3btn" data-r="1" title="Remettre la disposition par défaut" aria-label="Disposition par défaut">↺</button>`;
  bar.innerHTML = html;
}
function barClick(e) {
  const o = e.target.closest('[data-o]'), r = e.target.closest('[data-r]'), pin = e.target.closest('[data-pin]');
  if (pin) { cpt.pin = !cpt.pin; gfxWrap.classList.toggle('pin', cpt.pin); renderBar(); }
  else if (o) chipAct(o.dataset.o);
  else if (r) resetLayout();
}
/* Une vue par défaut garde telle quelle la disposition qu'on lui a donnée, même quand on en sort puis qu'on y revient (sans l'avoir enregistrée comme vue utilisateur).
   Pour la remettre à son état d'origine : appui d'une seconde sur son bouton de la barre du haut (ou ↺ de la barre Fenêtres, pour la vue affichée). */
function resetView(m) {
  if (m === 'normal') { nav.tree = defNormal(); nav.dock = { views: 'r', params: 'r' }; nav.frac = {}; }
  else if (m === 'compact') { Object.assign(cpt, { tree: defCompact(), rows: ['gfx', 'data', 'params'], gfxH: defGfxH(), pin: false }); mzC.unfoldAll(); }
  else if (m === 'full') { fl.main = 'v3d'; fl.tree = defFull('v3d'); fl.dock = { params: 'r' }; fl.frac = {}; }
}
function resetLayout() {
  resetView(mode); setMode(mode, { main: fl.main, force: true });
  if (mode === 'normal') toast(MODE_NAMES.normal + ' : disposition par défaut rétablie');
}
const MODE_NAMES = { normal: 'Vue principale', compact: 'Vue compacte', full: 'Vues élargies' };
function resetAndGo(m) {                                                    // appui long sur un bouton de vue : disposition par défaut, et on y va
  resetView(m);
  setMode(m, { main: fl.main, force: true });
  toast(MODE_NAMES[m] + ' : disposition par défaut rétablie');
}
let toastEl = null, toastT = 0;
function toast(t) {
  if (!toastEl) { toastEl = mk('m3toast'); document.body.append(toastEl); }
  toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
}
function swapIds(t, a, b) {                                                 // échange la place de deux fenêtres dans un arbre (null si l'une des deux n'y est pas)
  if (!t) return null;
  const c = JSON.parse(JSON.stringify(t)); let na = 0, nb = 0;
  (function w(n) { if (n.id != null) { if (n.id === a) { n.id = b; na++; } else if (n.id === b) { n.id = a; nb++; } } else n.kids.forEach(w); })(c);
  return na && nb ? c : null;
}

/* ---------- Rangement des éléments ---------- */
/* disposition de base : tout est rassemblé comme dans la présentation normale (les autres partent de là) */
function toBase() {
  viz.append(cards.face, cards.side, cards.top); $('viewsBody').append(viz);
  $('paramsBody').append(params);
  colOut.prepend(warnBox); colOut.prepend(status);
  dbIn.append(kpis, simVals); colOut.append(band); colOut.append(dragSel);
  stage.append(colOut, tabs);
  calc.insertBefore(stage, calc.firstChild); calc.insertBefore(side, stage.nextSibling);
  side.append($('win3dViews'), $('win3dParams'));
  $('win3dParams').classList.remove('mwPar', 'wide'); viz.classList.remove('row');
  nWrap.hidden = true; bar.hidden = false;
  root3.hidden = true; mdata.replaceChildren(); scroll.replaceChildren();
}
function arrange(m) {
  if (floatP) { floatP = null; cancelAnimationFrame(floatRaf); floatRaf = 0; rowEl.params.el.classList.remove('mwFloat'); }      // changement de présentation en plein geste : plus de saut
  if (root.WinZoom) root.WinZoom.close();                                   // une fenêtre agrandie revient à sa place avant le rangement
  toBase(); mode = m;
  for (const [k, c] of [['normal', 'm3n'], ['compact', 'm3c'], ['full', 'm3f']]) { calc.classList.toggle(c, m === k); main.classList.toggle(c, m === k); }
  if (m === 'normal') {
    root3.hidden = false; scroll.hidden = true; fmain.hidden = true; nWrap.hidden = false; bar.hidden = true;
    ['win3dViews', 'win3dParams'].forEach(k => $(k).classList.remove('hide3d'));
    mzN.setTree(nav.tree || defNormal()); requestAnimationFrame(adaptN);
  } else if (m === 'compact') {
    root3.hidden = false; scroll.hidden = false; fmain.hidden = true;
    if (!cpt.gfxH) cpt.gfxH = defGfxH(); gfxWrap.style.height = cpt.gfxH + 'px';
    rowEl.params.body.append(params); dataBox.append(status, warnBox, simVals);
    mzC.setTree(cpt.tree || defCompact()); layoutRows();
  } else if (m === 'full') {
    root3.hidden = false; scroll.hidden = true; fmain.hidden = false;
    fmain.append(side, tabs); mdata.append(band);
    mzF.setTree(fl.tree || defFull(fl.main)); renderTabsF(); requestAnimationFrame(adaptN);
  }
  applyPanel(); vars(); syncKpi(); setBand(bandOpen); renderModes(); kick(); syncBig();
}
function setMode(m, o = {}) {
  if (!on) return;
  if (m === 'full') { const want = o.main || fl.main || 'v3d'; if (want !== fl.main) { fl.tree = swapIds(fl.tree, want, fl.main); fl.main = want; } }      // même fenêtre principale : on garde la disposition réglée à la main ; une autre : elle prend la place de l'ancienne
  if (m === mode && !o.force) return;
  if (mode !== 'full') prevMode = mode;
  arrange(m);
}

/* ---------- Vues utilisateur : instantané de la disposition courante, et retour à un instantané ---------- */
/* Chaque présentation a ses propres éléments : normale = fenêtres de droite ouvertes ; compacte = lignes, mosaïque, rétractions, épinglage ; vues élargies = fenêtre principale et mosaïque.
   Communs : cases du bandeau données, bandeau déployé ou non, éléments de la scène 3D (faisceau, position, orientation, lens shift). */
function snapshot() {
  const s = { mode, kpi: { ...pref.kpi }, band: bandOpen };
  if (cb && cb.getShow) s.show = cb.getShow();
  if (mode === 'normal') s.norm = { tree: mzN.state() || nav.tree, dock: { ...nav.dock }, frac: { ...nav.frac } };
  else if (mode === 'compact') s.cpt = { tree: mzC.state() || cpt.tree, rows: cpt.rows.slice(), gfxH: cpt.gfxH, fold: { ...cpt.fold }, pin: !!cpt.pin };
  else s.full = { main: fl.main, tree: fl.tree || defFull(fl.main), dock: { ...fl.dock }, frac: { ...fl.frac } };
  return JSON.parse(JSON.stringify(s));
}
function prune(t, ok) {                                                     // ne garde de l'arbre mémorisé que des fenêtres connues
  if (!t || typeof t !== 'object') return null;
  if (t.id != null) return ok.includes(t.id) ? { id: t.id, w: +t.w || 1 } : null;
  if (!Array.isArray(t.kids)) return null;
  const kids = t.kids.map(k => prune(k, ok)).filter(Boolean);
  return kids.length ? { dir: t.dir === 'v' ? 'v' : 'h', w: +t.w || 1, kids } : null;
}
function restore(s, id) {
  if (!s || !['normal', 'compact', 'full'].includes(s.mode)) return;
  if (s.kpi) KP.forEach(k => { if (k in s.kpi) pref.kpi[k] = s.kpi[k] ? 1 : 0; });
  save();
  if (s.show && cb && cb.setShow) cb.setShow(s.show);
  bandOpen = s.band !== false;
  if (s.mode === 'normal' && s.norm) {
    const t = prune(s.norm.tree, ['v3d', ...NWIN]), has3d = (n) => n && (n.id === 'v3d' || (n.kids || []).some(has3d));
    nav.tree = has3d(t) ? t : defNormal();
    NWIN.forEach(k => { const d = s.norm.dock && s.norm.dock[k]; nav.dock[k] = ['l', 'r', 't', 'b'].includes(d) ? d : 'r'; const f = s.norm.frac && +s.norm.frac[k]; if (f > 0) nav.frac[k] = f; else delete nav.frac[k]; });
  } else if (s.mode === 'compact' && s.cpt) {
    const c = s.cpt, ids = ['gfx', 'data', 'params'];
    cpt.tree = prune(c.tree, [...GFX, 'data']) || defCompact();
    cpt.rows = (c.rows || []).filter((r, i, a) => ids.includes(r) && a.indexOf(r) === i); ids.forEach(r => { if (!cpt.rows.includes(r)) cpt.rows.push(r); });
    cpt.gfxH = Math.max(130, Math.min(innerHeight * 0.9, +c.gfxH || defGfxH()));
    for (const k in cpt.fold) delete cpt.fold[k];
    FOLD.forEach(k => { if (c.fold && c.fold[k]) cpt.fold[k] = true; });
    cpt.pin = !!c.pin;
    gfxWrap.style.height = cpt.gfxH + 'px';
  } else if (s.mode === 'full' && s.full) {
    fl.main = GFX.includes(s.full.main) ? s.full.main : 'v3d'; fl.tree = prune(s.full.tree, [...GFX, ...FWIN]) || defFull(fl.main);
    FWIN.forEach(k => { const d = s.full.dock && s.full.dock[k]; fl.dock[k] = ['l', 'r', 't', 'b'].includes(d) ? d : 'r'; const f = s.full.frac && +s.full.frac[k]; if (f > 0) fl.frac[k] = f; else delete fl.frac[k]; });
  }
  activeView = id || null;
  if (!on) { mode = s.mode; renderModes(); return; }                           // pas sur la page VP : la vue s'applique à l'arrivée
  restoring = true; try { setMode(s.mode, { force: true, main: fl.main }); } finally { restoring = false; }
}
function renderModes() {
  document.querySelectorAll('#m3modes [data-m]').forEach(b => { const o = !activeView && b.dataset.m === mode; b.classList.toggle('on', o); b.setAttribute('aria-pressed', o); });
  if (root.UserViews) root.UserViews.sync();
}

/* ---------- Fenêtres de droite (normale, vues élargies), onglets, bandeau données ---------- */
function applyPanel() {
  if (mode === 'normal') { main.classList.remove('p3noviews', 'p3noparams', 'p3nodisp', 'p3off'); return; }      // vue principale : les fenêtres sont dans la mosaïque (renderTabsN)
  main.classList.add('p3noviews', 'p3noparams', 'p3nodisp', 'p3off');      // compacte, vues élargies : pas de volet à droite (Réglages est une ligne ou une fenêtre de la mosaïque)
  $('win3dViews').classList.add('hide3d'); $('win3dParams').classList.remove('hide3d');
  tabs.querySelectorAll('button[data-t]').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', false); });
}
function toggle(k) {
  if (mode === 'full') { if (FWIN.includes(k)) fToggle(k); }                // vues élargies : l'onglet charge / ferme la fenêtre dans la mosaïque
  else if (mode === 'normal') nToggle(k);
}
/* ---------- Vues élargies : Réglages / Affichage chargées par leur onglet (même fonctionnement que la vue principale) ---------- */
function fToggle(k) { if (mzF.has(k)) mzF.close(k); else mzF.open(k); }
function updateDocksF() { if (mode !== 'full' || !fl.tree) return; FWIN.forEach(k => { if (mzF.has(k)) fl.dock[k] = dockSide(fl.tree, k, fl.main) || fl.dock[k]; }); }
function renderTabsF() {                                                    // un onglet par fenêtre, sur le bord où elle a été posée (même fermée)
  for (const q of ['l', 'r', 't', 'b']) fStrip[q].replaceChildren();
  if (mode !== 'full') return;
  for (const k of FWIN) {
    const b = mk('n3Tab' + (mzF.has(k) ? ' on' : ''), 'button'); b.type = 'button'; b.dataset.f = k; b.textContent = NAMES[k]; b.setAttribute('aria-pressed', mzF.has(k));
    b.title = mzF.has(k) ? 'Fermer la fenêtre ' + NAMES[k] : 'Ouvrir la fenêtre ' + NAMES[k]; fStrip[fl.dock[k] || 'r'].append(b);
  }
}
/* ---------- Vue principale : mosaïque 3D + Vues / Réglages / Affichage, onglets sur les bords ---------- */
function nToggle(k) { if (mzN.has(k)) mzN.close(k); else mzN.open(k); }
function updateDocks() { if (!nav.tree) return; NWIN.forEach(k => { if (mzN.has(k)) nav.dock[k] = dockSide(nav.tree, k) || nav.dock[k]; }); }
function renderTabsN() {                                                    // un onglet par fenêtre, sur le bord où elle a été posée (même fermée) ; ↺ sur le bord droit
  for (const q of ['l', 'r', 't', 'b']) nStrip[q].replaceChildren();
  for (const k of NWIN) {
    const b = mk('n3Tab' + (mzN.has(k) ? ' on' : ''), 'button'); b.type = 'button'; b.dataset.n = k; b.textContent = NAMES[k]; b.setAttribute('aria-pressed', mzN.has(k));
    b.title = mzN.has(k) ? 'Fermer la fenêtre ' + NAMES[k] : 'Ouvrir la fenêtre ' + NAMES[k]; nStrip[nav.dock[k] || 'r'].append(b);
  }
  const r = mk('n3Tab n3Reset', 'button'); r.type = 'button'; r.dataset.nr = '1'; r.textContent = '↺'; r.title = 'Remettre la vue principale par défaut (3D et Vues à droite)'; r.setAttribute('aria-label', 'Disposition par défaut'); nStrip.r.append(r);
}
function adaptN() {                                                         // le contenu s'adapte à la forme de la fenêtre : 3 vues en ligne si elle est large, réglages sur 2 colonnes
  const norm = mode === 'normal'; if (!norm && mode !== 'full') return;
  const mz = norm ? mzN : mzF;
  for (const k of norm ? NWIN : FWIN) {
    if (!mz.has(k)) continue;
    const sh = mz.shell(k).el, w = sh.offsetWidth, h = sh.offsetHeight; if (!w || !h) continue;
    if (k === 'views') viz.classList.toggle('row', w > h * 1.5);
    else if (k === 'params') $('win3dParams').classList.toggle('mwPar', w >= 560);
  }
}
function syncKpi() {
  KP.forEach(k => { calc.classList.toggle('hk-' + k, !pref.kpi[k]); });
  if (root.Display) root.Display.refresh();                                 // cases du bandeau données dans la fenêtre Affichage
}
function setBand(open) {
  bandOpen = !!open; band.classList.toggle('closed', !open); if (root.Display) root.Display.refresh();
  const t = $('dbTab'); t.textContent = open ? '‹' : '›'; t.setAttribute('aria-expanded', open); t.title = open ? 'Replier le bandeau données' : 'Déployer le bandeau données'; t.setAttribute('aria-label', t.title);
}
/* le switch vert (valeurs dans les simulations) passe sur ON : le bandeau se déploie aussi s'il était replié */
function simSwitch(onNow) { if (lastSw === false && onNow && !bandOpen) setBand(true); lastSw = !!onNow; }

function vars() {
  if (main) main.style.setProperty('--hdr3d', 8 + 'px');
}
function kick() {                                                           // les fenêtres ont changé de taille : les vues SVG se redessinent à leur nouvelle taille
  if (kickRaf || !on || !cb) return;
  kickRaf = requestAnimationFrame(() => { kickRaf = 0; if (on) cb.render(); });
}

function init(callbacks) {
  if (inited) return; cb = callbacks;
  calc = $('p-calc'); main = document.querySelector('main'); stage = $('stage3d'); side = $('side3d'); colOut = document.querySelector('.col.out'); viz = $('viz'); params = $('params');
  status = $('status'); warnBox = $('warnBox'); simVals = $('simVals'); kpis = $('kpis'); band = $('dataBand'); dbIn = $('dbIn'); dragSel = $('dragSel3d');
  cards = { face: viz.querySelector('.card.face'), side: viz.querySelector('.card.side'), top: viz.querySelector('.card.top') };
  home.drag = { parent: dragSel.parentNode, next: dragSel.nextSibling };

  tabs = mk('tabs3d'); tabs.innerHTML = '<button type="button" data-t="views" title="Afficher / replier la fenêtre des vues (face, côté, dessus)">Vues</button><button type="button" data-t="params" title="Afficher / replier la fenêtre des réglages">Réglages</button>';
  tabs.onclick = e => { if (e.target.closest('[data-reset]')) { resetLayout(); return; } const b = e.target.closest('button[data-t]'); if (b) toggle(b.dataset.t); };
  $('closeViews').onclick = () => toggle('views'); $('closeParams').onclick = () => toggle('params');
  /* appui long (1 s) sur le bouton d'une vue : sa disposition par défaut */
  let holdT = 0, held = false;
  const mm = $('m3modes');
  mm.addEventListener('pointerdown', e => {
    const b = e.target.closest('button[data-m]'); if (!b || (e.button && e.button !== 0)) return;
    held = false; b.classList.add('holding'); clearTimeout(holdT);
    holdT = setTimeout(() => { held = true; b.classList.remove('holding'); activeView = null; resetAndGo(b.dataset.m); renderModes(); }, 1000);
  });
  const endHold = e => { clearTimeout(holdT); mm.querySelectorAll('.holding').forEach(b => b.classList.remove('holding')); };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => mm.addEventListener(t, endHold));
  mm.addEventListener('contextmenu', e => { if (e.target.closest('button[data-m]')) e.preventDefault(); });
  mm.addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (!b) return; if (held) { held = false; return; } activeView = null; const m = b.dataset.m;
    setMode(m, { main: fl.main });
    renderModes(); });      // Vue principale / compacte / vues élargies (barre du haut)
  $('dbTab').onclick = () => setBand(!bandOpen);

  root3 = mk('m3Root'); root3.id = 'm3Root'; root3.hidden = true;
  bar = mk('m3Bar'); bar.id = 'm3Bar'; scroll = mk('c3Scroll scroll'); scroll.id = 'c3Scroll'; fmain = mk('f3Main'); fmain.id = 'f3Main'; mdata = mk('m3Data'); mdata.id = 'm3Data';
  const fhost = mk('mzHost');
  fWrap = mk('n3Wrap f3Wrap');                                              // vues élargies : la mosaïque entourée des onglets de Réglages / Affichage (mêmes bords que la vue principale)
  for (const q of ['l', 'r', 't', 'b']) { fStrip[q] = mk('n3St n3St-' + q); fWrap.append(fStrip[q]); }
  fWrap.append(fhost); fmain.append(fWrap);
  fWrap.addEventListener('click', e => { const t = e.target.closest('[data-f]'); if (t) fToggle(t.dataset.f); });
  park = mk('m3Park'); park.hidden = true;
  nWrap = mk('n3Wrap'); nWrap.id = 'n3Wrap'; nWrap.hidden = true; nHost = mk('mzHost');
  for (const q of ['l', 'r', 't', 'b']) { nStrip[q] = mk('n3St n3St-' + q); nWrap.append(nStrip[q]); }
  nWrap.append(nHost);
  nWrap.addEventListener('click', e => { const t = e.target.closest('[data-n]'), r = e.target.closest('[data-nr]'); if (t) nToggle(t.dataset.n); else if (r) { resetLayout(); } });
  root3.append(bar, scroll, fmain, nWrap, mdata, park); calc.append(root3);
  bar.onclick = barClick;
  dataBox = mk('dataBox');
  const chost = buildRows();
  mzC = Mosaic.create({ host: chost, wins: winDefs('c'), park, place: placeInViews, folded: cpt.fold, onDropOut: dropOut, onChange: () => { cpt.tree = mzC.state(); if (mode === 'compact') layoutRows(); else { renderBar(); kick(); } } });
  mzF = Mosaic.create({ host: fhost, wins: winDefs('f'), park, edge: true, share: nShare, place: placeF,
    onClose: id => { if (!FWIN.includes(id)) return; const sh = mzF.shell(id).el.getBoundingClientRect(), hr = fhost.getBoundingClientRect(), side = fl.dock[id], f = side === 'l' || side === 'r' ? sh.width / hr.width : sh.height / hr.height; if (isFinite(f) && f > .05) fl.frac[id] = Math.min(.5, f); },      // dernière taille de Réglages / Affichage
    onChange: () => { fl.tree = mzF.state(); if (mode === 'full') { updateDocksF(); renderTabsF(); requestAnimationFrame(adaptN); } renderBar(); kick(); } });
  mzN = Mosaic.create({ host: nHost, wins: winDefs('n'), park, edge: true, share: nShare, place: placeN,
    onClose: id => { const sh = mzN.shell(id).el.getBoundingClientRect(), hr = nHost.getBoundingClientRect(), side = nav.dock[id], f = side === 'l' || side === 'r' ? sh.width / hr.width : sh.height / hr.height; if (isFinite(f) && f > .05) nav.frac[id] = Math.min(.5, f); },
    onChange: () => { nav.tree = mzN.state(); if (mode === 'normal') { updateDocks(); renderTabsN(); requestAnimationFrame(adaptN); } kick(); } });

  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { if (on) kick(); }); Object.values(cards).forEach(c => ro.observe(c));
    roN = new ResizeObserver(() => { if (on && (mode === 'normal' || mode === 'full')) adaptN(); }); NWIN.forEach(k => roN.observe(mzN.shell(k).el)); FWIN.forEach(k => roN.observe(mzF.shell(k).el)); }
  inited = true; applyPanel(); syncKpi(); setBand(true);
}

function enter() {
  if (on) return; on = true;
  calc.classList.add('m3d'); main.classList.add('m3d');
  colOut.append(dragSel);
  arrange(mode);
}
function leave() {
  if (!on) return;
  if (root.WinZoom) root.WinZoom.close();
  toBase();
  calc.insertBefore(params, calc.firstChild);
  colOut.insertBefore(viz, $('msg3d')); colOut.insertBefore(simVals, $('msg3d')); colOut.append(kpis);
  calc.append(colOut);
  home.drag.parent.insertBefore(dragSel, home.drag.next);
  on = false;
  calc.classList.remove('m3d', 'm3n', 'm3c', 'm3f'); main.classList.remove('m3d', 'm3n', 'm3c', 'm3f', 'p3off', 'p3noviews', 'p3noparams', 'p3nodisp'); main.style.removeProperty('--hdr3d');
  KP.forEach(k => calc.classList.remove('hk-' + k));
  ['side', 'top', 'face'].forEach(k => cards[k].classList.remove('hide3d')); viz.classList.remove('hide3d');
}

/* indicateurs du bandeau données affichés (fenêtre Affichage) */
const kpi = { list: () => KP.slice(), get: k => !!pref.kpi[k], set(k, v) { if (!KP.includes(k)) return; pref.kpi[k] = v ? 1 : 0; save(); if (calc) syncKpi(); } };

root.Layout3D = { init, enter, leave, vars, kick, setMode, simSwitch, setBand, kpi, get bandOpen() { return bandOpen; }, snapshot, restore, bigView, floatParams, scrollInset, setActive: id => { activeView = id || null; renderModes(); }, get mode() { return mode; }, get active() { return activeView; } };
})(window);
