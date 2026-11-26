/* VP – fenêtres d'avant-plan (Affichage, Verrous…) : une fenêtre au centre, le reste assombri, contenu qui défile, menu facultatif en haut.
   Elles s'empilent : une nouvelle fenêtre s'ouvre par-dessus la précédente (et par-dessus une fenêtre agrandie, winzoom.js).
   On la ferme par sa croix, un appui en dehors (sur le fond assombri) ou Échap (seulement la fenêtre du dessus). */
(function (root) {
'use strict';

const Z0 = 58;                                       // au-dessus d'une fenêtre agrandie (55) ; sous les vignettes d'aide, alertes et modales (60 et plus)
const stack = [];
const mk = (cls, tag = 'div') => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

/* opts : { title, cls ('pnlSmall' : fenêtre plus petite), menu : [{ id, label }] (bouton = défilement rapide vers l'élément #id du contenu), build(body), onClose(),
           dock : volet posé à droite de la fenêtre agrandie (winzoom.js), sans assombrir : la fenêtre agrandie se rétrécit pour lui laisser la place et reste visible et utilisable } */
const relayout = () => requestAnimationFrame(() => dispatchEvent(new Event('resize')));      // la fenêtre agrandie a changé de largeur : ses vues se redessinent
function open(opts) {
  if (opts.dock) { const d = stack.find(g => g.opts.dock); if (d) close(d); }      // un seul volet à droite de la fenêtre agrandie à la fois (Affichage ou Verrous)
  const layer = mk('pnlLayer' + (opts.dock ? ' pnlDock' : '')), back = mk('pnlBack'), win = mk('pnl' + (opts.cls ? ' ' + opts.cls : '')), head = mk('pnlHead'), body = mk('pnlBody');
  layer.style.zIndex = Z0 + stack.length * 2;
  win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', opts.title);
  const t = mk('pnlTitle', 'b'); t.innerHTML = opts.title;
  const x = mk('pnlX', 'button'); x.type = 'button'; x.textContent = '✕'; x.title = 'Fermer'; x.setAttribute('aria-label', 'Fermer');
  head.append(t, mk('pnlSp', 'span'), x); win.append(head);
  if (opts.menu && opts.menu.length) {
    const nav = mk('pnlMenu');                                     // pas d'élément <nav> : les règles du menu de gauche (nav, nav button) s'y appliqueraient
    for (const m of opts.menu) { const b = mk('pnlMi', 'button'); b.type = 'button'; b.dataset.to = m.id; b.textContent = m.label; nav.append(b); }
    nav.onclick = e => {
      const b = e.target.closest('[data-to]'), tgt = b && body.querySelector('#' + b.dataset.to); if (!tgt) return;
      body.scrollTo({ top: tgt.offsetTop - 6, behavior: 'smooth' });      // le contenu est le repère des sections (position: relative)
      tgt.classList.remove('pnlFlash'); void tgt.offsetWidth; tgt.classList.add('pnlFlash');
    };
    body.addEventListener('scroll', () => {                                   // le bouton de la section visible est mis en avant
      let cur = null; for (const m of opts.menu) { const s = body.querySelector('#' + m.id); if (s && s.offsetTop - body.scrollTop <= 40) cur = m.id; }
      if (!cur) cur = opts.menu[0].id;
      nav.querySelectorAll('[data-to]').forEach(b => b.classList.toggle('on', b.dataset.to === cur));
    }, { passive: true });
    win.append(nav);
  }
  win.append(body); if (opts.dock) layer.append(win); else layer.append(back, win); document.body.append(layer);
  if (opts.dock) { document.body.classList.add('wzSide'); relayout(); }
  const h = { layer, win, body, close: () => close(h), refresh: () => { if (opts.build) { const st = body.scrollTop; body.replaceChildren(); opts.build(body, h); body.scrollTop = st; } } };
  h.opts = opts;
  stack.push(h);
  back.addEventListener('click', () => close(h));
  x.onclick = () => close(h);
  if (opts.build) opts.build(body, h);
  if (opts.menu && opts.menu.length) body.dispatchEvent(new Event('scroll'));
  return h;
}
function close(h) {
  const i = stack.indexOf(h); if (i < 0) return;
  for (const g of stack.splice(i)) { g.layer.remove(); if (g.opts.dock) { document.body.classList.remove('wzSide'); relayout(); } if (g.opts.onClose) g.opts.onClose(); }      // fermer une fenêtre ferme aussi celles qui étaient ouvertes par-dessus
}
const closeAll = () => { if (stack.length) close(stack[0]); };

/* Échap : seulement la fenêtre du dessus (la fenêtre agrandie en dessous reste agrandie) */
addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) { e.stopImmediatePropagation(); e.preventDefault(); close(stack[stack.length - 1]); } }, true);

root.Panels = { open, close, closeAll, list: () => stack.slice(), top: () => stack[stack.length - 1] || null };
})(window);
