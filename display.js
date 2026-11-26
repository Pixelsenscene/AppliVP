/* VP – fenêtre AFFICHAGE (page VP) : les règles d'affichage de toutes les fenêtres, à la suite, avec un menu en haut pour aller vite à l'une d'elles.
   • bouton œil de la barre du haut : toutes les fenêtres (Vue 3D, vues de face, de côté, de dessus, bandeau données) ;
   • œil dans la barre d'une fenêtre agrandie (double-clic sur sa barre, winzoom.js) : une petite fenêtre, par-dessus, avec les règles de cette fenêtre seulement.
   Les règles des vues sont gardées par view3d.js (View3D.show), celles du bandeau données par layout3d.js (Layout3D.kpi, Layout3D.setBand). Rien n'est calculé ici. */
(function (root) {
'use strict';

const $ = id => document.getElementById(id);
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/></svg>';
const LABELS = { beam: 'Faisceau', pos: 'Position VP', ori: 'Orientation VP', lens: 'Lens shift', calc: 'Calcul config', adv: 'Réglages supplémentaires' };
const TIPS = {
  calc: 'Afficher dans la vue la valeur du paramètre touché dans la barre de valeurs (Calculs config / favoris)',
  adv: 'Afficher les boutons « Viser le centre de l’écran », Lens shift, Translation, Rotation et Zoom',
};
const KPI = { util: 'Pixels utiles', perdus: 'Pixels perdus', couvert: 'Écran couvert', ratio: 'Ratio', lux: 'Éclairement', forme: 'Forme' };
const SECTIONS = [                                   // fenêtres réglables, dans l'ordre du menu
  { id: '3d', title: 'Vue 3D', short: '3D', sub: 'La scène 3D (vue principale, ligne des vues, vues élargies)' },
  { id: 'face', title: 'Vue de face', short: 'Face', sub: 'Le faisceau vu depuis le public' },
  { id: 'side', title: 'Vue de côté', short: 'Côté', sub: 'Recul et hauteur' },
  { id: 'top', title: 'Vue de dessus', short: 'Dessus', sub: 'Recul et centrage' },
  { id: 'band', title: 'Bandeau données', short: 'Bandeau', sub: 'Indicateurs en bas de la scène (ligne Données en vue compacte)' },
];
const panels = new Set();                            // fenêtres Affichage ouvertes (générale et / ou propre à une fenêtre agrandie)
let winPanel = null;

/* ----- contenu : une section par fenêtre, des boutons à bascule ----- */
function chip(on, attrs, label, tip) {
  return `<button type="button" class="dspChip${on ? ' on' : ''}" aria-pressed="${on}" ${attrs}${tip ? ` title="${tip}"` : ''}>${label}</button>`;
}
function sectionHtml(sec) {
  let chips = '';
  if (sec.id === 'band') {
    const L = root.Layout3D;
    chips = chip(!!(L && L.bandOpen), 'data-band="1"', 'Bandeau déployé', 'Bandeau déployé ou replié vers la gauche (languette ‹ / ›)')
      + '<span class="dspSep" aria-hidden="true"></span>'
      + Object.keys(KPI).map(k => chip(!!(L && L.kpi.get(k)), `data-kp="${k}"`, KPI[k])).join('');
  } else {
    const V = root.View3D, defs = V.show.defs()[sec.id] || {};
    chips = Object.keys(LABELS).filter(k => k in defs).map(k => chip(V.show.get(sec.id, k), `data-w="${sec.id}" data-k="${k}"`, LABELS[k], TIPS[k])).join('');
    if (sec.id === '3d') chips += chip(V.help.get(), 'data-help="1"', 'Aide des gestes', 'Afficher l’aide des gestes de la vue 3D (en bas de la scène)');
  }
  return `<section class="dspSec" id="dsp-${sec.id}"><h3>${sec.title}</h3><p class="dspSub">${sec.sub}</p><div class="dspChips">${chips}</div></section>`;
}
function build(body, ids) {
  body.classList.add('dspBody');
  body.innerHTML = SECTIONS.filter(s => ids.includes(s.id)).map(sectionHtml).join('');
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.k) root.View3D.show.set(b.dataset.w, b.dataset.k, !root.View3D.show.get(b.dataset.w, b.dataset.k));
  else if (b.dataset.help) root.View3D.help.set(!root.View3D.help.get());
  else if (b.dataset.kp) root.Layout3D.kpi.set(b.dataset.kp, !root.Layout3D.kpi.get(b.dataset.kp));
  else if (b.dataset.band) root.Layout3D.setBand(!root.Layout3D.bandOpen);
  refresh();
}
function openPanel(ids, o = {}) {
  const multi = ids.length > 1;
  const h = root.Panels.open({
    title: o.title || 'Affichage', cls: o.cls, dock: !!o.dock,
    menu: multi ? SECTIONS.filter(s => ids.includes(s.id)).map(s => ({ id: 'dsp-' + s.id, label: s.short })) : null,
    build: body => build(body, ids),
    onClose: () => { panels.delete(h); if (o.onClose) o.onClose(); },
  });
  h.body.addEventListener('click', onClick);
  panels.add(h);
  return h;
}
function refresh() { panels.forEach(h => h.refresh()); syncTools(); }

/* ----- fenêtre agrandie : dans sa barre, accès rapide (Position VP, Calcul config) pour une vue seule, puis l'œil ----- */
const QUICK = ['pos', 'calc'];                       // éléments réglables d'un appui depuis la barre d'une vue agrandie
let tools = null, toolsW = null, keepSide = false;      // keepSide : carrousel (winzoom.js) — le volet Affichage ouvert suit la vue suivante                     // groupe placé dans la barre ; vue concernée (3d, face, side, top) pour l'accès rapide
function sectionsFor(el) {
  if (!el || !root.View3D || !root.View3D.active) return [];
  if (el.classList.contains('dataBand') || el.classList.contains('mw-data')) return ['band'];
  const w = el.classList.contains('mw') ? el.dataset.w : el.matches('.viz .card') ? ['face', 'side', 'top'].find(k => el.classList.contains(k)) : null;
  return w === 'v3d' ? ['3d'] : w === 'views' ? ['face', 'side', 'top'] : ['face', 'side', 'top'].includes(w) ? [w] : [];
}
function syncTools() {
  if (!tools) return;
  tools.querySelectorAll('[data-q]').forEach(q => { const on = root.View3D.show.get(toolsW, q.dataset.q); q.classList.toggle('on', on); q.setAttribute('aria-pressed', on); });
  const e = tools.querySelector('.wzEye'); if (e) e.classList.toggle('on', !!winPanel);
}
function onZoom(el) {
  const sw = root.WinZoom.switching;
  if (!el) keepSide = sw && !!winPanel; else if (!sw) keepSide = false;
  if (winPanel) { const p = winPanel; winPanel = null; p.close(); }
  if (tools) { tools.remove(); tools = null; toolsW = null; }
  const ids = sectionsFor(el); if (!ids.length) return;
  tools = document.createElement('span'); tools.className = 'wzTools';
  const btn = (cls, title, html) => { const b = document.createElement('span'); b.className = cls; b.setAttribute('role', 'button'); b.tabIndex = 0; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = html; tools.append(b); return b; };
  if (ids.length === 1 && ids[0] !== 'band') {                                             // vue seule : Position VP et Calcul config d'un appui
    toolsW = ids[0];
    const defs = root.View3D.show.defs()[toolsW] || {};
    QUICK.filter(k => k in defs).forEach(k => { const q = btn('wzQ', 'Afficher / masquer « ' + LABELS[k] + ' » dans cette vue', LABELS[k]); q.dataset.q = k; });
  }
  const eye = btn('wzEye', 'Affichage de cette fenêtre (volet à droite)', EYE);
  const go = () => {
    if (winPanel) { winPanel.close(); return; }
    const t = SECTIONS.filter(s => ids.includes(s.id)).map(s => s.title).join(', ');
    winPanel = openPanel(ids, { title: 'Affichage <span class="pnlFor">· ' + (ids.length > 1 ? 'Vues' : t) + '</span>', cls: 'pnlSide', dock: true, onClose: () => { winPanel = null; syncTools(); } });      // volet à droite de la vue : il ne la masque pas
    syncTools();
  };
  const act = t => { const q = t.closest('[data-q]'); if (q) { root.View3D.show.set(toolsW, q.dataset.q, !root.View3D.show.get(toolsW, q.dataset.q)); refresh(); } else if (t.closest('.wzEye')) go(); };
  tools.addEventListener('click', e => { e.stopPropagation(); act(e.target); });
  tools.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e.target); } });
  const slot = root.WinZoom.slot(); if (slot) slot.append(tools);                         // barre du haut de la fenêtre agrandie, après les verrous (app.js)
  syncTools();
  if (!ids.includes('band')) root.WinZoom.attach($('dataBand'));                         // une vue agrandie : le bandeau données s'affiche sous elle (elle se réduit pour lui laisser la place)
  if (keepSide) { keepSide = false; go(); }
}

function init() {
  const b = $('eyeBtn'); if (b) b.onclick = () => { const all = [...panels].find(h => !h.opts.cls); if (all) all.close(); else openPanel(SECTIONS.map(s => s.id)); };
  if (root.WinZoom) root.WinZoom.on(onZoom);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

root.Display = { open: () => openPanel(SECTIONS.map(s => s.id)), refresh };
})(window);
