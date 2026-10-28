/* VP – moteur géométrique (pur, sans DOM).
   Repère : origine = centre de la base de l'écran, x = droite, y = vers le public, z = haut.
   L'écran est défini par un plan (origine, right, up, normal) : aujourd'hui frontal,
   il suffira de changer ces 4 vecteurs pour l'incliner plus tard. */
(function (root) {
'use strict';

const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const mul = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => { const l = len(a); return l < 1e-12 ? [0,0,0] : mul(a, 1/l); };
const deg = r => r * 180 / Math.PI;

const RANGES = { x:[-10,10], y:[0.5,30], z:[0,10], zoom:[0,100], sw:[0.5,20], sh:[0.3,12] };

function makeScreen(sw, sh) {
  return { w: sw, h: sh, origin:[0,0,0], right:[1,0,0], up:[0,0,1], normal:[0,1,0] };
}
function ratioOf(vp, zoom) {
  return vp.zoomable ? vp.rmin + (vp.rmax - vp.rmin) * zoom / 100 : vp.rmin;
}

/* ---------- Faisceau : VP orienté vers le centre de l'écran, sans roulis ---------- */
function computeBeam(vp, S) {
  const scr = makeScreen(S.sw, S.sh);
  const P = [S.x, S.y, S.z];
  const T = add(scr.origin, mul(scr.up, S.sh / 2));
  const d = sub(T, P), dist = len(d);
  if (dist < 1e-6) return { valid: false };
  const w = mul(d, 1 / dist);
  let u = cross([0,0,1], w);
  u = len(u) < 1e-9 ? [1,0,0] : unit(u);
  const v = cross(w, u);
  const ratio = ratioOf(vp, S.zoom);
  const tanH = 1 / (2 * ratio), tanV = tanH * vp.fh / vp.fw;
  const quad = [];
  for (const [a, b] of [[-1,1],[1,1],[1,-1],[-1,-1]]) {            // A B C D
    const dir = add(w, add(mul(u, a * tanH), mul(v, b * tanV)));
    const den = dot(dir, scr.normal);
    if (den > -1e-9) return { valid: false };
    const t = dot(sub(scr.origin, P), scr.normal) / den;
    if (t <= 0) return { valid: false };
    const H = add(P, mul(dir, t)), r = sub(H, scr.origin);
    quad.push([dot(r, scr.right), dot(r, scr.up)]);
  }
  return { valid: true, scr, P, T, dist, w, u, v, ratio, tanH, tanV, quad };
}

/* écran (s,t) -> panneau du VP en pixels (X vers la droite, Y vers le haut) */
function toPanel(B, vp, s, t) {
  const H = add(B.scr.origin, add(mul(B.scr.right, s), mul(B.scr.up, t)));
  const dd = sub(H, B.P), k = dot(dd, B.w);
  const a = dot(dd, B.u) / k / B.tanH, b = dot(dd, B.v) / k / B.tanV;
  return [(a + 1) / 2 * vp.resW, (b + 1) / 2 * vp.resH];
}

/* ---------- Polygones convexes ---------- */
function area(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const j = (i+1) % p.length; s += p[i][0]*p[j][1] - p[j][0]*p[i][1]; }
  return Math.abs(s) / 2;
}
function clip(poly, f) {                       // garde f(p) >= 0
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i+1) % poly.length], fa = f(A), fb = f(B);
    if (fa >= 0) out.push(A);
    if ((fa >= 0) !== (fb >= 0)) { const k = fa / (fa - fb); out.push([A[0]+(B[0]-A[0])*k, A[1]+(B[1]-A[1])*k]); }
  }
  return out;
}
function clipRect(poly, w, h) {
  let p = clip(poly, q => q[0] + w/2);
  p = clip(p, q => w/2 - q[0]); p = clip(p, q => q[1]); return clip(p, q => h - q[1]);
}

/* ---------- Statistiques du quadrilatère ABCD ---------- */
const d2 = (p, q) => Math.hypot(q[0]-p[0], q[1]-p[1]);
const mid = (p, q) => [(p[0]+q[0])/2, (p[1]+q[1])/2];
function distToLine(p, a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1], l = Math.hypot(dx, dy) || 1e-12;
  const f = ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / (l*l);
  const foot = [a[0]+dx*f, a[1]+dy*f];
  return { d: d2(p, foot), foot };
}
function quadStats(Q) {
  const [A,B,C,D] = Q, N = ['A','B','C','D'];
  const sides = { AB:d2(A,B), BC:d2(B,C), CD:d2(C,D), DA:d2(D,A) };
  const diags = { AC:d2(A,C), BD:d2(B,D) };
  const angles = {}, bis = {};
  for (let i = 0; i < 4; i++) {
    const P = Q[i], L = Q[(i+3)%4], R = Q[(i+1)%4];
    const u1 = [L[0]-P[0], L[1]-P[1]], u2 = [R[0]-P[0], R[1]-P[1]];
    const n1 = Math.hypot(...u1), n2 = Math.hypot(...u2);
    const c = (u1[0]*u2[0] + u1[1]*u2[1]) / (n1*n2);
    angles[N[i]] = deg(Math.acos(Math.max(-1, Math.min(1, c))));
    bis[N[i]] = [u1[0]/n1 + u2[0]/n2, u1[1]/n1 + u2[1]/n2];
  }
  const par = (p,q,r,s) => { const a=[q[0]-p[0],q[1]-p[1]], b=[s[0]-r[0],s[1]-r[1]];
    return Math.abs(a[0]*b[1]-a[1]*b[0]) / (Math.hypot(...a)*Math.hypot(...b)) < 1e-4; };
  const hz = par(A,B,D,C), vt = par(B,C,A,D);
  const right = Object.values(angles).every(a => Math.abs(a-90) < 0.05);
  let shape = 'Quadrilatère quelconque';
  if (hz && vt) shape = right ? 'Rectangle' : 'Parallélogramme';
  else if (hz) shape = Math.abs(sides.BC - sides.DA) < 1e-4 ? 'Trapèze isocèle (bases horizontales)' : 'Trapèze (bases horizontales)';
  else if (vt) shape = 'Trapèze (bases verticales)';
  const mAB = mid(A,B), mBC = mid(B,C), mCD = mid(C,D), mDA = mid(D,A);
  const hT = distToLine(mAB, D, C), wT = distToLine(mBC, A, D);
  let cx = 0, cy = 0, a2 = 0;
  for (let i = 0; i < 4; i++) { const p = Q[i], q = Q[(i+1)%4], c = p[0]*q[1]-q[0]*p[1]; a2 += c; cx += (p[0]+q[0])*c; cy += (p[1]+q[1])*c; }
  return { sides, diags, angles, bis, shape, parallelH: hz, parallelV: vt,
    perimeter: sides.AB+sides.BC+sides.CD+sides.DA, area: area(Q),
    mids: { AB:mAB, BC:mBC, CD:mCD, DA:mDA },
    heightTrap: hT.d, heightFoot: hT.foot, widthTrap: wT.d, widthFoot: wT.foot,
    medV: d2(mAB, mCD), medH: d2(mBC, mDA), centroid: [cx/(3*a2), cy/(3*a2)] };
}

/* ---------- Recouvrement faisceau / écran ---------- */
function overlap(Q, S) {
  const inter = clipRect(Q, S.sw, S.sh), aq = area(Q), as = S.sw * S.sh, ai = inter.length > 2 ? area(inter) : 0;
  return { inter, aq, as, ai, iou: ai / (aq + as - ai) };
}

/* ---------- Calcul complet ---------- */
function compute(vp, S) {
  const B = computeBeam(vp, S);
  if (!B.valid) return { valid: false };
  const ov = overlap(B.quad, S), q = quadStats(B.quad);
  const pan = p => toPanel(B, vp, p[0], p[1]);
  const pArea = poly => poly.length > 2 ? area(poly.map(pan)) : 0;
  const total = vp.resW * vp.resH, useful = pArea(ov.inter);

  // pixels perdus, côté par côté (découpage séquentiel pour ne pas compter deux fois les coins)
  const lost = {}; let rem = B.quad;
  const cut = (name, f) => { lost[name] = { poly: clip(rem, q => -f(q)) }; rem = clip(rem, f); lost[name].px = pArea(lost[name].poly); };
  cut('gauche', p => p[0] + S.sw/2); cut('droite', p => S.sw/2 - p[0]);
  cut('haut', p => S.sh - p[1]);     cut('bas', p => p[1]);

  const uP = ov.inter.map(pan);
  const xs = uP.map(p => p[0]), ys = uP.map(p => p[1]);
  const bbox = uP.length ? { w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys) } : { w:0, h:0 };

  const dh = Math.hypot(S.x, S.y), dz = S.z - S.sh/2;
  const geo = {
    d: B.dist, dh, dz, y: S.y, x: S.x,
    pitch: deg(Math.atan2(dz, dh)), yaw: deg(Math.atan2(S.x, S.y)),
    incidence: deg(Math.acos(Math.min(1, Math.abs(dot(B.w, B.scr.normal))))),
    fovH: deg(2*Math.atan(B.tanH)), fovV: deg(2*Math.atan(B.tanV)),
    fovD: deg(2*Math.atan(Math.hypot(B.tanH, B.tanV))),
    beamW: 2*B.dist*B.tanH, beamH: 2*B.dist*B.tanV,
  };
  const scr = { w:S.sw, h:S.sh, diag:Math.hypot(S.sw,S.sh), area:S.sw*S.sh, perimeter:2*(S.sw+S.sh) };
  const px = { total, useful, lost: Math.max(0, total-useful), byside: lost, bbox,
    usefulPoly: uP, lostPct: Math.max(0, 100*(total-useful)/total), usefulPct: Math.min(100, 100*useful/total),
    perM2: ov.ai > 0 ? useful/ov.ai : 0, pixelMm: ov.ai > 0 ? 1000*Math.sqrt(ov.ai/useful) : 0 };
  const uncovered = Math.max(0, ov.as - ov.ai);
  return { valid:true, B, q, ov, geo, scr, px, ratio:B.ratio, uncovered, uncoveredPct:100*uncovered/ov.as,
           lux: vp.lm / q.area, panelOf: pan };
}

/* ---------- Recherche automatique ---------- */
const clamp = (v, [a,b]) => Math.max(a, Math.min(b, v));
function score(vps, S) {
  const B = computeBeam(vps[S.vp], S);
  return B.valid ? overlap(B.quad, S).iou : -1;
}
function freeKeys(vp, locks, chain) {
  const ks = [];
  for (const k of ['y','x','z']) if (!locks[k]) ks.push(k);
  if (vp.zoomable && !locks.zoom) ks.push('zoom');
  if (!locks.sw) ks.push('sw');
  if (!locks.sh && !chain) ks.push('sh');
  return ks;
}
function withChain(S, k, chain, aspect) {
  if (chain && k === 'sw') S.sh = clamp(S.sw / aspect, RANGES.sh);
}
function localSearch(vps, S0, keys, chain, aspect, iters) {
  let S = { ...S0 }, best = score(vps, S);
  const step = {}; keys.forEach(k => step[k] = (RANGES[k][1]-RANGES[k][0]) * 0.12);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (const k of keys) for (const dir of [-1, 1]) {
      const T = { ...S }; T[k] = clamp(S[k] + dir*step[k], RANGES[k]); withChain(T, k, chain, aspect);
      const sc = score(vps, T);
      if (sc > best + 1e-9) { S = T; best = sc; moved = true; }
    }
    if (!moved) keys.forEach(k => step[k] *= 0.5);
  }
  return { S, score: best, keys };
}
/* Jusqu'à `max` propositions voisines de l'optimum (meilleure surface commune faisceau/écran),
   différentes entre elles sur les paramètres libres. */
function autoProposals(vps, S0, locks, chain, aspect, max = 3, starts = 36) {
  const cands = [];
  const names = locks.vp ? [S0.vp] : Object.keys(vps);
  for (const name of names) {
    const keys = freeKeys(vps[name], locks, chain);
    if (!keys.length) continue;
    for (let i = 0; i < starts; i++) {
      const S = { ...S0, vp: name };
      if (i > 0) for (const k of keys) { S[k] = RANGES[k][0] + Math.random() * (RANGES[k][1]-RANGES[k][0]); withChain(S, k, chain, aspect); }
      cands.push(localSearch(vps, S, keys, chain, aspect, 28));
    }
  }
  if (!cands.length) return [];
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0].score;
  // « écart significatif » par paramètre ; le zoom est ignoré (il compense le recul)
  const SCALE = { x:1.5, y:6, z:0.7, zoom:1e9, sw:2, sh:1.5 };
  const dist = (a, b) => {
    if (a.S.vp !== b.S.vp) return 9;
    const ks = new Set([...a.keys, ...b.keys]); let m = 0;
    ks.forEach(k => m = Math.max(m, Math.abs(a.S[k]-b.S[k]) / SCALE[k]));
    return m;
  };
  for (const tol of [0.04, 0.08, 0.15, 1]) {
    const pool = cands.filter(c => c.score >= best - tol), picked = [pool[0]];
    while (picked.length < max) {
      let far = null, farD = 0.5;                              // farthest-point : on cherche la proposition la plus différente
      for (const c of pool) { const d = Math.min(...picked.map(p => dist(p, c))); if (d > farD) { far = c; farD = d; } }
      if (!far) break; picked.push(far);
    }
    if (picked.length === max || tol === 1) return picked;
  }
  return [];
}

/* point d'impact (s,t) du rayon (a,b) ∈ [-1,1]² du panneau sur le plan écran */
function rayHit(B, a, b) {
  const dir = add(B.w, add(mul(B.u, a * B.tanH), mul(B.v, b * B.tanV)));
  const den = dot(dir, B.scr.normal); if (den > -1e-9) return null;
  const t = dot(sub(B.scr.origin, B.P), B.scr.normal) / den, r = sub(add(B.P, mul(dir, t)), B.scr.origin);
  return [dot(r, B.scr.right), dot(r, B.scr.up)];
}

const api = { rayHit, RANGES, ratioOf, makeScreen, computeBeam, toPanel, area, clip, clipRect, quadStats,
  overlap, compute, score, freeKeys, autoProposals, mid, distToLine, d2 };
if (typeof module !== 'undefined') module.exports = api; else root.VPGeo = api;
})(this);
