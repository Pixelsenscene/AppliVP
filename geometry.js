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

/* ---------- Valeurs standard (quand la fiche du projecteur ne les donne pas) ----------
   Décalages en fraction de l'image : vertical = de sa hauteur, horizontal = de sa largeur (0,3 = 30 %).
   Throw offset : position du centre de l'image au-dessus de l'axe de l'objectif, en fraction de la hauteur
   d'image (0,6 = le bas de l'image est à 10 % de sa hauteur au-dessus de l'axe, VP posé sur une table). */
const STD = { lensV: 0.30, lensH: 0.10, throwOffset: 0.60 };
/* Au-delà, ça n'existe pratiquement pas sur le marché : avertissement en mode « libre » */
const REAL_MAX = { lensV: 1.0, lensH: 0.4, tilt: 15, pan: 15, roll: 5, offset: 1.5, keystone: 0.10 };

/* Limites du lens shift selon la source : 'maker' (fiche), 'std', 'free' (aucune limite -> null) */
function hasMakerLens(vp) { return !!(vp.lensShift && vp.lensShift.v && vp.lensShift.h); }
function lensLimits(vp, source) {
  if (source === 'maker' && hasMakerLens(vp)) return vp.lensShift;
  if (source === 'std') return { v: [-STD.lensV, STD.lensV], h: [-STD.lensH, STD.lensH] };
  return null;
}
function throwOffsetOf(vp) {
  return typeof vp.throwOffset === 'number' ? { value: vp.throwOffset, standard: false } : { value: STD.throwOffset, standard: true };
}

/* ---------- Contrôle de cohérence : rien n'est interdit, tout ce qui est irréaliste est signalé ----------
   ctx = { lens, src, rot, off } (options cochées dans l'interface) ; r = résultat de compute().
   Renvoie [{ key, text }] : key = réglage concerné (sx, sy, oy, pan, tilt, roll, lensSrc) ou null. */
function checkSetup(vp, S, ctx, r) {
  const W = [], pc = x => Math.round(x * 100).toLocaleString('fr-FR'), add = (key, text) => W.push({ key, text });
  if (ctx.lens && ctx.src === 'free') {
    if (Math.abs(S.sy) > REAL_MAX.lensV) add('sy', `Lens shift vertical de ${pc(S.sy)} % : aucun projecteur n'offre plus de ±${pc(REAL_MAX.lensV)} %.`);
    if (Math.abs(S.sx) > REAL_MAX.lensH) add('sx', `Lens shift horizontal de ${pc(S.sx)} % : aucun projecteur n'offre plus de ±${pc(REAL_MAX.lensH)} %.`);
  }
  if (ctx.lens && ctx.src === 'maker' && vp.lensShift) {
    const { v, h } = vp.lensShift;
    if (v[0] > v[1] || h[0] > h[1]) add('lensSrc', 'Plage constructeur incohérente : un minimum dépasse son maximum.');
    else if (Math.max(Math.abs(v[0]), Math.abs(v[1])) > REAL_MAX.lensV || Math.max(Math.abs(h[0]), Math.abs(h[1])) > REAL_MAX.lensH)
      add('lensSrc', `Plage constructeur irréaliste (au-delà de ±${pc(REAL_MAX.lensV)} % en vertical ou ±${pc(REAL_MAX.lensH)} % en horizontal) : vérifier la fiche.`);
  }
  if (ctx.off && Math.abs(S.oy) > REAL_MAX.offset) add('oy', `Throw offset de ${pc(S.oy)} % : inhabituel (au-delà de ±${pc(REAL_MAX.offset)} %).`);
  if (ctx.rot && S.rot) {
    if (Math.abs(S.rot.pan) > REAL_MAX.pan) add('pan', `Pan de ${S.rot.pan.toFixed(1).replace('.', ',')}° : au-delà de ±${REAL_MAX.pan}°, déformation importante.`);
    if (Math.abs(S.rot.tilt) > REAL_MAX.tilt) add('tilt', `Tilt de ${S.rot.tilt.toFixed(1).replace('.', ',')}° : au-delà de ±${REAL_MAX.tilt}°, déformation importante.`);
    if (Math.abs(S.rot.roll) > REAL_MAX.roll) add('roll', `Roll de ${S.rot.roll.toFixed(1).replace('.', ',')}° : l'image est visiblement inclinée.`);
  }
  if (r && r.valid) {
    const { AB, BC, CD, DA } = r.q.sides, k = Math.max(Math.max(AB, CD) / Math.min(AB, CD), Math.max(BC, DA) / Math.min(BC, DA)) - 1;
    if (k > REAL_MAX.keystone) add(null, `Déformation en trapèze de ${pc(k)} % : l'image n'est plus rectangulaire (keystone).`);
    if (r.ov.ai < 1e-9) add(null, "L'image est entièrement hors de l'écran.");
  }
  return W;
}

/* ---------- Orientation ----------
   Automatique (S.rot absent) : l'axe optique vise le centre de l'écran.
   Manuelle (S.rot = {pan, tilt, roll}, en degrés) : pan > 0 vers +x, tilt > 0 vers le haut, roll autour de l'axe.
   pan = tilt = roll = 0 : axe perpendiculaire à l'écran, image droite. */
const rad = d => d * Math.PI / 180;
function autoAim(S) {                                      // angles pour viser S.aim (centre de l'écran si absent)
  const T = S.aim || [0, S.sh / 2];                          // point visé sur l'écran (x, hauteur) : centre de l'écran par défaut
  const d = [T[0] - S.x, -S.y, T[1] - S.z];
  return { pan: deg(Math.atan2(d[0], -d[1])), tilt: deg(Math.atan2(d[2], Math.hypot(d[0], d[1]))), roll: 0 };
}

/* ---------- Faisceau ----------
   Les rayons du panneau (a, b) ∈ [-1,1]² sont décalés de (sa, sb) : lens shift + throw offset.
   S.sx, S.sy = lens shift ; S.oy = throw offset (0 si absent). */
function computeBeam(vp, S) {
  const scr = makeScreen(S.sw, S.sh);
  const P = [S.x, S.y, S.z];
  let w;
  if (S.rot) {
    const p = rad(S.rot.pan), t = rad(S.rot.tilt);
    w = [Math.sin(p) * Math.cos(t), -Math.cos(p) * Math.cos(t), Math.sin(t)];
  } else {
    const d = sub(add(scr.origin, mul(scr.up, S.sh / 2)), P), dist = len(d);
    if (dist < 1e-6) return { valid: false };
    w = mul(d, 1 / dist);
  }
  const wn = dot(w, scr.normal);
  if (wn > -1e-9) return { valid: false };                // l'axe ne rencontre pas l'écran
  const dist = dot(sub(scr.origin, P), scr.normal) / wn;  // distance VP -> point visé (w est unitaire)
  if (dist <= 0) return { valid: false };
  const T = add(P, mul(w, dist));
  let u = cross([0,0,1], w);
  u = len(u) < 1e-9 ? [1,0,0] : unit(u);
  let v = cross(w, u);
  const roll = S.rot ? S.rot.roll || 0 : 0;
  if (roll) { const c = Math.cos(rad(roll)), s = Math.sin(rad(roll)); [u, v] = [add(mul(u, c), mul(v, s)), add(mul(v, c), mul(u, -s))]; }
  const ratio = ratioOf(vp, S.zoom);
  const tanH = 1 / (2 * ratio), tanV = tanH * vp.fh / vp.fw;
  const sa = 2 * (S.sx || 0), sb = 2 * ((S.sy || 0) + (S.oy || 0));
  const quad = [];
  for (const [a, b] of [[-1,1],[1,1],[1,-1],[-1,-1]]) {            // A B C D
    const dir = add(w, add(mul(u, (a + sa) * tanH), mul(v, (b + sb) * tanV)));
    const den = dot(dir, scr.normal);
    if (den > -1e-9) return { valid: false };
    const t = dot(sub(scr.origin, P), scr.normal) / den;
    if (t <= 0) return { valid: false };
    const H = add(P, mul(dir, t)), r = sub(H, scr.origin);
    quad.push([dot(r, scr.right), dot(r, scr.up)]);
  }
  return { valid: true, scr, P, T, dist, w, u, v, ratio, tanH, tanV, sa, sb, roll, quad };
}

/* écran (s,t) -> panneau du VP en pixels (X vers la droite, Y vers le haut) */
function toPanel(B, vp, s, t) {
  const H = add(B.scr.origin, add(mul(B.scr.right, s), mul(B.scr.up, t)));
  const dd = sub(H, B.P), k = dot(dd, B.w);
  const a = dot(dd, B.u) / k / B.tanH - B.sa, b = dot(dd, B.v) / k / B.tanV - B.sb;
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

/* Écran couvert : règle stricte, sans seuil. Le faisceau est un quadrilatère convexe (projection d'un rectangle), donc
   l'écran est entièrement dans le faisceau ssi ses 4 coins le sont, bords compris : dès qu'une partie de l'écran sort,
   aucun côté du faisceau ne peut avoir tout l'écran du bon côté. COVER_EPS (1 nm) n'absorbe que l'erreur d'arrondi
   quand le faisceau est calé exactement sur l'écran. */
const COVER_EPS = 1e-9;
function covers(Q, S) {
  let s = 0;
  for (let i = 0; i < 4; i++) { const a = Q[i], b = Q[(i+1)%4]; s += a[0]*b[1] - b[0]*a[1]; }
  if (!(Math.abs(s) > 1e-12)) return false;                                  // faisceau dégénéré
  const o = Math.sign(s), corners = [[-S.sw/2, 0], [S.sw/2, 0], [S.sw/2, S.sh], [-S.sw/2, S.sh]];
  return corners.every(p => Q.every((a, i) => {
    const b = Q[(i+1)%4], l = Math.hypot(b[0]-a[0], b[1]-a[1]) || 1e-12;
    return o * ((b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])) / l >= -COVER_EPS;   // coin du bon côté du côté AB, BC, CD, DA
  }));
}

/* ---------- Calcul complet ---------- */
function compute(vp, S) {
  const B = computeBeam(vp, S);
  if (!B.valid) return { valid: false };
  const ov = overlap(B.quad, S), q = quadStats(B.quad), covered = covers(B.quad, S);
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
    pan: deg(Math.atan2(B.w[0], -B.w[1])), tilt: deg(Math.asin(B.w[2])), roll: B.roll,
    fovH: deg(2*Math.atan(B.tanH)), fovV: deg(2*Math.atan(B.tanV)),
    fovD: deg(2*Math.atan(Math.hypot(B.tanH, B.tanV))),
    beamW: 2*B.dist*B.tanH, beamH: 2*B.dist*B.tanV,
  };
  const scr = { w:S.sw, h:S.sh, diag:Math.hypot(S.sw,S.sh), area:S.sw*S.sh, perimeter:2*(S.sw+S.sh) };
  const px = { total, useful, lost: Math.max(0, total-useful), byside: lost, bbox,
    usefulPoly: uP, lostPct: Math.max(0, 100*(total-useful)/total), usefulPct: Math.min(100, 100*useful/total),
    perM2: ov.ai > 0 ? useful/ov.ai : 0, pixelMm: ov.ai > 0 ? 1000*Math.sqrt(ov.ai/useful) : 0 };
  const uncovered = covered ? 0 : Math.max(0, ov.as - ov.ai);                 // aire d'écran hors faisceau : information, ne décide pas du verdict
  return { valid:true, B, q, ov, geo, scr, px, ratio:B.ratio, covered, uncovered, uncoveredPct:100*uncovered/ov.as,
           lux: vp.lm / q.area, panelOf: pan };
}

/* ---------- Auto ----------
   · Auto ne fait varier que la position du VP (y, x, z), et seulement les paramètres libres. Il ne touche jamais à l'écran,
     au projecteur, au zoom ni à l'optique avancée, et il vise toujours le centre de l'écran.
   · Priorité 1 : l'écran est couvert (règle stricte, voir covers). Priorité 2 : le moins de pixels perdus possible.
   · Les propositions sont sensiblement différentes entre elles (écart de position).
   · Si aucune position ne couvre l'écran, on cherche quels verrous de position en sont la cause. */
const clamp = (v, [a,b]) => Math.max(a, Math.min(b, v));
const POS = ['y', 'x', 'z'];
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

/* S0 placé en `pos`, VP visant le centre de l'écran (avec une orientation manuelle, seul le roll est conservé) */
function aimedAt(S0, pos) {
  const S = { ...S0, ...pos, aim: null };
  S.rot = S0.rot ? { ...autoAim(S), roll: S0.rot.roll || 0 } : null;
  return S;
}
/* f : à minimiser. Écran couvert → pixels perdus (< 100). Sinon 100 + part d'écran non couverte : guide la recherche vers la couverture. */
function tryPos(vp, S0, pos) {
  const S = aimedAt(S0, pos), B = computeBeam(vp, S);
  if (!B.valid) return { f: 1e6, covered: false, lost: 100 };
  const ov = overlap(B.quad, S), covered = covers(B.quad, S), total = vp.resW * vp.resH;
  const useful = ov.inter.length > 2 ? area(ov.inter.map(p => toPanel(B, vp, p[0], p[1]))) : 0;
  const lost = Math.max(0, 100 * (total - useful) / total);
  return { covered, lost, f: covered ? lost : 100 + 100 * Math.max(0, ov.as - ov.ai) / ov.as };
}

/* écart entre deux positions, en « écarts significatifs » : 1 = clairement différentes (recul : ±15 %, centrage : ¼ de la largeur d'écran, hauteur : ⅓ de la hauteur d'écran) */
const diffScale = S0 => ({ x: Math.max(0.6, 0.25 * S0.sw), z: Math.max(0.35, 0.3 * S0.sh) });
function posDist(a, b, keys, sc) {
  let m = 0;
  for (const k of keys) m = Math.max(m, k === 'y' ? Math.abs(Math.log(a.y / b.y)) / 0.15 : Math.abs(a[k] - b[k]) / sc[k]);
  return m;
}

const EFFORT = { main: { seeds: 28, iters: 40, grid: { y: 40, x: 21, z: 21 } }, light: { seeds: 8, iters: 28, grid: { y: 24, x: 11, z: 11 } } };

/* position arrondie au centimètre (ce que l'interface affiche) qui couvre toujours l'écran : on essaie les arrondis voisins */
function snapCovered(vp, S0, pos, keys, ranges) {
  for (const extra of [0, 1]) {
    const opts = keys.map(k => { const v = pos[k] * 100, lo = Math.floor(v) - extra, hi = Math.ceil(v) + extra, o = [];
      for (let i = lo; i <= hi; i++) o.push(clamp(i / 100, ranges[k])); return o; });
    let best = null;
    const walk = (i, cur) => {
      if (i === keys.length) { const t = tryPos(vp, S0, cur); if (t.covered && (!best || t.lost < best.lost)) best = { pos: { ...cur }, lost: t.lost }; return; }
      for (const v of opts[i]) walk(i + 1, { ...cur, [keys[i]]: v });
    };
    walk(0, { ...pos });
    if (best) return best;
  }
  return null;
}

/* positions qui couvrent l'écran en ne faisant varier que `keys` : grille grossière, puis affinage aléatoire autour des meilleures cases */
function findCovering(vp, S0, keys, ranges, effort) {
  const sc = diffScale(S0), cur = { y: S0.y, x: S0.x, z: S0.z };
  if (!keys.length) { const t = tryPos(vp, S0, cur); return t.covered ? [{ pos: cur, lost: t.lost }] : []; }      // rien de libre : la position actuelle ou rien
  const axis = k => {
    if (!keys.includes(k)) return [S0[k]];
    const [a, b] = ranges[k], n = effort.grid[k], v = [clamp(S0[k], ranges[k])];
    for (let i = 0; i < n; i++) v.push(k === 'y' ? a * (b / a) ** (i / (n - 1)) : a + (b - a) * i / (n - 1));
    return v;
  };
  const cells = [];
  for (const y of axis('y')) for (const x of axis('x')) for (const z of axis('z')) { const pos = { y, x, z }; cells.push({ pos, f: tryPos(vp, S0, pos).f }); }
  cells.sort((a, b) => a.f - b.f);
  const seeds = [];
  for (const c of cells) {                                    // meilleures cases, espacées entre elles pour couvrir des zones différentes
    if (seeds.length >= effort.seeds || c.f >= 1e6) break;
    if (seeds.every(s => posDist(s.pos, c.pos, keys, sc) >= 1)) seeds.push(c);
  }
  const out = [], seen = new Set();
  for (const seed of seeds) {
    let pos = { ...seed.pos }, f = seed.f;
    const step = {}; for (const k of keys) step[k] = k === 'y' ? 0.08 : (ranges[k][1] - ranges[k][0]) * 0.04;
    for (let it = 0; it < effort.iters; it++) {
      let up = false;
      for (let j = 0; j < 8; j++) {
        const q = { ...pos };
        for (const k of keys) q[k] = clamp(k === 'y' ? pos.y * Math.exp(step.y * gauss()) : pos[k] + step[k] * gauss(), ranges[k]);
        const t = tryPos(vp, S0, q); if (t.f < f) { pos = q; f = t.f; up = true; }
      }
      for (const k of keys) step[k] *= up ? 1.1 : 0.6;
      if (keys.every(k => step[k] < (k === 'y' ? 1e-4 : 1e-4 * (ranges[k][1] - ranges[k][0])))) break;
    }
    if (f >= 100) continue;                                   // cette zone ne couvre pas l'écran
    const s = snapCovered(vp, S0, pos, keys, ranges);
    if (!s) continue;
    const id = keys.map(k => s.pos[k]).join('|'); if (seen.has(id)) continue; seen.add(id);
    out.push({ pos: { ...cur, ...s.pos }, lost: s.lost });
  }
  return out;
}

/* jusqu'à n positions, la meilleure d'abord, puis les meilleures suivantes qui en sont sensiblement différentes
   (l'écart exigé diminue seulement s'il n'y en a pas assez). `avoid` : positions déjà vues, jamais reproposées. */
function pickDifferent(cands, n, keys, sc, avoid = []) {
  const sorted = cands.slice().sort((a, b) => a.lost - b.lost), picked = [], ref = avoid.slice();
  for (const t of [1, 0.6, 0.35, 0.2, 0.1]) {
    for (const c of sorted) {
      if (picked.length >= n) break;
      if (!picked.includes(c) && ref.every(p => posDist(p, c.pos, keys, sc) >= t)) { picked.push(c); ref.push(c.pos); }
    }
    if (picked.length >= n) break;
  }
  return picked.sort((a, b) => a.lost - b.lost);
}
const subsets = (a, n) => n === 0 ? [[]] : a.flatMap((v, i) => subsets(a.slice(i + 1), n - 1).map(s => [v, ...s]));

/* Résultat : { ok, free, proposals: [{pos, lost}], blockers }
   ok = au moins une position couvre l'écran. Sinon `blockers` = paramètres de position verrouillés dont le déverrouillage
   permettrait de couvrir l'écran (vide si même avec toute la position libre c'est impossible). */
function autoPlan(vps, S0, locks, opts = {}) {
  const vp = vps[S0.vp], ranges = { ...RANGES, ...opts.ranges }, sc = diffScale(S0);
  const free = POS.filter(k => !locks[k]), locked = POS.filter(k => locks[k]);
  const cands = findCovering(vp, S0, free, ranges, EFFORT.main);
  if (cands.length) return { ok: true, free, blockers: [], proposals: pickDifferent(cands, opts.count || 3, free, sc, opts.avoid) };
  for (let n = 1; n <= locked.length; n++) {
    const good = subsets(locked, n).filter(sub => findCovering(vp, S0, free.concat(sub), ranges, EFFORT.light).length);
    if (good.length) return { ok: false, free, proposals: [], blockers: POS.filter(k => good.some(s => s.includes(k))) };
  }
  return { ok: false, free, proposals: [], blockers: [] };
}

/* point d'impact (s,t) du rayon (a,b) ∈ [-1,1]² du panneau sur le plan écran */
function rayHit(B, a, b) {
  const dir = add(B.w, add(mul(B.u, (a + B.sa) * B.tanH), mul(B.v, (b + B.sb) * B.tanV)));
  const den = dot(dir, B.scr.normal); if (den > -1e-9) return null;
  const t = dot(sub(B.scr.origin, B.P), B.scr.normal) / den, r = sub(add(B.P, mul(dir, t)), B.scr.origin);
  return [dot(r, B.scr.right), dot(r, B.scr.up)];
}

const api = { checkSetup, STD, REAL_MAX, hasMakerLens, lensLimits, throwOffsetOf, autoAim, rayHit, RANGES, ratioOf, makeScreen, computeBeam, toPanel, area, clip, clipRect, quadStats,
  overlap, covers, compute, autoPlan, mid, distToLine, d2 };
if (typeof module !== 'undefined') module.exports = api; else root.VPGeo = api;
})(this);
