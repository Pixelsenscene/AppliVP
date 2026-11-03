/* VP – formes à partir de points 3D : segment (2 points), triangle (3), polygone (4 à 9). Pur, sans DOM.
   Repère : x = droite, y = vers le public (écran en y = 0), z = haut. Les points sont fournis dans l'ordre A, B, C…

   analyze(P, ctx) → { kind: 'segment' | 'triangle' | 'polygon', name, warn: [textes], rows: [ligne…] }
   ligne = { cat, n, f, val, kind, els, geo, x }
     cat  : catégorie (Longueurs, Angles, Surfaces…)         n : intitulé court         f : formule / description
     val  : { v, u } (u : 'm', 'm²', '°', '%', 'mm') | { pt: [x, y, z] } | { txt }
     kind : grandeur (Longueur, Angle, Surface, Coordonnées, Autre)      els : éléments concernés ('A', 'B', 'AB'…)
     geo  : primitives 3D à dessiner { t: 'pt' | 'seg' | 'poly', … }     x : vrai = ligne de la liste « plus exhaustive » seulement
   ctx = { sw, sh } : dimensions de l'écran (pour la part de surface incluse dans l'écran).
         more : vrai = lignes supplémentaires du menu « VP à écran » (médianes et hauteurs d'un quadrilatère quelconque, cercles « impossible » expliqués). */
(function (root) {
'use strict';

const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const mul = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => { const l = len(a); return l < 1e-12 ? [0, 0, 0] : mul(a, 1 / l); };
const dist = (a, b) => len(sub(a, b));
const mid = (a, b) => mul(add(a, b), 0.5);
const mean = P => mul(P.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / P.length);
const deg = r => r * 180 / Math.PI;
const angle = (u, v) => deg(Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v))))));       // angle entre deux vecteurs (0–180°)
const lineAngle = (u, v) => { const a = angle(u, v); return Math.min(a, 180 - a); };                       // angle entre deux droites (0–90°)
const LET = 'ABCDEFGHI';
const TOL_L = (a, b) => Math.abs(a - b) <= 1e-3 + 1e-4 * Math.max(a, b);                                  // longueurs égales
const TOL_A = (a, b) => Math.abs(a - b) <= 0.05;                                                           // angles égaux (°)
const pairId = (i, j) => LET[Math.min(i, j)] + LET[Math.max(i, j)];
const flat = (p, axis) => axis === 'x' ? [0, p[1], p[2]] : axis === 'y' ? [p[0], 0, p[2]] : [p[0], p[1], 0];     // projection sur un plan de coordonnées (x : plan vertical ⟂ écran, y : écran, z : sol)

/* primitives de dessin 3D */
const gPt = p => ({ t: 'pt', p });
const gSeg = (a, b) => ({ t: 'seg', a, b });
const gPoly = (P, fill = true) => ({ t: 'poly', p: P, fill });
const gCirc = (c, r, nrm) => {                                                                              // cercle 3D (72 points) dans le plan de normale nrm
  const axis = Math.abs(nrm[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = unit(cross(nrm, axis)), v = cross(nrm, u), P = [];
  for (let i = 0; i < 72; i++) { const t = 2 * Math.PI * i / 72; P.push(add(c, add(mul(u, r * Math.cos(t)), mul(v, r * Math.sin(t))))); }
  return gPoly(P, false);
};
const R = (cat, n, f, val, kind, els, geo, x) => ({ cat, n, f, val, kind, els, geo: geo || [], x: !!x });
const M = (v, u = 'm') => ({ v, u });

/* ---------- 2 points : segment ---------- */
function segment(P) {
  const [A, B] = P, d = sub(B, A), L = len(d), e = ['A', 'B', 'AB'];
  if (L < 1e-9) return { kind: 'segment', name: 'Points confondus', warn: ['Les deux points sont confondus : pas de segment.'], rows: [] };
  const [dx, dy, dz] = d.map(Math.abs);
  const P2 = [B[0], A[1], A[2]], P3 = [B[0], B[1], A[2]];                                                   // chemin A → x → y → z → B : les trois décalages
  const sA = flat(A, 'y'), sB = flat(B, 'y'), gA = flat(A, 'z'), gB = flat(B, 'z'), vA = flat(A, 'x'), vB = flat(B, 'x');
  const hd = Math.hypot(dx, dy);
  const rows = [
    R('Longueurs', 'A–B', '√(Δx² + Δy² + Δz²)', M(L), 'Longueur', e, [gSeg(A, B)]),
    R('Longueurs', 'Δx', 'décalage latéral |xB − xA|', M(dx), 'Longueur', e, [gSeg(A, P2)]),
    R('Longueurs', 'Δy', 'décalage en profondeur |yB − yA|', M(dy), 'Longueur', e, [gSeg(P2, P3)]),
    R('Longueurs', 'Δz', 'décalage en hauteur |zB − zA|', M(dz), 'Longueur', e, [gSeg(P3, B)]),
    R('Longueurs', 'au sol', 'distance dans le plan horizontal √(Δx² + Δy²)', M(hd), 'Longueur', e, [gSeg(gA, gB)], 1),
    R('Longueurs', 'dans l’écran', 'distance dans le plan de l’écran √(Δx² + Δz²)', M(Math.hypot(dx, dz)), 'Longueur', e, [gSeg(sA, sB)], 1),
    R('Angles avec les plans', 'avec l’écran', 'asin(|Δy| / L)', M(deg(Math.asin(Math.min(1, dy / L))), '°'), 'Angle', e, [gSeg(A, B), gSeg(sA, sB)]),
    R('Angles avec les plans', 'avec le sol', 'asin(|Δz| / L)', M(deg(Math.asin(Math.min(1, dz / L))), '°'), 'Angle', e, [gSeg(A, B), gSeg(gA, gB)]),
    R('Angles avec les plans', 'avec le plan vertical ⟂ écran', 'asin(|Δx| / L)', M(deg(Math.asin(Math.min(1, dx / L))), '°'), 'Angle', e, [gSeg(A, B), gSeg(vA, vB)]),
    R('Angles avec les plans', 'pente', '|Δz| / √(Δx² + Δy²)', hd < 1e-9 ? { txt: 'verticale' } : M(100 * dz / hd, '%'), 'Autre', e, [gSeg(A, B)], 1),
    R('Angles avec les plans', 'direction au sol', 'angle de la projection horizontale avec l’axe y (0° = ⟂ écran)', hd < 1e-9 ? { txt: 'verticale' } : M(deg(Math.atan2(dx, dy)), '°'), 'Angle', e, [gSeg(gA, gB)], 1),
    R('Angles avec les axes', 'avec l’axe x', 'acos(|Δx| / L)', M(deg(Math.acos(Math.min(1, dx / L))), '°'), 'Angle', e, [gSeg(A, B)], 1),
    R('Angles avec les axes', 'avec l’axe y', 'acos(|Δy| / L)', M(deg(Math.acos(Math.min(1, dy / L))), '°'), 'Angle', e, [gSeg(A, B)], 1),
    R('Angles avec les axes', 'avec l’axe z', 'acos(|Δz| / L)', M(deg(Math.acos(Math.min(1, dz / L))), '°'), 'Angle', e, [gSeg(A, B)], 1),
    R('Points', 'milieu M', '(A + B) / 2', { pt: mid(A, B) }, 'Coordonnées', e, [gPt(mid(A, B))], 1),
    R('Points', 'A', 'coordonnées de A', { pt: A }, 'Coordonnées', ['A'], [gPt(A)], 1),
    R('Points', 'B', 'coordonnées de B', { pt: B }, 'Coordonnées', ['B'], [gPt(B)], 1),
  ];
  return { kind: 'segment', name: 'Segment', warn: [], rows };
}

/* ---------- 3 points : triangle ---------- */
function circumcenter(A, B, C) {                                                                            // centre du cercle circonscrit (3D)
  const u = sub(B, A), v = sub(C, A), w = cross(u, v), w2 = dot(w, w);
  if (w2 < 1e-18) return null;
  const t1 = mul(cross(w, u), dot(v, v)), t2 = mul(cross(v, w), dot(u, u));
  return add(A, mul(add(t1, t2), 1 / (2 * w2)));
}
function triangle(P) {
  const [A, B, C] = P, a = dist(B, C), b = dist(A, C), c = dist(A, B), s = (a + b + c) / 2;
  const w = cross(sub(B, A), sub(C, A)), area = len(w) / 2, nrm = unit(w);
  const sideRows = [
    R('Côtés', 'a = B–C', '|BC|', M(a), 'Longueur', ['B', 'C', 'BC'], [gSeg(B, C)]),
    R('Côtés', 'b = A–C', '|AC|', M(b), 'Longueur', ['A', 'C', 'AC'], [gSeg(A, C)]),
    R('Côtés', 'c = A–B', '|AB|', M(c), 'Longueur', ['A', 'B', 'AB'], [gSeg(A, B)]),
    R('Côtés', 'périmètre', 'a + b + c', M(2 * s), 'Longueur', [], [gPoly(P, false)]),
  ];
  if (area < 1e-9 || Math.min(a, b, c) < 1e-9) return { kind: 'triangle', name: 'Triangle dégénéré', warn: ['Points confondus ou alignés : pas de triangle.'], rows: sideRows.slice(0, 3) };
  const ang = [angle(sub(B, A), sub(C, A)), angle(sub(A, B), sub(C, B)), angle(sub(A, C), sub(B, C))];
  // nature
  const rightAt = ang.findIndex(x => TOL_A(x, 90)), eqAB = TOL_L(c, b), eqBC = TOL_L(a, c), eqAC = TOL_L(a, b);
  const iso = eqAB || eqBC || eqAC, equi = eqAB && eqBC;
  const apexIdx = eqAB ? 0 : eqBC ? 1 : eqAC ? 2 : -1;                                                        // sommet d'où partent les 2 côtés égaux : A si c = b, B si c = a, C si a = b
  let name = equi ? 'Triangle équilatéral' : rightAt >= 0 ? `Triangle rectangle${iso ? ' isocèle' : ''} en ${LET[rightAt]}` : iso ? `Triangle isocèle en ${LET[apexIdx]}` : 'Triangle quelconque';
  if (!equi && rightAt < 0) name += ang.some(x => x > 90.05) ? ` (obtus en ${LET[ang.findIndex(x => x > 90.05)]})` : ' (aigu)';
  const rows = [
    R('Forme', 'nature', 'côtés égaux, angle droit, angles aigus / obtus', { txt: name.replace('Triangle ', '') }, 'Autre', [], [gPoly(P)]),
    ...sideRows,
    R('Côtés', 'demi-périmètre', '(a + b + c) / 2', M(s), 'Longueur', [], [], 1),
  ];
  ['A', 'B', 'C'].forEach((n, i) => rows.push(R('Angles', '∠' + n, `acos(u·v / |u||v|) en ${n}`, M(ang[i], '°'), 'Angle', [n], [gPt(P[i])])));
  rows.push(R('Angles', 'somme', '∠A + ∠B + ∠C = 180°', M(ang[0] + ang[1] + ang[2], '°'), 'Angle', ['A', 'B', 'C'], [gPoly(P, false)], 1));
  // hauteurs
  const sides = [[1, 2, a], [0, 2, b], [0, 1, c]];                                                           // côté opposé à chaque sommet
  const feet = [];
  [0, 1, 2].forEach(i => {
    const [j, k] = sides[i], base = sides[i][2], Vv = sub(P[k], P[j]), t = dot(sub(P[i], P[j]), Vv) / (base * base), F = add(P[j], mul(Vv, t));
    feet[i] = F; const h = 2 * area / base;
    rows.push(R('Hauteurs', 'h_' + LET[i], `2·S / ${'abc'[i]} (depuis ${LET[i]})`, M(h), 'Longueur', [LET[i]], [gSeg(P[i], F)]));
  });
  [0, 1, 2].forEach(i => rows.push(R('Hauteurs', 'pied de h_' + LET[i], `projection de ${LET[i]} sur le côté opposé`, { pt: feet[i] }, 'Coordonnées', [LET[i]], [gPt(feet[i])], 1)));
  const O = circumcenter(A, B, C), G = mul(add(add(A, B), C), 1 / 3), H = sub(add(add(A, B), C), mul(O, 2));
  rows.push(R('Hauteurs', 'orthocentre H', 'point de concours des hauteurs', { pt: H }, 'Coordonnées', ['A', 'B', 'C'], [gPt(H)], 1));
  // médianes
  [0, 1, 2].forEach(i => {
    const [j, k] = sides[i], Mi = mid(P[j], P[k]);
    rows.push(R('Médianes', 'm_' + LET[i], `½·√(2b² + 2c² − a²) (depuis ${LET[i]})`, M(dist(P[i], Mi)), 'Longueur', [LET[i]], [gSeg(P[i], Mi)], 1));
  });
  rows.push(R('Médianes', 'centre de gravité G', '(A + B + C) / 3', { pt: G }, 'Coordonnées', ['A', 'B', 'C'], [gPt(G)], 1));
  // bissectrices
  const Ic = mul(add(add(mul(A, a), mul(B, b)), mul(C, c)), 1 / (2 * s));
  [0, 1, 2].forEach(i => {
    const [j, k] = sides[i], dj = dist(P[i], P[j]), dk = dist(P[i], P[k]), D = add(P[j], mul(sub(P[k], P[j]), dj / (dj + dk)));
    rows.push(R('Bissectrices', 't_' + LET[i], `2·b·c·cos(∠${LET[i]}/2) / (b + c) (depuis ${LET[i]})`, M(dist(P[i], D)), 'Longueur', [LET[i]], [gSeg(P[i], D)], 1));
  });
  // cercles
  const r = area / s, Rc = a * b * c / (4 * area);
  rows.push(R('Cercles', 'cercle inscrit : rayon r', 'r = S / p (p = demi-périmètre)', M(r), 'Longueur', ['A', 'B', 'C'], [gCirc(Ic, r, nrm)]));
  rows.push(R('Cercles', 'cercle inscrit : centre I', '(a·A + b·B + c·C) / (a + b + c)', { pt: Ic }, 'Coordonnées', ['A', 'B', 'C'], [gPt(Ic)], 1));
  rows.push(R('Cercles', 'cercle circonscrit : rayon R', 'R = a·b·c / (4·S)', M(Rc), 'Longueur', ['A', 'B', 'C'], [gCirc(O, Rc, nrm)]));
  rows.push(R('Cercles', 'cercle circonscrit : centre O', 'point équidistant de A, B, C', { pt: O }, 'Coordonnées', ['A', 'B', 'C'], [gPt(O)], 1));
  // surfaces
  rows.push(R('Surfaces', 'surface', '½·|AB × AC|  (= √(p(p−a)(p−b)(p−c)))', M(area, 'm²'), 'Surface', [], [gPoly(P)]));
  [['y', 'projetée sur l’écran', 1], ['z', 'projetée sur le sol', 2], ['x', 'projetée sur le plan vertical ⟂ écran', 0]].forEach(([ax, lab, ci]) =>
    rows.push(R('Surfaces', lab, `S·|n·e${ax}|`, M(area * Math.abs(nrm[ci]), 'm²'), 'Surface', [], [gPoly(P.map(p => flat(p, ax)))], 1)));
  // plan du triangle
  rows.push(R('Plan du triangle', 'normale unitaire', 'AB × AC / |AB × AC|', { pt: nrm }, 'Coordonnées', [], [gPoly(P)], 1));
  [['z', 'inclinaison par rapport au sol', 2], ['y', 'angle avec le plan de l’écran', 1], ['x', 'angle avec le plan vertical ⟂ écran', 0]].forEach(([ax, lab, ci]) =>
    rows.push(R('Plan du triangle', lab, `acos(|n·e${ax}|)`, M(deg(Math.acos(Math.min(1, Math.abs(nrm[ci])))), '°'), 'Angle', [], [gPoly(P)], 1)));
  return { kind: 'triangle', name, warn: [], rows };
}

/* ---------- 4 à 9 points : polygone (sommets reliés dans l'ordre A → B → C … → A) ---------- */
function clipConvex(poly, w, h) {                                                                            // découpe un polygone convexe (x, z) par l'écran [-w/2, w/2] × [0, h]
  const clip = (pl, f) => { const out = []; for (let i = 0; i < pl.length; i++) { const a = pl[i], b = pl[(i + 1) % pl.length], fa = f(a), fb = f(b); if (fa >= 0) out.push(a); if ((fa >= 0) !== (fb >= 0)) { const k = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); } } return out; };
  let p = clip(poly, q => q[0] + w / 2); p = clip(p, q => w / 2 - q[0]); p = clip(p, q => q[1]); return clip(p, q => h - q[1]);
}
const shoelace = Q => { let s = 0; for (let i = 0; i < Q.length; i++) { const j = (i + 1) % Q.length; s += Q[i][0] * Q[j][1] - Q[j][0] * Q[i][1]; } return s / 2; };
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
function segsCross(p1, p2, p3, p4) {                                                                         // intersection stricte de deux segments 2D
  const d1 = cross2([p4[0]-p3[0], p4[1]-p3[1]], [p1[0]-p3[0], p1[1]-p3[1]]), d2 = cross2([p4[0]-p3[0], p4[1]-p3[1]], [p2[0]-p3[0], p2[1]-p3[1]]);
  const d3 = cross2([p2[0]-p1[0], p2[1]-p1[1]], [p3[0]-p1[0], p3[1]-p1[1]]), d4 = cross2([p2[0]-p1[0], p2[1]-p1[1]], [p4[0]-p1[0], p4[1]-p1[1]]);
  return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12));
}
function polygon(P, ctx) {
  const n = P.length, nx = i => (i + 1) % n, E = i => sub(P[nx(i)], P[i]);
  const side = P.map((p, i) => len(E(i))), perim = side.reduce((s, x) => s + x, 0);
  const sideRows = P.map((p, i) => R('Côtés', `${LET[i]}–${LET[nx(i)]}`, `|${LET[i]}${LET[nx(i)]}|`, M(side[i]), 'Longueur', [LET[i], LET[nx(i)], pairId(i, nx(i))], [gSeg(P[i], P[nx(i)])]));
  sideRows.push(R('Côtés', 'périmètre', 'somme des côtés', M(perim), 'Longueur', [], [gPoly(P, false)]));
  let Nv = [0, 0, 0]; P.forEach((p, i) => { Nv = add(Nv, cross(p, P[nx(i)])); }); Nv = mul(Nv, 0.5);
  const areaVec = len(Nv);
  let nh = areaVec >= 1e-9 ? unit(Nv) : null;                                                                // contour croisé : l'aire vectorielle peut s'annuler, la normale vient alors du premier coin non aligné
  if (!nh) for (let i = 0; i < n && !nh; i++) { const w = cross(E(i), E(nx(i))); if (len(w) > 1e-9) nh = unit(w); }
  if (Math.min(...side) < 1e-9 || !nh) return { kind: 'polygon', name: 'Polygone dégénéré', warn: ['Points confondus ou alignés : pas de surface.'], rows: sideRows };
  const c0 = mean(P), dev = Math.max(...P.map(p => Math.abs(dot(sub(p, c0), nh)))), planar = dev < 1e-3;
  const u0 = sub(P[1], P[0]), uu = unit(sub(u0, mul(nh, dot(u0, nh)))), vv = cross(nh, uu);
  const Q2 = P.map(p => [dot(sub(p, P[0]), uu), dot(sub(p, P[0]), vv)]);
  let crossed = false;
  for (let i = 0; i < n && !crossed; i++) for (let j = i + 2; j < n && !crossed; j++) { if (i === 0 && j === n - 1) continue; if (segsCross(Q2[i], Q2[nx(i)], Q2[j], Q2[nx(j)])) crossed = true; }
  const turn = i => { const pv = (i + n - 1) % n; return cross2([Q2[i][0]-Q2[pv][0], Q2[i][1]-Q2[pv][1]], [Q2[nx(i)][0]-Q2[i][0], Q2[nx(i)][1]-Q2[i][1]]); };
  const convex = !crossed && P.every((p, i) => turn(i) >= -1e-9);
  const rawAng = P.map((p, i) => angle(sub(P[(i + n - 1) % n], p), sub(P[nx(i)], p)));
  const inner = rawAng.map((a, i) => (planar && !crossed && turn(i) < -1e-9) ? 360 - a : a);                  // angle intérieur (rentrant : plus de 180°)
  const fan = []; for (let i = 1; i < n - 1; i++) fan.push(len(cross(sub(P[i], P[0]), sub(P[i + 1], P[0]))) / 2);
  const fanArea = fan.reduce((s, x) => s + x, 0);
  const area = planar && !crossed ? areaVec : crossed && planar ? Math.abs(shoelace(Q2)) : fanArea;
  const warn = []; if (!planar) warn.push(`Points non coplanaires (écart maximal ${(dev * 1000).toFixed(1).replace('.', ',')} mm) : surface calculée par triangulation en éventail depuis A, approximative.`);
  if (crossed) warn.push('Le contour se croise (ordre des points A → B → C…) : surface au sens de la formule du lacet.');
  // nom
  const eqAll = side.every(s => TOL_L(s, side[0])), angEq = inner.every(a => TOL_A(a, inner[0]));
  const par = (i, j) => { const a = angle(E(i), E(j)); return a < 0.05 || a > 179.95; };
  let name;
  if (n === 4) {
    const right = inner.every(a => TOL_A(a, 90)), oppEq = TOL_L(side[0], side[2]) && TOL_L(side[1], side[3]), p13 = par(0, 2), p24 = par(1, 3);
    if (!planar) name = 'Quadrilatère gauche (non plan)';
    else if (crossed) name = 'Quadrilatère croisé';
    else if (eqAll && right) name = 'Carré';
    else if (right && oppEq) name = 'Rectangle';
    else if (eqAll) name = 'Losange';
    else if (p13 && p24) name = 'Parallélogramme';
    else if (p13 || p24) {
      const legs = p13 ? [side[1], side[3]] : [side[0], side[2]], rightAngles = inner.filter(a => TOL_A(a, 90)).length;
      name = TOL_L(legs[0], legs[1]) ? 'Trapèze isocèle' : rightAngles >= 2 ? 'Trapèze rectangle' : 'Trapèze';
    }
    else if ((TOL_L(side[0], side[3]) && TOL_L(side[1], side[2])) || (TOL_L(side[0], side[1]) && TOL_L(side[2], side[3]))) name = convex ? 'Cerf-volant' : 'Fer de lance (quadrilatère concave)';
    else name = 'Quadrilatère quelconque ' + (convex ? 'convexe' : 'concave');
  } else {
    const base = ['Pentagone', 'Hexagone', 'Heptagone', 'Octogone', 'Ennéagone'][n - 5];
    name = !planar ? `${base} gauche (non plan)` : crossed ? `${base} croisé` : `${base} ${eqAll && angEq && convex ? 'régulier convexe' : 'irrégulier ' + (convex ? 'convexe' : 'concave')}`;
  }
  const allEls = P.map((p, i) => LET[i]);
  const rows = [R('Forme', 'nom', 'selon les côtés, angles et parallélismes', { txt: name }, 'Autre', [], [gPoly(P)]), ...sideRows];
  // diagonales
  const diags = []; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; diags.push([i, j]); }
  diags.forEach(([i, j]) => rows.push(R('Diagonales', `${LET[i]}–${LET[j]}`, `|${LET[i]}${LET[j]}|`, M(dist(P[i], P[j])), 'Longueur', [LET[i], LET[j], pairId(i, j)], [gSeg(P[i], P[j])], n > 4)));
  // angles
  P.forEach((p, i) => rows.push(R('Angles', '∠' + LET[i], planar && !crossed ? `angle intérieur en ${LET[i]}` : `angle entre les côtés en ${LET[i]}`, M(inner[i], '°'), 'Angle', [LET[i]], [gPt(p)])));
  rows.push(R('Angles', 'somme', planar && !crossed ? `(n − 2)·180° = ${(n - 2) * 180}°` : 'somme des angles', M(inner.reduce((s, x) => s + x, 0), '°'), 'Angle', allEls, [gPoly(P, false)], 1));
  if (n === 4) {
    rows.push(R('Angles', 'côtés opposés A–B et C–D', 'angle entre les deux droites', M(lineAngle(E(0), E(2)), '°'), 'Angle', ['A', 'B', 'C', 'D', 'AB', 'CD'], [gSeg(P[0], P[1]), gSeg(P[2], P[3])], 1));
    rows.push(R('Angles', 'côtés opposés B–C et D–A', 'angle entre les deux droites', M(lineAngle(E(1), E(3)), '°'), 'Angle', ['A', 'B', 'C', 'D', 'BC', 'AD'], [gSeg(P[1], P[2]), gSeg(P[3], P[0])], 1));
  }
  // surfaces
  rows.push(R('Surfaces', 'surface totale', !planar ? 'Σ triangles en éventail depuis A (approximatif : points non plans)' : crossed ? 'formule du lacet (contour croisé)' : 'formule du lacet : ½·|Σ Pᵢ × Pᵢ₊₁|', M(area, 'm²'), 'Surface', [], [gPoly(P)]));
  for (let i = 1; i < n - 1; i++) rows.push(R('Surfaces', `triangle A–${LET[i]}–${LET[i + 1]}`, 'triangulation en éventail depuis A : ½·|AP × AQ|', M(fan[i - 1], 'm²'), 'Surface', ['A', LET[i], LET[i + 1]], [gPoly([P[0], P[i], P[i + 1]])], 1));
  [['y', 'projetée sur l’écran', [0, 2]], ['z', 'projetée sur le sol', [0, 1]], ['x', 'projetée sur le plan vertical ⟂ écran', [1, 2]]].forEach(([ax, lab, ci]) =>
    rows.push(R('Surfaces', lab, 'formule du lacet sur la projection', M(Math.abs(shoelace(P.map(p => [p[ci[0]], p[ci[1]]]))), 'm²'), 'Surface', [], [gPoly(P.map(p => flat(p, ax)))], 1)));
  if (ctx && ctx.sw && planar && !crossed && convex && P.every(p => Math.abs(p[1]) < 1e-3)) {
    const cl = clipConvex(P.map(p => [p[0], p[2]]), ctx.sw, ctx.sh), inside = cl.length > 2 ? Math.abs(shoelace(cl)) : 0;
    rows.push(R('Surfaces', 'surface incluse dans l’écran', 'polygone ∩ écran (polygone dans le plan de l’écran)', M(inside, 'm²'), 'Surface', [], cl.length > 2 ? [gPoly(cl.map(q => [q[0], 0, q[1]]))] : [], 1));
    rows.push(R('Surfaces', 'part de l’écran couverte', 'surface incluse / surface de l’écran', M(100 * inside / (ctx.sw * ctx.sh), '%'), 'Surface', [], [], 1));
  }
  // hauteurs (quadrilatères à côtés parallèles)
  if (n === 4 && planar && !crossed) {
    const p13 = par(0, 2), p24 = par(1, 3);
    if (p13 && p24) { rows.push(R('Hauteurs', 'hauteur sur A–B', 'surface / |AB|', M(area / side[0]), 'Longueur', ['A', 'B', 'AB'], [gSeg(P[2], add(P[0], mul(unit(E(0)), dot(sub(P[2], P[0]), unit(E(0))))))], 1)); rows.push(R('Hauteurs', 'hauteur sur B–C', 'surface / |BC|', M(area / side[1]), 'Longueur', ['B', 'C', 'BC'], [gSeg(P[0], add(P[1], mul(unit(E(1)), dot(sub(P[0], P[1]), unit(E(1))))))], 1)); }
    else if (p13 || p24) { const bs = p13 ? [0, 2] : [1, 3]; rows.push(R('Hauteurs', 'hauteur du trapèze', '2·surface / (somme des bases)', M(2 * area / (side[bs[0]] + side[bs[1]])), 'Longueur', allEls, [], 1)); }
  }
  if (ctx.more && n === 4 && planar && !crossed) {                                                          // quadrilatère : médianes (milieux des côtés opposés) et, s'il n'a pas de côtés parallèles, hauteur de chaque sommet sur le côté opposé
    const m = i => mid(P[i], P[nx(i)]);
    rows.push(R('Médianes', 'médiane A–B ↔ C–D', 'segment joignant les milieux de A–B et de C–D', M(dist(m(0), m(2))), 'Longueur', ['A', 'B', 'C', 'D', 'AB', 'CD'], [gSeg(m(0), m(2))]));
    rows.push(R('Médianes', 'médiane B–C ↔ D–A', 'segment joignant les milieux de B–C et de D–A', M(dist(m(1), m(3))), 'Longueur', ['A', 'B', 'C', 'D', 'BC', 'AD'], [gSeg(m(1), m(3))]));
    if (!rows.some(r => r.cat === 'Hauteurs')) for (let i = 0; i < 4; i++) {
      const v = (i + 2) % 4, u = unit(E(i)), F = add(P[i], mul(u, dot(sub(P[v], P[i]), u)));
      rows.push(R('Hauteurs', `${LET[v]} sur ${LET[i]}–${LET[nx(i)]}`, `distance de ${LET[v]} à la droite ${LET[i]}${LET[nx(i)]}`, M(dist(P[v], F)), 'Longueur', [LET[v], LET[i], LET[nx(i)], pairId(i, nx(i))], [gSeg(P[v], F)]));
    }
  }
  // centres : diagonales, gravité, cercles
  if (n === 4 && planar && convex) {
    const d1 = sub(P[2], P[0]);
    const q1 = Q2[0], q3 = Q2[2], q2 = Q2[1], q4 = Q2[3], dd1 = [q3[0]-q1[0], q3[1]-q1[1]], dd2 = [q4[0]-q2[0], q4[1]-q2[1]], den = cross2(dd1, dd2);
    if (Math.abs(den) > 1e-12) { const t = cross2([q2[0]-q1[0], q2[1]-q1[1]], dd2) / den, I = add(P[0], mul(d1, t)); rows.push(R('Centres', 'intersection des diagonales', 'A–C ∩ B–D', { pt: I }, 'Coordonnées', allEls, [gPt(I)], 1)); }
  }
  let Gc = c0;
  if (planar && !crossed) {                                                                                  // centre de gravité de la surface
    let cx = 0, cy = 0, a2 = 0; Q2.forEach((p, i) => { const q = Q2[nx(i)], k = p[0] * q[1] - q[0] * p[1]; a2 += k; cx += (p[0] + q[0]) * k; cy += (p[1] + q[1]) * k; });
    if (Math.abs(a2) > 1e-12) Gc = add(P[0], add(mul(uu, cx / (3 * a2)), mul(vv, cy / (3 * a2))));
  }
  rows.push(R('Centres', 'centre de gravité', planar && !crossed ? 'centre de gravité de la surface' : 'moyenne des sommets', { pt: Gc }, 'Coordonnées', allEls, [gPt(Gc)], 1));
  if (planar && !crossed && convex) {
    const Oc = circumcenter(P[0], P[1], P[2]);
    const regular = eqAll && angEq;
    if (regular) {
      const Rr = side[0] / (2 * Math.sin(Math.PI / n)), rr = side[0] / (2 * Math.tan(Math.PI / n));
      rows.push(R('Cercles', 'cercle circonscrit : rayon R', 'R = côté / (2·sin(π/n))', M(Rr), 'Longueur', allEls, [gCirc(c0, Rr, nh)], 1));
      rows.push(R('Cercles', 'cercle inscrit : rayon r', 'r = côté / (2·tan(π/n))', M(rr), 'Longueur', allEls, [gCirc(c0, rr, nh)], 1));
    } else if (Oc) {
      const Rr = dist(Oc, P[0]);
      if (P.every(p => TOL_L(dist(Oc, p), Rr))) rows.push(R('Cercles', 'cercle circonscrit : rayon R', 'polygone inscriptible : centre équidistant des sommets', M(Rr), 'Longueur', allEls, [gCirc(Oc, Rr, nh)], 1));
      if (n === 4 && TOL_L(side[0] + side[2], side[1] + side[3])) rows.push(R('Cercles', 'cercle inscrit : rayon r', 'quadrilatère circonscriptible : r = surface / demi-périmètre', M(area / (perim / 2)), 'Longueur', allEls, [], 1));
    }
  }
  if (ctx.more && n === 4 && planar && !crossed) {                                                          // pas de cercle possible : on le dit
    if (!rows.some(r => r.cat === 'Cercles' && /circonscrit/.test(r.n))) rows.push(R('Cercles', 'cercle circonscrit', 'existe si les 4 sommets sont sur un même cercle', { txt: 'impossible' }, 'Autre', allEls, []));
    if (!rows.some(r => r.cat === 'Cercles' && /inscrit/.test(r.n))) rows.push(R('Cercles', 'cercle inscrit', 'existe si A–B + C–D = B–C + D–A', { txt: 'impossible' }, 'Autre', allEls, []));
  }
  // plan
  rows.push(R('Plan', 'écart au plan', 'distance maximale des sommets au plan moyen', M(dev * 1000, 'mm'), 'Longueur', allEls, [], 1));
  rows.push(R('Plan', 'normale unitaire', 'normale au plan moyen', { pt: nh }, 'Coordonnées', [], [gPoly(P)], 1));
  [['z', 'inclinaison par rapport au sol', 2], ['y', 'angle avec le plan de l’écran', 1], ['x', 'angle avec le plan vertical ⟂ écran', 0]].forEach(([ax, lab, ci]) =>
    rows.push(R('Plan', lab, `acos(|n·e${ax}|)`, M(deg(Math.acos(Math.min(1, Math.abs(nh[ci])))), '°'), 'Angle', [], [gPoly(P)], 1)));
  return { kind: 'polygon', name, warn, rows };
}

function analyze(P, ctx) {
  const n = P.length;
  if (n === 2) return segment(P);
  if (n === 3) return triangle(P);
  if (n >= 4) return polygon(P, ctx || {});
  return { kind: 'none', name: '', warn: [], rows: [] };
}

const api = { analyze, LET, circumcenter, clipConvex };
if (typeof module !== 'undefined') module.exports = api; else root.VPShapes = api;
})(this);
