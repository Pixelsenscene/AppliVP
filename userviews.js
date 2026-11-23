/* VP – vues utilisateur de la page VP : l'utilisateur enregistre la disposition courante (quelle que soit la présentation de départ : principale, compacte ou vues élargies,
   ou une vue déjà enregistrée), lui donne un nom, puis la recharge, la renomme ou la supprime depuis le menu « Vue utilisateur » de la barre du haut.
   Le contenu d'une vue est fourni par Layout3D.snapshot() et rejoué par Layout3D.restore() : ce module ne connaît que la liste, les noms et le menu.
   Mémorisé dans localStorage (clé vp3dv). */
(function (root) {
'use strict';

const KEY = 'vp3dv';
const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let list = (() => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(v => v && v.id && v.name && v.state) : []; } catch (_) { return []; } })();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* stockage indisponible */ } };
const uid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let wrap, btn, menu, pick = null;                                           // pick : null | 'rename' | 'delete' (le menu attend le choix de la vue concernée)

/* ---------- petites fenêtres (nom, confirmation) ---------- */
function dialog(title, build, okLabel, validate) {
  return new Promise(resolve => {
    const ov = el('div', 'askWin'), box = el('div', 'askBox'), foot = el('div', 'askFoot'), err = el('p', 'askNote');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const h = el('h2', '', title), cancel = el('button', 'hbtn', 'Annuler'), ok = el('button', 'hbtn', okLabel);
    cancel.type = ok.type = 'button'; err.style.color = 'var(--bad)'; err.hidden = true;
    const ctl = build(box); box.append(err, foot); box.prepend(h); foot.append(cancel, ok); ov.append(box); document.body.append(ov);
    const done = v => { removeEventListener('keydown', key, true); ov.remove(); resolve(v); };
    const go = () => { const v = ctl ? ctl.value.trim() : true; const m = validate ? validate(v) : ''; if (m) { err.textContent = m; err.hidden = false; return; } done(v); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } else if (e.key === 'Enter' && (ctl || e.target === ok)) { e.preventDefault(); e.stopPropagation(); go(); } };
    addEventListener('keydown', key, true);
    cancel.onclick = () => done(null); ok.onclick = go; ov.addEventListener('pointerdown', e => { if (e.target === ov) done(null); });
    if (ctl) { ctl.focus(); ctl.select(); } else ok.focus();
  });
}
const askName = (title, initial, okLabel, taken) => dialog(title, box => {
  const lab = el('label', '', 'Nom de la vue'), inp = el('input'); inp.type = 'text'; inp.maxLength = 40; inp.value = initial || ''; inp.setAttribute('autocomplete', 'off'); lab.append(inp); box.append(lab); return inp;
}, okLabel, v => !v ? 'Donnez un nom à cette vue.' : taken(v) ? 'Une vue porte déjà ce nom.' : '');
const confirmBox = (title, msg, okLabel) => dialog(title, box => { box.append(el('p', 'askNote', msg)); return null; }, okLabel);

/* ---------- menu ---------- */
function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); pick = null; }
function openMenu() { pick = null; draw(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
function item(label, fn, cls) { const b = el('button', 'uvItem' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.onclick = fn; return b; }
function draw() {
  menu.replaceChildren();
  const act = root.Layout3D && root.Layout3D.active;
  if (pick) {
    menu.append(el('div', 'uvHead', pick === 'rename' ? 'Renommer : choisir la vue' : 'Supprimer : choisir la vue'));
    list.forEach(v => menu.append(item(v.name, () => (pick === 'rename' ? rename(v) : remove(v)), 'uvPick')));
    menu.append(el('div', 'uvSep'), item('‹ Retour', () => { pick = null; draw(); }));
    return;
  }
  if (!list.length) menu.append(el('div', 'uvEmpty', 'Aucune vue enregistrée'));
  list.forEach(v => menu.append(item((v.id === act ? '✓ ' : '') + v.name, () => { close(); root.Layout3D.restore(v.state, v.id); }, v.id === act ? 'on' : '')));
  menu.append(el('div', 'uvSep'), item('＋ Enregistrer la vue actuelle…', saveCurrent));
  const r = item('✎ Renommer une vue…', () => { pick = 'rename'; draw(); }), d = item('✕ Supprimer une vue…', () => { pick = 'delete'; draw(); }, 'uvDel');
  if (!list.length) r.disabled = d.disabled = true;
  menu.append(r, d);
}
async function saveCurrent() {
  close();
  const name = await askName('Enregistrer la vue actuelle', '', 'Enregistrer', n => list.some(v => v.name.toLowerCase() === n.toLowerCase()));
  if (!name) return;
  const v = { id: uid(), name, state: root.Layout3D.snapshot() };
  list.push(v); persist(); root.Layout3D.setActive(v.id);                          // la vue enregistrée devient la vue active (l'aspect ne change pas)
}
async function rename(v) {
  close();
  const name = await askName('Renommer la vue', v.name, 'Renommer', n => list.some(o => o !== v && o.name.toLowerCase() === n.toLowerCase()));
  if (name) { v.name = name; persist(); sync(); }
}
async function remove(v) {
  close();
  if (!await confirmBox('Supprimer la vue', `Supprimer la vue « ${v.name} » ?`, 'Supprimer')) return;
  list = list.filter(o => o !== v); persist();
  if (root.Layout3D.active === v.id) root.Layout3D.setActive(null);          // la disposition reste telle quelle, mais n'est plus « une vue enregistrée »
  sync();
}
function sync() {
  if (!btn) return;
  const act = root.Layout3D && root.Layout3D.active, v = list.find(o => o.id === act);
  btn.classList.toggle('on', !!v); btn.textContent = (v ? v.name : 'Vue utilisateur') + ' ▾';
}

function init() {
  wrap = $('uvWrap'); btn = $('uvBtn'); menu = $('uvMenu'); if (!wrap) return;
  btn.onclick = () => (menu.hidden ? openMenu() : close());
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !wrap.contains(e.target)) close(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) close(); });
  sync();
}
root.UserViews = { sync };
init();
})(window);
