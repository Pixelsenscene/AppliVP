/* VP – agrandissement d'une fenêtre par double-clic (souris) ou double appui (doigt) sur sa barre du haut.
   La fenêtre passe en grand (80 % de l'application), au centre, le reste assombri ; un clic en dehors, un nouveau double-clic sur sa barre ou Échap la remettent à sa place.
   La fenêtre n'est jamais déplacée dans le document : elle reste où elle est (mêmes styles, mêmes écouteurs) et passe seulement en position fixe (classe .wz).
   Fenêtres concernées : fenêtres de la mosaïque et lignes de la vue compacte (barre .mwh), sections Vues / Réglages / Affichage (barre .wh),
   cartes des vues face / côté / dessus hors mosaïque (bande du haut de la carte), bandeau données, panneau ∑ Calculs détaillés (barre .dhead). */
(function (root) {
'use strict';

const Z = 55;                                        // au-dessus de la barre du haut, des volets et des menus de la page ; sous les fenêtres d'avant-plan (vignettes, alertes, modales)
const TOP = 34;                                      // hauteur (px) de la « barre » d'une carte de vue (titre en haut à gauche)
const NOT = 'button,input,select,textarea,a,label,[role=button],[role=checkbox],.chip,.rollDot,.handle,.vpHandle,.zlk,.wzEye,.wzTools,.wzSlot,.wzBand';      // éléments actifs : un double appui y garde son effet propre
let cur = null, back = null, lifted = [], watch = 0, down = null, last = null, swallow = false;
const subs = [];                                     // abonnés : appelés avec la fenêtre agrandie (ou null) à chaque changement (œil et verrous de la fenêtre agrandie)
const emit = () => subs.forEach(fn => { try { fn(cur); } catch (err) { console.error(err); } });

/* fenêtre dont la barre du haut est sous le pointeur (null sinon) */
function winAt(e) {
  const t = e.target; if (!(t instanceof Element) || t.closest(NOT)) return null;
  let b = t.closest('.mwh'); if (b) { const w = b.closest('.mw'); return w && (!w.classList.contains('mwBare') || w === cur) ? w : null; }      // la 3D de la vue principale n'a de barre qu'agrandie (carrousel)
  b = t.closest('.win3d>.wh'); if (b) return b.parentElement;
  b = t.closest('#details .dhead'); if (b) return b.parentElement.classList.contains('open') ? b.parentElement : null;
  b = t.closest('.dataBand'); if (b) return b;
  const c = t.closest('.viz .card');
  if (c && !(c.parentElement && c.parentElement.classList.contains('mwb')) && e.clientY - c.getBoundingClientRect().top <= TOP) return c;      // carte seule dans une fenêtre de la mosaïque : c'est la barre de la fenêtre qui compte
  return null;
}

/* Les ancêtres qui forment un contexte d'empilement (z-index) ou un repère pour la position fixe (transform, filter…) sont neutralisés le temps de l'agrandissement. */
function lift(el, z = Z) {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n), set = (p, v) => { lifted.push([n, p, n.style.getPropertyValue(p), n.style.getPropertyPriority(p)]); n.style.setProperty(p, v, 'important'); };
    if (cs.zIndex !== 'auto' && +cs.zIndex < z) set('z-index', String(z));
    if (cs.transform !== 'none') set('transform', 'none');
    if (cs.filter !== 'none') set('filter', 'none');
    if ((cs.backdropFilter || cs.webkitBackdropFilter || 'none') !== 'none') { set('backdrop-filter', 'none'); set('-webkit-backdrop-filter', 'none'); }
    if (cs.willChange && /transform|filter/.test(cs.willChange)) set('will-change', 'auto');
    if (cs.contain && cs.contain !== 'none') set('contain', 'none');
  }
}
function unlift() { for (const [n, p, v, pr] of lifted.reverse()) { if (v) n.style.setProperty(p, v, pr); else n.style.removeProperty(p); } lifted = []; }

const relayout = () => requestAnimationFrame(() => dispatchEvent(new Event('resize')));      // les vues (SVG, scène 3D) se redessinent à leur nouvelle taille
const gone = el => !el.isConnected || !el.getClientRects().length || (el.id === 'details' && !el.classList.contains('open'));

function open(el) {
  if (cur === el) return; close(true);
  cur = el; lift(el);
  back = document.createElement('div'); back.className = 'wzBack'; document.body.append(back);
  el.classList.add('wz'); document.body.classList.add('wzOn');
  watch = setInterval(() => { if (cur && gone(cur)) close(); }, 300);      // fenêtre fermée, rangée ou page quittée pendant l'agrandissement
  emit(); relayout();
}
function close(quiet) {
  if (!cur) return;
  const el = cur; cur = null; clearInterval(watch); watch = 0;
  detach();
  el.classList.remove('wz'); document.body.classList.remove('wzOn'); unlift();
  if (back) { back.remove(); back = null; }
  emit(); if (slotEl) { slotEl.remove(); slotEl = null; }
  if (!quiet) relayout();
}

/* Emplacement dans la barre du haut de la fenêtre agrandie, pour les outils des autres modules (verrous x, y, z, zoom ; accès rapide d'affichage ; œil).
   Fenêtre de la mosaïque : dans sa barre de titre, avant ses boutons ; sinon (carte de vue, bandeau) : pastille en haut à droite. Retiré à la fermeture.
   Seulement des <span role="button"> : la mosaïque retire et recrée les <button> de la barre à chaque rangement. */
let slotEl = null;
function slot() {
  if (!cur) return null;
  if (slotEl && slotEl.isConnected) return slotEl;
  slotEl = document.createElement('span'); slotEl.className = 'wzSlot';
  const head = cur.classList.contains('mw') ? cur.querySelector(':scope > .mwh') : null;
  if (head) head.insertBefore(slotEl, head.querySelector('button')); else { slotEl.classList.add('wzSlotAbs'); cur.append(slotEl); }
  return slotEl;
}

/* Élément posé sous la fenêtre agrandie (le bandeau données sous une vue) : la fenêtre se réduit en hauteur pour lui laisser la place. */
let comp = null, compRO = null;
function attach(el) {
  if (!cur || !el || comp || cur === el || el.contains(cur)) return;
  comp = el; lift(el, Z + 1); el.classList.add('wzBand'); document.body.classList.add('wzBandOn');
  const measure = () => { if (comp) document.body.style.setProperty('--wzBandH', comp.offsetHeight + 'px'); };
  measure();
  if (typeof ResizeObserver !== 'undefined') { compRO = new ResizeObserver(measure); compRO.observe(el); }
  relayout();
}
function detach() {
  if (!comp) return;
  comp.classList.remove('wzBand'); document.body.classList.remove('wzBandOn'); document.body.style.removeProperty('--wzBandH');
  if (compRO) { compRO.disconnect(); compRO = null; }
  comp = null;
}
const toggle = el => { if (cur === el) close(); else open(el); };

/* au-dessus de la fenêtre agrandie (vignette, message, modale) : un appui n'y compte pas comme « en dehors » */
function above(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.position === 'fixed' && +cs.zIndex > Z) return true; }
  return false;
}

/* appui en dehors de la fenêtre agrandie : elle revient à sa place, et l'appui ne fait rien d'autre */
document.addEventListener('pointerdown', e => {
  swallow = false;
  if (!cur || !(e.target instanceof Element) || cur.contains(e.target) || above(e.target)) return;
  close(); swallow = true; down = null; last = null;
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
for (const t of ['pointerup', 'click']) document.addEventListener(t, e => { if (swallow) { e.preventDefault(); e.stopImmediatePropagation(); if (t === 'click') swallow = false; } }, true);

/* double appui / double-clic : deux appuis brefs, sans glisser, au même endroit de la même barre */
document.addEventListener('pointerdown', e => {
  if (!e.isPrimary || (e.button && e.button !== 0)) { down = null; last = null; return; }
  const w = winAt(e); down = w ? { w, x: e.clientX, y: e.clientY, t: performance.now() } : null;
  if (!w) last = null;
}, true);
document.addEventListener('pointerup', e => {
  const d = down; down = null; if (!d || !e.isPrimary) return;
  const now = performance.now(), sx = e.clientX - d.x, sy = e.clientY - d.y;
  if (cur && d.w === cur && Math.abs(sx) > 60 && Math.abs(sy) < 40 && now - d.t < 800) { last = null; step(sx < 0 ? 1 : -1); return; }      // glisser la barre vers la gauche : vue suivante ; vers la droite : vue précédente
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || now - d.t > 450) { last = null; return; }
  if (last && last.w === d.w && now - last.t < 400 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) { last = null; toggle(d.w); }
  else last = { w: d.w, t: now, x: e.clientX, y: e.clientY };
}, true);
document.addEventListener('pointercancel', () => { down = null; }, true);
addEventListener('keydown', e => { if (e.key === 'Escape' && cur) close(); });

/* ----- Carrousel des vues agrandies (3D, face, côté, dessus) : défilement horizontal (pavé tactile, molette inclinée) sur la vue, ou glisser sa barre du haut,
   pour passer à la vue voisine ; la nouvelle vue arrive par un léger glissement. Seules les vues ouvertes de la même présentation en font partie, dans l'ordre 3D, face, côté, dessus. */
const ORDER = ['v3d', 'face', 'side', 'top'];
const viewId = e => e.classList.contains('mw') ? e.dataset.w : e.matches('.viz .card') ? ['face', 'side', 'top'].find(k => e.classList.contains(k)) : null;
function carousel(el) {
  if (!el || !ORDER.includes(viewId(el))) return [];
  const host = el.classList.contains('mw') ? el.closest('.mz') : null, v3 = document.querySelector('#n3Wrap:not([hidden]) .mw-v3d');
  const list = [...new Set([...(host ? host.querySelectorAll('.mw[data-w]') : []),      // compacte, vues élargies : les vues de la mosaïque
    ...document.querySelectorAll('#viz > .card'),                                                      // page 2D, fenêtre Vues de la vue principale : les cartes
    ...(v3 ? [v3] : [])])];                                                                            // vue principale : la 3D aussi
  return list.filter(e => ORDER.includes(viewId(e)) && (e === el || e.getClientRects().length)).sort((a, b) => ORDER.indexOf(viewId(a)) - ORDER.indexOf(viewId(b)));
}
let switching = false, swT = 0;
function step(dir) {
  const list = carousel(cur); if (list.length < 2) return;
  const next = list[(list.indexOf(cur) + dir + list.length) % list.length];
  document.body.classList.add('wzSwitch');                           // pas de fondu (bandeau, volets) pendant le passage d'une vue à l'autre
  switching = true; try { open(next); } finally { switching = false; }
  next.classList.remove('wzFromR', 'wzFromL'); void next.offsetWidth; next.classList.add(dir > 0 ? 'wzFromR' : 'wzFromL');
  clearTimeout(swT); swT = setTimeout(() => { document.body.classList.remove('wzSwitch'); next.classList.remove('wzFromR', 'wzFromL'); }, 360);
}
/* défilement horizontal : un seul passage par geste (l'inertie du pavé tactile ne fait pas défiler plusieurs vues) ; le défilement vertical reste aux vues (zoom de la 3D…) */
let wAcc = 0, wLock = false, wIdle = 0;
addEventListener('wheel', e => {
  if (!cur || !(e.target instanceof Element) || !(cur.contains(e.target) || e.target === back)) return;
  { const h = e.target.closest('.simGrn'); if (h && h.scrollWidth > h.clientWidth + 1) return; }      // favoris qui défilent : le geste fait défiler les favoris, pas le carrousel
  let dx = e.deltaX, dy = e.deltaY; if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
  if (!dx || Math.abs(dx) <= Math.abs(dy) * 1.2 || carousel(cur).length < 2) return;
  e.preventDefault(); e.stopPropagation();
  clearTimeout(wIdle); wIdle = setTimeout(() => { wAcc = 0; wLock = false; }, 240);
  if (wLock) return;
  wAcc += dx;
  if (Math.abs(wAcc) > 70) { const d = wAcc > 0 ? 1 : -1; wAcc = 0; wLock = true; step(d); }
}, { capture: true, passive: false });

root.WinZoom = { open, close: () => close(), toggle, slot, attach, step, get switching() { return switching; }, get active() { return cur; }, has: el => !!el && cur === el, on: fn => subs.push(fn) };
})(window);
