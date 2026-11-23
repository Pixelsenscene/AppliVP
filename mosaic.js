/* VP – gestionnaire de fenêtres en mosaïque (aucune dépendance).
   Les fenêtres remplissent leur zone sans se chevaucher. La disposition est un arbre : chaque nœud est soit une fenêtre {id}, soit un groupe {dir:'h'|'v', kids:[…]}
   (h = côte à côte, v = empilées) ; chaque nœud porte un poids `w` (sa part de l'espace du groupe).
   - Redimensionner : tirer le séparateur entre deux fenêtres voisines.
   - Déplacer : glisser la barre de titre. Déposer au centre d'une autre fenêtre = les deux échangent leur place ; déposer près d'un de ses bords
     = la fenêtre se glisse à côté (à gauche, à droite, au-dessus ou en dessous).
   - Fenêtre `rowable` : peut vivre dans la mosaïque ou ailleurs (une ligne de l'appelant) ; elle n'est donc jamais rangée dans `park` ; insert() l'y fait entrer,
     probe() / unprobe() montrent où elle atterrirait pendant que l'appelant la glisse, onDropOut() signale qu'elle a été lâchée en dehors.
   - Rétracter : une fenêtre `foldable` se réduit à sa barre de titre (fold / setFold), sans quitter la mosaïque ; ses voisines prennent la place.
   - Fermer / recharger : close(id) / open(id) (la fenêtre rouvre à l'endroit prévu par `place`, par défaut au bout du groupe principal).
   Le contenu de chaque fenêtre est un élément DOM fourni (`el`) : il n'est jamais recréé, seulement déplacé, donc ses écouteurs et son état restent intacts ;
   fermé, il est rangé dans l'élément `park` (caché) pour que le reste de l'application le retrouve toujours. */
(function (root) {
'use strict';

const MIN = 90;                                                    // taille minimale (px) d'une fenêtre au glisser d'un séparateur
const isLeaf = n => n && n.id != null;
const mk = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = cls; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = n => JSON.parse(JSON.stringify(n, (k, v) => k === 'el' ? undefined : v));      // sans les références DOM

function create(opts) {
  const host = opts.host, wins = opts.wins, park = opts.park || null, place = opts.place || null, onChange = opts.onChange || (() => {}), onAction = opts.onAction || (() => {});
  let tree = null, empty = null;
  const shells = {}, folded = opts.folded || {};                   // folded : fenêtres rétractées (objet partagé avec l'appelant, gardé d'une disposition à l'autre)
  const onDropOut = opts.onDropOut || null;                         // une fenêtre `rowable` lâchée hors de la mosaïque : l'appelant la range ailleurs
  host.classList.add('mz');

  /* ----- arbre ----- */
  const walk = (n, fn, p = null) => { if (!n) return; fn(n, p); if (!isLeaf(n)) n.kids.forEach(k => walk(k, fn, n)); };
  const find = id => { let r = null; walk(tree, (n, p) => { if (n.id === id) r = { n, p }; }); return r; };
  const ids = () => { const a = []; walk(tree, n => { if (isLeaf(n)) a.push(n.id); }); return a; };
  function flat(n) {                                                // fusionne les groupes imbriqués de même sens ; un groupe d'un seul enfant disparaît
    if (!n || isLeaf(n)) return n;
    const out = [];
    for (const k0 of n.kids) {
      const k = flat(k0); if (!k) continue;
      if (!isLeaf(k) && k.dir === n.dir) { const s = k.kids.reduce((a, g) => a + (g.w || 1), 0) || 1; k.kids.forEach(g => out.push({ ...g, w: (g.w || 1) / s * (k.w || 1) })); } else out.push(k);
    }
    if (!out.length) return null;
    if (out.length === 1) return { ...out[0], w: n.w || 1 };
    return { dir: n.dir, w: n.w || 1, kids: out };
  }
  const strip = (n, id) => { if (!n) return null; if (isLeaf(n)) return n.id === id ? null : n; return { ...n, kids: n.kids.map(k => strip(k, id)).filter(Boolean) }; };
  const setTree = t => { tree = t ? flat(clone(t)) : null; render(); };

  function insertBeside(targetId, id, side) {                       // side : l, r, t, b
    const f = find(targetId); if (!f) return;
    const dir = side === 'l' || side === 'r' ? 'h' : 'v', before = side === 'l' || side === 't';
    if (f.p && f.p.dir === dir) {
      const i = f.p.kids.indexOf(f.n), half = (f.n.w || 1) / 2; f.n.w = half;
      f.p.kids.splice(before ? i : i + 1, 0, { id, w: half });
    } else {
      const w = f.n.w || 1, wrap = { dir, w, kids: before ? [{ id, w: 1 }, { ...f.n, w: 1 }] : [{ ...f.n, w: 1 }, { id, w: 1 }] };
      if (f.p) f.p.kids[f.p.kids.indexOf(f.n)] = wrap; else tree = wrap;
    }
  }
  function insert(id, targetId, zone) {                            // fait entrer dans la mosaïque une fenêtre qui n'y était pas (zone c : à droite de la cible)
    if (find(id)) { move(id, targetId, zone); return; }
    if (!find(targetId)) return;
    insertBeside(targetId, id, zone === 'c' ? 'r' : zone); tree = flat(tree); render();
  }
  function swap(a, b) { const fa = find(a), fb = find(b); if (fa && fb) { fa.n.id = b; fb.n.id = a; } }
  function move(id, targetId, zone) {                               // zone : c (échange) ou l, r, t, b
    if (id === targetId || !find(id) || !find(targetId)) return;
    if (zone === 'c') swap(id, targetId);
    else { tree = strip(tree, id); tree = flat(tree); insertBeside(targetId, id, zone); tree = flat(tree); }
    render();
  }
  function close(id) { if (!find(id)) return; tree = flat(strip(tree, id)); render(); }
  function open(id) {
    if (find(id)) return;
    if (!tree) tree = { id, w: 1 };
    else if (place && place(tree, id)) { /* placée par l'appelant */ }
    else if (isLeaf(tree)) tree = { dir: 'h', w: 1, kids: [{ ...tree, w: 1 }, { id, w: 1 }] };
    else { const s = tree.kids.reduce((a, g) => a + (g.w || 1), 0) / tree.kids.length; tree.kids.push({ id, w: s || 1 }); }
    tree = flat(tree); render();
  }

  /* ----- fenêtre (cadre : barre de titre + corps) ----- */
  function shell(id) {
    if (shells[id]) return shells[id];
    const w = wins[id], el = mk('mw'), head = mk('mwh'), body = mk('mwb');
    el.dataset.w = id; el.classList.add('mw-' + id);
    const t = mk('mwt', 'b'); t.textContent = w.title; head.append(t, mk('mwsp', 'span'));
    el.append(head, body);
    head.addEventListener('pointerdown', e => dragStart(e, id, head));
    head.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (!b) return; if (b.dataset.k === 'close') close(id); else if (b.dataset.k === 'fold') setFold(id, !folded[id]); else onAction(id, b.dataset.k); });
    return (shells[id] = { el, head, body, id });
  }
  function buttons(id) {                                            // boutons de la barre de titre (propres à la fenêtre + fermer)
    const s = shell(id), w = wins[id];
    s.head.querySelectorAll('button').forEach(b => b.remove());
    const list = (typeof w.buttons === 'function' ? w.buttons(id) : w.buttons) || [];
    for (const b of list) { const e = mk('mwb2' + (b.cls ? ' ' + b.cls : ''), 'button'); e.type = 'button'; e.dataset.k = b.k; e.title = b.title || ''; e.setAttribute('aria-label', b.title || b.k); e.textContent = b.t; if (b.on) e.classList.add('on'); s.head.append(e); }
    if (w.foldable) { const e = mk('mwb2', 'button'); e.type = 'button'; e.dataset.k = 'fold'; e.title = folded[id] ? 'Déployer la fenêtre' : 'Rétracter la fenêtre'; e.setAttribute('aria-label', e.title); e.textContent = folded[id] ? '▸' : '▾'; s.head.append(e); }
    if (w.closable !== false) { const e = mk('mwb2 mwx', 'button'); e.type = 'button'; e.dataset.k = 'close'; e.title = 'Fermer la fenêtre'; e.setAttribute('aria-label', 'Fermer la fenêtre'); e.textContent = '✕'; s.head.append(e); }
  }

  function setFold(id, v) { folded[id] = !!v; render(); }

  /* ----- dessin de l'arbre ----- */
  function build(n) {
    if (isLeaf(n)) {
      const s = shell(n.id); n.el = s.el; buttons(n.id);
      if (s.body.firstChild !== wins[n.id].el) s.body.append(wins[n.id].el);         // le contenu a pu partir ailleurs (autre mode)
      s.el.classList.toggle('mwFold', !!folded[n.id]); s.el.style.flex = folded[n.id] ? '0 0 auto' : `${n.w || 1} 1 0px`; return s.el;
    }
    const box = mk('mzs mzs-' + n.dir); n.el = box; box.style.flex = `${n.w || 1} 1 0px`;
    n.kids.forEach((k, i) => { if (i) box.append(separator(n, i)); box.append(build(k)); });
    return box;
  }
  function render() {
    host.replaceChildren();
    if (!tree) { empty = empty || Object.assign(mk('mzEmpty'), { textContent: 'Toutes les fenêtres sont fermées : touchez un nom en haut pour la rouvrir.' }); host.append(empty); }
    else { const r = build(tree); r.style.flex = '1 1 auto'; host.append(r); }
    if (park) for (const id in wins) if (!find(id) && !wins[id].rowable) park.append(wins[id].el);       // une fenêtre fermée garde son contenu dans le document (les éléments restent trouvables par leur identifiant), caché
    onChange();
  }

  /* ----- séparateurs : redimensionnement ----- */
  function separator(n, i) {
    const sep = mk('mzSep mzSep-' + n.dir), horiz = n.dir === 'h', isF = k => isLeaf(k) && folded[k.id];
    if (isF(n.kids[i - 1]) || isF(n.kids[i])) { sep.classList.add('mzSep-off'); return sep; }      // une fenêtre rétractée n'a pas de taille à régler
    sep.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); try { sep.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
      const a = n.kids[i - 1], b = n.kids[i], ra = a.el.getBoundingClientRect(), rb = b.el.getBoundingClientRect();
      const sa = horiz ? ra.width : ra.height, sb = horiz ? rb.width : rb.height, tot = sa + sb, ws = (a.w || 1) + (b.w || 1), p0 = horiz ? e.clientX : e.clientY;
      sep.classList.add('on');
      const mv = ev => {
        const d = (horiz ? ev.clientX : ev.clientY) - p0, na = clamp(sa + d, Math.min(MIN, tot / 2), Math.max(tot - MIN, tot / 2));
        a.w = ws * na / tot; b.w = ws - a.w; a.el.style.flex = `${a.w} 1 0px`; b.el.style.flex = `${b.w} 1 0px`;
      };
      const up = () => { sep.classList.remove('on'); sep.removeEventListener('pointermove', mv); sep.removeEventListener('pointerup', up); sep.removeEventListener('pointercancel', up); onChange(); };
      sep.addEventListener('pointermove', mv); sep.addEventListener('pointerup', up); sep.addEventListener('pointercancel', up);
    });
    return sep;
  }

  /* ----- où atterrirait une fenêtre lâchée en (x, y) : repère affiché ----- */
  let mark = null;
  const hideMark = () => { if (mark) { mark.remove(); mark = null; } };
  function showMark(hit) {
    if (!mark) { mark = mk('mzMark'); document.body.append(mark); }
    if (!hit) { mark.style.display = 'none'; return; }
    const r = hit.r, h = { l: [r.left, r.top, r.width / 2, r.height], r: [r.left + r.width / 2, r.top, r.width / 2, r.height], t: [r.left, r.top, r.width, r.height / 2], b: [r.left, r.top + r.height / 2, r.width, r.height / 2], c: [r.left, r.top, r.width, r.height] }[hit.zone];
    Object.assign(mark.style, { display: 'block', left: h[0] + 'px', top: h[1] + 'px', width: h[2] + 'px', height: h[3] + 'px' });
    mark.dataset.z = hit.zone;
  }
  function zoneAt(x, y, exclude) {
    for (const k of ids()) {
      if (k === exclude) continue;
      const r = shell(k).el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height, d = { l: fx, r: 1 - fx, t: fy, b: 1 - fy };
      const z = Object.keys(d).reduce((m, q) => d[q] < d[m] ? q : m, 'l');
      return { id: k, zone: d[z] < .26 ? z : 'c', r };
    }
    return null;
  }
  const probe = (x, y) => { const h = zoneAt(x, y, null); showMark(h); return h; };

  /* ----- déplacer une fenêtre (glisser sa barre de titre) ----- */
  function dragStart(e, id, head) {
    if (e.target.closest('button') || (e.button && e.button !== 0) || !tree) return;
    if (isLeaf(tree) && !wins[id].rowable) return;                    // seule dans la mosaïque : rien à échanger
    const x0 = e.clientX, y0 = e.clientY; let active = false, ghost = null, hit = null;
    const mv = ev => {
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
        active = true; ghost = mk('mzGhost'); ghost.textContent = wins[id].title; document.body.append(ghost);
        shell(id).el.classList.add('mwLift'); document.body.classList.add('mzDrag');
      }
      ghost.style.transform = `translate(${ev.clientX + 12}px,${ev.clientY + 12}px)`;
      hit = zoneAt(ev.clientX, ev.clientY, id); showMark(hit);
    };
    const end = ev => {
      head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', end); head.removeEventListener('pointercancel', end); removeEventListener('keydown', esc, true);
      if (ghost) ghost.remove(); hideMark(); document.body.classList.remove('mzDrag');
      const s = shells[id]; if (s) s.el.classList.remove('mwLift');
      if (!active || ev.type !== 'pointerup') return;
      if (hit) move(id, hit.id, hit.zone);
      else if (wins[id].rowable && onDropOut) onDropOut(id, ev.clientX, ev.clientY);
    };
    const esc = ev => { if (ev.key === 'Escape') { hit = null; end({ type: 'cancel' }); } };
    try { head.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
    head.addEventListener('pointermove', mv); head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end); addEventListener('keydown', esc, true);
  }

  return {
    setTree, open, close, move, render, setFold, insert, probe, unprobe: hideMark,
    folded: id => !!folded[id], unfoldAll() { for (const k in folded) delete folded[k]; },
    has: id => !!find(id), ids, shell,
    get tree() { return tree; },
    state: () => (tree ? clone(tree) : null),
    refreshButtons() { ids().forEach(buttons); },
  };
}

root.Mosaic = { create };
})(window);
