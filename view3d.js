/* VP – vue 3D (canvas 2D, projection perspective écrite à la main : aucune dépendance).
   Repère de la salle (celui de geometry.js) : origine = centre de la base de l'écran, x = droite (vu du public), y = vers le public, z = haut.
   Le module ne calcule rien de photométrique : il dessine ce que app.js a déjà calculé (faisceau, partie utile) et traduit les gestes en réglages
   (position / orientation du VP et de l'écran) par les fonctions fournies par app.js (api.moveVP, rotVP, moveScr, rotScr), qui respectent les verrous.

   Interactions
   - mode normal : toucher le VP ou l'écran le sélectionne ; glisser le corps le déplace dans le plan horizontal ;
     flèches = translation sur x / y / z ; cercles = rotation (VP : pan, tilt, roll · écran : lacet, tangage, roulis).
   - mode caméra (icône caméra) : glisser = tourner autour de la scène, Maj + glisser (ou clic droit) = déplacer, molette / pincement = zoom. */
(function (root) {
'use strict';

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const mul = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => { const l = len(a); return l < 1e-12 ? [0, 0, 0] : mul(a, 1 / l); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fm = (v, n = 2) => (Math.abs(v) < 0.5 * 10 ** -n ? 0 : v).toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });
const $ = id => document.getElementById(id);
const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

const COL = { x: '#ff6b6b', y: '#3ecf8e', z: '#4da3ff', lock: '#b58cff', acc: '#4da3ff', ok: '#3ecf8e', bad: '#fc0522', grey: '#8b98a6', amber: '#f2c94c' };
const NEAR = 0.05;
const LOCK_NAMES = { x: 'Centrage (x)', y: 'Recul (y)', z: 'Hauteur (z)', pan: 'Pan', tilt: 'Tilt', roll: 'Roll',
  sdx: 'Décalage x de l\'écran', sdy: 'Décalage y de l\'écran', sdz: 'Décalage z de l\'écran', syaw: 'Lacet de l\'écran', spitch: 'Tangage de l\'écran', sroll: 'Roulis de l\'écran' };
const shown = new Set();                                         // poignées dont la valeur est affichée (« objet:poignée ») : 1er clic ; le 2e verrouille, le 3e libère et retire la valeur
const PRESETS = { persp: { az: 30, el: 22 }, face: { az: 0, el: 1 }, side: { az: -90, el: 1 }, top: { az: 0, el: 89 } };       // côté : l'écran à gauche, le public à droite, comme la vue de côté 2D ; dessus : l'écran en haut, comme la vue de dessus 2D

let api = null, on = false, inited = false, stage, cv, ctx, W = 0, H = 0, dpr = 1;
const cam = { az: 30, el: 22, dist: 14, t: [0, 4, 1.2], fov: 40 };
let home = null, holdT = 0, downObj = null, lastTap = null, camMode = false, sel = null, hover = null, active = null, fitted = false, tween = 0;
let E, Rr, Uu, Ff, FPX = 600;                    // œil, repère de la caméra (droite, haut, avant), focale en pixels
let handles = [], pickVP = null, pickScr = null, lastG = null, dragLabel = null;
const ptrs = new Map();
let drag = null, moved = false, down0 = null, pend = null, raf = 0, tol = 10, mvTol = 4;
const prefs = Object.assign({ show: { pos: false, ori: false, lens: false } }, (() => { try { return JSON.parse(localStorage.getItem('vp3d') || '{}'); } catch (_) { return {}; } })());
/* Éléments d'affichage de chaque vue, réglés séparément (fenêtre Affichage) : prefs.show = { sel : vue en cours de réglage, v : { 3d, face, side, top } }.
   Valeurs par défaut : la Vue 3D montre le faisceau, le calcul config et les boutons Réglages supplémentaires ; les vues de côté et de dessus gardent leurs cotes et leur faisceau habituels. */
const VIEWS = ['3d', 'face', 'side', 'top'];
const SHOW_DEF = { '3d': { beam: true, pos: false, ori: false, lens: false, calc: true, adv: true }, face: { pos: false, ori: false, lens: false, calc: false, adv: false },
  side: { beam: true, pos: true, ori: false, lens: false, calc: false }, top: { beam: true, pos: true, ori: false, lens: false, calc: false } };
function normShow(sh) {                                            // accepte aussi l'ancien format (un seul jeu d'éléments, pour la Vue 3D)
  sh = sh || {}; const old = !sh.v, v = sh.v || {}, out = { sel: VIEWS.includes(sh.sel || sh.where) ? (sh.sel || sh.where) : '3d', v: {} };
  for (const k of VIEWS) {
    out.v[k] = { ...SHOW_DEF[k] };
    for (const f in SHOW_DEF[k]) { const x = old ? (k === '3d' && (!sh.where || sh.where === '3d') ? sh[f] : undefined) : (v[k] || {})[f]; if (typeof x === 'boolean') out.v[k][f] = x; }
  }
  return out;
}
prefs.show = normShow(prefs.show);
const shw = () => prefs.show.v['3d'];                              // éléments affichés dans la Vue 3D
const savePrefs = () => { try { localStorage.setItem('vp3d', JSON.stringify(prefs)); } catch (_) { /* stockage indisponible */ } };

/* ---------- Caméra ---------- */
function setupCam() {
  const az = rad(cam.az), el = rad(cam.el), back = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
  E = add(cam.t, mul(back, cam.dist)); Ff = mul(back, -1);
  Rr = [Math.cos(az), -Math.sin(az), 0];                       // droite de l'écran : +x quand on regarde vers l'écran depuis le public
  Uu = cross(Ff, Rr);
  FPX = (H / 2) / Math.tan(rad(cam.fov) / 2);
}
const cc = p => { const d = sub(p, E); return [dot(d, Rr), dot(d, Uu), dot(d, Ff)]; };      // monde -> repère caméra
const proj = c => [W / 2 + c[0] * FPX / c[2], H / 2 - c[1] * FPX / c[2]];
const lerpZ = (a, b) => { const t = (NEAR - a[2]) / (b[2] - a[2]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]; };
function seg3(a, b) {                                           // segment 3D -> segment écran (coupé au plan proche), ou null
  let ca = cc(a), cb = cc(b);
  if (ca[2] < NEAR && cb[2] < NEAR) return null;
  if (ca[2] < NEAR) ca = lerpZ(ca, cb); else if (cb[2] < NEAR) cb = lerpZ(cb, ca);
  return [proj(ca), proj(cb)];
}
function poly3(pts) {                                           // polygone 3D -> polygone écran (coupé au plan proche), ou null
  const c = pts.map(cc), out = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], ia = a[2] >= NEAR, ib = b[2] >= NEAR;
    if (ia) out.push(a);
    if (ia !== ib) out.push(ia ? lerpZ(b, a) : lerpZ(a, b));
  }
  return out.length >= 3 ? out.map(proj) : null;
}
function rayAt(x, y) { return { o: E, d: unit(add(Ff, add(mul(Rr, (x - W / 2) / FPX), mul(Uu, (H / 2 - y) / FPX)))) }; }
const depthOf = p => cc(p)[2];
const avg = pts => mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);

/* ---------- Scène (repère de la salle) ---------- */
function scene() {
  const S = api.S, G = api.G, r = api.last();
  const fr = G.makeScreen(S.sw, S.sh, S.scr), to3 = (s, t) => add(fr.origin, add(mul(fr.right, s), mul(fr.up, t)));
  const sc = [[-S.sw / 2, S.sh], [S.sw / 2, S.sh], [S.sw / 2, 0], [-S.sw / 2, 0]].map(p => to3(p[0], p[1]));
  const P = [S.x, S.y, S.z], rot = S.rot || G.autoAim(S), pan = rad(rot.pan), tilt = rad(rot.tilt);
  const w = [Math.sin(pan) * Math.cos(tilt), -Math.cos(pan) * Math.cos(tilt), Math.sin(tilt)];
  let u = cross([0, 0, 1], w); u = len(u) < 1e-9 ? [1, 0, 0] : unit(u);
  let v = cross(w, u);
  const roll = rad(rot.roll || 0), c = Math.cos(roll), s = Math.sin(roll);
  [u, v] = [add(mul(u, c), mul(v, s)), add(mul(v, c), mul(u, -s))];
  const BOX = { W: 0.42, H: 0.16, L: 0.36 }, bc = sub(P, mul(w, BOX.L / 2));
  const g = { S, r, fr, to3, sc, scC: to3(0, S.sh / 2), P, w, u, v, bc, BOX, rot, valid: !!(r && r.valid), q: null, inter: null, T: null, covered: false };
  if (g.valid) {
    g.q = r.B.quad.map(p => to3(p[0], p[1]));
    g.inter = r.ov && r.ov.inter && r.ov.inter.length > 2 ? r.ov.inter.map(p => to3(p[0], p[1])) : null;
    g.T = to3(r.B.T[0], r.B.T[2]); g.covered = !!r.covered; g.dist = r.B.dist;
  }
  return g;
}

/* ---------- Dessin ---------- */
function fillPoly(p2, fill, stroke, lw, dash) {
  ctx.beginPath(); p2.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.setLineDash(dash || []); ctx.lineJoin = 'round'; ctx.stroke(); ctx.setLineDash([]); }
}
function strokeSeg(s, color, lw, dash) { if (!s) return; ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.setLineDash(dash || []); ctx.lineCap = 'round'; ctx.stroke(); ctx.setLineDash([]); }
function text(t, x, y, color = '#e8edf2', size = 12, align = 'center', weight = 600) {
  ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5; ctx.strokeStyle = '#0f1216'; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
}
const shade = (rgb, k) => `rgb(${rgb.map(c => Math.round(clamp(c * k, 0, 255))).join(',')})`;
const LIGHT = unit([-0.45, 0.55, 0.75]);

function drawFloor() {
  const X0 = -12, X1 = 12, Y0 = -3, Y1 = 32;
  const fl = poly3([[X0, Y0, 0], [X1, Y0, 0], [X1, Y1, 0], [X0, Y1, 0]]);
  if (fl) fillPoly(fl, 'rgba(255,255,255,.022)');
  const batch = (list, color, lw) => {
    ctx.beginPath();
    for (const [a, b] of list) { const s = seg3(a, b); if (s) { ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); } }
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke();
  };
  const minor = [], major = [];
  for (let x = X0; x <= X1; x++) if (x) (x % 5 ? minor : major).push([[x, Y0, 0], [x, Y1, 0]]);
  for (let y = Y0; y <= Y1; y++) if (y) (y % 5 ? minor : major).push([[X0, y, 0], [X1, y, 0]]);
  batch(minor, 'rgba(255,255,255,.055)', 1); batch(major, 'rgba(255,255,255,.14)', 1);
  batch([[[0, Y0, 0], [0, Y1, 0]]], 'rgba(77,163,255,.45)', 1.2);              // axe de la salle (centre de l'écran)
  batch([[[X0, 0, 0], [X1, 0, 0]]], 'rgba(255,255,255,.26)', 1.2);              // pied de l'écran
}

function drawShadows(g) {
  const dash = [4, 4], floor = p => [p[0], p[1], 0];
  const drop = (p, a = .4) => { strokeSeg(seg3(p, floor(p)), `rgba(255,255,255,${a})`, 1, dash); };
  drop(g.bc); const f = floor(g.bc);
  strokeSeg(seg3(add(f, [-.18, 0, 0]), add(f, [.18, 0, 0])), 'rgba(255,255,255,.4)', 1.2); strokeSeg(seg3(add(f, [0, -.18, 0]), add(f, [0, .18, 0])), 'rgba(255,255,255,.4)', 1.2);
  [g.sc[2], g.sc[3]].forEach(p => { if (p[2] > 0.02) drop(p, .3); });
  const fp = poly3(g.sc.map(floor)); if (fp) fillPoly(fp, null, 'rgba(255,107,107,.35)', 1.2);        // emprise de l'écran au sol (un trait quand il est droit)
}

const glow = o => sel === o || !!(drag && drag.type === 'body' && drag.o === o && moved);      // halo blanc : objet sélectionné (poignées affichées) ou en cours de déplacement
function drawScene(g) {
  const items = [], S = g.S;
  pickVP = null; pickScr = null;

  if (g.q && shw().beam) {                                   // faisceau : pyramide (désactivé : ni remplissage bleu ni arêtes ; le cadre bleu du quadrilatère rouge reste) translucide du VP vers les 4 coins sur le plan de l'écran
    for (let i = 0; i < 4; i++) {
      const a = g.q[i], b = g.q[(i + 1) % 4], tri = [g.P, a, b];
      items.push({ d: depthOf(avg(tri)), paint() {
        const p = poly3(tri); if (!p) return;
        fillPoly(p, 'rgba(77,163,255,.085)');
        strokeSeg(seg3(g.P, a), 'rgba(120,185,255,.8)', 1.4);
      } });
    }
  }

  const toward = sub(E, g.scC), frontVisible = dot(toward, g.fr.normal) > 0;                 // face avant de l'écran (côté public) vue de la caméra ?
  items.push({ d: depthOf(g.scC), paint() {
    const p = poly3(g.sc); if (!p) return;
    pickScr = p;
    const col = !g.valid ? COL.grey : g.covered ? COL.ok : COL.bad;
    fillPoly(p, frontVisible ? '#222c37' : '#2c333c');
    if (frontVisible && g.q) {
      const q = poly3(g.q); if (q) fillPoly(q, 'rgba(255,93,93,.30)');                       // faisceau sur le plan de l'écran : perdu (rouge) …
      if (g.inter) { const it = poly3(g.inter); if (it) fillPoly(it, 'rgba(62,207,142,.46)'); }        // … et utile (vert)
    }
    if (glow('scr')) { ctx.save(); ctx.shadowColor = COL.acc; ctx.shadowBlur = 14; fillPoly(p, null, '#fff', 2.5); ctx.restore(); }
    fillPoly(p, null, frontVisible ? col : COL.grey, 3);
    if (frontVisible && g.q) {
      const q = poly3(g.q); if (q) fillPoly(q, null, COL.acc, 1.8);
      if (g.T) { const a = g.T, r = .12; strokeSeg(seg3(sub(a, mul(g.fr.right, r)), add(a, mul(g.fr.right, r))), 'rgba(255,255,255,.8)', 1.3); strokeSeg(seg3(sub(a, mul(g.fr.up, r)), add(a, mul(g.fr.up, r))), 'rgba(255,255,255,.8)', 1.3); }
    }
  } });

  if (g.T) items.push({ d: depthOf(avg([g.P, g.T])), paint() { strokeSeg(seg3(g.P, g.T), 'rgba(255,255,255,.55)', 1.2, [6, 5]); } });      // axe optique

  const { BOX } = g, ax = [g.u, g.v, g.w], half = [BOX.W / 2, BOX.H / 2, BOX.L / 2];
  items.push({ d: depthOf(g.bc), paint() {                           // VP : boîte orientée, faces visibles seulement
    const vis = [];
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
      const j = (i + 1) % 3, k = (i + 2) % 3, c = add(g.bc, mul(ax[i], s * half[i])), a = mul(ax[j], half[j]), b = mul(ax[k], half[k]), n = mul(ax[i], s);
      if (dot(sub(E, c), n) <= 0) continue;
      const p = poly3([add(add(c, a), b), add(sub(c, a), b), sub(sub(c, a), b), sub(add(c, a), b)]); if (!p) continue;
      vis.push({ p, n, front: i === 2 && s === 1 });
    }
    pickVP = vis.map(f => f.p);
    for (const f of vis) fillPoly(f.p, shade([77, 163, 255], 0.38 + 0.62 * Math.max(0, dot(f.n, LIGHT))), 'rgba(15,18,22,.9)', 1);
    const fr = vis.find(f => f.front);
    if (fr) {                                                          // objectif
      const ring = (rr, col) => { const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * 2 * Math.PI; pts.push(add(g.P, add(mul(g.u, Math.cos(a) * rr), mul(g.v, Math.sin(a) * rr)))); } const pp = poly3(pts); if (pp) fillPoly(pp, col); };
      ring(0.078, '#0c1015'); ring(0.05, '#9cc9ff');
    }
    if (glow('vp')) { ctx.save(); ctx.shadowColor = COL.acc; ctx.shadowBlur = 14; vis.forEach(f => fillPoly(f.p, null, '#fff', 2)); ctx.restore(); }
  } });

  items.sort((a, b) => b.d - a.d).forEach(i => i.paint());
}

/* « Position VP » : cotes en pointillés depuis l'origine (centre de l'écran, à sa base) :
   recul y (au sol, dans l'axe de l'écran) -> centrage x (au sol, sous le VP, parallèle à l'écran) -> hauteur z (verticale jusqu'au VP) ; d = distance au sol entre l'origine et l'aplomb du VP (diagonale) */
function drawPosition(g) {
  const S = g.S, O = [0, 0, 0], A = [0, S.y, 0], B = [S.x, S.y, 0], C = [S.x, S.y, S.z], sameXY = Math.abs(S.x) < 0.02;
  const d = Math.hypot(S.x, S.y), ok = (a, b) => len(sub(a, b)) > 0.02;
  const items = [                                                     // [début, fin, couleur, texte, décalage px du libellé, alignement]
    [A, B, COL.x, `x ${fm(S.x)} m`, [0, 12], 'center'],                // centrage : sous le VP, à son aplomb au sol, parallèle à l'écran
    [O, A, COL.y, sameXY ? `y = d ${fm(S.y)} m` : `y ${fm(S.y)} m`, [0, 12], 'center'],
    [B, C, COL.z, `z ${fm(S.z)} m`, [8, 0], 'left'],
    [O, B, '#ff9f43', `d ${fm(d)} m`, [0, -11], 'center']];
  ctx.globalAlpha = .9;
  for (const [a, b, col] of items) if (ok(a, b)) strokeSeg(seg3(a, b), col, 1.8, [1.5, 5.5]);
  ctx.globalAlpha = 1;
  const foot = cc(B); if (foot[2] > NEAR) { const q = proj(foot); ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, 2 * Math.PI); ctx.fillStyle = '#ff9f43'; ctx.fill(); }
  items.forEach(([a, b, col, t, off, al], i) => {
    if (!ok(a, b) || (i === 3 && sameXY)) return;                      // x = 0 : d se confond avec y (libellé « y = d »)
    const s = seg3(a, b); if (!s) return;
    text(t, (s[0][0] + s[1][0]) / 2 + off[0], (s[0][1] + s[1][1]) / 2 + off[1], col, 12, al);
  });
}
/* valeurs affichées sur le graphique (boutons « afficher : »), sous le VP : une ligne par groupe, chaque valeur dans la couleur de son axe / cercle */
function drawValues(g, p) {
  const sh = shw(); if (!p || !(sh.ori || sh.lens)) return;
  const S = g.S, rot = S.rot || api.G.autoAim(S), lines = [];
  if (sh.ori) lines.push([['pan ', COL.grey], [fm(rot.pan, 1) + '°', COL.z], ['   tilt ', COL.grey], [fm(rot.tilt, 1) + '°', COL.x], ['   roll ', COL.grey], [fm(rot.roll || 0, 1) + '°', COL.y]]);
  if (sh.lens) lines.push([['lens shift  H ', COL.grey], [fm((S.sx || 0) * 100, 0) + ' %', '#0fbcd6'], ['   V ', COL.grey], [fm((S.sy || 0) * 100, 0) + ' %', '#0fbcd6']]);
  const wd = s => { ctx.font = '600 12px -apple-system, BlinkMacSystemFont, system-ui, sans-serif'; return ctx.measureText ? ctx.measureText(s).width : s.length * 6.5; };
  lines.forEach((runs, i) => {
    const tot = runs.reduce((a, r) => a + wd(r[0]), 0); let x = p[0] - tot / 2; const y = p[1] + 22 + i * 16;
    for (const [t, c] of runs) { const w = wd(t); text(t, x, y, c, 12, 'left'); x += w; }
  });
}
/* Surbrillance jaune d'une valeur (vertes, jaunes, favoris) cliquée dans la barre de valeurs : mêmes traits que dans les vues de face, de côté et de dessus, posés sur la scène.
   app.js fournit des primitives simples ; frame 'scr' = coordonnées 2D dans le repère de l'écran (vue de face), 'world' = 3D dans le repère de l'écran à plat. */
const HLC = '#ffd166';
let hlValue = null;
function drawHighlight(g) {
  hlValue = null;
  const h = api.hl && api.hl(); if (!h || !h.items || !h.items.length) return;
  const fr = g.fr, nrm = fr.normal || [0, 1, 0], W3 = h.frame === 'world';
  const P = q => W3 ? add(fr.origin, add(mul(fr.right, q[0]), add(mul(nrm, q[1]), mul(fr.up, q[2])))) : g.to3(q[0], q[1]);
  const D = d => unit(W3 ? add(mul(fr.right, d[0]), add(mul(nrm, d[1]), mul(fr.up, d[2]))) : add(mul(fr.right, d[0]), mul(fr.up, d[1])));
  const line = (a, b, w, dash, alpha = 1) => {                  // trait jaune sur un liseré sombre (lisible sur le faisceau et sur la grille)
    const s = seg3(P(a), P(b)); if (!s) return;
    ctx.globalAlpha = alpha; strokeSeg(s, 'rgba(8,12,16,.75)', w + 3, dash); strokeSeg(s, HLC, w, dash); ctx.globalAlpha = 1;
  };
  const ring = (pts, w, dash, closed) => { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) line(pts[i], pts[(i + 1) % pts.length], w, dash); };
  ctx.save();
  for (const it of h.items) {
    if (it.t === 'seg') line(it.a, it.b, it.ghost ? 2.5 : 4, it.dash ? [6, 5] : null, it.ghost ? .6 : 1);
    else if (it.t === 'path') ring(it.p, 4, null, false);
    else if (it.t === 'poly') { const f = poly3(it.p.map(P)); if (f && it.fill) fillPoly(f, 'rgba(255,209,102,.3)'); ring(it.p, 4, null, true); }
    else if (it.t === 'diff') {
      const o = poly3(it.p.map(P)), hole = poly3(it.hole.map(P));
      if (o) { ctx.beginPath(); [o, hole].forEach(pl => { if (pl) { pl.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); } }); ctx.fillStyle = `rgba(255,209,102,${it.alpha})`; ctx.fill('evenodd'); }
      ring(it.p, 4, null, true); if (it.holeStroke) ring(it.hole, 2, [5, 4], true);
    } else if (it.t === 'pt') {
      const c = cc(P(it.p)); if (c[2] < NEAR) continue;
      const q = proj(c); ctx.beginPath(); ctx.arc(q[0], q[1], it.ring ? 9 : 7, 0, 2 * Math.PI);
      if (it.ring) { ctx.lineWidth = 2.5; ctx.strokeStyle = HLC; ctx.stroke(); } else { ctx.fillStyle = HLC; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(8,12,16,.75)'; ctx.stroke(); }
    } else if (it.t === 'rt') {                                  // angle droit : petit carré blanc dans l'angle
      const c = P(it.c), u = D(it.u), v = D(it.v), d = 0.12, a = add(c, mul(u, d)), b = add(a, mul(v, d)), e = add(c, mul(v, d));
      ctx.globalAlpha = .85; for (const [x, y] of [[a, b], [b, e]]) { const s = seg3(x, y); if (s) strokeSeg(s, '#fff', 1.6); } ctx.globalAlpha = 1;
    }
  }
  if (shw().calc && h.label) {                              // « Calcul config » : la valeur du paramètre touché, en jaune brillant, à l'endroit surligné
    const pts = h.items.filter(it => !it.ghost && !it.dash), first = k => pts.find(it => it.t === k);
    const it = first('seg') || first('poly') || first('diff') || first('path') || first('pt') || h.items[0];
    let a = null;
    if (it) {
      const mid = ps => ps.length ? ps.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + (p[2] || 0)], [0, 0, 0]).map(v => v / ps.length) : null;
      const q = it.t === 'seg' ? [it.a, it.b] : it.t === 'pt' ? [it.p] : it.t === 'path' ? [it.p[Math.floor(it.p.length / 2)]] : (it.p || [it.c]);
      const m = mid(q.map(P).map(v => [v[0], v[1], v[2]]));
      if (m) { const c = cc(m); if (c[2] >= NEAR) a = proj(c); }
    }
    if (a) hlValue = { x: a[0], y: a[1] - 20, t: h.label };
  }
  ctx.restore();
}
function drawHighlightValue() {                                  // la valeur se dessine après les étiquettes de la scène : rien ne la recouvre
  if (!hlValue) return;
  ctx.save(); ctx.font = '800 17px -apple-system, BlinkMacSystemFont, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(8,12,16,.9)'; ctx.strokeText(hlValue.t, hlValue.x, hlValue.y);
  ctx.shadowColor = 'rgba(255,225,60,.85)'; ctx.shadowBlur = 10; ctx.fillStyle = '#ffe433'; ctx.fillText(hlValue.t, hlValue.x, hlValue.y);
  ctx.restore();
}

function drawLabels(g) {
  const S = g.S, v = cc(add(g.bc, mul(g.v, 0.2)));
  if (v[2] > NEAR) { const p = proj(v); text(S.vp || 'VP', p[0], p[1] - 6, '#9cc9ff', 12); }
  const b = cc(add(avg([g.sc[2], g.sc[3]]), mul(g.fr.up, -0.12)));
  if (b[2] > NEAR) { const p = proj(b); text(`Écran ${fm(S.sw)} × ${fm(S.sh)} m`, p[0], p[1] + 4, '#cfd8e2', 12); }
  if (shw().pos) drawPosition(g);
  { const c = cc(g.bc); drawValues(g, c[2] > NEAR ? proj(c) : null); }
  if (g.T) { const m = cc(avg([g.P, g.T])); if (m[2] > NEAR) { const p = proj(m); text(`c ${fm(g.dist)} m`, p[0], p[1] - 10, '#ffd166', 12); } }
}

function bottomTop() {                                              // haut de la pile d'éléments posés en bas de la scène (indications, indicateurs, valeurs vertes), dans le repère du canvas
  const top0 = stage.getBoundingClientRect().top; let t = H - 8;
  for (const id of ['msg3d', 'hint3d', 'dragSel3d', 'kpis', 'simVals']) { const e = $(id); if (e && stage.contains(e) && e.offsetParent && e.offsetHeight) t = Math.min(t, e.getBoundingClientRect().top - top0); }      // seulement ce qui est posé sur la scène (le bandeau données peut être ailleurs)
  return t;
}
function drawAxisWidget() {
  const ox = W - 64, oy = Math.max(70, bottomTop() - 42), L = 26;                     // au-dessus de la pile du bas, à gauche des onglets : jamais sous un autre élément
  for (const [n, a, c] of [['x', [1, 0, 0], COL.x], ['y', [0, 1, 0], COL.y], ['z', [0, 0, 1], COL.z]]) {
    const dx = dot(a, Rr) * L, dy = -dot(a, Uu) * L;
    strokeSeg([[ox, oy], [ox + dx, oy + dy]], c, 2.2);
    text(n, ox + dx * 1.35, oy + dy * 1.35, c, 11, 'center', 700);
  }
}

/* ---------- Poignées (flèches de translation, cercles de rotation) ---------- */
function ringBasis(a) {
  const h = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], e1 = unit(cross(a, h));
  return [e1, cross(a, e1)];                                      // e1 × e2 = a : angle croissant = rotation directe autour de a
}
function gizmoSpec(g) {
  const S = g.S;
  if (sel === 'vp') {
    const w0 = g.w, u0 = unit(cross([0, 0, 1], w0));
    return { o: g.bc, key: ['x', 'y', 'z'], rings: [
      { id: 'pan', name: 'Pan', axis: [0, 0, 1], col: COL.z }, { id: 'tilt', name: 'Tilt', axis: u0, col: COL.x }, { id: 'roll', name: 'Roll', axis: w0, col: COL.y }] };
  }
  const yawOnly = api.G.makeScreen(S.sw, S.sh, { dx: 0, dy: 0, dz: 0, yaw: S.scr ? S.scr.yaw : 0, pitch: 0, roll: 0 });
  return { o: g.scC, key: ['x', 'y', 'z'], rings: [
    { id: 'yaw', name: 'Lacet', axis: [0, 0, 1], col: COL.z }, { id: 'pitch', name: 'Tangage', axis: yawOnly.right, col: COL.x }, { id: 'roll', name: 'Roulis', axis: g.fr.normal, col: COL.y }] };
}
function buildHandles(g) {
  handles = [];
  if (!sel || camMode) return;
  const sp = gizmoSpec(g), d = cc(sp.o)[2]; if (d < NEAR * 3) return;
  const L = 112 * d / FPX, R = 0.74 * L;
  for (const [k, a] of [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]]) {
    const s = seg3(sp.o, add(sp.o, mul(a, L))); if (!s) continue;
    const lockKey = sel === 'vp' ? k : 'sd' + k;
    handles.push({ id: 'm' + k, kind: 'move', key: k, axis: a, o: sp.o, col: COL[k], seg: s, lockKey, label: LOCK_NAMES[lockKey], locked: api.isLocked(lockKey) });
  }
  for (const rg of sp.rings) {
    const [e1, e2] = ringBasis(unit(rg.axis)), segs = [], N = 64;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI;
      const s = seg3(add(sp.o, add(mul(e1, Math.cos(a0) * R), mul(e2, Math.sin(a0) * R))), add(sp.o, add(mul(e1, Math.cos(a1) * R), mul(e2, Math.sin(a1) * R))));
      if (s) segs.push(s);
    }
    const lockKey = sel === 'vp' ? rg.id : 's' + rg.id;
    handles.push({ id: 'r' + rg.id, kind: 'rot', rid: rg.id, name: rg.name, axis: unit(rg.axis), o: sp.o, col: rg.col, segs, lockKey, label: LOCK_NAMES[lockKey], locked: api.isLocked(lockKey) });
  }
}
function valueText(h) {                                          // valeur en cours du paramètre de la poignée
  const S = api.S, sc = S.scr || { dx: 0, dy: 0, dz: 0, yaw: 0, pitch: 0, roll: 0 };
  if (sel === 'vp') {
    if (h.kind === 'move') return `${h.key} ${fm(S[h.key])} m`;
    const rot = S.rot || api.G.autoAim(S); return `${h.name} ${fm(rot[h.rid] || 0, 1)}°`;
  }
  return h.kind === 'move' ? `d${h.key} ${fm(sc['d' + h.key])} m` : `${h.name} ${fm(sc[h.rid] || 0, 1)}°`;
}
function drawHandles() {
  for (const h of handles) {
    const hot = hover === h.id || active === h.id, col = h.locked ? COL.lock : h.col, showV = shown.has(sel + ':' + h.id);
    if (h.kind === 'rot') {
      ctx.beginPath(); h.segs.forEach(s => { ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); });
      ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.globalAlpha = hot ? 1 : .8; ctx.lineWidth = hot ? 5 : 2.6; ctx.setLineDash(h.locked ? [7, 5] : []); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      if (showV && h.segs.length) {                                  // valeur au point le plus haut du cercle
        let top = h.segs[0][0]; for (const s of h.segs) if (s[0][1] < top[1]) top = s[0];
        text(valueText(h), top[0], top[1] - 12, col, 13, 'center', 700);
      }
    } else {
      const s = h.seg, dx = s[1][0] - s[0][0], dy = s[1][1] - s[0][1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      strokeSeg(s, col, hot ? 5 : 3.2, h.locked ? [5, 4] : null);
      const hx = s[1][0], hy = s[1][1], sz = hot ? 13 : 10;
      ctx.beginPath(); ctx.moveTo(hx + ux * sz, hy + uy * sz); ctx.lineTo(hx - ux * sz * .4 - uy * sz * .6, hy - uy * sz * .4 + ux * sz * .6); ctx.lineTo(hx - ux * sz * .4 + uy * sz * .6, hy - uy * sz * .4 - ux * sz * .6); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      text(showV ? valueText(h) : h.key, hx + ux * (sz + (showV ? 30 : 9)), hy + uy * (sz + (showV ? 12 : 9)), col, showV ? 13 : 12, 'center', 700);
    }
  }
}

function draw() {
  if (!on || !api) return;
  const rc = stage.getBoundingClientRect();
  if (rc.width < 10 || rc.height < 10) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  if (Math.abs(rc.width - W) > .5 || Math.abs(rc.height - H) > .5 || cv.width !== Math.round(rc.width * dpr)) {
    W = rc.width; H = rc.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#171d25'); bg.addColorStop(1, '#0c1014'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  setupCam();
  const g = scene(); lastG = g;
  drawFloor(); drawShadows(g); drawScene(g); drawHighlight(g); drawLabels(g); drawHighlightValue();
  buildHandles(g); drawHandles(); drawAxisWidget();
  if (dragLabel) text(dragLabel.t, dragLabel.x + 18, dragLabel.y - 22, '#fff', 14, 'left', 700);
  updateHint();
}

/* ---------- Cadrage ---------- */
function bounds(g) {
  const pts = [g.P, g.bc, ...g.sc, ...(g.q || [])];
  const lo = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i]))), hi = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])));
  const c = mul(add(lo, hi), .5), rr = Math.max(1.5, ...pts.map(p => len(sub(p, c))));
  return { c, r: rr };
}
function fitTarget() {
  const g = scene(), b = bounds(g), vf = rad(cam.fov), asp = W && H ? W / H : 1.6, hf = 2 * Math.atan(Math.tan(vf / 2) * asp);
  return { t: b.c, dist: clamp(b.r * 1.25 / Math.sin(Math.min(vf, hf) / 2), 3, 80) };
}
function goTo(target, ms = 380) {
  cancelAnimationFrame(tween);
  const from = { az: cam.az, el: cam.el, dist: cam.dist, t: cam.t.slice() }, t0 = performance.now();
  let da = target.az == null ? 0 : ((target.az - from.az + 540) % 360) - 180;                       // chemin le plus court
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    cam.az = from.az + da * e; if (target.el != null) cam.el = from.el + (target.el - from.el) * e;
    if (target.dist != null) cam.dist = from.dist + (target.dist - from.dist) * e;
    if (target.t) cam.t = [0, 1, 2].map(i => from.t[i] + (target.t[i] - from.t[i]) * e);
    draw(); if (k < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
}
function fit() { const f = fitTarget(); cam.t = f.t; cam.dist = f.dist; fitted = true; }
function preset(name) {
  const p = PRESETS[name], f = fitTarget(); goTo({ az: p.az, el: p.el, t: f.t, dist: f.dist });
}

/* ---------- Sélection, poignées, glisser ---------- */
const local = e => { const rc = cv.getBoundingClientRect(); return [e.clientX - rc.left, e.clientY - rc.top]; };
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function distSeg(p, s) {
  const [a, b] = s, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}
function pickHandle(p) {
  let best = null, bd = tol;
  for (const h of handles) {
    let d;
    if (h.kind === 'move') {                                     // flèche : on ignore sa première partie (autour de l'origine commune des trois flèches) pour laisser le corps de l'objet saisissable
      const [a, b] = h.seg, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, k = Math.min(20, l * .35) / l;
      d = distSeg(p, [[a[0] + dx * k, a[1] + dy * k], b]) - (d2(p, b) < 16 ? 6 : 0);                // flèches prioritaires, bout de flèche plus facile à saisir
    } else {                                                     // cercle : on ignore sa partie proche du centre de l'objet (un cercle vu de tranche le traverse) pour laisser le corps saisissable
      const c = cc(h.o), oc = c[2] > NEAR ? proj(c) : null;
      d = Math.min(...h.segs.filter(s => !oc || d2([(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2], oc) > 24).map(s => distSeg(p, s)), 1e9) + 1.5;
    }
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; } return c; };
function pickObject(p) {
  if (pickVP && (pickVP.some(f => inPoly(p, f)) || (lastG && (() => { const c = cc(lastG.bc); return c[2] > NEAR && d2(p, proj(c)) < 20; })()))) return 'vp';
  if (pickScr && inPoly(p, pickScr)) return 'scr';
  return null;
}
function select(o) { sel = o; draw(); }
const startState = (o = sel) => {
  const S = api.S;
  return o === 'vp' ? { x: S.x, y: S.y, z: S.z, rot: S.rot ? { ...S.rot } : { ...api.G.autoAim(S), roll: 0 } }
    : { dx: S.scr ? S.scr.dx : 0, dy: S.scr ? S.scr.dy : 0, dz: S.scr ? S.scr.dz : 0, yaw: S.scr ? S.scr.yaw : 0, pitch: S.scr ? S.scr.pitch : 0, roll: S.scr ? S.scr.roll : 0 };
};
function closestParam(o, a, ray) {                                 // paramètre s du point o + s·a le plus proche du rayon
  const w0 = sub(o, ray.o), b = dot(a, ray.d), c = dot(ray.d, ray.d), d = dot(a, w0), e = dot(ray.d, w0), den = c - b * b;
  return Math.abs(den) < 1e-4 ? null : (b * e - c * d) / den;
}
function planeHit(o, n, ray) { const k = dot(ray.d, n); if (Math.abs(k) < 0.04) return null; const t = dot(sub(o, ray.o), n) / k; return t > 0 ? add(ray.o, mul(ray.d, t)) : null; }

/* appui long et fixe (2 s) sur une flèche ou un cercle : le paramètre revient à sa valeur d'avant l'apparition des poignées (`home`) */
const HOLD_MS = 2000;
function cancelHold() { clearTimeout(holdT); holdT = 0; }
function armHold(h, p) {
  cancelHold();
  holdT = setTimeout(() => {
    holdT = 0;
    if (!drag || drag.h !== h || moved || !home) return;
    const lk = h.kind === 'move'
      ? (sel === 'vp' ? api.moveVP({ [h.key]: home[h.key] }) : api.moveScr({ ['d' + h.key]: home['d' + h.key] }))
      : (sel === 'vp' ? api.rotVP({ [h.rid]: home.rot[h.rid] }) : api.rotScr({ [h.rid]: home[h.rid] }));
    drag = { type: 'hclick', h, p0: p, long: true };            // la suite du geste ne déplace plus rien et ne compte pas comme un clic
    if (lk && lk.length) flash(`${h.label} : verrouillé`, true);
    else { flash(`${h.label} : valeur initiale rétablie (${valueText(h)})`); }
    try { navigator.vibrate && navigator.vibrate(40); } catch (_) { /* pas de vibration */ }
    draw(); if (api) api.render();
  }, HOLD_MS);
}
function startHandle(h, p) {
  active = h.id;
  armHold(h, p);
  if (h.locked) { drag = { type: 'hclick', h, p0: p }; draw(); return; }      // verrouillée : on ne peut que la libérer d'un simple clic
  const ray = rayAt(p[0], p[1]);
  if (h.kind === 'move') {
    const s0 = closestParam(h.o, h.axis, ray); if (s0 == null) { drag = { type: 'hclick', h, p0: p }; return; }
    drag = { type: 'move', h, s0, st: startState() };
  } else {
    const hit = planeHit(h.o, h.axis, ray); if (!hit) { drag = { type: 'hclick', h, p0: p, edge: true }; return; }
    const [e1, e2] = ringBasis(h.axis), v = sub(hit, h.o), a0 = Math.atan2(dot(v, e2), dot(v, e1));
    drag = { type: 'rot', h, e1, e2, last: a0, acc: 0, st: startState() };
  }
  draw();
}
/* simple clic (sans glisser) sur une flèche ou un cercle : 1er = la valeur s'affiche · 2e = le paramètre se verrouille (poignée violette, valeur conservée) · 3e = libère et retire la valeur */
function cycleHandle(h) {
  const id = sel + ':' + h.id;
  if (api.isLocked(h.lockKey)) { api.setLock(h.lockKey, false); shown.delete(id); flash(`${h.label} : libéré`); }
  else if (shown.has(id)) { api.setLock(h.lockKey, true); flash(`${h.label} : verrouillé`, true); }
  else { shown.add(id); flash(`${h.label} : ${valueText(h)} (cliquer de nouveau pour verrouiller)`); }
  draw();
}
/* Glisser le corps : le mouvement reste dans l'espace des axes LIBRES (x, y, z non verrouillés).
   3 libres : plan horizontal (plan vertical face à la caméra quand on la regarde de très bas) · 2 libres : le plan de ces deux axes (ex. x verrouillé : on bouge y et z)
   · 1 libre : la droite de cet axe · aucun : rien ne bouge. Un plan vu de tranche (mal conditionné) est remplacé par l'axe libre le plus visible. */
function startBody(o, p) {
  const st = startState(o), org = o === 'vp' ? lastG.bc : lastG.scC, ray = rayAt(p[0], p[1]);
  const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, lk = k => api.isLocked(o === 'vp' ? k : 'sd' + k);
  const free = ['x', 'y', 'z'].filter(k => !lk(k));
  if (!free.length) { drag = { type: 'idle', p0: p }; flash(o === 'vp' ? 'x, y et z sont verrouillés' : 'Décalages x, y et z de l\'écran verrouillés', true); return; }
  const line = k => { const s0 = closestParam(org, AX[k], ray); drag = s0 == null ? { type: 'click', p0: p } : { type: 'body', o, mode: 'line', axis: AX[k], org, s0, st }; };
  if (free.length === 1) { line(free[0]); return; }
  let n;
  if (free.length === 3) n = cam.el >= 15 ? [0, 0, 1] : unit([Ff[0], Ff[1], 0]);
  else n = AX[['x', 'y', 'z'].find(k => !free.includes(k))];
  if (free.length === 2 && Math.abs(dot(ray.d, n)) < 0.15) {            // plan vu de tranche : on garde l'axe libre dont le déplacement à l'écran est le plus grand
    const vis = k => { const q = [org, add(org, mul(AX[k], 0.5))].map(cc); return q[0][2] > NEAR && q[1][2] > NEAR ? d2(proj(q[0]), proj(q[1])) : 0; };
    line(vis(free[0]) >= vis(free[1]) ? free[0] : free[1]); return;
  }
  const hit = planeHit(org, n, ray);
  if (!hit) { drag = { type: 'click', p0: p }; return; }
  drag = { type: 'body', o, mode: 'plane', n, org, off: sub(org, hit), st };
}
function applyDrag(p) {
  if (!drag) return;
  const t = drag.type, S = api.S;
  if (t === 'orbit') { cam.az = drag.c0.az - (p[0] - drag.p0[0]) * 0.4; cam.el = clamp(drag.c0.el + (p[1] - drag.p0[1]) * 0.4, 0, 89); draw(); return; }
  if (t === 'pan') { const k = cam.dist / FPX; cam.t = add(drag.c0.t, add(mul(Rr, -(p[0] - drag.p0[0]) * k), mul(Uu, (p[1] - drag.p0[1]) * k))); draw(); return; }
  const ray = rayAt(p[0], p[1]);
  if (t === 'body') {
    let dlt;
    if (drag.mode === 'line') { const sp = closestParam(drag.org, drag.axis, ray); if (sp == null) return; dlt = mul(drag.axis, sp - drag.s0); }
    else { const hit = planeHit(drag.org, drag.n, ray); if (!hit) return; dlt = sub(add(hit, drag.off), drag.org); }
    const st = drag.st;
    if (drag.o === 'vp') { const lk = api.moveVP({ x: st.x + dlt[0], y: st.y + dlt[1], z: st.z + dlt[2] }); if (lk.length) flash(`${lk.map(k => LOCK_NAMES[k]).join(', ')} : verrouillé`, true); }
    else { const lk = api.moveScr({ dx: st.dx + dlt[0], dy: st.dy + dlt[1], dz: st.dz + dlt[2] }); if (lk.length) flash(`${lk.map(k => LOCK_NAMES[k]).join(', ')} : verrouillé`, true); }
    return;
  }
  if (t === 'move') {
    const s = closestParam(drag.h.o, drag.h.axis, ray); if (s == null) return;
    const dv = s - drag.s0, st = drag.st, k = drag.h.key;
    if (sel === 'vp') api.moveVP({ [k]: st[k] + dv });
    else api.moveScr({ ['d' + k]: st['d' + k] + dv });
    const val = sel === 'vp' ? api.S[k] : api.S.scr && api.S.scr['d' + k];
    dragLabel = { t: `${k} ${fm(val)} m`, x: p[0], y: p[1] }; draw();
    return;
  }
  if (t === 'rot') {
    const hit = planeHit(drag.h.o, drag.h.axis, ray); if (!hit) return;
    const v = sub(hit, drag.h.o), a = Math.atan2(dot(v, drag.e2), dot(v, drag.e1));
    drag.acc += wrapPi(a - drag.last); drag.last = a;
    const dg = deg(drag.acc), st = drag.st, id = drag.h.rid; let val;
    if (sel === 'vp') {                                                                               // pan : autour de +z · tilt : autour de l'axe horizontal du VP (sens inverse) · roll : autour de l'axe optique
      if (id === 'pan') api.rotVP({ pan: val = st.rot.pan + dg }); else if (id === 'tilt') api.rotVP({ tilt: val = st.rot.tilt - dg }); else api.rotVP({ roll: val = st.rot.roll + dg });
      val = api.S.rot ? api.S.rot[id] : val;
    } else {                                                                                          // lacet : sens inverse autour de +z · tangage : direct autour de la droite de l'écran · roulis : sens inverse autour de la normale
      if (id === 'yaw') api.rotScr({ yaw: val = st.yaw - dg }); else if (id === 'pitch') api.rotScr({ pitch: val = st.pitch + dg }); else api.rotScr({ roll: val = st.roll - dg });
      val = api.S.scr ? api.S.scr[id] : val;
    }
    dragLabel = { t: `${drag.h.name} ${fm(val, 1)}°`, x: p[0], y: p[1] }; draw();
  }
}
function later(fn) { pend = fn; if (!raf) raf = requestAnimationFrame(() => { raf = 0; const f = pend; pend = null; if (f) f(); }); }
const flush = () => { cancelAnimationFrame(raf); raf = 0; const f = pend; pend = null; if (f) f(); };

function startPinch() {
  const [a, b] = [...ptrs.values()];
  drag = { type: 'pinch', d0: Math.max(10, d2(a, b)), m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], c0: { dist: cam.dist, t: cam.t.slice() } };
  active = null;
}
function onDown(e) {
  e.preventDefault(); cancelAnimationFrame(tween);
  const p = local(e); ptrs.set(e.pointerId, p);
  try { cv.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
  if (ptrs.size >= 2) { cancelHold(); flush(); startPinch(); return; }
  tol = e.pointerType === 'mouse' ? 9 : 18; mvTol = e.pointerType === 'mouse' ? 4 : 8; moved = false; down0 = p; dragLabel = null;
  const c0 = { az: cam.az, el: cam.el, t: cam.t.slice() };
  downObj = null;
  if (camMode) { const o = pickObject(p); if (o) { setCamMode(false); if (sel && sel !== o) sel = null; downObj = o; startBody(o, p); draw(); return; } }      // caméra activée par un glisser dans le vide : toucher le VP ou l'écran rend les poignées
  if (camMode || e.button === 1 || e.button === 2) { drag = { type: e.button === 1 || (camMode && (e.button === 2 || e.shiftKey)) ? 'pan' : 'orbit', p0: p, c0 }; return; }
  const h = pickHandle(p); if (h) { startHandle(h, p); return; }
  const o = pickObject(p); if (o) { if (sel && sel !== o) sel = null; downObj = o; startBody(o, p); draw(); return; }      // 1er clic + glisser : déplace l'objet ; le double clic affiche flèches et cercles (voir onUp)
  drag = { type: 'click', p0: p };      // appui dans le vide : un simple toucher désélectionne, un glisser active la caméra (voir onMove)
}
function onMove(e) {
  const p = local(e); if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
  if (!drag) {
    if (e.pointerType !== 'mouse') return;
    later(() => { const h = camMode ? null : pickHandle(p), id = h ? h.id : null; tol = 9; if (id !== hover) { hover = id; draw(); } cv.style.cursor = camMode ? 'grab' : h ? 'pointer' : pickObject(p) ? 'move' : 'default'; });
    return;
  }
  if (drag.type === 'pinch') {
    if (ptrs.size < 2) return;
    const [a, b] = [...ptrs.values()], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    cam.dist = clamp(drag.c0.dist * drag.d0 / Math.max(10, d2(a, b)), 1.5, 90);
    const k = cam.dist / FPX; cam.t = add(drag.c0.t, add(mul(Rr, -(m[0] - drag.m0[0]) * k), mul(Uu, (m[1] - drag.m0[1]) * k)));
    later(draw); return;
  }
  if (drag.type === 'click' && d2(p, drag.p0) > 5) {                 // glisser dans le vide (ou après un appui sans prise) : mode caméra, ses raccourcis s'affichent
    drag = { type: ptrs.size === 1 && e.shiftKey ? 'pan' : 'orbit', p0: drag.p0, c0: { az: cam.az, el: cam.el, t: cam.t.slice() } };
    setCamMode(true);
  }
  if (d2(p, down0) > mvTol) moved = true;
  if (moved) cancelHold();
  if (drag.type === 'hclick') { if (moved && !drag.warned && !drag.long) { drag.warned = true; flash(drag.edge ? 'Tournez la caméra : ce cercle est vu de côté' : `${drag.h.label} est verrouillé : cliquer pour le libérer`, !drag.edge); } return; }
  if (!moved && (drag.type === 'move' || drag.type === 'rot' || drag.type === 'body')) return;      // un simple clic ne déplace rien
  later(() => applyDrag(p));
}
function onUp(e) {
  flush(); ptrs.delete(e.pointerId);
  try { cv.releasePointerCapture(e.pointerId); } catch (_) { /* déjà relâché */ }
  if (drag && drag.type === 'click' && !moved && ptrs.size === 0 && !downObj) { sel = null; lastTap = null; }      // clic en dehors : flèches et cercles disparaissent
  if (downObj && !moved && ptrs.size === 0) {                      // clic sur le VP ou l'écran, sans glisser : deux clics rapprochés = flèches et cercles
    const now = performance.now(), q = local(e);
    if (lastTap && lastTap.o === downObj && now - lastTap.t < 450 && d2(lastTap.p, q) < 24) { sel = sel === downObj ? null : downObj; home = sel ? startState(sel) : null; lastTap = null; } else lastTap = { o: downObj, t: now, p: q };
  } else if (moved) lastTap = null;
  downObj = ptrs.size === 0 ? null : downObj;
  cancelHold();
  if (drag && drag.h && !drag.long && !moved && ptrs.size === 0) cycleHandle(drag.h);
  if (drag && (drag.type === 'orbit' || drag.type === 'pan') && !moved && ptrs.size === 0 && camMode) setCamMode(false);      // simple toucher du vide en mode caméra : on en sort
  if (ptrs.size === 0) { drag = null; active = null; dragLabel = null; draw(); if (api) api.render(); }
  else if (drag && drag.type === 'pinch') { drag = null; }
}
function onWheel(e) {
  e.preventDefault(); cancelAnimationFrame(tween);
  cam.dist = clamp(cam.dist * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)), 1.5, 90); draw();
}

/* ---------- Interface : barre caméra, panneau de droite ---------- */
let flashT = 0;
function flash(t, lock) { const m = $('msg3d'); m.textContent = t; m.classList.add('show'); m.classList.toggle('lock', !!lock); clearTimeout(flashT); flashT = setTimeout(() => m.classList.remove('show'), 2600); }
function updateHint() {
  const h = $('hint3d'); if (!h) return;
  h.textContent = camMode ? ''                                      // mode caméra : aucune indication
    : sel ? 'Glisser une flèche (déplacer) ou un cercle (orienter) · simple clic : valeur, puis verrou, puis libération · appui long 2 s : valeur initiale · double clic sur l\'objet ou clic en dehors = fermer'
      : 'Glisser le VP ou l\'écran pour le déplacer · double clic : flèches et cercles';
}
function setCamMode(v) {                                           // mode caméra : activé par un glisser dans le vide ; toucher le VP ou l'écran, toucher le vide sans glisser ou Échap en sort
  camMode = v; $('pre3d').classList.toggle('hidden', !v);
  cv.style.cursor = v ? 'grab' : 'default'; hover = null; draw();
}
/* La mise en page (fenêtres de droite, vue compacte, plein écran, bandeau données) est rangée par layout3d.js. */
function resizeSoon() { requestAnimationFrame(() => { if (api) api.render(); draw(); }); }

function enter() {
  if (on || !inited) return;
  const calc = $('p-calc');
  if (calc.classList.contains('cfg')) $('cfgBtn').click();                                          // sort de la vue compacte 2D
  const big = document.querySelector('.viz .card.full'); if (big) big.querySelector('.expand').click();      // et du plein écran 2D d'une vue
  on = true;
  Layout3D.enter();
  requestAnimationFrame(() => { Layout3D.vars(); if (!fitted) { setupCam(); const rc = stage.getBoundingClientRect(); W = rc.width; H = rc.height; setupCam(); fit(); } api.render(); draw(); });
}
function leave() {
  if (!on) return;
  on = false; drag = null; ptrs.clear();
  Layout3D.leave();
}

let syncShow = () => {};                                          // met à jour les boutons Faisceau / Position VP / Orientation VP / Lens shift
function init(a) {
  api = a; stage = $('stage3d');
  stage.innerHTML = `<canvas id="cv3d"></canvas>
    <div class="tb3d">
      <div class="pre3d hidden" id="pre3d">
        <button type="button" data-pre="persp">3D</button><button type="button" data-pre="face">Face</button><button type="button" data-pre="side">Côté</button><button type="button" data-pre="top">Dessus</button>
      </div>
    </div>
    `;
  cv = $('cv3d'); ctx = cv.getContext('2d'); inited = true;
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false }); cv.addEventListener('contextmenu', e => e.preventDefault());
  $('pre3d').onclick = e => { const b = e.target.closest('button[data-pre]'); if (b) preset(b.dataset.pre); };
  Layout3D.init({ render: () => { if (api) api.render(); }, getShow: () => JSON.parse(JSON.stringify(prefs.show)), setShow: sh => { prefs.show = normShow({ ...prefs.show, ...sh }); savePrefs(); syncShow(); if (api) api.render(); else draw(); } });
  const ib = $('info3d');
  if (ib) ib.onclick = () => { const h = $('hint3d'), on = !h.classList.contains('open'); h.classList.toggle('open', on); ib.setAttribute('aria-pressed', on); };      // « i » : affiche / masque l'aide des gestes
  const sb = $('show3d');
  if (sb) {
    syncShow = () => {
      const w = prefs.show.sel, f = prefs.show.v[w], c = $('p-calc');
      sb.dataset.w = w; sb.querySelectorAll('button[data-k]').forEach(b => b.classList.toggle('on', !!f[b.dataset.k]));
      $('vsel').querySelectorAll('button[data-w]').forEach(b => b.classList.toggle('on', b.dataset.w === w));
      c.classList.toggle('noAdv3', !prefs.show.v['3d'].adv); c.classList.toggle('noAdvF', !prefs.show.v.face.adv);      // adv : boutons « Réglages supplémentaires », dans la scène 3D et / ou dans la vue de face
    };
    sb.onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; const w = prefs.show.sel; prefs.show.v[w][b.dataset.k] = !prefs.show.v[w][b.dataset.k]; savePrefs(); syncShow(); if (api) api.render(); else draw(); };      // réglage de la vue choisie seulement ; les vues 2D se redessinent aussi
    $('vsel').onclick = e => { const b = e.target.closest('button[data-w]'); if (!b || prefs.show.sel === b.dataset.w) return; prefs.show.sel = b.dataset.w; savePrefs(); syncShow(); };      // choisit la vue dont on règle les éléments
    syncShow();
  }
  if (typeof ResizeObserver !== 'undefined') {                      // la scène, la barre du haut et la pile du bas (indications, indicateurs, valeurs vertes) changent de taille : on recale la mise en page
    const ro = new ResizeObserver(() => { if (on) { Layout3D.vars(); draw(); } });
    [stage, document.querySelector('main > header'), $('hint3d'), $('dragSel3d'), $('simVals'), $('kpis')].forEach(e => e && ro.observe(e));
  }
  addEventListener('keydown', e => { if (!on || e.key !== 'Escape') return; if (camMode) setCamMode(false); else if (sel) { sel = null; draw(); } });
}

/* pixels par mètre au niveau de l'écran (échelle des glissers depuis les icônes de la vue de face) */
function scale() { if (!lastG) return 50; const d = cc(lastG.scC)[2]; return d > NEAR ? clamp(FPX / d, 8, 400) : 50; }

root.View3D = { init, enter, leave, draw, scale, showFor: v => on ? prefs.show.v[v] : null, get active() { return on; } };
})(window);
