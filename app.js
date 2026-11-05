/* VP – interface */
(() => {
  'use strict';
  const G = window.VPGeo;
  let VPS = window.Parc.usable();                 // projecteurs cochés dans la page Projecteurs
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const fm = (v, n = 2) => (Math.abs(v) < 0.5 * 10 ** -n ? 0 : v).toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });   // jamais « −0,00 »
  const fi = v => Math.round(v).toLocaleString('fr-FR');

  /* ---------- État ---------- */
  const S = { vp: 'VP1', sw: 4, sh: 2.25, x: 0, y: 9, z: 1.5, zoom: 50, sx: 0, sy: 0, oy: 0, rot: null, aim: null };   // sx, sy : lens shift · oy : throw offset · rot : orientation manuelle {pan, tilt, roll} · aim : point visé sur l'écran [x, z] (null = centre)
  const st = { chain: true, aspect: 16 / 9 };
  // verrouillé = true. Par défaut : projecteur et écran figés, position + zoom libres.
  const locks = { vp: true, sw: true, sh: true, x: false, y: false, z: false, zoom: false };

  /* ---------- Derniers paramètres modifiés ----------
     Un curseur qui bouge devient jaune intense (classe .hot) ; une fois relâché il reste jaune, moins vif, et son cadenas prend un contour jaune
     (classe .recent), pour suggérer de le verrouiller ou non. Dès qu'un autre paramètre est modifié, le jaune passe sur lui. Jamais sur un paramètre
     verrouillé. Les changements sont repérés par comparaison des valeurs à chaque rendu : curseur, boutons ± , saisie, glisser dans les vues, Auto, liste d'écrans.
     Un geste = du premier doigt posé au dernier relevé : tous les paramètres modifiés pendant le geste (VP glissé en x et y, deux doigts…) restent jaunes ensemble. */
  const TOUCH_KEYS = ['sw', 'sh', 'y', 'x', 'z', 'zoom'];
  const ADV_KEYS = ['sx', 'sy', 'oy', 'pan', 'tilt', 'roll'];     // curseurs de l'optique avancée : même principe, couleur de leur icône, pas de cadenas
  const down = new Set();                                          // pointeurs enfoncés
  let touched = new Set(), hot = false, gesture = false, prevS = null, hotT = 0, advToggled = false;
  function trackChanges() {
    const cur = { vp: S.vp, sx: S.sx * 100, sy: S.sy * 100, oy: S.oy * 100, pan: S.rot ? S.rot.pan : 0, tilt: S.rot ? S.rot.tilt : 0, roll: S.rot ? S.rot.roll : 0 };
    TOUCH_KEYS.forEach(k => cur[k] = S[k]);
    if (prevS) {
      const diff = k => Math.abs(cur[k] - prevS[k]) > 1e-9;
      const chP = TOUCH_KEYS.filter(k => !locks[k] && diff(k));
      // pan / tilt suivent le VP quand on le déplace (visée sur le centre) : ce n'est pas une modification de leur curseur ; cocher / décocher une option non plus
      const chA = advToggled ? [] : ADV_KEYS.filter(k => diff(k) && !(chP.length && (k === 'pan' || k === 'tilt')));
      const ch = chP.length ? chP : chA;
      if (ch.length) {
        clearTimeout(hotT); hot = true;
        if (down.size) { if (!gesture) { gesture = true; touched = new Set(); } ch.forEach(k => touched.add(k)); }       // en plein geste : on cumule
        else { touched = new Set(ch); hotT = setTimeout(() => { hot = false; syncTouched(); }, 450); }                  // action ponctuelle (±, saisie, Auto…) : bref éclat
      } else if (cur.vp !== prevS.vp || ADV_KEYS.some(diff)) { touched = new Set(); hot = false; }                    // un autre réglage a été touché
    }
    advToggled = false; prevS = cur;
  }
  /* fait défiler le panneau de réglages (s'il y a lieu) pour montrer les curseurs en cours de modification */
  let gestureInParams = false;
  function revealRows(rows) {
    rows = rows.filter(r => r.offsetParent); if (!rows.length) return;
    let box = rows[0].parentElement; while (box && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (!box) return;
    const c = box === document.scrollingElement ? { top: 0, bottom: innerHeight } : box.getBoundingClientRect(), pad = 8;
    const fit = rs => { const rc = rs.map(r => r.getBoundingClientRect()); return [Math.min(...rc.map(r => r.top)), Math.max(...rc.map(r => r.bottom))]; };
    const need = (top, bottom) => top < c.top + pad ? top - c.top - pad : bottom > c.bottom - pad ? Math.min(bottom - c.bottom + pad, top - c.top - pad) : 0;      // défilement minimal, sans faire sortir le haut
    const [rTop, rBottom] = fit(rows), [cTop, cBottom] = fit([...new Set(rows.map(r => r.closest('.card') || r))]);
    let d = need(cTop, cBottom);                                  // on montre le bloc entier (titre, cadenas, tous ses curseurs)…
    if (cBottom - cTop > c.bottom - c.top - 2 * pad) {            // …sauf s'il est plus grand que le panneau : on garde son haut et les curseurs modifiés visibles
      const dTop = cTop - c.top - pad; d = rBottom - dTop <= c.bottom - pad ? dTop : need(rTop, rBottom);
    }
    if (Math.abs(d) > 1) box.scrollTop += d;
  }
  function syncTouched() {
    for (const k of [...touched]) if (locks[k]) touched.delete(k);                                                    // verrouillé : plus de jaune
    for (const k of [...TOUCH_KEYS, ...ADV_KEYS]) {
      const row = document.querySelector(TOUCH_KEYS.includes(k) ? `.row[data-k=${k}]` : `.row[data-a=${k}]`); if (!row) continue;
      row.classList.toggle('hot', hot && touched.has(k)); row.classList.toggle('recent', !hot && touched.has(k));
    }
    if (hot && !gestureInParams) revealRows([...document.querySelectorAll('#params .row.hot')]);        // geste dans le panneau lui-même : on ne le fait pas bouger sous le doigt
  }
  const endGesture = () => { down.clear(); gestureInParams = false; gesture = false; clearTimeout(hotT); hot = false; syncTouched(); };
  document.addEventListener('pointerdown', e => { if (e.isPrimary) { down.clear(); gestureInParams = !!e.target.closest('#params'); } down.add(e.pointerId); if (down.size === 1) gesture = false; }, true);
  ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, e => { down.delete(e.pointerId); if (!down.size) endGesture(); }, true));
  addEventListener('blur', endGesture);

  /* blocs déployés au démarrage */
  const OPEN = { vp: true, ecran: true, pos: true, zoom: true, adv: true };
  const PARAMS = {
    sw: { label: 'Largeur', min: 0.5, max: 20, step: 0.05, unit: 'm' },
    sh: { label: 'Hauteur', min: 0.3, max: 12, step: 0.05, unit: 'm' },
    y: { label: 'Recul (y)', min: 0.5, max: 30, step: 0.05, unit: 'm' },
    x: { label: 'Centrage (x)', min: -10, max: 10, step: 0.05, unit: 'm' },
    z: { label: 'Hauteur (z)', min: -3, max: 10, step: 0.05, unit: 'm' },
    zoom: { label: 'Zoom', min: 0, max: 100, step: 1, unit: '%' },
  };
  const GROUPS = [
    { id: 'vp', title: 'Projecteur', short: 'VP', keys: ['vp'] },
    { id: 'ecran', title: 'Écran', short: 'Écran', keys: ['sw', 'sh'] },
    { id: 'pos', title: 'Position', short: 'Position', keys: ['y', 'x', 'z'] },
    { id: 'zoom', title: 'Optique', short: 'Zoom', keys: ['zoom'] },
  ];
  const ICON_L = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const ICON_U = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/></svg>';

  const vpOf = () => VPS[S.vp];
  const effChain = () => st.chain && !locks.sw && !locks.sh;
  const clampP = (k, v) => Math.max(PARAMS[k].min, Math.min(PARAMS[k].max, v));
  /* aimants : en déplaçant le VP au curseur ou au doigt, la hauteur se colle à z = 0 (VP posé au ras du sol) et le centrage à x = 0 (VP dans l'axe de
     l'écran) quand on passe tout près. Seuil en mètres ; en glissant dans une vue, il vaut environ 8 pixels. La saisie au clavier et les boutons ± ne sont pas aimantés. */
  const magnet0 = (v, thr = 0.08) => Math.abs(v) <= thr ? 0 : v;
  const magnetKey = (k, v, thr) => k === 'z' || k === 'x' ? magnet0(v, thr) : v;
  const magnetPx = k => Math.min(0.2, Math.max(0.04, 8 / (k || 1)));
  const groupState = g => {
    const n = g.keys.filter(k => locks[k]).length;
    return n === 0 ? 'free' : n === g.keys.length ? 'locked' : 'mixed';
  };

  const fillVpSelect = () => { const sel = $('vpsel_s'); sel.innerHTML = ''; Object.keys(VPS).forEach(n => sel.add(new Option(n, n))); };
  /* au retour sur la page Calcul : relit le parc (sélection, fiches modifiées) */
  function refreshVps() {
    VPS = window.Parc.usable();
    if (!VPS[S.vp]) S.vp = Object.keys(VPS)[0];
    adv._vp = null; fillVpSelect();
  }

  /* ---------- Panneau de réglages ---------- */
  /* appui maintenu 1 s sur n'importe quel bloc : tous les blocs se réduisent (si le bloc pressé est déployé) ou se déploient (s'il est réduit) */
  let suppressFold = false;
  function attachFoldAll(card) {
    let timer = 0, p0 = null;
    const stop = () => { clearTimeout(timer); timer = 0; };
    card.addEventListener('pointerdown', e => {
      if (e.target.closest('button, select, input, option, label')) return;      // pas sur les commandes
      p0 = [e.clientX, e.clientY];
      timer = setTimeout(() => {
        timer = 0; suppressFold = true; setTimeout(() => suppressFold = false, 600);
        const collapse = !card.classList.contains('collapsed');      // d'après le bloc pressé
        document.querySelectorAll('#params .card').forEach(c => c.classList.toggle('collapsed', collapse));
      }, 1000);
    });
    card.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - p0[0], e.clientY - p0[1]) > 10) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => card.addEventListener(t, stop));
    card.addEventListener('contextmenu', e => { if (timer || suppressFold) e.preventDefault(); });
  }
  function buildParams() {
    const box = $('params'); box.innerHTML = '';
    const colL = document.createElement('div'), colR = document.createElement('div'); colL.className = colR.className = 'pcol';      // 2 piles en affichage réglages, transparentes sinon
    for (const g of GROUPS) {
      const card = document.createElement('div'); card.className = 'card'; card.dataset.g = g.id;
      card.innerHTML = `<h2><span class="chev"></span>${g.title}<span class="hsp"></span>${g.id === 'ecran' ? '<button class="lk chainBtn" id="chain" title="Largeur / hauteur liées">🔗</button>' : ''}<button class="lk" data-g="${g.id}" title="Verrouiller / libérer le groupe"></button></h2>`;
      if (g.id === 'ecran') card.insertAdjacentHTML('beforeend', `<div class="vpsel" id="scrsel"><button class="sq" id="sprev">◀</button><select id="scrsel_s"></select><button class="sq" id="snext">▶</button></div>`);
      if (g.id === 'vp') {
        card.insertAdjacentHTML('beforeend', `<div class="vpsel" id="vpsel"><button class="sq" id="vprev">◀</button><select id="vpsel_s"></select><button class="sq" id="vnext">▶</button></div><div class="sub" id="vpinfo"></div>`);
      } else for (const k of g.keys) {
        const p = PARAMS[k];
        card.insertAdjacentHTML('beforeend', `<div class="row" data-k="${k}">
        <div class="rt"><label>${p.label}${k === 'zoom' ? ' · ratio <b id="o_ratio"></b>' : ''}</label><input class="val" id="o_${k}" data-k="${k}" type="text" inputmode="${k === 'x' ? 'text' : 'decimal'}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="ctl"><button class="lk" data-k="${k}"></button><button data-s="${k}" data-d="-1">−</button><input type="range" id="${k}" min="${p.min}" max="${p.max}" step="${p.step}"><button data-s="${k}" data-d="1">+</button></div></div>`);
      }
      if (!OPEN[g.id]) card.classList.add('collapsed');
      /* bloc réduit / déployé ; le chemin de l'événement est lu tel quel car le bouton cadenas redessine son icône pendant le clic (la cible n'est alors plus dans la page) */
      card.querySelector('h2').onclick = e => {
        if (suppressFold) { suppressFold = false; return; }
        if (!e.composedPath().some(n => n.tagName === 'BUTTON')) card.classList.toggle('collapsed');
      };
      attachFoldAll(card);
      (g.id === 'vp' || g.id === 'ecran' ? colL : colR).append(card);
    }
    box.append(colL, colR);
    const sel = $('vpsel_s'); fillVpSelect();
    sel.onchange = () => { S.vp = sel.value; render(); };
    const cyc = d => { const k = Object.keys(VPS); S.vp = k[(k.indexOf(S.vp) + d + k.length) % k.length]; render(); };
    $('vprev').onclick = () => cyc(-1); $('vnext').onclick = () => cyc(1);
    /* écran : liste de départ ; modifier largeur / hauteur ensuite le fait passer en « Personnalisé » */
    const ssel = $('scrsel_s'), SCR = window.SCREEN_DATA || [];
    ssel.innerHTML = '<option value="">Personnalisé</option>' + SCR.map(p => `<option value="${p.id}">${p.name} · ${fm(p.sw)} × ${fm(p.sh)} m</option>`).join('');
    const pickScr = id => {
      const p = SCR.find(x => x.id === id); if (!p) { render(); return; }
      S.sw = clampP('sw', p.sw); S.sh = clampP('sh', p.sh); if (st.chain) st.aspect = S.sw / S.sh; render();
    };
    ssel.onchange = () => pickScr(ssel.value);
    const scyc = d => { const i = SCR.findIndex(p => p.id === ssel.value); pickScr(SCR[(i < 0 ? (d > 0 ? 0 : SCR.length - 1) : (i + d + SCR.length) % SCR.length)].id); };
    $('sprev').onclick = () => scyc(-1); $('snext').onclick = () => scyc(1);

    box.querySelectorAll('input[type=range]').forEach(i => i.oninput = () => setParam(i.id, magnetKey(i.id, +i.value, i.id === 'x' ? 0.1 : 0.08)));
    box.querySelectorAll('.ctl button[data-s]').forEach(b => b.onclick = () => {
      const k = b.dataset.s; setParam(k, S[k] + (+b.dataset.d) * PARAMS[k].step);
    });
    box.querySelectorAll('.val').forEach(inp => {
      const k = inp.dataset.k;
      inp.onfocus = () => { if (locks[k]) { inp.blur(); return; } inp.value = fm(S[k], k === 'zoom' ? 0 : 2); setTimeout(() => inp.select(), 0); };
      inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.dataset.cancel = 1; inp.blur(); } };
      inp.onblur = () => {
        const cancel = inp.dataset.cancel; delete inp.dataset.cancel;
        const v = parseFloat(inp.value.replace(/\s/g, '').replace(',', '.').replace('−', '-'));
        if (!cancel && isFinite(v)) setParam(k, v); else render();
      };
    });
    // un appui sur le libellé recentre le paramètre : recul = milieu du curseur, hauteur = centre de l'écran, centrage = dans l'axe
    const JUMP = { y: () => (PARAMS.y.min + PARAMS.y.max) / 2, z: () => S.sh / 2, x: () => 0 };
    Object.entries(JUMP).forEach(([k, fn]) => {
      const lab = box.querySelector(`.row[data-k=${k}] label`);
      lab.classList.add('jump'); lab.title = { y: 'Milieu de la course', z: "Centré sur l'écran", x: "Dans l'axe de l'écran" }[k];
      lab.onclick = () => setParam(k, fn());
    });
    box.querySelectorAll('.lk[data-k]').forEach(b => b.onclick = () => { locks[b.dataset.k] = !locks[b.dataset.k]; render(); });
    box.querySelectorAll('.lk[data-g]').forEach(b => b.onclick = () => toggleGroup(b.dataset.g));
    $('chain').onclick = () => { st.chain = !st.chain; if (st.chain) st.aspect = S.sw / S.sh; render(); };
    buildAdv(box);
    /* toucher un réglage verrouillé (curseur, valeur, libellé, listes) : message sous les icônes de la vue de face */
    box.addEventListener('pointerdown', e => {
      const row = e.target.closest('.row.locked'), sel = e.target.closest('.vpsel.locked');
      if (row && !e.target.closest('.lk')) lockMsg(row.dataset.k); else if (sel) lockMsg(...(sel.id === 'vpsel' ? ['vp'] : ['sw', 'sh']));
    });
  }
  function toggleGroup(id) {
    const g = GROUPS.find(x => x.id === id), lock = groupState(g) !== 'locked';
    g.keys.forEach(k => locks[k] = lock); render();
  }
  function setParam(k, v) {
    if (locks[k]) { lockMsg(k); render(); return; }          // le curseur revient à sa place
    S[k] = clampP(k, v);
    if (effChain()) { if (k === 'sw') S.sh = clampP('sh', S.sw / st.aspect); if (k === 'sh') S.sw = clampP('sw', S.sh * st.aspect); }
    reaim(); render();
  }
  function buildLockPills() {
    $('locks').innerHTML = GROUPS.map(g => `<button class="pill" data-g="${g.id}">${ICON_L}<span>${g.short}</span></button>`).join('');
    $('locks').onclick = e => { const b = e.target.closest('.pill'); if (b) toggleGroup(b.dataset.g); };
  }
  function syncLocks() {
    for (const g of GROUPS) {
      const s = groupState(g);
      const card = document.querySelector(`.card[data-g=${g.id}]`); card.dataset.st = s;
      const lk = card.querySelector('.lk[data-g]'); lk.dataset.l = s === 'locked' ? 1 : 0; lk.innerHTML = s === 'free' ? ICON_U : ICON_L;
      const pill = document.querySelector(`.pill[data-g=${g.id}]`); pill.dataset.st = s; pill.firstElementChild.outerHTML = s === 'free' ? ICON_U : ICON_L;
      for (const k of g.keys) {
        const row = card.querySelector(`.row[data-k=${k}]`); if (!row) continue;
        row.classList.toggle('locked', locks[k]);
        const b = row.querySelector('.lk'); b.dataset.l = locks[k] ? 1 : 0; b.innerHTML = locks[k] ? ICON_L : ICON_U;
      }
    }
    $('vpsel').classList.toggle('locked', locks.vp);
    $('scrsel').classList.toggle('locked', locks.sw || locks.sh);
  }

  /* ---------- Optique avancée : A lens shift · B translation · C rotation · throw offset ---------- */
  const adv = { ref: 'auto', zoom: false, lens: false, trans: false, rot: false, src: 'std', off: false, offV: 0, offEdited: false, drag: null, _vp: null };
  const LENS_FREE = { v: 2, h: 1 };                                   // course des curseurs en mode libre (fraction de l'image)
  const lensRange = ax => { const L = G.lensLimits(vpOf(), adv.src); return L ? L[ax] : [-LENS_FREE[ax], LENS_FREE[ax]]; };
  const HELP = {
    lens: "<b>Lens shift (décalage optique)</b> : l'objectif glisse dans le projecteur. L'image se déplace sur l'écran <u>sans se déformer</u>, le VP restant droit. La plage dépend du modèle ; elle s'exprime en % de la hauteur (vertical) ou de la largeur (horizontal) de l'image.",
    src: "<b>Constructeur</b> : plage donnée par la fiche du projecteur (si renseignée).<br><b>Standard</b> : moyenne courante, ±30 % en vertical et ±10 % en horizontal.<br><b>Libre</b> : aucune limite, pour tester un cas hors fiche.",
    trans: "<b>Translation du VP</b> : on déplace le projecteur (x, y, z) sans le faire pivoter. Son axe reste fixe : l'image suit le VP et le faisceau se <u>désaxe</u> de l'écran. Cocher cette case fige la visée automatique.",
    rot: "<b>Rotation du VP</b> : <i>pan</i> = gauche / droite, <i>tilt</i> = haut / bas, <i>roll</i> = autour de l'axe optique. L'image se déplace mais se <u>déforme en trapèze</u> (keystone). Les angles partent de la visée actuelle.",
    off: "<b>Throw offset</b> : décalage vertical <u>fixe</u> de l'image par rapport à l'axe de l'objectif, propre à chaque modèle. À +60 %, le bas de l'image est à 10 % de sa hauteur au-dessus de l'axe (VP posé sur une table). Il s'ajoute au lens shift ; en plafonnier retourné, il est négatif.",
  };
  const ADV_ROWS = [
    { id: 'sx', grp: 'lens', label: 'Horizontal', unit: '%', dp: 0, lens: 'h', step: 1, hard: 500, get: () => S.sx * 100, set: v => S.sx = v / 100 },
    { id: 'sy', grp: 'lens', label: 'Vertical', unit: '%', dp: 0, lens: 'v', step: 1, hard: 500, get: () => S.sy * 100, set: v => S.sy = v / 100 },
    { id: 'oy', grp: 'off', label: 'Décalage vertical', unit: '%', dp: 0, min: -100, max: 150, step: 1, hard: 300, get: () => adv.offV * 100, set: v => { adv.offV = v / 100; adv.offEdited = true; } },
    { id: 'pan', grp: 'rot', label: 'Pan ↔ gauche / droite', unit: '°', dp: 1, min: -45, max: 45, step: 0.5, hard: 89, get: () => S.rot ? S.rot.pan : 0, set: v => S.rot.pan = v },
    { id: 'tilt', grp: 'rot', label: 'Tilt ↕ haut / bas', unit: '°', dp: 1, min: -45, max: 45, step: 0.5, hard: 89, get: () => S.rot ? S.rot.tilt : 0, set: v => S.rot.tilt = v },
    { id: 'roll', grp: 'rot', label: 'Roll ⟳ autour de l\'axe', unit: '°', dp: 1, min: -45, max: 45, step: 0.5, hard: 180, get: () => S.rot ? S.rot.roll : 0, set: v => S.rot.roll = v },
  ];
  const advSlider = r => r.lens ? lensRange(r.lens).map(x => x * 100) : [r.min, r.max];
  const ADV_COL = { lens: '#0fbcd6', off: '#0fbcd6', rot: '#d6620f' };      // couleurs des icônes (lens shift, rotation) ; le throw offset prolonge le lens shift
  const advRowHtml = r => `<div class="row" data-a="${r.id}" style="--tc:${ADV_COL[r.grp]}"><div class="rt"><label>${r.label}</label><input class="val" id="a_o_${r.id}" type="text" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
  <div class="ctl"><button data-a="${r.id}" data-d="-1">−</button><input type="range" id="a_${r.id}" step="${r.step}"><button data-a="${r.id}" data-d="1">+</button></div><div class="rw" id="a_w_${r.id}"></div></div>`;
  const AIM_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>';
  const optHtml = (id, tag, name, help) => `<div class="opt"><label><input type="checkbox" id="adv_${id}"><span>${name}</span></label>${id === 'rot' ? `<button class="aimMini" data-t="Viser le centre de l’écran" aria-label="Viser le centre de l’écran">${AIM_ICON}</button>` : ''}<button class="info" data-h="${help}" aria-label="Aide">i</button></div>`;

  function buildAdv(box) {
    const rows = g => ADV_ROWS.filter(r => r.grp === g).map(advRowHtml).join('');
    const card = document.createElement('div'); card.className = 'card'; card.id = 'advCard';
    card.innerHTML = `<h2><span class="chev"></span>Optique avancée</h2>
    <div class="advItem">${optHtml('lens', 'A', 'Lens shift', 'lens')}
    <div class="grp" id="g_lens">
      <div class="radios" id="lensSrc">${[['maker', 'Constructeur'], ['std', 'Standard'], ['free', 'Libre']].map(([v, t]) => `<label><input type="radio" name="lsrc" value="${v}"><span>${t}</span></label>`).join('')}<button class="info" data-h="src" aria-label="Aide">i</button></div>
      <div class="sub" id="lensHint"></div>${rows('lens')}</div></div>
    <div class="advItem">${optHtml('trans', 'B', 'Translation du VP', 'trans')}
    <div class="grp" id="g_trans"><div class="sub">Orientation figée : les curseurs x, y, z (et la vue de côté / dessus) déplacent l'image.</div></div></div>
    <div class="advItem">${optHtml('rot', 'C', 'Rotation du VP', 'rot')}
    <div class="grp" id="g_rot">${rows('rot')}</div></div>
    <div class="advItem">${optHtml('off', '', 'Throw offset', 'off')}
    <div class="grp" id="g_off"><div class="sub" id="offHint"></div>${rows('off')}</div></div>`;
    if (!OPEN.adv) card.classList.add('collapsed');
    card.querySelector('h2').onclick = () => { if (suppressFold) { suppressFold = false; return; } card.classList.toggle('collapsed'); };
    attachFoldAll(card);
    box.append(card);
    { const sv = document.createElement('div'); sv.id = 'simVals2'; sv.className = 'simVals simBottom'; sv.hidden = true; box.append(sv); }      // vue compacte : valeurs cochées tout en bas, sous les options avancées

    const chk = (id, fn) => $('adv_' + id).onchange = e => { advToggled = true; fn(e.target.checked); render(); };
    chk('lens', on => setOpt('lens', on));
    chk('trans', on => setOpt('trans', on));
    chk('rot', on => setOpt('rot', on));
    chk('off', on => { adv.off = on; adv.offEdited = false; adv.offV = on ? G.throwOffsetOf(vpOf()).value : 0; });
    card.querySelectorAll('input[name=lsrc]').forEach(i => i.onchange = () => { advToggled = true; adv.src = i.value; render(); });
    card.querySelector('.aimMini').onclick = () => { advToggled = true; S.aim = null; if (adv.trans || adv.rot) S.rot = G.autoAim(S); render(); };

    const byId = id => ADV_ROWS.find(r => r.id === id);
    const apply = (r, v) => { const lim = r.lens && adv.src !== 'free' ? advSlider(r) : [-r.hard, r.hard]; r.set(Math.max(lim[0], Math.min(lim[1], v))); render(); };
    card.querySelectorAll('input[type=range]').forEach(i => i.oninput = () => apply(byId(i.id.slice(2)), +i.value));
    card.querySelectorAll('.ctl button').forEach(b => b.onclick = () => { const r = byId(b.dataset.a); apply(r, r.get() + (+b.dataset.d) * r.step); });
    card.querySelectorAll('.val').forEach(inp => {
      const r = byId(inp.id.slice(4));
      inp.onfocus = () => { inp.value = fm(r.get(), r.dp); setTimeout(() => inp.select(), 0); };
      inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.dataset.cancel = 1; inp.blur(); } };
      inp.onblur = () => {
        const cancel = inp.dataset.cancel; delete inp.dataset.cancel;
        const v = parseFloat(inp.value.replace(/\s/g, '').replace(',', '.').replace('−', '-').replace('%', '').replace('°', ''));
        if (!cancel && isFinite(v)) apply(r, v); else render();
      };
    });

    const pop = document.createElement('div'); pop.id = 'pop'; pop.className = 'pop hidden'; document.body.append(pop);
    document.addEventListener('click', e => {
      const b = e.target.closest('.info');
      if (!b) { if (!e.target.closest('#pop')) pop.classList.add('hidden'); return; }
      if (!pop.classList.contains('hidden') && pop._for === b) { pop.classList.add('hidden'); return; }
      pop._for = b; pop.innerHTML = HELP[b.dataset.h]; pop.classList.remove('hidden');
      const rc = b.getBoundingClientRect(), w = Math.min(320, innerWidth - 16);
      pop.style.width = w + 'px'; pop.style.left = Math.max(8, Math.min(rc.left - 8, innerWidth - w - 8)) + 'px';
      const h = pop.offsetHeight; pop.style.top = (rc.bottom + 8 + h > innerHeight ? Math.max(8, rc.top - h - 8) : rc.bottom + 8) + 'px';
    });
    addEventListener('keydown', e => { if (e.key === 'Escape') pop.classList.add('hidden'); });
  }
  /* Coche / décoche A, B ou C (cases de la vue de face et du menu) ; ne change pas l'option agissante, sauf pour la retirer si on la décoche. */
  function setOpt(k, on) {
    if (adv[k] === on) return;
    adv[k] = on;
    if (!on && adv.drag === k) adv.drag = null;
    syncRot();
  }
  /* Visée : automatique (centrée sur l'écran) tant que ni B ni C n'est cochée ; sinon orientation manuelle, figée à la première activation */
  /* vues de côté / dessus et curseurs x, y, z : le VP pivote pour continuer à viser le même point de l'écran
     (le centre de l'écran, ou le point où l'axe tombait après un réglage manuel dans la vue de face) */
  function reaim() { if (S.rot) S.rot = { ...G.autoAim(S), roll: S.rot.roll || 0 }; }
  function syncRot() {
    if (adv.trans || adv.rot) { if (!S.rot) S.rot = G.autoAim(S); }      // B ou C cochée : la visée est figée (réglage « brut »)
    else { S.rot = null; S.aim = null; }                                 // ni B ni C : visée automatique, le VP pivote pour garder le faisceau centré sur l'écran
  }
  /* cohérence de l'état avant calcul : changement de VP, limites du lens shift, throw offset effectif */
  function syncAdv() {
    const v = vpOf();
    if (adv._vp !== S.vp) {
      adv._vp = S.vp;
      if (adv.off) { adv.offV = G.throwOffsetOf(v).value; adv.offEdited = false; }
    }
    if (adv.src === 'maker' && !G.hasMakerLens(v)) adv.src = 'std';
    if (adv.lens && adv.src !== 'free') {
      const cl = (v, [a, b]) => Math.max(a, Math.min(b, v));
      S.sx = cl(S.sx, lensRange('h')); S.sy = cl(S.sy, lensRange('v'));
    }
    S.oy = adv.off ? adv.offV : 0;
  }
  function drawAdv() {
    const v = vpOf(), pct = x => fm(x * 100, 0);
    for (const id of ['lens', 'trans', 'rot', 'off']) { $('adv_' + id).checked = adv[id]; $('g_' + id).classList.toggle('hidden', !adv[id]); }
    document.querySelectorAll('#lensSrc input').forEach(i => {
      const nok = i.value === 'maker' && !G.hasMakerLens(v);
      i.checked = i.value === adv.src; i.disabled = nok; i.nextElementSibling.textContent = nok ? 'Constructeur (non renseigné)' : { maker: 'Constructeur', std: 'Standard', free: 'Libre' }[i.value];
    });
    const L = G.lensLimits(v, adv.src);
    $('lensHint').textContent = L ? `Plage ${adv.src === 'maker' ? 'constructeur' : 'standard'} : vertical ${pct(L.v[0])} à ${pct(L.v[1])} % · horizontal ${pct(L.h[0])} à ${pct(L.h[1])} %` : 'Aucune limite (mode libre).';
    const wl = $('lensHint'), wm = warns.filter(w => w.key === 'lensSrc').map(w => w.text).join(' ');
    wl.classList.toggle('warn', !!wm); if (wm) wl.textContent = wm;
    const T = G.throwOffsetOf(v);
    $('offHint').textContent = adv.offEdited ? `Valeur modifiée (fiche : ${T.standard ? 'standard ' : ''}${pct(T.value)} %)` : T.standard ? `Valeur standard (${pct(T.value)} %) : non renseignée pour ce projecteur` : 'Valeur de la fiche du projecteur';
    for (const r of ADV_ROWS) {
      const [lo, hi] = advSlider(r), i = $('a_' + r.id), o = $('a_o_' + r.id);
      i.min = lo; i.max = hi; i.value = r.get();
      if (document.activeElement !== o) o.value = fm(r.get(), r.dp) + ' ' + r.unit;
      $('a_w_' + r.id).textContent = warns.filter(w => w.key === r.id).map(w => w.text).join(' ');
    }
  }

  /* ---------- Glisser le faisceau dans la vue de face ---------- */
  const DRAG_OPTS = [   // [id, nom, icône, couleur]
    ['lens', 'Lens Shift', '<path opacity=".5" d="M8.5 9.5H7.3a1.8 1.8 0 0 0-1.8 1.8v3.9A1.8 1.8 0 0 0 7.3 17h6.4a1.8 1.8 0 0 0 1.8-1.8v-.9"/><rect x="8.5" y="6.8" width="10" height="7.5" rx="1.8"/><path d="M12 4.4V1.8M10.4 3.4 12 1.8l1.6 1.6M12 19.6v2.6M10.4 20.8 12 22.4l1.6-1.6M4.4 12H1.8M3.2 10.4 1.6 12l1.6 1.6M19.6 12h2.6M20.8 10.4 22.4 12l-1.6 1.6"/>', '#0fbcd6'],
    ['trans', 'Translation', '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>', '#0fd683'],
    ['rot', 'Rotation', '<circle cx="12" cy="12" r="9.5"/><ellipse cx="12" cy="12" rx="4.4" ry="9.5"/><path d="M2.5 12A9.5 4 0 0 1 9.6 8.2M21.5 12A9.5 4 0 0 0 14.4 8.2M2.5 12A9.5 4 0 0 0 9.6 15.8M21.5 12A9.5 4 0 0 1 14.4 15.8"/><path fill="currentColor" stroke-width=".6" d="M11.2 7.9 14.6 6.3v3.2zM12.8 16.1 9.4 14.5v3.2z"/>', '#d6620f'],
    ['zoom', 'Zoom', '<circle cx="12" cy="12" r="9.5"/><path d="M8.7 17.6V9.2M15.3 6.4v8.4"/><path fill="currentColor" stroke-width=".8" d="M8.7 5.4 5.6 9.4h6.2zM15.3 18.6l-3.1-4h6.2z"/>', '#f2c94c']];
  const dragMode = () => adv.drag && adv[adv.drag] && (adv.drag !== 'zoom' || vpOf().zoomable) ? adv.drag : null;   // option agissant au glisser : une seule, toujours cochée, ou aucune
  let dmT = 0, rollMode = false;                               // rollMode : le glisser (point orange au-dessus de la flèche du haut, ou poignée du faisceau) ne pilote que le roll
  /* « Recul (y) est verrouillé » : indique quel(s) paramètre(s) verrouillé(s) on a tenté de modifier */
  const LOCK_NAMES = { vp: ['Projecteur', 0], sw: ['Largeur de l’écran', 1], sh: ['Hauteur de l’écran', 1], y: ['Recul (y)', 0], x: ['Centrage (x)', 0], z: ['Hauteur (z)', 1], zoom: ['Zoom', 0] };      // [nom, féminin ?]
  function lockMsg(...keys) {
    const ks = [...new Set(keys)].filter(k => locks[k] && LOCK_NAMES[k]);
    if (!ks.length) return;
    const fem = ks.every(k => LOCK_NAMES[k][1]), names = ks.map(k => LOCK_NAMES[k][0]);
    dragMsg(ks.length === 1 ? `${names[0]} est verrouillé${fem ? 'e' : ''}` : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]} sont verrouillé${fem ? 'e' : ''}s`, true);
  }
  function dragMsg(text, lock) {        /* petit message centré sous les icônes de la vue de face */
    const m = $('dragSel').querySelector('.dmsg'); if (!m) return; m.textContent = text; m.classList.add('show'); m.classList.toggle('lock', !!lock);
    clearTimeout(dmT); dmT = setTimeout(() => m.classList.remove('show'), 2800);
  }
  function drawDragSel(r) {
    const cur = dragMode(), box = $('dragSel');
    if (box.querySelectorAll('button[data-m]').length !== DRAG_OPTS.length)      /* construit une fois : l'icône active doit survivre aux rafraîchissements pendant le glisser */
      box.innerHTML = '<button class="aimBtn" data-t="Viser le centre de l’écran" aria-label="Viser le centre de l’écran"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></button>' + DRAG_OPTS.map(([k, t, ic, c]) => `<button data-m="${k}" data-t="${t}" style="--c:${c}" aria-label="${t}"><svg viewBox="0 0 24 24">${ic}</svg><span class="arws"><i></i><i></i><i></i><i></i></span>${k === 'rot' ? '<i class="rollDot" title="Roll : faire pivoter l’image autour de l’axe (recliquer : retour à pan / tilt)"></i>' : ''}</button>`).join('') + '<div class="dmsg"></div>';
    /* mire : grisée quand l'axe du faisceau tombe déjà sur le centre de l'écran */
    const centered = r && r.valid && Math.abs(r.B.T[0]) < 0.01 && Math.abs(r.B.T[2] - S.sh / 2) < 0.01;
    box.querySelector('.aimBtn').classList.toggle('idle', !!centered);
    document.querySelectorAll('.aimMini').forEach(b => b.classList.toggle('idle', !!centered));
    if (cur !== 'rot') rollMode = false;                    // autre icône (ou aucune) : retour par défaut à pan / tilt
    box.querySelector('.rollDot')?.classList.toggle('on', rollMode);
    box.querySelectorAll('button[data-m]').forEach(b => {
      const k = b.dataset.m;
      b.className = (k === cur ? 'on' : adv[k] && (k !== 'zoom' || vpOf().zoomable) ? 'chk' : 'off')
        ;
      if (k === 'rot' && rollMode) b.classList.add('roll');
      if (k === 'zoom') {                                   // flèches jaunes (0, 1 ou 2 par sens) selon la course restante
        const lvl = r => locks.zoom || r <= 0 ? 0 : r < 0.5 ? 1 : 2;
        b.dataset.zu = lvl(S.zoom / 100); b.dataset.zd = lvl((100 - S.zoom) / 100);
      }
    });
    $('refSel').dataset.r = adv.ref;
    $('refSel').textContent = 'Référence = ' + { vp: 'VP', ecran: 'écran', auto: 'FIT' }[adv.ref];
    $('refSel').title = { auto: 'affichage centré sur l’écran + faisceau', vp: 'affichage centré sur le faisceau', ecran: 'affichage centré sur l’écran' }[adv.ref];      // note au survol
  }
  /* Mouvement du faisceau : on appuie sur une icône (ou sur le cercle clignotant) et on glisse. Appui sur une icône = l'active et coche l'option ; double clic = la désélectionne et décoche l'option. */
  function attachFaceDrag() {
    const box = $('dragSel'), fsvg = $('svgFace'); let st0 = null, p0 = null, F = null, moved = false, dotTap = null;      // dotTap : appui sur le point roll (simple appui = bascule, glisser = roll)
    const begin = (e, k, freezeFace) => {
      const ok = lastR && lastR.valid && fsvg._F;
      F = fsvg._F; p0 = [e.clientX, e.clientY]; moved = false;
      if (ok && freezeFace) frozen.svgFace = F;          /* glisser le cercle : le repère de la vue de face reste figé sous le doigt (pas avec les icônes) */
      const q = ok ? lastR.q : null;
      dragNow = k; render();
      st0 = {
        m: k, ok, zoom: S.zoom, sx: S.sx, sy: S.sy, x: S.x, z: S.z, rot: S.rot && { ...S.rot }, roll: S.rot ? S.rot.roll || 0 : 0,
        Wb: q ? (q.sides.AB + q.sides.CD) / 2 : 1, Hb: q ? (q.sides.BC + q.sides.DA) / 2 : 1, dist: ok ? lastR.B.dist : 1
      };
    };
    const move = e => {
      if (!st0) return;
      const px = e.clientX - p0[0], py = e.clientY - p0[1];
      if (!moved && Math.hypot(px, py) < 6) return;
      moved = true;
      if (!st0.ok || !F) return;
      const g = adv.ref === 'vp' ? -1 : 1;                 // référence VP : la main tient l'écran, qui bouge par rapport au faisceau fixe → effet inverse sur le faisceau
      const dx = g * px / F.k, dz = -g * py / F.k, cl = (v, [a, b]) => Math.max(a, Math.min(b, v));       // pixels → mètres dans le plan de l'écran
      if (st0.m === 'lens') {
        const lh = adv.src === 'free' ? [-5, 5] : lensRange('h'), lv = adv.src === 'free' ? [-5, 5] : lensRange('v');
        S.sx = Math.round(cl(st0.sx + dx / st0.Wb, lh) * 200) / 200; S.sy = Math.round(cl(st0.sy + dz / st0.Hb, lv) * 200) / 200;
      } else if (st0.m === 'zoom') {                                       // glisser vers la droite = faisceau plus grand (zoom % plus faible)
        if (locks.zoom) { if (Math.abs(px) > 4) lockMsg('zoom'); } else S.zoom = clampP('zoom', Math.round(st0.zoom - px * 0.5));
      } else if (st0.m === 'trans') {
        const lk = [];
        if (!locks.x) S.x = clampP('x', magnet0(Math.round((st0.x + dx) * 100) / 100, magnetPx(F && F.k))); else if (Math.abs(dx) > 0.02) lk.push('x');
        if (!locks.z) S.z = clampP('z', magnet0(Math.round((st0.z + dz) * 100) / 100, magnetPx(F && F.k))); else if (Math.abs(dz) > 0.02) lk.push('z');
        if (lk.length) lockMsg(...lk);
      } else if (st0.m === 'rot' && S.rot && rollMode) {                   // glisser vers la droite = image qui tourne dans le sens horaire (roll < 0)
        S.rot.roll = Math.round(cl(st0.roll - px * 0.15, [-45, 45]) * 2) / 2;
      } else if (st0.m === 'rot' && S.rot) {
        S.rot.pan = Math.round(cl(st0.rot.pan + deg(Math.atan2(dx, st0.dist)), [-89, 89]) * 10) / 10;
        S.rot.tilt = Math.round(cl(st0.rot.tilt + deg(Math.atan2(dz, st0.dist)), [-89, 89]) * 10) / 10;
      }
      render();
    };
    const end = () => { if (!st0) return; if (dotTap && !moved) rollMode = !dotTap.was; dotTap = null; st0 = null; dragNow = null; delete frozen.svgFace; render(); };
    $('refSel').onclick = () => {
      if (fv.mode !== 'auto' && $('dispSel').offsetParent !== null) { Object.assign(fv, { mode: 'auto', manual: false }); render(); return; }      // grisée : un appui réactive Auto (sans changer de référence)
      adv.ref = { vp: 'ecran', ecran: 'auto', auto: 'vp' }[adv.ref]; render();
    };      /* VP → écran → auto → VP */
    box.addEventListener('click', e => {      /* mire : la visée revient au centre de l'écran (comme « Viser le centre de l'écran » de l'option C) */
      if (!e.target.closest('.aimBtn') || e.target.closest('.aimBtn.idle')) return;
      S.aim = null; if (adv.trans || adv.rot) S.rot = G.autoAim(S); render();
    });
    box.ondblclick = e => { if (e.target.closest('.rollDot')) return; const b = e.target.closest('button[data-m]'); if (b) { setOpt(b.dataset.m, false); render(); } };
    box.addEventListener('pointerdown', e => {
      const dot = e.target.closest('.rollDot');
      if (dot) {                                                  // depuis le point : glisser = roll seul ; simple appui = bascule roll ↔ pan / tilt
        e.preventDefault(); e.stopPropagation(); try { dot.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
        dotTap = { was: rollMode }; rollMode = true; begin(e, 'rot', false); return;
      }
      const b = e.target.closest('button[data-m]'); if (!b) return;
      e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
      const k = b.dataset.m;
      rollMode = false;                                           // depuis l'icône : pan / tilt (ou le mouvement de l'icône)
      if (k === 'zoom' && !vpOf().zoomable) { dragMsg('Focale fixe : zoom indisponible pour ce VP'); return; }
      setOpt(k, true); adv.drag = k; render();
      begin(e, k, false);
    });
    fsvg.addEventListener('pointerdown', e => {
      const k = dragMode();
      if (!k || !e.target.closest('.handle') || !lastR || !lastR.valid) return;
      e.preventDefault(); try { fsvg.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
      begin(e, k, false);       /* le cadrage suit la taille faisceau + écran pendant le glisser : rien ne sort de la vue */
    });
    for (const t of [box, fsvg]) { t.addEventListener('pointermove', move); t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end); }
  }
  const deg = r => r * 180 / Math.PI;

  /* ---------- SVG ---------- */
  function el(t, a, txt) { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; }
  function frame(svg, minx, maxx, miny, maxy, pad = 0.6, flipY = false, mTop, mBot) {      // flipY : y croît vers le bas de l'image (vue de dessus : écran en haut, VP en bas)
    const rc = svg.getBoundingClientRect(), W = rc.width || 400, H = rc.height || 300, m = 30, mt = mTop == null ? m : mTop, mb = mBot == null ? m : mBot;      // mTop / mBot : marges réservées en haut (bandeau du plein écran) et en bas (icônes d'affichage)
    const wx = (maxx - minx) + 2 * pad, wy = (maxy - miny) + 2 * pad;
    const k = Math.min((W - 2 * m) / wx, (H - mt - mb) / wy);
    const ox = W / 2 - k * (minx + maxx) / 2, sg = flipY ? -1 : 1, oy = (H + mt - mb) / 2 + sg * k * (miny + maxy) / 2;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
    return { W, H, X: x => ox + k * x, Y: y => oy - sg * k * y, ix: px => (px - ox) / k, iy: py => sg * (oy - py) / k, k, b: [minx, maxx, miny, maxy] };
  }
  /* pendant un glisser, le repère est figé pour que la vue ne « fuie » pas sous le doigt */
  const frozen = {};
  function viewFrame(svg, b, pad, flipY, mTop, mBot) {
    let F = frozen[svg.id];
    if (F) { const rc = svg.getBoundingClientRect(); svg.setAttribute('viewBox', `0 0 ${rc.width} ${rc.height}`); svg.replaceChildren(); }
    else F = frame(svg, ...b, pad, flipY, mTop, mBot);
    svg._F = F; return F;
  }
  function gridLines(svg, F, minx, maxx, miny, maxy) {
    const step = (maxx - minx) > 14 || (maxy - miny) > 14 ? 5 : 1;
    for (let x = Math.ceil(minx / step) * step; x <= maxx; x += step) svg.append(el('line', { x1: F.X(x), x2: F.X(x), y1: F.Y(miny), y2: F.Y(maxy), stroke: '#1f262e' }));
    for (let y = Math.ceil(miny / step) * step; y <= maxy; y += step) svg.append(el('line', { y1: F.Y(y), y2: F.Y(y), x1: F.X(minx), x2: F.X(maxx), stroke: '#1f262e' }));
  }
  const pts = (F, poly) => poly.map(p => `${F.X(p[0])},${F.Y(p[1])}`).join(' ');
  const COL = { ok: '#3ecf8e', warn: '#f5a524', bad: '#ff5d5d' };
  const USEFUL = '#3ecf8e', LOST = '#ff5d5d';

  /* ---------- État : couverture + pixels perdus ---------- */
  const PX_SCALE = [[15, '#0aa81a'], [30, '#7ea80a'], [50, '#a89b0a'], [70, '#a8570a'], [Infinity, '#a81a0a']];
  const pxColor = p => PX_SCALE.find(([max]) => p <= max)[1];
  const COVER_OK = '#0aa81a', COVER_BAD = '#a81a0a';
  /* « % d'écran non couvert » / « % couvert » : jamais « 0,0 % » ni « 100,0 % » tant que l'écran n'est pas entièrement couvert */
  const fuPct = p => p < 0.1 ? '< 0,1' : fm(p, 1);
  const fcPct = r => r.covered ? '100,0' : fm(Math.min(99.9, Math.floor((100 - r.uncoveredPct) * 10) / 10), 1);
  function verdict(r) {
    if (!r.valid) return { lvl: 'bad', cover: false, text: 'Faisceau hors écran (VP mal placé)' };
    const cover = r.covered;                                    // règle stricte : tout l'écran est dans le faisceau, sans tolérance
    return { lvl: cover ? 'ok' : 'bad', cover, text: cover ? 'Écran couvert' : `Écran non couvert : ${fuPct(r.uncoveredPct)} %` };
  }
  function statusHtml(r) {
    const v = verdict(r);
    let html = `<div class="stat"><i style="background:${v.cover ? COVER_OK : COVER_BAD}"></i><span>${v.text}</span></div>`;
    if (r.valid) {
      const c = pxColor(r.px.lostPct);
      html += `<div class="stat"><i style="background:${c}"></i><span>Pixels perdus : <b style="color:${c}">${fm(r.px.lostPct, 1)} %</b></span></div>`;
    }
    return html;
  }
  let warns = [], warnOpen = false;
  /* affichage réglages : les autres indicateurs, sous forme de pastilles à la suite de l'état */
  function cfgInfoHtml(r) {
    const pill = (c, label, val) => `<div class="stat"><i style="background:${c}"></i><span>${label} : <b>${val}</b></span></div>`;
    return pill(COVER_OK, 'Pixels utiles', `${fm(r.px.usefulPct, 1)} % · ${fi(r.px.useful)} px`)
      + pill('#3a4654', 'Ratio', fm(r.ratio) + ':1') + pill('#3a4654', 'Éclairement', fi(r.lux) + ' lx')
      + pill('#3a4654', 'Forme', r.q.shape.split(' (')[0].replace('Quadrilatère quelconque', 'Quelconque'));
  }
  function drawStatus(r) {
    const n = warns.length;
    $('status').innerHTML = statusHtml(r) + (r.valid && $('p-calc').classList.contains('cfg') ? cfgInfoHtml(r) : '') + (n ? `<button class="stat warnPill ${warnOpen ? 'open' : ''}" id="warnBtn"><i></i><span>${n} alerte${n > 1 ? 's' : ''}</span></button>` : '');
    const box = $('warnBox'); box.classList.toggle('hidden', !n || !warnOpen);
    box.innerHTML = warnOpen ? warns.map(w => `<div><span>${w.text}</span>${w.key ? `<small>${({ sx: 'Lens shift H', sy: 'Lens shift V', lensSrc: 'Lens shift', oy: 'Throw offset', pan: 'Pan', tilt: 'Tilt', roll: 'Roll' })[w.key]}</small>` : ''}</div>`).join('') : '';
  }
  $('status').onclick = e => { if (e.target.closest('#warnBtn')) { warnOpen = !warnOpen; drawStatus(lastR); } };

  /* ---------- Vue de face ---------- */
  /* ---------- Affichage de la vue de face : Auto · zoom · déplacement ----------
     Une icône est toujours active. Auto (par défaut) = cadrage automatique, qui dépend de « Référence » (FIT, VP, écran).
     Zoom ou déplacement : la vue devient manuelle et indépendante du faisceau (centre cx, cy en mètres ; échelle k en pixels par mètre). */
  const fv = { mode: 'auto', manual: false, cx: 0, cy: 0, k: 1, k0: 1 };
  function attachDisp() {
    const box = $('dispSel'); let st = null;
    box.addEventListener('pointerdown', e => {
      const b = e.target.closest('button[data-d]'); if (!b) return;
      e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
      const d = b.dataset.d;
      if (d === 'auto') { Object.assign(fv, { mode: 'auto', manual: false }); render(); return; }       // retour au cadrage automatique
      fv.mode = d; st = { d, x: e.clientX, y: e.clientY, cx0: fv.cx, cy0: fv.cy, k0: fv.k, moved: false };
      render();
    });
    box.addEventListener('pointermove', e => {
      if (!st) return;
      const px = e.clientX - st.x, py = e.clientY - st.y;
      if (!st.moved && Math.hypot(px, py) < 4) return;
      if (!st.moved) {
        st.moved = true;
        if (!fv.manual) {                                        // première modification : on fige le cadrage automatique actuel comme point de départ
          const F = $('svgFace')._F; if (!F) { st = null; return; }
          Object.assign(fv, { manual: true, cx: (F.b[0] + F.b[1]) / 2, cy: (F.b[2] + F.b[3]) / 2, k: F.k, k0: F.k });
          Object.assign(st, { cx0: fv.cx, cy0: fv.cy, k0: fv.k });
        }
      }
      if (st.d === 'zoom') fv.k = Math.max(fv.k0 * 0.25, Math.min(fv.k0 * 25, st.k0 * Math.exp(-py * 0.01)));      // vers le haut : agrandir ; vers le bas : prendre du recul
      else { fv.cx = st.cx0 - px / st.k0; fv.cy = st.cy0 + py / st.k0; }                                         // le dessin suit le doigt
      render();
    });
    const end = () => { st = null; };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  }
  /* ---------- Affichage des vues de côté et de dessus : Fit · zoom · déplacement (comme la vue de face, sans « Référence = ») ----------
     Fit = cadrage automatique ; zoom ou déplacement : vue manuelle (centre cx, cy en mètres ; échelle k en pixels par mètre). Pas de vue manuelle en petite vue ni en vue compacte. */
  const dpv = { side: { mode: 'auto', manual: false, cx: 0, cy: 0, k: 1, k0: 1 }, face: { mode: 'auto', manual: false, cx: 0, cy: 0, k: 1, k0: 1 }, top: { mode: 'auto', manual: false, cx: 0, cy: 0, k: 1, k0: 1 } };      // cadrage de chacune des 3 vues du menu « VP à écran » (∑ Calculs)
  const dv = { svgSide: { mode: 'auto', manual: false, cx: 0, cy: 0, k: 1, k0: 1 }, svgTop: { mode: 'auto', manual: false, cx: 0, cy: 0, k: 1, k0: 1 } };
  function attachDispView(boxId, svgId, flip) {
    const box = $(boxId), d0 = dv[svgId]; let st = null;
    box.addEventListener('pointerdown', e => {
      const b = e.target.closest('button[data-d]'); if (!b) return;
      e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
      const d = b.dataset.d;
      if (d === 'auto') { Object.assign(d0, { mode: 'auto', manual: false }); render(); return; }
      d0.mode = d; st = { d, x: e.clientX, y: e.clientY, cx0: d0.cx, cy0: d0.cy, k0: d0.k, moved: false };
      render();
    });
    box.addEventListener('pointermove', e => {
      if (!st) return;
      const px = e.clientX - st.x, py = e.clientY - st.y;
      if (!st.moved && Math.hypot(px, py) < 4) return;
      if (!st.moved) {
        st.moved = true;
        if (!d0.manual) {                                        // première modification : on fige le cadrage actuel comme point de départ
          const F = $(svgId)._F; if (!F) { st = null; return; }
          Object.assign(d0, { manual: true, cx: (F.b[0] + F.b[1]) / 2, cy: (F.b[2] + F.b[3]) / 2, k: F.k, k0: F.k });
          Object.assign(st, { cx0: d0.cx, cy0: d0.cy, k0: d0.k });
        }
      }
      if (st.d === 'zoom') d0.k = Math.max(d0.k0 * 0.25, Math.min(d0.k0 * 25, st.k0 * Math.exp(-py * 0.01)));      // vers le haut : agrandir ; vers le bas : prendre du recul
      else { d0.cx = st.cx0 - px / st.k0; d0.cy = st.cy0 + (flip ? -py : py) / st.k0; }                          // le dessin suit le doigt (vue de dessus : y vers le bas)
      render();
    });
    const end = () => { st = null; };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  }
  /* vignette explicative d'une ligne de calcul : elle apparaît 200 ms après le début du survol du texte bleu (nom de la ligne), à gauche ;
     sur une ligne active, un « i » s'affiche après son texte et un nouvel appui sur la ligne ouvre la vignette. Elle se ferme quand on appuie ailleurs, qu'on fait défiler ou qu'on quitte la liste. */
  const tip = document.createElement('div'); tip.id = 'tip'; tip.hidden = true; document.body.append(tip);
  let tipT = 0, tipEl = null, tipSticky = false, tipWas = null;      // tipWas : ligne dont la vignette (ouverte par un appui) était affichée au début de l'appui en cours
  const hideTip = () => { clearTimeout(tipT); tipEl = null; tipSticky = false; tip.hidden = true; };
  const placeTip = row => {                                           // sur la ligne elle-même, entre le texte bleu (à gauche) et le résultat (à droite) qu'elle ne recouvre pas
    const rc = row.getBoundingClientRect(), nb = row.querySelector('.n').getBoundingClientRect(), vb = row.querySelector('b').getBoundingClientRect();
    const f = row.querySelector('.f'); let fr = nb.right;                                              // fin du texte de la 2e colonne (formule + « i »), pas de la cellule entière
    if (f && f.firstChild) { const rg = document.createRange(); rg.selectNodeContents(f); const rr = rg.getBoundingClientRect(); if (rr.width) fr = Math.max(fr, rr.right); }
    const x0 = fr + 12, w = Math.max(140, vb.left - 10 - x0);
    tip.style.maxWidth = w + 'px'; tip.style.left = x0 + 'px'; tip.style.top = '0px';      // d'abord la largeur et la position horizontale, pour mesurer la hauteur réelle
    const th = tip.offsetHeight, cy = (rc.top + rc.bottom) / 2;
    tip.style.top = Math.max(8, Math.min(innerHeight - th - 8, cy - th / 2)) + 'px';
  };
  const showTip = row => {
    if (tipEl !== row || !row.isConnected) return;
    tip.textContent = row.dataset.d; tip.hidden = false; placeTip(row);
  };
  const showTipNow = row => { hideTip(); tipEl = row; tipSticky = true; showTip(row); };
  $('dbody').addEventListener('mouseover', e => {
    const tEl = e.target.closest('[data-tip]');                         // bouton à vignette courte : « Réinitialiser » après 800 ms
    if (tEl) {
      if (tEl === tipEl) return;
      hideTip(); tipEl = tEl;
      tipT = setTimeout(() => {
        if (tipEl !== tEl || !tEl.isConnected) return;
        tip.style.maxWidth = '240px'; tip.textContent = tEl.dataset.tip; tip.hidden = false; tip.style.top = '0px'; tip.style.left = '0px';
        const rc = tEl.getBoundingClientRect(), tw = tip.offsetWidth;
        tip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, rc.left + rc.width / 2 - tw / 2)) + 'px'; tip.style.top = (rc.bottom + 6) + 'px';
      }, 800);
      return;
    }
    if (tipSticky) return;      // vignette ouverte par un appui : elle reste affichée quand on bouge le curseur, même sur une autre ligne
    const nEl = e.target.closest('.m[data-d] .n'), row = nEl && nEl.closest('.m'); if (row === tipEl) return;
    hideTip(); if (!row) return;
    tipEl = row; tipT = setTimeout(() => showTip(row), 200);
  });
  $('dbody').addEventListener('mouseleave', () => { if (!tipSticky) hideTip(); });
  $('dbody').addEventListener('pointerdown', () => { tipWas = tipSticky && !tip.hidden ? tipEl : null; hideTip(); });
  let tipScrollT = 0;
  $('dbody').addEventListener('scroll', () => {                         // vignette de survol : fermée ; vignette ouverte par un appui : elle suit sa ligne, et se ferme si la ligne sort de la vue une fois le défilement terminé
    if (!tipSticky || !tipEl || !tipEl.isConnected) { hideTip(); return; }
    placeTip(tipEl); clearTimeout(tipScrollT);
    tipScrollT = setTimeout(() => {
      if (!tipSticky || !tipEl) return;
      const rc = tipEl.getBoundingClientRect(), bd = $('dbody').getBoundingClientRect(), st = $('dbody').querySelector('.stk'), top = st ? st.getBoundingClientRect().bottom : bd.top;
      if (rc.bottom < top || rc.top > bd.bottom) hideTip();
    }, 200);
  }, { passive: true });
  const retip = () => {                                                  // une vignette était ouverte et la ligne active change (flèches, appui sur une ligne, appui dans le graphique) : elle s'ouvre pour la nouvelle ligne
    const was = tipWas; tipWas = null; if (!was) return;
    const el = $('dbody').querySelector(`.m[data-i="${selRow}"]`);
    if (el && el.dataset.d) showTipNow(el);
  };
  $('detClose').addEventListener('click', hideTip);
  $('dbody').addEventListener('pointerdown', e => {                    // VP à écran : zoom · déplacement · Fit des 3 vues
    const b = e.target.closest('.dpv button[data-d]'); if (!b) return;
    e.preventDefault();
    const kind = b.closest('.dpv').dataset.v, D = dpv[kind], d = b.dataset.d, again = () => renderDetails(G.compute(vpOf(), S));
    if (d === 'auto') { Object.assign(D, { mode: 'auto', manual: false }); again(); return; }
    D.mode = d; const st = { d, x: e.clientX, y: e.clientY, cx0: D.cx, cy0: D.cy, k0: D.k, moved: false }; let raf = 0;
    const move = ev => {
      const px = ev.clientX - st.x, py = ev.clientY - st.y;
      if (!st.moved && Math.hypot(px, py) < 4) return;
      if (!st.moved) {
        st.moved = true;
        if (!D.manual) {                                               // première modification : on fige le cadrage actuel comme point de départ
          const sv = $('dbody').querySelector(`.dpv[data-v="${kind}"]`).closest('.vwin').querySelector('svg:not(.ic)'), F = sv && sv._F; if (!F) return;
          Object.assign(D, { manual: true, cx: (F.b[0] + F.b[1]) / 2, cy: (F.b[2] + F.b[3]) / 2, k: F.k, k0: F.k });
          Object.assign(st, { cx0: D.cx, cy0: D.cy, k0: D.k });
        }
      }
      if (st.d === 'zoom') D.k = Math.max(D.k0 * 0.25, Math.min(D.k0 * 25, st.k0 * Math.exp(-py * 0.01)));
      else { D.cx = st.cx0 - px / st.k0; D.cy = st.cy0 + py / st.k0; }
      if (!raf) raf = setTimeout(() => { raf = 0; again(); }, 16);      // un seul redessin à la fois pendant le glisser
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    again();
  });
  function drawDispViews() {
    Object.entries({ dispSelSide: 'svgSide', dispSelTop: 'svgTop' }).forEach(([box, id]) => $(box).querySelectorAll('button[data-d]').forEach(b => b.classList.toggle('on', dv[id].mode === b.dataset.d)));
  }
  const dispManual = svg => dv[svg.id].manual && !isThumb(svg) && !$('p-calc').classList.contains('cfg');      // vue manuelle active ?
  const manualBounds = (svg, d, mt = 30, mb = 30) => { const rc = svg.getBoundingClientRect(), W = rc.width || 400, H = rc.height || 300, hx = (W - 60) / (2 * d.k), hy = (H - mt - mb) / (2 * d.k); return [d.cx - hx, d.cx + hx, d.cy - hy, d.cy + hy]; };
  const dispBot = svg => !isThumb(svg) && !$('p-calc').classList.contains('cfg') ? (isBig(svg) ? 72 : 56) : undefined;      // marge basse réservée aux icônes d'affichage (en bas à droite)
  const visRange = F => [F.ix(0), F.ix(F.W), Math.min(F.iy(0), F.iy(F.H)), Math.max(F.iy(0), F.iy(F.H))];      // zone du plan visible, pour la grille
  function drawDispSel() {
    $('dispSel').querySelectorAll('button[data-d]').forEach(b => b.classList.toggle('on', fv.mode === b.dataset.d));        // toujours une seule active
    $('refSel').classList.toggle('off', fv.mode !== 'auto' && $('dispSel').offsetParent !== null);                               // la référence ne joue que si Auto est actif
  }
  function drawFace(r) {
    const svg = $('svgFace'); svg.closest('.card').classList.toggle('covered', !!(r.valid && r.covered));      // écran couvert : contour de la vue de face en vert
    if (!r.valid) { svg.replaceChildren(); return; }
    const Q = r.B.quad, xs = Q.map(p => p[0]).concat(-S.sw / 2, S.sw / 2), ys = Q.map(p => p[1]).concat(0, S.sh);
    let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (!isThumb(svg) && !$('p-calc').classList.contains('cfg')) y1 += (isBig(svg) ? 0.3 : 0.2) * (y1 - y0);      // réserve de la place en haut pour les icônes de mouvement (en petit elles sont en bas à gauche)
    if (adv.ref !== 'auto') {      /* référence VP : le faisceau reste au centre de la vue, l'écran bouge · référence écran : l'écran reste au centre, le faisceau bouge */
      const c = adv.ref === 'vp' ? r.q.centroid : [0, S.sh / 2];
      const hx = Math.max(c[0] - x0, x1 - c[0]), hy = Math.max(c[1] - y0, y1 - c[1]);
      [x0, x1, y0, y1] = [c[0] - hx, c[0] + hx, c[1] - hy, c[1] + hy];
    }
    const adj = !isThumb(svg) && !$('p-calc').classList.contains('cfg');                    // icônes d'affichage présentes (pas en petite vue ni en vue compacte)
    const mBot = adj ? 112 : undefined;                                                     // marge basse : icônes d'affichage + « Référence = »
    let pad;
    if (adj && fv.manual) {                                                                 // vue manuelle : centre et échelle imposés
      const rc = svg.getBoundingClientRect(), W = rc.width || 400, H = rc.height || 300, hx = (W - 60) / (2 * fv.k), hy = (H - 30 - mBot) / (2 * fv.k);
      [x0, x1, y0, y1] = [fv.cx - hx, fv.cx + hx, fv.cy - hy, fv.cy + hy]; pad = 0;
    }
    const F = viewFrame(svg, [x0, x1, y0, y1], pad, false, undefined, mBot);
    if (adj && fv.manual) gridLines(svg, F, F.ix(0), F.ix(F.W), F.iy(F.H), F.iy(0)); else gridLines(svg, F, x0 - 1, x1 + 1, y0 - 1, y1 + 1);
    const sx = F.X(-S.sw / 2), sy = F.Y(S.sh), sW = F.X(S.sw / 2) - sx, sH = F.Y(0) - sy;
    const lvl = verdict(r).lvl;
    svg.append(el('defs', {}), (() => {
      const d = el('defs', {});
      d.innerHTML = `<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#12161b"/><line x1="0" y1="0" x2="0" y2="8" stroke="#2b3440" stroke-width="3"/></pattern><clipPath id="scrClip"><rect x="${sx}" y="${sy}" width="${sW}" height="${sH}"/></clipPath>`; return d;
    })());
    svg.append(el('rect', { x: sx, y: sy, width: sW, height: sH, fill: 'url(#hatch)' }));                       // écran non couvert
    svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(255,93,93,.28)' }));                             // faisceau (perdu)
    svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(62,207,142,.42)', 'clip-path': 'url(#scrClip)' })); // faisceau ∩ écran (utile)
    svg.append(el('rect', { x: sx, y: sy, width: sW, height: sH, fill: 'none', stroke: lvl === 'bad' ? SCREEN_RED : COL[lvl], 'stroke-width': 3 }));      // écran non couvert : rouge vif ; couvert : vert
    svg.append(el('polygon', { points: pts(F, Q), fill: 'none', stroke: '#4da3ff', 'stroke-width': 2, class: 'bglow' }));
    ['A', 'B', 'C', 'D'].forEach((n, i) => {
      const p = Q[i], ox = i === 0 || i === 3 ? -12 : 12, oy = i < 2 ? -8 : 16;
      svg.append(el('circle', { cx: F.X(p[0]), cy: F.Y(p[1]), r: 3.5, fill: '#4da3ff' }));
      svg.append(el('text', { x: F.X(p[0]) + ox, y: F.Y(p[1]) + oy, 'text-anchor': 'middle', fill: '#9cc9ff', 'font-size': 13, 'font-weight': 700 }, n));
    });
    const cx = F.X(r.B.T[0]), cy = F.Y(r.B.T[2]);                                                               // point visé par l'axe optique
    svg.append(el('path', { d: `M${cx - 7},${cy}H${cx + 7}M${cx},${cy - 7}V${cy + 7}`, stroke: '#fff', 'stroke-width': 1.5, opacity: .7 }));
    if (sW > 130 && sy > 34) {
      const t = el('text', { x: F.X(0), y: sy - 8, 'text-anchor': 'middle', fill: '#e8edf2', 'font-size': 13 });       // largeur et hauteur de l'écran : violet si verrouillées
      const both = locks.sw && locks.sh;                                                      // écran entièrement verrouillé : « 4,00 × 2,25 m » en entier en violet ; une seule dimension verrouillée : seul son nombre
      [[fm(S.sw), 'sw'], [' × ', null], [fm(S.sh), 'sh'], [' m', null]].forEach(([txt, k]) => { const ts = el('tspan', (k && locks[k]) || both ? { fill: LOCKC } : {}, txt); t.append(ts); });
      svg.append(t);
    }   // pas de cote si elle chevauche les lettres A/B ou le titre de la vue
    if (!isThumb(svg)) {                                                                  // nom du VP, discret : au pied de l'écran, en bas à droite, à l'extérieur
      const by = Math.max(sy + sH, F.Y(Math.min(...ys)));                                 // sous l'écran et sous le faisceau (lettres A–D comprises)
      svg.append(el('text', isBig(svg) ? { x: sx + sW / 2, y: by + 17, 'text-anchor': 'middle', fill: pcol('vp', GREY), 'font-size': 12, 'font-weight': 600, opacity: .8, class: 'vpName' } : { x: sx + sW, y: by + 36, 'text-anchor': 'end', fill: pcol('vp', GREY), 'font-size': 12, 'font-weight': 600, opacity: .8, class: 'vpName' }, S.vp));      // violet si le projecteur est verrouillé
    }
    const dm = dragMode();
    if (dm && !isThumb(svg)) {                                                       // poignée au centre de l'image : glisser = déplacer le faisceau
      const g = r.q.centroid, free = dm !== 'trans' || !locks.x || !locks.z, hx = F.X(g[0]), hy = F.Y(g[1]);
      svg.append(el('circle', { cx: hx, cy: hy, r: 17, fill: 'none', stroke: free ? DRAG_OPTS.find(o => o[0] === dm)[3] : '#b58cff', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: .85, class: 'blink', 'pointer-events': 'none' }));
      if (free) svg.append(el('circle', { class: 'handle', cx: hx, cy: hy, r: 30, fill: 'transparent' }));
    }
    if (isThumb(svg)) {                                                            // petite vue : dimensions du faisceau + angles aux sommets
      const q = r.q, inw = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      ['A', 'B', 'C', 'D'].forEach((n, i) => val(svg, F.X(Q[i][0]) + inw[i][0] * 6, F.Y(Q[i][1]) + inw[i][1] * 16, `${fm(q.angles[n], 1)}°`, inw[i][0] > 0 ? 'start' : 'end', '#9cc9ff', 11));
      val(svg, F.X(0), F.Y(0) + 4 + 16 * 1, `faisceau ${fm(q.widthTrap)} × ${fm(q.heightTrap)} m`, 'middle', '#9cc9ff', 12);
    }
    if (dragNow) {
      const o = DRAG_OPTS.find(o => o[0] === dragNow);      // nom du mouvement, tant que l'icône est tenue
      svg.append(el('text', { x: F.X(0), y: Math.min(F.H - 8, F.Y(0) + (isThumb(svg) ? 44 : 24)), 'text-anchor': 'middle', fill: o[3], 'font-size': 14, 'font-weight': 700, stroke: '#0f1216', 'stroke-width': 4, 'paint-order': 'stroke' }, o[1]));
    }
  }

  /* ---------- Vue de côté / dessus (le VP se déplace au doigt) ---------- */
  function handle(svg, F, x, y, axes) {
    const free = axes.some(k => !locks[k]), cx = F.X(x), cy = F.Y(y);
    svg.append(el('circle', { cx, cy, r: 17, fill: 'none', stroke: free ? '#fff' : '#b58cff', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: .85 }));
    if (free) svg.append(el('circle', { class: 'handle', cx, cy, r: 30, fill: 'transparent' }));
  }
  const DIM = '#ffd166', LOCKC = '#b58cff', GREY = '#8b98a6', SCREEN_RED = '#fc0522', LOST_DARK = '#f7a414';      // vues de côté et de dessus : écran en rouge vif, projection hors écran en orange (dans le prolongement de la ligne de l'écran)
  const pcol = (k, c) => locks[k] ? LOCKC : c;                       // un paramètre verrouillé s'affiche en violet partout
  /* cote : trait + repères aux extrémités + valeur, décalés de `off` pixels ; lo = décalage du texte par rapport au milieu */
  function dim(svg, F, A, B, label, off, lo, anchor = 'middle', color = DIM) {
    const x1 = F.X(A[0]) + off[0], y1 = F.Y(A[1]) + off[1], x2 = F.X(B[0]) + off[0], y2 = F.Y(B[1]) + off[1];
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l * 7, ny = dx / l * 7;
    svg.append(el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 1.6 }));
    [[x1, y1], [x2, y2]].forEach(([x, y]) => svg.append(el('line', { x1: x - nx, y1: y - ny, x2: x + nx, y2: y + ny, stroke: color, 'stroke-width': 1.6 })));
    svg.append(el('text', {
      x: (x1 + x2) / 2 + lo[0], y: (y1 + y2) / 2 + lo[1], 'text-anchor': anchor, fill: color, 'font-size': 15, 'font-weight': 700,
      stroke: '#0f1216', 'stroke-width': 4, 'paint-order': 'stroke'
    }, label));
  }
  const isBig = svg => svg.closest('.card').classList.contains('full');
  const isThumb = svg => !isBig(svg) && $('viz').classList.contains('fs');
  /* valeur posée dans le graphique (sans trait de cote), avec un liseré sombre pour rester lisible sur la grille */
  function val(svg, x, y, text, anchor = 'middle', color = DIM, size = 13) {
    svg.append(el('text', { x, y, 'text-anchor': anchor, fill: color, 'font-size': size, 'font-weight': 700, stroke: '#0f1216', 'stroke-width': 3.5, 'paint-order': 'stroke' }, text));
  }
  /* carré du VP pivoté de l'angle donné (degrés) quand l'orientation est manuelle (B ou C) ; droit en visée automatique */
  const vpTilt = (cx, cy, deg) => S.rot ? { transform: `rotate(${deg} ${cx} ${cy})` } : {};
  function drawSide(r) {
    const svg = $('svgSide'); if (!r.valid) { svg.replaceChildren(); return; }
    const qz = r.B.quad.map(p => p[1]), zHi = Math.max(...qz), zLo = Math.min(...qz);        // étendue verticale réelle du faisceau = ses 4 coins A B C D (pas le milieu des bords : pan / roll / keystone le font déborder), comme la vue de face
    const maxz = Math.max(S.sh, S.z, zHi) + 0.2, minz = Math.min(0, zLo, S.z);          // le VP peut passer sous la ligne du sol (z < 0)
    const mBot = dispBot(svg), man = dispManual(svg), F = man ? viewFrame(svg, manualBounds(svg, dv.svgSide, 30, mBot || 30), 0, false, undefined, mBot) : viewFrame(svg, [-0.3, Math.max(S.y * 1.25, S.y + 2), minz - 0.2, maxz + Math.max(1, 0.2 * maxz)], 0.3, false, undefined, mBot);
    const [bx0, bx1] = F.b; gridLines(svg, F, ...(man ? visRange(F) : F.b));
    svg.append(el('line', { x1: F.X(bx0), x2: F.X(bx1), y1: F.Y(0), y2: F.Y(0), stroke: '#556', 'stroke-width': 2 }));
    svg.append(el('polygon', { points: `${F.X(S.y)},${F.Y(S.z)} ${F.X(0)},${F.Y(zHi)} ${F.X(0)},${F.Y(zLo)}`, fill: 'rgba(77,163,255,.16)', stroke: '#4da3ff', class: 'bglow' }));
    /* deux voies collées l'une à l'autre : l'écran en rouge à l'arrière, la projection (verte = utile, rouge = perdue) devant, côté VP */
    /* deux voies collées : à l'arrière la ligne de l'écran (rouge vif) ; devant, côté VP, la projection utile (verte). La projection hors écran (rouge sombre)
       prolonge la ligne de l'écran, sur la même voie, sans la remplacer ; elle n'est donc plus dans la continuité du vert. */
    const LANE = 4.2, SLANE = 2.7, OLANE = 4.5, x0s = F.X(0), lo = zLo, hi = zHi;
    const back = (a, b, c, w) => svg.append(el('line', { x1: x0s - w / 2, x2: x0s - w / 2, y1: F.Y(a), y2: F.Y(b), stroke: c, 'stroke-width': w }));      // bord côté projection commun : l'écran (fin) reste collé au vert, l'orange (plus épais) déborde vers l'arrière
    if (lo < 0) back(lo, Math.min(0, hi), LOST_DARK, OLANE);                                                              // projection sous l'écran
    if (hi > S.sh) back(Math.max(S.sh, lo), hi, LOST_DARK, OLANE);                                                        // projection au-dessus de l'écran
    back(0, S.sh, SCREEN_RED, SLANE);                                                                                     // écran
    if (Math.max(0, lo) < Math.min(S.sh, hi)) svg.append(el('line', { x1: x0s + LANE / 2, x2: x0s + LANE / 2, y1: F.Y(Math.max(0, lo)), y2: F.Y(Math.min(S.sh, hi)), stroke: USEFUL, 'stroke-width': LANE }));      // partie utile
    svg.append(el('line', { x1: F.X(S.y), y1: F.Y(S.z), x2: F.X(0), y2: F.Y(r.B.T[2]), stroke: '#fff', 'stroke-dasharray': '4 4', opacity: .5 }));
    svg.append(el('rect', { x: F.X(S.y) - 8, y: F.Y(S.z) - 6, width: 16, height: 12, rx: 2, fill: '#4da3ff', ...vpTilt(F.X(S.y), F.Y(S.z), Math.atan2(-r.B.w[2], r.B.w[1]) * 180 / Math.PI - 180) }));      // le VP suit son tilt
    if (isBig(svg)) {
      dim(svg, F, [0, 0], [S.y, 0], `y = ${fm(S.y)} m`, [0, 28], [0, 22], 'middle', pcol('y', DIM));
      dim(svg, F, [S.y, 0], [S.y, S.z], `z = ${fm(S.z)} m`, [34, 0], [10, 5], 'start', pcol('z', DIM));
    } else {                                           // hors grand écran : dimensions en gris discret
      val(svg, F.X(S.y / 2), F.Y(0) + 16, `y = ${fm(S.y)} m`, 'middle', pcol('y', GREY), 11);
      val(svg, F.X(S.y), F.Y(S.z) - 22, `z = ${fm(S.z)} m`, 'middle', pcol('z', GREY), 11);
      val(svg, 10, F.H - 10, `x = ${fm(S.x)} m`, 'start', pcol('x', GREY), 11);
    }
    handle(svg, F, S.y, S.z, ['y', 'z']);
  }
  function drawTop(r) {
    const svg = $('svgTop'); if (!r.valid) { svg.replaceChildren(); return; }
    const qx = r.B.quad.map(p => p[0]), xL = Math.min(...qx), xR = Math.max(...qx);          // étendue horizontale réelle du faisceau = ses 4 coins A B C D (pas le milieu des bords : pan / roll / keystone le font déborder), comme la vue de face
    const hx = Math.max(Math.abs(xL), Math.abs(xR), S.sw / 2, Math.abs(S.x)) * 1.15 + 0.5;
    const hud = isBig(svg) && svg.closest('.card').querySelector('.hud');                    // plein écran : l'écran est en haut, sous le bandeau d'état → on réserve sa hauteur
    const mTop = hud ? Math.max(30, hud.getBoundingClientRect().bottom - svg.getBoundingClientRect().top + 48) : undefined;
    const mBot = dispBot(svg), man = dispManual(svg), F = man ? viewFrame(svg, manualBounds(svg, dv.svgTop, mTop == null ? 30 : mTop, mBot || 30), 0, true, mTop, mBot) : viewFrame(svg, [-hx, hx, -0.2, Math.max(S.y * 1.25, S.y + 2)], 0.3, true, mTop, mBot);      // écran en haut, VP en bas ; x < 0 à gauche, x > 0 à droite (comme la vue de face)
    gridLines(svg, F, ...(man ? visRange(F) : F.b));
    svg.append(el('polygon', { points: `${F.X(S.x)},${F.Y(S.y)} ${F.X(xL)},${F.Y(0)} ${F.X(xR)},${F.Y(0)}`, fill: 'rgba(77,163,255,.16)', stroke: '#4da3ff', class: 'bglow' }));
    const LANE = 4.2, SLANE = 2.7, OLANE = 4.5, y0s = F.Y(0), lo = xL, hi = xR;       // voies collées : écran (rouge vif, à l'arrière) puis projection utile (verte, côté VP)
    const back = (a, b, c, w) => svg.append(el('line', { x1: F.X(a), x2: F.X(b), y1: y0s - w / 2, y2: y0s - w / 2, stroke: c, 'stroke-width': w }));      // bord côté projection commun (voir vue de côté)
    if (lo < -S.sw / 2) back(lo, Math.min(-S.sw / 2, hi), LOST_DARK, OLANE);                                              // projection à gauche de l'écran : prolonge sa ligne, en rouge sombre
    if (hi > S.sw / 2) back(Math.max(S.sw / 2, lo), hi, LOST_DARK, OLANE);                                                // projection à droite de l'écran
    back(-S.sw / 2, S.sw / 2, SCREEN_RED, SLANE);                                                                         // écran
    if (Math.max(lo, -S.sw / 2) < Math.min(hi, S.sw / 2)) svg.append(el('line', { x1: F.X(Math.max(lo, -S.sw / 2)), x2: F.X(Math.min(hi, S.sw / 2)), y1: y0s + LANE / 2, y2: y0s + LANE / 2, stroke: USEFUL, 'stroke-width': LANE }));      // partie utile
    svg.append(el('line', { x1: F.X(S.x), y1: F.Y(S.y), x2: F.X(r.B.T[0]), y2: F.Y(0), stroke: '#fff', 'stroke-dasharray': '4 4', opacity: .5 }));
    svg.append(el('rect', { x: F.X(S.x) - 8, y: F.Y(S.y) - 6, width: 16, height: 12, rx: 2, fill: '#4da3ff', ...vpTilt(F.X(S.x), F.Y(S.y), Math.atan2(r.B.w[1], r.B.w[0]) * 180 / Math.PI + 90) }));      // le VP suit son pan (y vers le bas de l'image : l'axe visé monte)
    if (isBig(svg)) {
      dim(svg, F, [S.x, 0], [S.x, S.y], `y = ${fm(S.y)} m`, [34, 0], [10, 5], 'start', pcol('y', DIM));
      dim(svg, F, [0, S.y], [S.x, S.y], `x = ${fm(S.x)} m`, [0, 30], [0, 22], 'middle', pcol('x', DIM));      // cote sous le VP : décalage du VP par rapport au milieu de l'écran
    } else {                                           // hors grand écran : dimensions en gris discret
      const xe = Math.max((S.x + xL) / 2, (S.x + xR) / 2);                 // bord du faisceau à mi-distance : le texte reste à côté, pas dessus
      val(svg, F.X(xe) + 10, F.Y(S.y / 2) + 4, `y = ${fm(S.y)} m`, 'start', pcol('y', GREY), 11);
      val(svg, F.X(S.x), F.Y(S.y) + 34, `x = ${fm(S.x)} m`, 'middle', pcol('x', GREY), 11);      // sous le VP
      val(svg, 10, F.H - 10, `z = ${fm(S.z)} m`, 'start', pcol('z', GREY), 11);
    }
    handle(svg, F, S.x, S.y, ['x', 'y']);
  }

  /* glisser le VP : horizontal / vertical de la vue -> paramètres (les axes verrouillés ne bougent pas) */
  let lastR = null, dragNow = null;      // dragNow : icône en cours de glisser (son nom s'affiche sous l'écran)
  function attachDrag(id, axes) {
    const svg = $(id); let off = null;
    const world = e => { const rc = svg.getBoundingClientRect(), F = frozen[id]; return [F.ix(e.clientX - rc.left), F.iy(e.clientY - rc.top)]; };
    svg.addEventListener('pointerdown', e => {
      if (!e.target.closest('.handle')) return;
      e.preventDefault(); try { svg.setPointerCapture(e.pointerId); } catch (_) { /* pointeur synthétique */ }
      frozen[id] = svg._F; const w = world(e); off = [S[axes[0]] - w[0], S[axes[1]] - w[1]];
    });
    svg.addEventListener('pointermove', e => {
      if (!off || !frozen[id]) return;
      const w = world(e), q = svg.closest('.card').classList.contains('full') ? 100 : 20;       // pas : 1 cm en plein écran, 5 cm sinon
      const lk = [];
      axes.forEach((k, i) => { if (!locks[k]) { const v = Math.round((w[i] + off[i]) * q) / q; S[k] = clampP(k, magnetKey(k, v, magnetPx(frozen[id].k))); } else if (Math.abs(w[i] + off[i] - S[k]) > 0.05) lk.push(k); });
      if (lk.length) lockMsg(...lk);
      reaim(); render();
    });
    const end = () => { if (!off) return; off = null; delete frozen[id]; render(); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  }
  /* plein écran des vues face / côté / dessus */
  let backToCompact = false;                                             // plein écran demandé depuis la vue compacte : en sortir ramène à la vue compacte
  function toggleFull(card, on) {
    const want = on ?? !card.classList.contains('full');
    document.querySelectorAll('.viz .card.full').forEach(c => { c.classList.remove('full'); c.querySelector('.expand').textContent = '⤢'; });
    const viz = $('viz'); viz.classList.remove('fs-side', 'fs-top', 'fs-face', 'fs');
    if (want) { viz.classList.add('fs'); card.classList.add('full'); card.querySelector('.expand').textContent = '✕'; viz.classList.add(card.classList.contains('side') ? 'fs-side' : card.classList.contains('face') ? 'fs-face' : 'fs-top'); }
    dockAuto();
    if (!want && backToCompact) { backToCompact = false; if (!$('p-calc').classList.contains('cfg')) $('cfgBtn').click(); }
    requestAnimationFrame(render);
  }
  /* le bouton Auto (avec son curseur, son message et sa note) passe dans la grande vue en bas à gauche quand une vue est agrandie, puisque la barre du haut est alors recouverte ; il retourne à sa place ensuite */
  const dockHome = { parent: $('autoDock').parentNode, next: $('autoDock').nextSibling };
  function dockAuto() {
    const dock = $('autoDock'), big = document.querySelector('.viz .card.full');
    if (big) { big.append(dock); dock.classList.add('inCard'); }
    else if (dock.parentNode !== dockHome.parent) { dockHome.parent.insertBefore(dock, dockHome.next); dock.classList.remove('inCard'); }
    hideAutoCount(); hideAutoMsg();
  }
  function drawHud() {
    document.querySelectorAll('.card.full .hud').forEach(h => {      // deux groupes : x, y, z · état (couverture, pixels perdus) ; en vue de face plein écran ils sont placés séparément
      h.innerHTML = `<div class="hg">${['y', 'x', 'z'].map(k => `<button class="chip ${locks[k] ? 'lockd' : ''}" data-k="${k}">${locks[k] ? ICON_L : ICON_U}${PARAMS[k].label} <b>${fm(S[k])} m</b></button>`).join('')}</div><div class="hg st">${lastR ? statusHtml(lastR) : ''}</div>`;
    });
  }


  /* ---------- Indicateurs ---------- */
  function drawKpis(r) {
    if (!r.valid) { $('kpis').innerHTML = ''; return; }
    const lostCol = pxColor(r.px.lostPct);
    const items = [
      ['Pixels utiles', fm(r.px.usefulPct, 1), '%', 'ok', `${fi(r.px.useful)} px`],
      ['Pixels perdus', fm(r.px.lostPct, 1), '%', '', `${fi(r.px.lost)} px`, lostCol],
      ['Écran couvert', fcPct(r), '%', r.covered ? 'ok' : 'bad', ''],
      ['Ratio utilisé', fm(r.ratio), ':1', '', ''],
      ['Éclairement', fi(r.lux), 'lx', '', ''],
      ['Forme', r.q.shape.split(' (')[0].replace('Quadrilatère quelconque', 'Quelconque'), '', 'shape', ''],
    ];
    $('kpis').innerHTML = items.map(i => `<div class="kpi ${i[3]}"><small>${i[0]}</small><div class="kv"><div class="main"><b${i[5] ? ` style="color:${i[5]}"` : ''}>${i[1]}</b><span>${i[2]}</span></div>${i[3] === 'shape' ? '' : `<em>${i[4]}</em>`}</div></div>`).join('');      // titre en haut, contenu centré dans la case
  }

  /* ---------- Rendu principal ---------- */
  /* MESURE DES TEMPS (temporaire) : chaque rendu écrit dans la console (F12) la durée de ses étapes en ms. À retirer après diagnostic (chercher « PERF »). */
  const PERF = { on: false, t: [], last: 0, m(l) { if (this.on) this.t.push([l, performance.now()]); }, end() {
    if (!this.on || !this.t.length) return; const t0 = this.t[0][1], tot = performance.now() - t0, gap = t0 - this.last; this.last = performance.now();
    const rows = this.t.slice(1).map((x, i) => `${x[0]} ${(x[1] - this.t[i][1]).toFixed(1)}`).join(' | ');
    if (tot > 8) console.log(`%cPERF render ${tot.toFixed(1)} ms (+${gap.toFixed(0)} ms depuis le précédent)  →  ${rows}`, tot > 40 ? 'color:#ff5d5d' : 'color:#e0b040'); this.t = [];
    const e = performance.now(); requestAnimationFrame(() => { const d = performance.now() - e; if (d > 25) console.log(`%cPERF image suivante affichée ${d.toFixed(0)} ms après la fin du rendu (mise en page + peinture + animations)`, 'color:#8ab4ff'); }); } };
  /* Valeurs vertes : buildDetails() reconstruit les 4 onglets de détails (surbrillances, aides, géométrie) : trop lourd pour tourner à chaque image pendant un glissement (c'est ce qui ralentissait quand le switch est ON).
     On le limite à une fois toutes les SIM_GAP ms (première mise à jour immédiate, puis la dernière valeur au plus tard SIM_GAP ms après) ; le dessin des vues, lui, reste à chaque image. */
  const SIM_GAP = 120; let simLastRun = 0, simTimer = 0, simR = null;
  function simRun() {
    simTimer = 0; simLastRun = performance.now(); const r = simR; simR = null;
    if (!r || !sim.checks.length || $('details').classList.contains('open')) return;
    const t0 = performance.now(); if (simCfg.on) renderSim(buildDetails(r)); else renderSimOff();
    if (PERF.on) console.log(`%cPERF valeurs vertes (buildDetails + renderSim) ${(performance.now() - t0).toFixed(1)} ms`, 'color:#8ae08a');
  }
  function simSchedule(r) {
    simR = r; const wait = SIM_GAP - (performance.now() - simLastRun);
    if (wait <= 0) { clearTimeout(simTimer); simRun(); } else if (!simTimer) simTimer = setTimeout(simRun, wait);
  }
  window.PERF = PERF;      // pour l'activer à la demande : taper  PERF.on = true  dans la console (et  PERF.on = false  pour l'arrêter)
  function render() {
    PERF.t = []; PERF.m('début');
    trackChanges(); syncAdv(); PERF.m('trackChanges+syncAdv');
    const r = G.compute(vpOf(), S), v = vpOf(); PERF.m('G.compute');
    if (S.rot && r.valid) S.aim = [r.B.T[0], r.B.T[2]];          // mémorise le point visé (référence pour les déplacements en vue de côté / dessus)
    warns = G.checkSetup(v, S, { lens: adv.lens, src: adv.src, rot: adv.rot, off: adv.off }, r); PERF.m('checkSetup');
    for (const k of Object.keys(PARAMS)) {
      const i = $(k); if (+i.value !== S[k]) i.value = S[k];
      const o = $('o_' + k); o.readOnly = locks[k];
      if (document.activeElement !== o) o.value = k === 'zoom' ? Math.round(S[k]) + ' %' : fm(S[k]) + ' m';
    }
    $('vpsel_s').value = S.vp;
    {
      const cur = (window.SCREEN_DATA || []).find(p => Math.abs(p.sw - S.sw) < 0.005 && Math.abs(p.sh - S.sh) < 0.005), o = $('scrsel_s');
      o.options[0].textContent = `Personnalisé · ${fm(S.sw)} × ${fm(S.sh)} m`; o.value = cur ? cur.id : '';
    }
    $('vpinfo').textContent = `Ratio ${fm(v.rmin)}${v.zoomable ? ' – ' + fm(v.rmax) : ' (fixe)'} · ${v.fw}:${v.fh} · ${v.res} ${v.resW}×${v.resH} · ${fi(v.lm)} lm`;
    $('vpinfo').classList.toggle('warn', !!(v.stdFields && v.stdFields.length));
    if (v.stdFields && v.stdFields.length) $('vpinfo').textContent += ` · ⚠ valeurs standard : ${v.stdFields.join(', ').toLowerCase()}`;
    $('o_ratio').textContent = fm(G.ratioOf(v, S.zoom)) + ':1';
    document.querySelector('.row[data-k=zoom]').style.display = v.zoomable ? '' : 'none';
    $('chain').classList.toggle('on', effChain());
    $('chain').style.opacity = locks.sw || locks.sh ? .4 : 1;
    PERF.m('champs'); syncLocks(); syncTouched(); drawAdv(); drawDragSel(r); drawDispSel(); drawDispViews(); syncAutoMsg(); PERF.m('réglages+icônes');
    drawStatus(r); PERF.m('drawStatus');
    lastR = r;
    drawHud(); PERF.m('drawHud'); drawFace(r); PERF.m('drawFace'); drawSide(r); PERF.m('drawSide'); drawTop(r); PERF.m('drawTop'); drawKpis(r); PERF.m('drawKpis');
    if ($('details').classList.contains('open')) { renderDetails(r); PERF.m('renderDetails'); } else if (sim.checks.length) { simSchedule(r); PERF.m('valeurs vertes (planifiées / exécutées)'); }      // valeurs désactivées (bouton vert) et panneau fermé : aucun calcul de détail, l'application ne fait que le dessin
    PERF.m('fin'); PERF.end();
  }

  /* ---------- Auto : propositions ----------
     Auto ne déplace que le VP (recul, centrage, hauteur — ceux qui sont libres), vise le centre de l'écran et ne touche ni à l'écran,
     ni au projecteur, ni au zoom, ni à l'optique avancée. Il propose toujours des positions où l'écran est couvert, avec le moins
     possible de pixels perdus ; sinon il dit quels verrous empêchent de couvrir l'écran. */
  const AUTO_COUNTS = [1, 3, 5, 8, Infinity];                      // niveaux 1 à 5 du curseur (appui maintenu 1 s sur le bouton)
  let autoLvl = 2;                                                // niveau 2 (3 propositions) par défaut
  let props = [], propIdx = -1, appliedSig = '', recent = [];
  /* rotation de l'octogone = cadran des propositions : la proposition 1 est toujours point noir en haut, puis chaque appui avance d'un cran
     (1 proposition : un tour complet par appui ; 3 : un tiers de tour ; 5 : un cinquième ; 8 : un huitième), et le retour à la proposition 1
     ramène le point en haut. Sans fin : un dixième de tour par appui, sans jamais s'arrêter. Après un changement de configuration (nouveau cycle),
     la proposition 1 ramène le point en haut en continuant dans le même sens. */
  let rot = 0, rotBase = 0, rotK = 0;                                // angle cumulé (°) · angle de la proposition 1 du cycle · crans depuis la proposition 1
  const rotEl = $('autoRot');
  function turnAuto(to) {                                          // toujours dans le même sens ; un grand angle prend un peu plus de temps
    rotEl.style.transition = `transform ${(0.35 + 0.45 * Math.min(1, (to - rot) / 360)).toFixed(2)}s cubic-bezier(.3,1.35,.5,1)`;
    rot = to; rotEl.style.transform = `rotate(${rot}deg)`;
  }
  const nextTop = () => Math.ceil(rot / 360 - 1e-9) * 360;         // prochain « point noir en haut » dans le sens de rotation (l'angle actuel s'il y est déjà)
  const autoRanges = () => ({ y: [PARAMS.y.min, PARAMS.y.max], x: [PARAMS.x.min, PARAMS.x.max], z: [PARAMS.z.min, PARAMS.z.max] });
  const sig = () => JSON.stringify([S, locks, autoLvl]);
  let toastT;
  function toast(msg) { hideAutoMsg(); const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
  const setAutoBar = () => $('autoFill').setAttribute('width', 38 * (autoLvl - 1) / 4);      // 38 = largeur de la barre : niveau 1 vide, niveau 5 pleine
  setAutoBar();

  /* message « L'écran ne peut pas être couvert » : paramètres verrouillés en cause, cliquables (violet = verrouillé, blanc = libéré) */
  function showCantCover(plan) {
    const m = $('autoMsg'); clearTimeout(toastT); $('toast').classList.remove('show');
    m.innerHTML = `<b>L'écran ne peut pas être couvert</b><div class="sub">` + (plan.blockers.length
      ? 'Verrouillé : ' + plan.blockers.map(k => `<button class="amChip" data-k="${k}"></button>`).join('')
      : 'Même avec toute la position libre : changer le zoom, le projecteur ou l\'écran') + '</div>';
    m.hidden = false; syncAutoMsg();
    m.style.maxWidth = ''; const r = m.getBoundingClientRect(), room = innerWidth - 8 - r.left;      // trop près du bord droit : le texte passe à la ligne
    if (r.width > room) m.style.maxWidth = Math.max(180, room) + 'px';
  }
  const hideAutoMsg = () => { $('autoMsg').hidden = true; };
  function syncAutoMsg() {
    $('autoMsg').querySelectorAll('.amChip').forEach(b => {
      const k = b.dataset.k; b.classList.toggle('free', !locks[k]);
      b.innerHTML = `${locks[k] ? ICON_L : ICON_U}${PARAMS[k].label}`;
    });
  }
  $('autoMsg').onclick = e => { const b = e.target.closest('.amChip'); if (b) { locks[b.dataset.k] = !locks[b.dataset.k]; render(); } };

  function autoRun() {
    hideAutoCount(); hideAutoMsg();
    const N = AUTO_COUNTS[autoLvl - 1], endless = N === Infinity;
    const unchanged = propIdx >= 0 && props.length > 0 && sig() === appliedSig;       // rien n'a changé depuis la dernière proposition
    const fresh = !unchanged;                                         // sinon : nouveau cycle, on repart de la proposition 1
    if (!endless && unchanged) propIdx = (propIdx + 1) % props.length;                // proposition suivante
    else {
      const plan = G.autoPlan(VPS, S, locks, { count: endless ? 4 : N, avoid: endless ? [{ x: S.x, y: S.y, z: S.z }, ...recent] : [], ranges: autoRanges() });
      props = []; propIdx = -1;
      if (!plan.ok) { showCantCover(plan); return; }
      if (!plan.free.length) { toast('Recul, centrage et hauteur sont verrouillés : rien à déplacer'); return; }
      props = endless ? [plan.proposals[Math.floor(Math.random() * plan.proposals.length)]] : plan.proposals; propIdx = 0;
    }
    const p = props[propIdx];
    Object.assign(S, p.pos); S.aim = null; reaim();                 // visée : toujours le centre de l'écran
    if (fresh) { rotBase = nextTop(); rotK = 0; } else rotK++;
    if (endless) turnAuto(fresh ? rotBase : rot + 36);
    else if (props.length === 1) turnAuto((Math.floor(rot / 360 + 1e-9) + 1) * 360);                  // une seule proposition : un tour complet par appui
    else turnAuto(rotBase + 360 * rotK / props.length);
    render(); appliedSig = sig();
    if (endless) recent = [p.pos, ...recent].slice(0, 6);
    toast(`${endless ? 'Nouvelle proposition' : `Proposition ${propIdx + 1}/${props.length}`} · pixels perdus ${fm(p.lost, 1)} %`);
  }

  /* appui maintenu 1 s : curseur du nombre de propositions à droite du bouton (1 · 3 · 5 · 8 · sans fin) ; il disparaît une fois le choix fait,
     ou à un nouvel appui sur Auto */
  let lpTimer = 0, lpDone = false, countT = 0;
  const autoN = $('autoN');
  function showAutoCount() { hideAutoMsg(); autoN.value = autoLvl; $('autoCount').hidden = false; }
  function hideAutoCount() { clearTimeout(countT); $('autoCount').hidden = true; }
  $('auto').addEventListener('pointerdown', () => { lpDone = false; clearTimeout(lpTimer); lpTimer = setTimeout(() => { lpDone = true; showAutoCount(); }, 1000); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => $('auto').addEventListener(t, () => clearTimeout(lpTimer)));
  $('auto').addEventListener('contextmenu', e => e.preventDefault());
  $('auto').onclick = () => { if (lpDone) { lpDone = false; return; } autoRun(); };           // le relâchement qui suit l'appui long n'est pas un clic
  autoN.oninput = () => { autoLvl = +autoN.value; setAutoBar(); };
  autoN.onchange = () => { clearTimeout(countT); countT = setTimeout(hideAutoCount, 350); };
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#autoCount, #auto')) hideAutoCount();
    if (!e.target.closest('#autoMsg, #auto')) hideAutoMsg();
  });

  /* ---------- Fenêtre annexe : calculs détaillés ---------- */
  let tab = 'quad', selRow = 0;
  const pxFull = new Set();      // Pixels : lignes dont on affiche la valeur pleine (appui sur la valeur) ; par défaut les valeurs sont abrégées (3 M, 743 k…)
  const pxShort = n => {                                         // 2 073 600 → « 2,07 M » · 743 022 → « 743 k » · 3 000 → « 3 k » · 950 → « 950 » (3 chiffres significatifs)
    const a = Math.abs(n), u = a >= 1e6 ? [1e6, ' M'] : a >= 1e3 ? [1e3, ' k'] : null; if (!u) return fi(n);
    const v = n / u[0], d = Math.abs(v) >= 99.5 ? 0 : Math.abs(v) >= 9.95 ? 1 : 2;
    return fm(v, d).replace(/,(\d*?)0+$/, ',$1').replace(/,$/, '') + u[1];
  };
  /* ---------- Valeurs cochées dans les lignes de calcul : affichées dans les simulations ----------
     Le mode se règle en haut de ∑ Calculs (bouton rond vert). Cases à cocher sans limite ; les 3 premières (par ordre de cochage) en vert #07a61c, les suivantes en #93b509.
     Chaque valeur cochée peut recevoir un nom (affiché à la place du texte bleu). Des configurations (A, B, C…) mémorisent une sélection + ses noms. */
  const sim = { checks: [], names: {}, snap: {}, editing: null, draft: '', focusNm: false, FIRST: 3 };
  const simCfg = { on: false, current: '', cfgs: [{ id: 'A', name: 'Config A', items: [] }, { id: 'B', name: 'Config B', items: [] }, { id: 'C', name: 'Config C', items: [] }] };
  const simColor = ['#07a61c', '#93b509'];
  const SIM_KEY = 'vp.sim.v1';
  /* RÉGLAGE PAR DÉFAUT de la Config A : celle de tout nouvel utilisateur (premier lancement, rien en mémoire) ; Réglages > « Rétablir la Config A par défaut » y revient.
     Pour changer ce défaut : régler la Config A voulue, puis copier ses lignes (clé, nom, copie) ici. */
  const DEFAULT_CFG_A = [
    {"sk": "px|Pixel", "label": "Pixel", "name": "Taille pixels", "snap": {"name": "Pixel", "val": "1,96 mm"}},
    {"sk": "vpe|Longueurs|A–B|base,vp", "label": "A–B", "name": "ligne VP à centre base", "snap": {"val": "9,12 m", "x": false, "pts": ["base", "vp"], "cust": [], "name": "A–B", "f": "√(Δx² + Δy² + Δz²)", "cat": "Longueurs"}},
    {"sk": "vpe|Longueurs|A–B|fD,fC", "label": "A–B", "name": "base faisceau (D-C)", "snap": {"val": "3,77 m", "x": false, "pts": ["fD", "fC"], "cust": [], "name": "A–B", "f": "√(Δx² + Δy² + Δz²)", "cat": "Longueurs"}}
  ];
  const defaultCfgA = () => JSON.parse(JSON.stringify(DEFAULT_CFG_A));
  let simIdx = new Map();                                                // dernières lignes connues : clé → { name (texte bleu), val }
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  let simFirstRun = true;
  try { const j = JSON.parse(localStorage.getItem(SIM_KEY) || 'null'); if (j) { simFirstRun = false; simCfg.on = !!j.on; simCfg.current = j.current || ''; if (Array.isArray(j.cfgs) && j.cfgs.length) simCfg.cfgs = j.cfgs; sim.checks = j.checks || []; sim.names = j.names || {}; sim.snap = j.snap || {}; } } catch (_) { /* pas de mémoire */ }
  ['A', 'B', 'C'].forEach((id, i) => { if (!simCfg.cfgs.some(c => c.id === id)) simCfg.cfgs.splice(i, 0, { id, name: 'Config ' + id, items: [] }); });
  if (simFirstRun) {      // premier lancement : la Config A par défaut est chargée (les valeurs s'affichent dès que le bouton vert est activé)
    const a = simCfg.cfgs.find(c => c.id === 'A'); a.items = defaultCfgA(); simCfg.current = 'A';
    a.items.forEach(i => { sim.checks.push(i.sk); if (i.name) sim.names[i.sk] = i.name; if (i.snap) sim.snap[i.sk] = { ...i.snap }; });
  }      // Config A, B, C existent toujours : une mémoire où l'une manque (supprimée avant) la retrouve, vide
  const simSave = () => { try { localStorage.setItem(SIM_KEY, JSON.stringify({ on: simCfg.on, current: simCfg.current, cfgs: simCfg.cfgs, checks: sim.checks, names: sim.names, snap: sim.snap })); } catch (_) { /* stockage indisponible */ } };
  const IC = { ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', del: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/>', edit: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 7l3 3"/>', add: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', sync: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/>' };
  const ic = n => `<svg viewBox="0 0 24 24">${IC[n]}</svg>`;
  const simLabel = k => (simIdx.get(k) || {}).name || String(k).split('|')[1] || k;
  const simItem = (k, i) => { const o = simIdx.get(k); return `<span class="simItem" style="color:${simColor[i < sim.FIRST ? 0 : 1]}"><em>${esc(sim.names[k] || o.name)}</em> : <b>${o.val}</b></span>`; };
  function renderSim(tabs) {
    simIdx = new Map(); Object.values(tabs).forEach(T => (T.all || []).forEach(o => simIdx.set(o.sk, o)));
    /* Règle : une ligne cochée est conservée. Sa dernière valeur est mémorisée (sim.snap) ; si la ligne n'existe plus (points de VP à écran réinitialisés ou changés…), elle reste cochée et garde sa dernière valeur. Seul un décochage volontaire l'enlève. */
    sim.checks.forEach(k => { const o = simIdx.get(k); if (o) sim.snap[k] = { ...sim.snap[k], name: o.name, val: o.val, f: o.f, cat: o.cat }; else if (sim.snap[k]) simIdx.set(k, { sk: k, ...sim.snap[k], kept: true }); });
    sim.checks = sim.checks.filter(k => simIdx.has(k));                  // sans copie connue (ancienne mémoire), une ligne disparue ne peut être gardée
    Object.keys(sim.snap).forEach(k => { if (!sim.checks.includes(k)) delete sim.snap[k]; });
    cfgFollow();
    simSave();
    const sig = sim.checks.map(k => (simIdx.get(k) || {}).val).join('|'); if (simSig !== null && sig !== simSig && simCfg.on) simPulse(); simSig = sig;      // valeurs qui bougent → le switch s'anime
    const tog = simTogHtml();      // bouton vert à gauche des valeurs : active / désactive la fonction (comme le bouton rond du haut de ∑ Calculs)
    paintSim(tog, simCfg.on ? sim.checks.slice(0, sim.FIRST).map(simItem).join('') : '', (simCfg.on ? `<div class="simRow">${sim.checks.map(simItem).join('')}</div>` : ''));
  }
  /* Tous les switchs verts : rond de 36 px. Dedans : 5 × 5 petits carrés en dégradé vert, rognés par le rond. Celui du haut est collé à gauche de ∑ Calculs (les deux contours forment un huit horizontal, orbite dans simOrbit) ;
     les autres (vues agrandies, plein écran, Calculs détaillés) portent leur propre orbite : un point brillant + traîne qui tourne autour du rond (rotation CSS d'un conteneur, exécutée par le GPU).
     OFF (CSS) : plus sombre, et les carrés se réduisent à un cercle intérieur (nets jusqu'à 1/2 du diamètre, estompés jusqu'à 7/10). */
  function simRound(orb = true, nm = false) {      // carrés en HTML (pas en SVG) : clignotement et glissement ne sont que des opacity / transform, exécutés par le GPU même quand le fil principal est occupé
    const N = 5, S = 5, G = 1.25, P = S + G, rnd = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
    const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    let g = '';
    for (let i = 0; i < N; i++) {
      g += `<span class="r" style="top:${(i * P).toFixed(2)}px;--d:${rnd(-2, 0)}s;--t:${rnd(.9, 1.5)}s">`;
      for (let k = 0; k < N; k++) g += `<i${Math.random() < .45 ? ' class="b"' : ''} style="left:${(k * P).toFixed(2)}px;background:rgb(${lerp([200, 242, 60], [7, 140, 28], (k + .5) / N)});--d:${rnd(-1.5, 0)}s;--t:${rnd(.35, .9)}s"></i>`;
      g += '</span>';
    }
    let o = '';
    if (orb) {      // orbite autour du rond : tête + traîne (conteneur qui tourne d'un tour par seconde quand .live)
      for (let i = 0; i <= 6; i++) { const z = i ? 5 - i * .5 : 5.5; o += `<i style="width:${z}px;height:${z}px;margin:${-z / 2}px 0 0 ${-z / 2}px;opacity:${(1 - i * .15).toFixed(2)};transform:rotate(${-i * 13}deg) translateY(-17px)${i ? '' : ';box-shadow:0 0 4px 1px #b8ff6a'}"></i>`; }
      o = `<span class="orb" aria-hidden="true">${o}</span>`;
    }
    return `<span class="g" aria-hidden="true">${g}</span>${o}${nm ? '<span class="cfgNm" aria-hidden="true"></span>' : ''}`;      // nm : nom de la config active, sous le rond
  }
  /* Circulation lumineuse sur le contour du huit (rond + bouton Calculs) : un seul tracé fermé (rond dans un sens, bouton dans l'autre, croisement au point de contact), 1 s par tour.
     Petits points HTML déplacés par des animations de transform (Web Animations) : exécutées par le GPU, elles ne sont pas freinées par les recalculs de l'application.
     Un point brillant + sa traîne + des points ambiants répartis sur tout le contour. Animées seulement quand le switch est ON et que les valeurs bougent (.live). */
  let simOrbitAnims = [];
  function simOrbitPlay(on) { simOrbitAnims.forEach(an => on ? an.play() : an.pause()); }
  function simOrbit() {
    const cw = $('calcWrap'), btn = $('detBtn'); if (!cw || !btn || !cw.animate) return;
    const Bw = btn.offsetWidth || 100; let o = cw.querySelector('.simOrbit'); if (o && o.dataset.w === String(Bw)) return;
    simOrbitAnims.forEach(an => an.cancel()); simOrbitAnims = []; if (o) o.remove();
    const W = 34 + Bw, c = W - 18;      // rond 36 px + bouton Bw − 2 px de contours superposés ; tracé au milieu des contours de 2 px (rayon 17)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M35 18A17 17 0 0 0 1 18A17 17 0 0 0 35 18A17 17 0 0 1 52 1H${c}A17 17 0 0 1 ${c} 35H52A17 17 0 0 1 35 18Z`);
    const L = path.getTotalLength(), M = 90, pts = [];
    for (let i = 0; i <= M; i++) pts.push(path.getPointAtLength(L * i / M));
    const dots = [];      // [taille px, opacité, retard (ms derrière la tête), couleur, ombre]
    dots.push([6, 1, 0, '#fff', '0 0 5px 1px #b8ff6a']);
    for (let i = 1; i <= 7; i++) dots.push([6 - i * .55, 1 - i * .12, i * 22, '#d8ffa0', 'none']);
    for (let j = 0; j < 12; j++) dots.push([2, .5, 1000 * j / 12 + 40, '#c9f58a', 'none']);
    let html = ''; dots.forEach(d => { html += `<i style="width:${d[0]}px;height:${d[0]}px;margin:${-d[0] / 2}px 0 0 ${-d[0] / 2}px;opacity:${d[1]};background:${d[3]};box-shadow:${d[4]}"></i>`; });
    cw.insertAdjacentHTML('beforeend', `<span class="simOrbit" data-w="${Bw}" style="width:${W}px" aria-hidden="true">${html}</span>`);
    o = cw.querySelector('.simOrbit');
    [...o.children].forEach((el, i) => {
      const an = el.animate(pts.map(q => ({ transform: `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px)` })), { duration: 1000, iterations: Infinity, easing: 'linear', delay: -(1000 - dots[i][2] % 1000) % 1000 });
      an.pause(); simOrbitAnims.push(an);
    });
    simOrbitPlay(!!$('simTopTog') && $('simTopTog').classList.contains('live') && $('simTopTog').classList.contains('on'));
  }
  window.addEventListener('resize', simOrbit); if (document.fonts && document.fonts.ready) document.fonts.ready.then(simOrbit);
  let simSig = null, simLiveT = 0;
  const simLive = on => { document.querySelectorAll('.simTog').forEach(b => b.classList.toggle('live', on)); simOrbitPlay(on); };
  let simRel = 0;      // instant du dernier relâchement : la mise à jour différée des valeurs ne doit pas relancer l'animation juste après
  function simPulse() {
    if (performance.now() - simRel < 400) return;      // valeurs vertes qui changent : le switch s'anime ; il s'arrête dès le relâchement du doigt / de la souris / de la touche (pas d'attente), avec un filet de 400 ms si l'on reste appuyé sans rien changer (plus court, il coupait l'animation entre deux rendus lents)
    simLive(true); clearTimeout(simLiveT); simLiveT = setTimeout(() => simLive(false), 400);
  }
  ['pointerup', 'pointercancel', 'touchend', 'mouseup', 'keyup'].forEach(ev => document.addEventListener(ev, () => { simRel = performance.now(); clearTimeout(simLiveT); simLive(false); }, true));
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { simRel = 0; }, true));
  const simTogHtml = () => sim.checks.length ? `<button type="button" class="simTog${simCfg.on ? ' on' : ''}" aria-pressed="${simCfg.on}" aria-label="Valeurs dans les simulations" title="${simCfg.on ? 'Masquer les valeurs dans les simulations' : 'Afficher les valeurs dans les simulations'}">${simRound()}</button>` : '';
  const renderSimOff = () => { const t = simTogHtml(); paintSim(t, '', ''); };      // valeurs désactivées : seul le bouton vert reste, sans aucun calcul
  function paintSim(tog, first, all) {      // tog : bouton vert (dans la bande du haut ; repris dans les vues agrandies) ; first : valeurs de la vue principale ; all : valeurs de la vue compacte
    { const nm = (cfgOf(simCfg.current) || {}).name || ''; document.querySelectorAll('.cfgNm').forEach(e => { if (e.textContent !== nm) e.textContent = nm; }); }      // nom de la config active sous les switchs (hors Calculs détaillés)
    const top = $('simTopTog'); if (top) { top.hidden = !tog; if (tog && !top.firstChild) top.innerHTML = simRound(false, true); if (tog) simOrbit(); top.classList.toggle('on', simCfg.on); top.setAttribute('aria-pressed', String(simCfg.on)); top.title = simCfg.on ? 'Masquer les valeurs dans les simulations' : 'Afficher les valeurs dans les simulations'; }
    document.querySelectorAll('.viz .card').forEach(c => { if (!c.querySelector('.simFull')) { const d = document.createElement('div'); d.className = 'simFull'; c.append(d); } });
    document.querySelectorAll('.viz .card').forEach(c => {                                                   // vue agrandie : bouton vert placé au-dessus du bouton Auto (bas gauche) ; il n'est montré que dans la vue agrandie (CSS)
      let b = c.querySelector('.simFullTog'); if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'simTog simFullTog'; b.setAttribute('aria-label', 'Valeurs dans les simulations'); b.innerHTML = simRound(true, true); c.append(b); }
      b.hidden = !tog; b.classList.toggle('on', simCfg.on); b.setAttribute('aria-pressed', String(simCfg.on)); b.title = simCfg.on ? 'Masquer les valeurs dans les simulations' : 'Afficher les valeurs dans les simulations';
    });
    document.querySelectorAll('.simFull').forEach(el => { el.innerHTML = first; });                           // vue agrandie : les 3 premières, en bas du grand graphique
    [['simVals', first], ['simVals2', all]].forEach(([id, html]) => { const el = $(id); if (el) { el.innerHTML = html; el.hidden = !html; } });      // vue principale : les 3 premières ; vue compacte : toutes, 3 par ligne
  }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.simTog, .simVals .simItem, .simFull .simItem')) {      // un appui sur le texte vert agit comme l'interrupteur (il passe sur OFF)
       simCfg.on = !simCfg.on; simChanged(); } });
  /* ---- configurations ---- */
  const cfgOf = id => simCfg.cfgs.find(c => c.id === id);
  const FIXED = ['A', 'B', 'C'];                                         // Config A, B, C : modifiables, jamais supprimables
  const fromCurrent = () => sim.checks.map(sk => ({ sk, label: simLabel(sk), name: sim.names[sk] || '', snap: sim.snap[sk] }));
  /* Chaque ligne d'une config garde une copie (valeur, dessin, points créés) pour être recalculée quand elle n'est plus sélectionnée. Celle de la config ACTIVE suit la ligne en direct : sans cela, une valeur modifiée revenait
     à l'ancienne en validant la fenêtre de modification, en changeant de config ou en rouvrant la config. Elle ne suit que si les points de la ligne sont les mêmes (valeur et dessin recalculés, ex. VP déplacé) : les points créés
     par leurs coordonnées ont des numéros (#1, #2…) qui repartent de zéro à chaque ouverture, une ligne de même clé mais d'autres coordonnées ne doit pas écraser la config (une modification voulue passe par cfgAdopt). */
  const snapDef = s => JSON.stringify([s.pts || null, s.cust || null]);
  function cfgFollow() {
    const cc = cfgOf(simCfg.current); if (!cc) return;
    cc.items.forEach(i => { const s = sim.snap[i.sk]; if (s && sim.checks.includes(i.sk) && (!i.snap || snapDef(i.snap) === snapDef(s))) i.snap = { ...s }; });
  }
  function cfgAdopt(id) {      // les coordonnées du point créé `id` viennent d'être modifiées par l'utilisateur : les lignes de la config active qui l'utilisent adoptent ces coordonnées
    const cc = cfgOf(simCfg.current); if (!cc) return;
    cc.items.forEach(i => { const s = sim.snap[i.sk]; if (s && sim.checks.includes(i.sk) && (s.cust || []).some(c => c.id === id)) i.snap = { ...s }; });
    simSave();
  }
  function simChanged() { simSave(); renderSimHead(); renderSimSettings(); render(); }
  function applyCfg(id) {
    const c = cfgOf(id); simCfg.current = id; sim.checks = []; sim.names = {}; sim.editing = null; simNav = -1;
    if (c) c.items.forEach(i => { sim.checks.push(i.sk); if (i.name) sim.names[i.sk] = i.name; if (i.snap) sim.snap[i.sk] = i.snap; });
    simChanged();
  }
  /* Flèches haut / bas à droite du menu des configurations : affichent une à une les lignes de la configuration en cours (onglet de la ligne ouvert, ligne sélectionnée, dessinée dans les vues) */
  let simNav = -1;
  function simStep(dir) {
    const ks = sim.checks, n = ks.length; if (!n) return;
    if (simNav < 0 || simNav >= n) simNav = dir > 0 ? -1 : 0;
    simNav = ((simNav + dir) % n + n) % n;
    const k = ks[simNav], t = k.split('|')[0], r = G.compute(vpOf(), S); if (!r || !r.valid) return;
    let T = buildDetails(r)[t]; if (!T) return;
    let i = T.rows.findIndex(x => x.sk === k);
    if (i < 0 && t === 'vpe') { vpe.flt = ['', '']; T = buildDetails(r)[t]; i = T.rows.findIndex(x => x.sk === k); }      // ligne cachée par un filtre : on le lève
    tab = t; selRow = i >= 0 ? i : 1; renderDetails(r); scrollToRow(selRow); renderSimHead();
  }
  /* Barre du haut de Calculs détaillés : [flèches haut/bas + « n valeurs »] [switch] [menu des configs existantes] [icônes : ajouter · supprimer · modifier · valider (actif seulement si la sélection a changé)] */
  let simBackState = null;      // fenêtre de modification laissée en plein travail (bouton « Revenir aux modifications »)
  let hdrArm = '', hdrArmT = 0;      // icône en cours de confirmation ('del')
  const cfgDirty = c => { if (!c) return false; const A = c.items.map(i => i.sk + '\u0001' + (i.name || '')).join('\u0002'), B = sim.checks.map(k => k + '\u0001' + (sim.names[k] || '')).join('\u0002'); return A !== B; };      // la sélection actuelle (lignes cochées + noms) diffère de la config enregistrée
  const hdrFlash = (what, ms) => { hdrArm = what; clearTimeout(hdrArmT); hdrArmT = setTimeout(() => { hdrArm = ''; renderSimHead(); }, ms); renderSimHead(); };
  function renderSimHead() {
    $('detBtn').classList.toggle('simOff', !simCfg.on);      // contour du bouton ∑ Calculs assombri quand l'interrupteur est sur OFF
    const el = $('simHead'); if (!el) return;
    const cur = cfgOf(simCfg.current), n = sim.checks.length, dis = simCfg.on ? '' : ' disabled';
    const opts = (cur ? '' : '<option value="" disabled hidden selected>Choisir une configuration</option>') + simCfg.cfgs.map(c => `<option value="${esc(c.id)}"${c.id === simCfg.current ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    const act = (a, ico, title, off, cls = '', tip = true) => `<button type="button" class="${cls}" data-act="${a}"${tip ? ` title="${title}"` : ''} aria-label="${title}"${off ? ' disabled' : ''}>${ic(ico)}</button>`;
    const canDel = cur && !FIXED.includes(cur.id), dirty = cfgDirty(cur), pos = simNav >= 0 && simNav < n ? `${simNav + 1}/${n}` : String(n);      // « 3/5 » : ligne active / total ; « 5 » : aucune ligne active
    el.innerHTML = `<span class="simNavBox"><span class="simCnt"${simCfg.on ? '' : ' style="visibility:hidden"'}>valeurs</span><span class="simNav"><button type="button" data-n="-1" aria-label="Ligne précédente de la configuration" title="Ligne précédente de la configuration"${dis}><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button><span class="simPos"${simCfg.on ? '' : ' style="visibility:hidden"'}>${pos}</span><button type="button" data-n="1" aria-label="Ligne suivante de la configuration" title="Ligne suivante de la configuration"${dis}><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></span></span>`
      + `<button class="simSw${simCfg.on ? ' on' : ''}" id="simSw" aria-pressed="${simCfg.on}" aria-label="Valeurs dans les simulations" title="${simCfg.on ? 'Désactiver les valeurs dans les simulations' : 'Activer les valeurs dans les simulations'}">${simRound(false)}</button>`
      + `<select id="simSel" aria-label="Configuration"${dis}>${opts}</select>`
      + `<span class="simAct">${act('add', 'add', 'Ajouter une configuration', false)}${act('del', hdrArm === 'del' ? 'ok' : 'del', hdrArm === 'del' ? 'Confirmer la suppression (cliquer de nouveau)' : canDel ? 'Supprimer la configuration' : 'Supprimer la configuration (impossible pour A, B et C)', !canDel, hdrArm === 'del' ? 'danger' : '')}${simBackState ? `<button type="button" class="simBackBtn" title="Revenir aux modifications" aria-label="Revenir aux modifications"><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button>` : act('edit', 'eye', 'aperçu', !simCfg.cfgs.length)}${act('sync', 'ok', 'Appliquer les modifications à la config', !dirty, dirty ? 'dirty' : '', false)}</span>${dirty ? '<span class="simSaveLbl" role="button" tabindex="0">appliquer modifications</span>' : ''}`;
    el.querySelectorAll('.simNav button').forEach(b => { b.onclick = () => simStep(+b.dataset.n); });
    const bk = el.querySelector('.simBackBtn'); if (bk) bk.onclick = simBackRestore;
    const sl = el.querySelector('.simSaveLbl'); if (sl) sl.onclick = () => el.querySelector('.simAct [data-act=sync]').click();
    $('simSw').onclick = () => { simCfg.on = !simCfg.on; simChanged(); };
    el.querySelectorAll('.simAct button[data-act]').forEach(b => {
      b.onclick = () => {
        const a = b.dataset.act, c = cfgOf(simCfg.current);
        if (a === 'add') openSimModal('edit', null);
        else if (a === 'edit') openSimModal('edit', (c || simCfg.cfgs[0]).id);      // panneau des configurations : par défaut la config active
        else if (a === 'sync' && c && cfgDirty(c)) { c.items = fromCurrent(); simSave(); renderSimHead(); }
        else if (a === 'del' && c && !FIXED.includes(c.id)) {
          if (hdrArm === 'del') { clearTimeout(hdrArmT); hdrArm = ''; simCfg.cfgs = simCfg.cfgs.filter(x => x.id !== c.id); simCfg.current = ''; simChanged(); } else hdrFlash('del', 3000);
        }
      };
    });
    const sel = $('simSel'); if (sel) sel.onchange = () => { if (sel.value) applyCfg(sel.value); };
  }
  /* ---- petite fenêtre (avant-plan, fond flouté) ---- */
  let modal = null, delConfirm = null;
  function closeSimModal() { const m = $('simModal'); if (m) m.remove(); modal = null; delConfirm = null; }
  function openSimModal(view, id, restore) {
    closeSimModal(); simBackHide();
    const ov = document.createElement('div'); ov.id = 'simModal'; ov.innerHTML = '<div class="smWin"></div>'; document.body.append(ov);
    ov.addEventListener('pointerdown', e => { if (e.target === ov) closeSimModal(); });
    ov.addEventListener('click', simModalClick); ov.addEventListener('input', simModalInput);
    ov.addEventListener('focusin', e => {      // un appui dans la case « nom » d'une ligne la sélectionne aussi : le visuel apparaît sur le côté (sans redessiner la liste, pour ne pas perdre le curseur)
      const t = e.target; if (!modal || modal.view !== 'edit' || !t.dataset || t.dataset.f !== 'item') return;
      const i = +t.dataset.i; if (modal.sel === i) return;
      modal.sel = i; ov.querySelectorAll('.smList .smRow').forEach((r, k) => r.classList.toggle('sel', k === i));
      smSyncView(); smKeepHalf();
    });
    ov.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('smCfgIn')) cfgRenameEnd(); });
    ov.addEventListener('keydown', e => { if (e.target.classList && e.target.classList.contains('smCfgIn')) { if (e.key === 'Enter') { e.preventDefault(); cfgRenameEnd(); } else if (e.key === 'Escape') { e.stopPropagation(); cfgRenameEnd(true); } return; }
      if (e.key === 'Escape') closeSimModal(); else if (e.key === 'Enter' && e.target.closest('.smWin input') && modal && modal.view === 'edit') simModalClick({ target: ov.querySelector('button[data-a=save]') }); });
    if (restore) modal = restore; else modal = { view, id: id || null };
    modal.hist = modal.hist || []; modal.fut = modal.fut || [];
    if (!restore && view === 'edit') {
      const c = id ? cfgOf(id) : null; modal.name = c ? c.name : ''; modal.dup = '';
      if (c && c.id === simCfg.current) { modal.items = fromCurrent().map(i => ({ ...i })); modal.base = smBaseOfCfg(c); }      // config active : la fenêtre montre exactement ce qui est coché dans Calculs détaillés (même non enregistré) ; « Valider » apparaît tant que cela diffère de la config enregistrée
      else modal.items = c ? c.items.map(i => ({ ...i })) : [];
    }      // nouvelle config : liste vide (on repart de zéro) ; la liste déroulante permet de dupliquer une config existante
    if (!modal.base && modal.view === 'edit') modal.base = smBaseOf();      // état à l'ouverture : sert à savoir s'il y a quelque chose à valider
    drawSimModal();
  }
  /* menu déroulant du panneau : choisir la configuration à afficher (par défaut la config active) ; la config chargée (active) est en vert et en gras */
  function cfgMenuHtml() {
    const ld = id => id === simCfg.current ? ' loaded' : '', nm = (modal.name || '').trim() || (cfgOf(modal.id) || {}).name || '';
    const opt = c => {
      if (c.id !== modal.id) return `<div class="smCfgOpt${ld(c.id)}" role="button" tabindex="0" data-a="cfgpick" data-id="${esc(c.id)}"><span>${esc(c.name)}</span></div>`;
      if (modal.renaming) return `<div class="smCfgOpt on${ld(c.id)}"><input class="smCfgIn" data-f="name" maxlength="30" value="${esc(modal.name)}" aria-label="Nom de la configuration" placeholder="nom de la configuration"></div>`;
      return `<div class="smCfgOpt on${ld(c.id)}" role="button" tabindex="0" data-a="cfgpick" data-id="${esc(c.id)}"><span>${esc(nm)}</span><i class="smCfgEd" role="button" tabindex="0" data-a="cfgren" aria-label="Modifier le nom">${ic('edit')}</i></div>`;      // stylo : modifier le nom de la configuration affichée
    };
    return `<div class="smCfgDd"><button type="button" class="smCfgBtn${ld(modal.id)}" data-a="cfgmenu" aria-label="Choisir une configuration"><span>${esc(nm)}</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><div class="smCfgList"${modal.menuOpen ? '' : ' hidden'}>${simCfg.cfgs.map(opt).join('')}</div></div>`;
  }
  function cfgMenuRefresh(focus) {      // redessine le menu seul (le reste de la fenêtre, boutons compris, n'est pas touché)
    const dd = document.querySelector('#simModal .smCfgDd'); if (!dd || !modal) return;
    dd.outerHTML = cfgMenuHtml();
    if (focus) { const i = document.querySelector('#simModal .smCfgIn'); if (i) { i.focus(); i.select(); } }
  }
  function cfgRenameEnd(cancel) {      // fin de la saisie du nom : un nom vide ou Échap rend l'ancien
    if (!modal || !modal.renaming) return;
    modal.renaming = false; if (cancel || !(modal.name || '').trim()) modal.name = modal.nameBefore;
    cfgMenuRefresh(); smUpdateSave();
  }
  function drawSimModal() {
    const w = document.querySelector('#simModal .smWin'); if (!w || !modal) return;
    const oldList = w.querySelector('.smList'), keepTop = oldList ? oldList.scrollTop : 0;      // le redessin ne ramène pas la liste en haut
    const btn = (a, ico, title, extra = '', cls = '') => `<button class="smIc ${cls}" data-a="${a}" ${extra} title="${title}" aria-label="${title}">${ic(ico)}</button>`;
    if (modal.view === 'manage') {
      w.innerHTML = `<h4>Configurations</h4><div class="smList">${simCfg.cfgs.map(c => `<div class="smRow"><span class="smNm">${esc(c.name)}<small>${c.items.length} valeur${c.items.length > 1 ? 's' : ''}</small></span>${btn('edit', 'edit', 'Modifier', `data-id="${esc(c.id)}"`)}${FIXED.includes(c.id) ? '' : btn('del', delConfirm === c.id ? 'ok' : 'del', delConfirm === c.id ? 'Confirmer la suppression' : 'Supprimer', `data-id="${esc(c.id)}"`, delConfirm === c.id ? 'danger' : '')}</div>`).join('') || '<p class="smEmpty">Aucune configuration.</p>'}</div><div class="smFoot">${btn('new', 'add', 'Ajouter une config')}${btn('close', 'x', 'Fermer')}</div>`;
    } else {
      w.innerHTML = `<div class="smTop"><div class="smTitle"><h4>${modal.id ? 'Panneau des configurations' : 'Nouvelle configuration'}</h4><div class="smAct"><span class="smOkWrap"><button class="smIc ok" data-a="save" aria-label="Appliquer les modifications">${ic('ok')}</button><span class="smOkLbl" role="button" data-a="save">appliquer modifications</span></span>${btn('close', 'x', 'Annuler')}</div></div>${modal.id ? cfgMenuHtml() : `<input class="smName" data-f="name" placeholder="nom de la configuration" maxlength="30" value="${esc(modal.name)}">`}${modal.id ? '' : `<select class="smDup" data-f="dup" aria-label="Dupliquer une configuration existante"><option value="">Nouvelle configuration vide</option>${simCfg.cfgs.map(c => `<option value="${esc(c.id)}"${modal.dup === c.id ? ' selected' : ''}>Dupliquer : ${esc(c.name)} (${c.items.length})</option>`).join('')}</select>`}</div><div class="smList">${modal.items.map((it, i) => `<div class="smRow${modal.sel === i ? ' sel' : ''}${modal.id && modal.id === simCfg.current && !sim.checks.includes(it.sk) ? ' miss' : ''}"${modal.id && modal.id === simCfg.current && !sim.checks.includes(it.sk) ? ' title="Cette valeur n’est pas active dans Calculs détaillés (décochée, ou introuvable dans le calcul actuel) : elle n’est pas comptée là-bas"' : ''}><span class="smLbl" role="button" tabindex="0" data-a="pick" data-i="${i}" title="Voir où se trouve cette valeur">${esc(it.label)}</span><input data-f="item" data-i="${i}" placeholder="nom (facultatif)" maxlength="40" value="${esc(it.name)}">${btn('rm', 'x', 'Retirer cette valeur', `data-i="${i}"`)}</div>`).join('') || '<p class="smEmpty">Aucune valeur : cochez des lignes dans ∑ Calculs, puis appliquez les modifications.</p>'}<div class="smAddRow" role="button" tabindex="0" data-a="addrow" title="Ajouter une valeur : ouvre Calculs détaillés (un bouton permettra de revenir ici)" aria-label="Ajouter une valeur">${ic('add')}</div></div>`;
    }
    const newList = w.querySelector('.smList'); if (newList) { newList.scrollTop = keepTop; if (modal.view === 'edit' && modal.sel != null && modal.keepHalf) smKeepHalf(); }
    modal.keepHalf = false;
    smUpdateSave();
    smSyncView();
  }
  function smSyncView() {      // ligne choisie (clic sur son texte bleu ou dans sa case de nom) : la fenêtre passe à gauche, le visuel apparaît à droite
    const ov = $('simModal'), it = modal && modal.view === 'edit' && modal.sel != null ? modal.items[modal.sel] : null;
    if (!ov) return;
    const show = !!modal && modal.view === 'edit' && (!!it || modal.hist.length > 0 || modal.fut.length > 0);      // sans ligne choisie, le volet reste tant qu'il y a un historique : pour pouvoir annuler / rétablir
    ov.classList.toggle('withView', show);
    let pane = ov.querySelector('.smView');
    if (!show) { if (pane) pane.remove(); return; }
    if (!pane) { pane = document.createElement('div'); pane.className = 'smView'; ov.append(pane); }
    simPreview(pane, it);
  }
  /* « Modifier » dans le volet : va à la ligne dans Calculs détaillés (onglet, ligne sélectionnée, défilement) ; « Revenir aux modifications » rouvre la fenêtre telle qu'elle était (nom, noms saisis, ligne choisie). */
  const simBackShow = st => { simBackState = st; renderSimHead(); };
  function simBackHide() { if (simBackState) { simBackState = null; renderSimHead(); } }
  function simBackRestore() {      // rouvre la fenêtre en tenant compte de ce qui a changé entre-temps ; chaque valeur retirée, renommée ou ajoutée est une étape d'historique à part (annulable une à une)
    const st = simBackState; if (!st) return;
    const cur = new Map(fromCurrent().map(x => [x.sk, x])), was = new Set(st.snapChecks || []), selSk = st.selSk, isCur = !!st.id && st.id === simCfg.current, other = !!st.id && !isCur;
    st.hist = st.hist || []; st.fut = [];
    if (st.id && st.id === simCfg.current) st.items.forEach(i => { const c = cur.get(i.sk); if (c && c.snap) i.snap = c.snap; });      // copies des lignes de la config active : celles d'avant le départ sont périmées (valeur ou points modifiés entre-temps)
    const step = fn => { st.hist.push(JSON.stringify({ items: st.items, sel: st.sel, dup: st.dup })); if (st.hist.length > 20) st.hist.shift(); fn(); };      // instantané avant chaque changement
    if (!other) [...was].filter(k => !cur.has(k) && st.items.some(i => i.sk === k)).forEach(k => step(() => { st.items = st.items.filter(i => i.sk !== k); }));      // décochées entre-temps : n'apparaissent plus
    if (!other) st.items.filter(i => cur.has(i.sk) && (st.snapNames || {})[i.sk] !== sim.names[i.sk] && i.name !== cur.get(i.sk).name).forEach(i => step(() => { i.name = cur.get(i.sk).name; }));      // renommées entre-temps : le nouveau nom l'emporte
    if (!other) [...cur.keys()].filter(k => !was.has(k) && !st.items.some(i => i.sk === k)).forEach(k => step(() => { st.items.push({ ...cur.get(k) }); }));
    if (isCur) {      // config active : la fenêtre montre toujours exactement les valeurs cochées dans Calculs détaillés
      st.items.filter(i => !cur.has(i.sk)).forEach(i => step(() => { st.items = st.items.filter(x => x.sk !== i.sk); }));
      [...cur.keys()].filter(k => !st.items.some(i => i.sk === k)).forEach(k => step(() => { st.items.push({ ...cur.get(k) }); }));
    }      // cochées entre-temps : ajoutées en fin de liste, une à une
    const at = selSk ? st.items.findIndex(i => i.sk === selSk) : -1; st.sel = !selSk ? null : at >= 0 ? at : st.items.length ? Math.min(st.sel == null ? 0 : st.sel, st.items.length - 1) : null;
    openSimModal('edit', null, st);
  }
  function smPark() {      // quitte la fenêtre en gardant son état (pour « Revenir aux modifications ») : noms saisis appliqués à la config active, lignes cochées mémorisées
    const st = modal;
    if (st.id && st.id === simCfg.current) { st.items.forEach(i => { if (sim.checks.includes(i.sk)) { const n = (i.name || '').trim(); if (n) sim.names[i.sk] = n; else delete sim.names[i.sk]; } });
      sim.checks.filter(k => !st.items.some(i => i.sk === k)).forEach(k => { sim.checks.splice(sim.checks.indexOf(k), 1); delete sim.names[k]; });      // une valeur retirée dans la fenêtre est aussi décochée dans Calculs détaillés : les deux contenus restent identiques
      simSave(); }      // noms saisis mais pas encore validés : ils apparaissent déjà dans Calculs détaillés (config active)
    st.snapChecks = [...sim.checks]; st.snapNames = { ...sim.names }; closeSimModal(); return st;
  }
  function simOpenDetails() { $('details').classList.add('open'); $('detBtn').classList.add('on'); renderDetails(G.compute(vpOf(), S)); }
  function simGoto(k) {
    const t = String(k).split('|')[0], r = G.compute(vpOf(), S); if (!r || !r.valid) return false;
    let T = buildDetails(r)[t]; if (!T) return false;
    let i = T.rows.findIndex(x => x.sk === k);
    if (i < 0 && t === 'vpe') { vpe.flt = ['', '']; T = buildDetails(r)[t]; i = T.rows.findIndex(x => x.sk === k); }      // ligne cachée par un filtre : on le lève
    if (i < 0) return false;
    $('details').classList.add('open'); $('detBtn').classList.add('on');
    tab = t; selRow = i; renderDetails(r); scrollToRow(selRow); return true;
  }
  /* La ligne choisie est soit au-dessus de la moitié de la fenêtre, soit maintenue à la moitié : c'est le défilement de la liste qui le garantit (appelé après une sélection ou un appui sur les flèches). */
  function smKeepHalf() {
    const list = document.querySelector('#simModal .smList'), row = list && list.querySelector('.smRow.sel'); if (!row) return;
    const lr = list.getBoundingClientRect(), rr = row.getBoundingClientRect(), mid = lr.height / 2, c = rr.top - lr.top + rr.height / 2;      // centre de la ligne dans la zone visible de la liste
    if (c > mid) list.scrollTop += c - mid;                                    // en dessous de la moitié : on la remonte à la moitié
    else if (rr.top < lr.top) list.scrollTop += rr.top - lr.top - 4;           // cachée en haut : on la ramène en vue
  }
  /* Visuel d'une valeur : le(s) graphique(s) de son onglet (Faisceau, Écran, Pixels : 1 fenêtre ; VP à écran : 3 fenêtres l'une sous l'autre) avec la ligne / le point en surbrillance jaune.
     Même dessin que Calculs détaillés (V.draw + drawPrim), recadré automatiquement ; la valeur est reprise dans le titre. */
  function simPreview(pane, it) {
    if (it) simPreview0(pane, it);
    else { pane.className = 'smView'; pane.innerHTML = '<div class="smFig smNone">Sélectionnez une valeur (clic sur son texte bleu ou dans sa case de nom) pour voir où elle se trouve.</div><div class="smPaneFoot"><span class="smHist"></span></div>'; }
    smUpdateHist();
  }
  function simPreview0(pane, it) {
    const foot = go => `<div class="smPaneFoot">${go ? '<button type="button" class="hbtn smGo" data-a="goto" title="Aller à cette valeur dans Calculs détaillés (un bouton permettra de revenir ici)">Modifier</button>' : ''}<span class="smHist"></span></div>`;
    const n = modal.items.length, ar = d => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
    const bar = `<div class="smNavBar"><button type="button" data-a="pv" data-d="-1" title="Valeur précédente" aria-label="Valeur précédente"${n > 1 ? '' : ' disabled'}>${ar('M6 15l6-6 6 6')}</button><span>${modal.sel + 1}/${n}</span><button type="button" data-a="pv" data-d="1" title="Valeur suivante" aria-label="Valeur suivante"${n > 1 ? '' : ' disabled'}>${ar('M6 9l6 6 6-6')}</button></div>`;
    const nm = `<div class="smSelNm">${esc((it.name || '').trim() || it.label)}</div>`;      // le nom donné à la valeur, sinon le texte bleu
    const msg = t => { pane.className = 'smView'; pane.innerHTML = nm + bar + `<div class="smFig smNone">${t}</div>` + foot(false); };
    const r = lastR && lastR.valid ? lastR : G.compute(vpOf(), S);
    if (!r || !r.valid) return msg('Faisceau hors écran : aucun visuel.');
    const t = String(it.sk).split('|')[0], tabs = buildDetails(r), T = tabs[t], rw = T && T.rows.find(x => x.sk === it.sk);
    if (!rw || !rw.hl || !rw.hl.length) return msg('Cette valeur n’existe pas (ou n’a pas de visuel) dans le calcul actuel.');
    const val = String(rw.val).replace(/<[^>]*>/g, ''), step = t === 'quad' || t === 'scr';
    pane.className = 'smView' + (T.views.length > 1 ? ' multi' : '');
    pane.innerHTML = nm + bar + T.views.map(() => '<div class="smFig"><svg></svg></div>').join('') + foot(true);
    pane.querySelectorAll('.smFig svg').forEach((svg, vi) => {
      const V = T.views[vi], [x0, x1, y0, y1] = V.b, F = frame(svg, x0, x1, y0, y1, Math.max(x1 - x0, y1 - y0) * 0.08 + 0.05, false, step || t === 'px' ? 44 : undefined);
      V.draw(svg, F);
      if (V.t) svg.append(el('text', { x: 8, y: F.H - 8, fill: '#8b98a6', 'font-size': 10.5 }, { face: 'vue de face', side: 'vue de côté', top: 'vue de dessus' }[V.t] || V.t));
      (rw.one ? [rw.hl[0]] : rw.hl).filter(p => (p.vw || 0) === vi).forEach(p => drawPrim(svg, F, p));      // surbrillance jaune
      if (rw.rt) { const pk = rw.one ? 0 : -1; rw.rt.filter(m => (m.vw || 0) === vi && (pk < 0 || m.pi === pk)).forEach(m => drawPrim(svg, F, m)); }
      if (vi === 0) svg.append(el('text', { x: 10, y: 22, fill: HL, 'font-size': 13, 'font-weight': 800 }, (rw.t || rw.n) + ' : ' + val));
    });
  }
  /* Annuler / rétablir dans la fenêtre de modification : instantanés (nom de la config, lignes, noms saisis, ligne choisie) ; la frappe d'un même champ est regroupée (1 s de pause = nouvelle étape). */
  const smBaseOf = () => JSON.stringify({ n: (modal.name || '').trim(), i: modal.items.map(i => i.sk + '\u0001' + (i.name || '').trim()) });
  const smBaseOfCfg = c => JSON.stringify({ n: (c.name || '').trim(), i: c.items.map(i => i.sk + '\u0001' + (i.name || '').trim()) });
  function smUpdateSave() {      // bouton Valider : absent à l'ouverture ; il apparaît (vert, ✓, clignotement léger) dès la moindre modification
    const b = document.querySelector('#simModal button[data-a=save]'); if (!b || !modal || modal.view !== 'edit') return;
    const d = smBaseOf() !== modal.base; if (b.classList.contains('dirty') === d && b.dataset.init) return;
    b.dataset.init = '1'; b.classList.toggle('dirty', d);
    b.innerHTML = ic('ok'); b.ariaLabel = 'Appliquer les modifications'; b.tabIndex = d ? 0 : -1;      // pas d'info-bulle
  }
  const smSnap = () => JSON.stringify({ items: modal.items, sel: modal.sel, dup: modal.dup });      // les valeurs enregistrées (lignes, noms) ; pas le nom de la config
  function smPush() { modal.hist.push(smSnap()); if (modal.hist.length > 20) modal.hist.shift(); modal.fut = []; }      // mémorise jusqu'à 20 pas
  function smTyping(key) { const now = Date.now(); if (modal.typKey !== key || now - (modal.typT || 0) > 1000) { smPush(); smUpdateHist(); } modal.typKey = key; modal.typT = now; }
  function smRestore(s) { const o = JSON.parse(s); modal.items = o.items; modal.sel = o.sel != null && o.sel < o.items.length ? o.sel : null; modal.dup = o.dup; modal.typKey = null; drawSimModal(); }
  function smUpdateHist() {      // boutons annuler / rétablir (volet de droite, à droite de « Modifier ») : seulement quand une modification a eu lieu (ou a été annulée, donc à rétablir)
    const h = document.querySelector('#simModal .smHist'); if (!h || !modal) return;
    const bt = (a, d, t, off) => `<button type="button" class="smHb" data-a="${a}" title="${t}" aria-label="${t}"${off ? ' disabled' : ''}><svg viewBox="0 0 24 24"><path d="${d}"/></svg></button>`;
    h.innerHTML = modal.hist.length || modal.fut.length ? bt('undo', 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5', 'Annuler la dernière modification', !modal.hist.length) + bt('redo', 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5', 'Rétablir', !modal.fut.length) : '';
  }
  function simModalInput(e) {
    const f = e.target.dataset && e.target.dataset.f; if (!modal) return;
    if (f === 'dup') {      // nouvelle config : « partir de zéro » ou dupliquer une config existante (lignes + noms), annulable
      const c = cfgOf(e.target.value); smPush();
      if (c) { if (!(modal.name || '').trim() || modal.name === modal.dupName) { modal.name = c.name + ' (copie)'; modal.dupName = modal.name; } modal.items = c.items.map(i => ({ ...i })); }
      else { if (modal.name === modal.dupName) modal.name = ''; modal.dupName = ''; modal.items = []; }
      modal.dup = e.target.value; modal.sel = null; drawSimModal(); return;
    }
    if (f === 'item') smTyping('item' + e.target.dataset.i);
    if (f === 'name') modal.name = e.target.value; else if (f === 'item') { modal.items[+e.target.dataset.i].name = e.target.value; if (+e.target.dataset.i === modal.sel) { const s = document.querySelector('#simModal .smSelNm'), it = modal.items[modal.sel]; if (s) s.textContent = (it.name || '').trim() || it.label; } }
    smUpdateSave();
  }
  function simModalClick(e) {
    const b = e.target.closest && e.target.closest('[data-a]'); if (!b || !modal) return;
    const a = b.dataset.a, id = b.dataset.id;
    if (a === 'close') closeSimModal();
    else if (a === 'cfgmenu') { modal.menuOpen = !modal.menuOpen; const l = b.nextElementSibling; if (l) l.hidden = !modal.menuOpen; }
    else if (a === 'cfgren') { modal.nameBefore = modal.name; modal.renaming = true; modal.menuOpen = true; cfgMenuRefresh(true); }
    else if (a === 'cfgpick') { if (id !== modal.id) { applyCfg(id); openSimModal('edit', id); } else { modal.menuOpen = false; cfgMenuRefresh(); } }      // choisir une configuration la charge (comme le menu de l'en-tête) : elle devient la config active, en vert ; les modifications non appliquées de la précédente ne sont pas gardées
    else if (a === 'new') openSimModal('edit', null);
    else if (a === 'edit') openSimModal('edit', id);
    else if (a === 'del' && !FIXED.includes(id)) { if (delConfirm === id) { simCfg.cfgs = simCfg.cfgs.filter(c => c.id !== id); if (simCfg.current === id) simCfg.current = ''; delConfirm = null; simChanged(); } else delConfirm = id; drawSimModal(); }
    else if (a === 'addrow') { const st = smPark(); st.selSk = null; st.sel = null; simOpenDetails(); simBackShow(st); }      // « + » : on va dans Calculs détaillés pour cocher une ligne de plus
    else if (a === 'goto') { if (modal.sel != null) { const it = modal.items[modal.sel], st = smPark(); st.selSk = it.sk; if (simGoto(it.sk)) simBackShow(st); else openSimModal('edit', null, st); } }
    else if (a === 'pv') { const n = modal.items.length; if (n > 1) { modal.sel = ((modal.sel == null ? 0 : modal.sel) + (+b.dataset.d) + n) % n; modal.keepHalf = true; drawSimModal(); } }
    else if (a === 'pick') { const i = +b.dataset.i; modal.sel = modal.sel === i ? null : i; modal.keepHalf = true; drawSimModal(); }
    else if (a === 'rm') { smPush(); modal.items.splice(+b.dataset.i, 1); modal.sel = null; drawSimModal(); }
    else if (a === 'undo') { if (modal.hist.length) { modal.fut.push(smSnap()); smRestore(modal.hist.pop()); } }
    else if (a === 'redo') { if (modal.fut.length) { modal.hist.push(smSnap()); smRestore(modal.fut.pop()); } }
    else if (a === 'save') {
      const nm = (modal.name || '').trim(); if (!nm) { const i = document.querySelector('#simModal .smName'); if (i) { i.classList.add('bad'); i.focus(); } return; }
      if (modal.saving) return; modal.saving = true; const sb = document.querySelector('#simModal button[data-a=save]'); if (sb) sb.classList.add('saving');      // le bouton cesse de clignoter : on le voit 200 ms, puis la fenêtre se ferme en fondu (1000 ms)
      setTimeout(() => { const ov = $('simModal'); if (!ov || !modal) return; ov.classList.add('fading'); setTimeout(() => { if (modal) smSave(nm); }, 1000); }, 200);
    }
  }
  function smSave(nm) {      // enregistre (après le fondu), ferme la fenêtre et applique
    {
      const live = k => modal.id && modal.id === simCfg.current && sim.checks.includes(k) && sim.snap[k];      // config active : la copie en direct de la ligne est la plus récente (celle de la fenêtre date de son ouverture)
      const items = modal.items.map(i => ({ sk: i.sk, label: i.label, name: (i.name || '').trim(), snap: live(i.sk) ? { ...sim.snap[i.sk] } : i.snap }));
      if (modal.id) { const c = cfgOf(modal.id); c.name = nm; c.items = items; if (simCfg.current === c.id) { sim.checks = items.map(i => i.sk); sim.names = {}; items.forEach(i => { if (i.name) sim.names[i.sk] = i.name; if (i.snap) sim.snap[i.sk] = i.snap; }); } closeSimModal(); simChanged(); }
      else { const c = { id: 'c' + Date.now().toString(36), name: nm, items }; simCfg.cfgs.push(c); closeSimModal(); applyCfg(c.id); }
    }
  }
  /* ---- page Réglages : liste des configurations ---- */
  let resetArm = 0;      // « Rétablir la Config A par défaut » : demande une confirmation (deuxième appui dans les 4 s)
  function renderSimSettings() {
    const box = $('simCfgBox'); if (!box) return;
    box.onclick = e => {
      const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id;
      if (a === 'resetA') {
        if (resetArm) { clearTimeout(resetArm); resetArm = 0; const c = cfgOf('A'); c.name = 'Config A'; c.items = defaultCfgA(); if (simCfg.current === 'A') applyCfg('A'); else simChanged(); }
        else { resetArm = setTimeout(() => { resetArm = 0; renderSimSettings(); }, 4000); renderSimSettings(); }
        return;
      }
      if (a === 'new') openSimModal('edit', null); else if (a === 'edit') openSimModal('edit', id);
      else if (a === 'del' && !FIXED.includes(id)) { if (delConfirm === id) { simCfg.cfgs = simCfg.cfgs.filter(c => c.id !== id); if (simCfg.current === id) simCfg.current = ''; delConfirm = null; simChanged(); } else { delConfirm = id; renderSimSettings(); } }
    };
    box.innerHTML = `<h3>Valeurs dans les simulations</h3><p class="sub">Configurations mémorisées (une sélection de lignes de calcul avec leurs noms). Elles se choisissent en haut de ∑ Calculs.</p>${simCfg.cfgs.map(c => `<div class="smRow"><span class="smNm">${esc(c.name)}<small>${c.items.length} valeur${c.items.length > 1 ? 's' : ''}</small></span><button class="smIc" data-a="edit" data-id="${esc(c.id)}" title="Modifier" aria-label="Modifier">${ic('edit')}</button>${FIXED.includes(c.id) ? '' : `<button class="smIc${delConfirm === c.id ? ' danger' : ''}" data-a="del" data-id="${esc(c.id)}" title="${delConfirm === c.id ? 'Confirmer la suppression' : 'Supprimer'}" aria-label="Supprimer">${ic(delConfirm === c.id ? 'ok' : 'del')}</button>`}</div>`).join('')}<div class="smFoot"><button class="smIc" data-a="new" title="Ajouter une config" aria-label="Ajouter une config">${ic('add')}</button></div><div class="smReset"><button class="hbtn${resetArm ? ' danger' : ''}" data-a="resetA">${resetArm ? 'Confirmer : écraser la Config A (appuyer de nouveau)' : 'Rétablir la Config A par défaut'}</button><p class="sub">Revient au calibrage d’origine de la Config A (valeurs et noms), celui de tout nouvel utilisateur. Les autres configurations ne changent pas.</p></div>`;
  }
  const dfl = { quad: { full: false, flt: ['', ''] }, scr: { full: false, flt: ['', ''] } };      // Faisceau, Écran : « calculs plus exhaustifs » et deux filtres propres à chaque onglet
  const fmtEdit = v => String(+v.toFixed(4)).replace('.', ',');                // coordonnée proposée à la modification
  const startEdit = id => { const c = vpe.custom.find(q => q.id === id); if (!c) return; vpe.editing = id; vpe.edraft = c.p.map(fmtEdit); vpe.editNew = true; };      // un point créé par ses coordonnées : sa ligne de calcul devient modifiable
  const vpe = { pts: [], short: false, full: false, flt: ['', ''], lock: false, focus: null, custom: [], seq: 0, adding: false, draft: ['', '', ''], editing: null, edraft: ['', '', ''], editNew: false, blink: false, lastSig: '' }, VMAX = 5;      // onglet « VP à écran » : pts = identifiants des points touchés (dans l'ordre A, B, C…), lock = points verrouillés (plus de sélection ni de retrait ; un appui sur un point montre ses coordonnées), focus = lettre du point dont on veut la ligne de coordonnées, custom = points créés par leurs coordonnées (id « #1 »…, gardés tant qu'ils sont sélectionnés), adding / draft = formulaire x, y, z, editing / edraft = point créé dont on modifie les coordonnées (dans sa ligne de calcul), VMAX = nombre maximal de points (5 : test) ; flt = filtres formes / élément
  const TRI = '#a855f7', TRI_FILL = 'rgba(168,85,247,.28)', SCREEN = '#ff5d5d', BEAM = '#4da3ff';
  /* affichage réglages : réglages en grand sur 2 colonnes, les 3 vues en petit sur une ligne au-dessus, bandeau d'indicateurs réduit */
  $('cfgBtn').onclick = () => {
    backToCompact = false;
    document.querySelectorAll('.viz .card.full').forEach(c => toggleFull(c, false));
    const on = $('p-calc').classList.toggle('cfg'); $('cfgBtn').textContent = on ? 'Vue principale' : 'vue compacte';
    requestAnimationFrame(render);
  };
  $('detBtn').onclick = () => { $('details').classList.toggle('open'); $('detBtn').classList.toggle('on'); render(); };
  document.addEventListener('pointerdown', e => {      // un appui hors du panneau le referme ; isConnected : un bouton du panneau redessiné pendant l'appui (zoom, Fit) n'est plus dans la page, mais il appartenait bien au panneau
    if ($('details').classList.contains('open') && e.target.isConnected && !e.target.closest('#details, #detBtn, #simModal')) { $('details').classList.remove('open'); $('detBtn').classList.remove('on'); }
  });
  $('detFull').onclick = () => { const f = $('details').classList.toggle('full'); $('detFull').textContent = f ? '⤡' : '⤢'; $('detFull').title = f ? 'Quitter le plein écran' : 'Plein écran'; renderDetails(G.compute(vpOf(), S)); };
  $('detClose').onclick = () => { $('details').classList.remove('open'); $('detBtn').classList.remove('on'); };

  const dist2 = G.d2;
  const HL = '#ffd166', BIS_LEN = 3.5;      // BIS_LEN : longueur du trait de la bissectrice, en rayons de l'arc
  const span = p => { const a1 = Math.atan2(p.u1[1], p.u1[0]); let da = Math.atan2(p.u2[1], p.u2[0]) - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; return { a1, da, m: a1 + da / 2 }; };      // angle entre u1 et u2 : départ, ouverture, direction de la bissectrice
  function drawPrim(svg, F, p) {
    const a = { stroke: HL, 'stroke-width': 4, 'stroke-linecap': 'round' };
    if (p.k === 'seg') svg.append(el('line', { x1: F.X(p.a[0]), y1: F.Y(p.a[1]), x2: F.X(p.b[0]), y2: F.Y(p.b[1]), ...a, ...(p.ghost ? { 'stroke-width': 2.5, opacity: 0.6 } : {}) }));      // ghost : trait de repère (côtés d'un angle), plus discret et non cliquable
    else if (p.k === 'rt') {                                                                    // angle droit : petit carré blanc, discret, dans l'angle (3 sommets : le coin reste ouvert)
      const c0 = [F.X(p.c[0]), F.Y(p.c[1])], dn = w => { const dx = F.X(p.c[0] + w[0]) - c0[0], dy = F.Y(p.c[1] + w[1]) - c0[1], l = Math.hypot(dx, dy) || 1; return [dx / l * 9, dy / l * 9]; };
      const u = dn(p.u), v = dn(p.v);
      svg.append(el('polyline', { points: `${c0[0] + u[0]},${c0[1] + u[1]} ${c0[0] + u[0] + v[0]},${c0[1] + u[1] + v[1]} ${c0[0] + v[0]},${c0[1] + v[1]}`, fill: 'none', stroke: '#fff', 'stroke-width': 1.4, opacity: 0.85, 'stroke-linejoin': 'miter', 'pointer-events': 'none' }));
    }
    else if (p.k === 'path') svg.append(el('polyline', { points: pts(F, p.p), fill: 'none', ...a }));                  // ligne ouverte (arc d'angle en 3D projeté)
    else if (p.k === 'poly') svg.append(el('polygon', { points: pts(F, p.p), fill: p.fill === false ? 'none' : 'rgba(255,209,102,.3)', ...a, 'stroke-linejoin': 'round' }));
    else if (p.k === 'pt') svg.append(el('circle', p.ring ? { cx: F.X(p.p[0]), cy: F.Y(p.p[1]), r: 9, fill: 'none', stroke: HL, 'stroke-width': 2.5 } : { cx: F.X(p.p[0]), cy: F.Y(p.p[1]), r: 7, fill: HL }));      // ring : anneau autour du point (VP à écran), la couleur du point reste visible
    else if (p.k === 'diff') {                                                                  // surface p privée de la zone hole : remplissage troué, contour seulement sur le bord extérieur
      const path = [p.p, p.hole].map(P => 'M' + P.map(q => F.X(q[0]) + ' ' + F.Y(q[1])).join('L') + 'Z').join('');
      svg.append(el('path', { d: path, 'fill-rule': 'evenodd', fill: `rgba(255,209,102,${p.alpha || 0.3})`, stroke: 'none' }));
      svg.append(el('polygon', { points: pts(F, p.p), fill: 'none', ...a, 'stroke-linejoin': 'round' }));
      if (p.holeStroke) svg.append(el('polygon', { points: pts(F, p.hole), fill: 'none', stroke: HL, 'stroke-width': 2, 'stroke-dasharray': '5 4', 'stroke-linejoin': 'round' }));      // bord de la partie exclue (l'écran), en pointillé : la surface surlignée s'arrête là
    }
    else if (p.k === 'arc') {                                                                  // angle : l'arc seul
      const c = p.c, { a1, da } = span(p), R = p.r, path = [];
      for (let i = 0; i <= 16; i++) { const t = a1 + da * i / 16; path.push([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]); }
      svg.append(el('polyline', { points: pts(F, path), fill: 'none', ...a }));
    } else if (p.k === 'bis') {                                                                // bissectrice : le trait pointillé seul
      const c = p.c, { m } = span(p);
      svg.append(el('line', { x1: F.X(c[0]), y1: F.Y(c[1]), x2: F.X(c[0] + BIS_LEN * p.r * Math.cos(m)), y2: F.Y(c[1] + BIS_LEN * p.r * Math.sin(m)), ...a, 'stroke-dasharray': '6 5' }));
    }
  }
  const lbl = (svg, F, p, t, dx = 0, dy = -8, c = '#9cc9ff') => svg.append(el('text', { x: F.X(p[0]) + dx, y: F.Y(p[1]) + dy, 'text-anchor': 'middle', fill: c, 'font-size': 12, 'font-weight': 700 }, t));

  /* ---------- Angles droits : petit repère carré, discret, quand un élément surligné en comporte un ----------
     rtMarks(prims, edges, cen) → [{ c, u, v, pi }] : sommet c et directions unitaires u, v des deux côtés ; pi = indice du trait d'origine.
     Cas : (1) deux traits de la ligne qui se rejoignent à 90° ; (2) un trait qui arrive à 90° sur la droite d'un côté de référence (médiane, hauteur…) ;
     (3) un sommet à 90° d'un polygone surligné. Les coordonnées peuvent être en 2D (onglets Faisceau, Écran, Pixels) ou en 3D (VP à écran). */
  function rtMarks(prims, edges, cen) {
    const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), ln = a => Math.sqrt(dot(a, a));
    const un = a => { const l = ln(a); return l < 1e-9 ? null : a.map(v => v / l); };
    const COS = 1e-7, EPS = 1e-6, out = [], seen = new Set();
    const add = (c, u, v, pi) => {
      if (!u || !v || Math.abs(dot(u, v)) > COS || out.length >= 8) return;
      const r = a => a.map(x => Math.round(x * 1e4)), k1 = [r(c), r(u), r(v)].join('|'), k2 = [r(c), r(v), r(u)].join('|');
      if (seen.has(k1) || seen.has(k2)) return; seen.add(k1); out.push({ c, u, v, pi });
    };
    const kind = p => p.k || p.t;
    const segs = prims.map((p, i) => ({ p, i })).filter(o => kind(o.p) === 'seg');
    for (let x = 0; x < segs.length; x++) for (let y = x + 1; y < segs.length; y++) {                         // (1) deux traits qui partent du même point
      const A = segs[x].p, B = segs[y].p;
      [[A.a, A.b], [A.b, A.a]].forEach(([ca, oa]) => [[B.a, B.b], [B.b, B.a]].forEach(([cb, ob]) => { if (ln(sub(ca, cb)) < EPS) add(ca, un(sub(oa, ca)), un(sub(ob, cb)), segs[x].i); }));
    }
    segs.filter(o => !o.p.ghost).forEach(o => [[o.p.a, o.p.b], [o.p.b, o.p.a]].forEach(([E, other]) => {      // (2) un trait qui arrive sur un côté de référence (pas les traits de repère d'un angle)
      const dir = un(sub(other, E)); if (!dir) return;
      (edges || []).forEach(([A, B]) => {
        const d = un(sub(B, A)); if (!d || Math.abs(dot(dir, d)) > COS) return;
        const w = sub(E, A), off = sub(w, d.map(v => v * dot(w, d)));
        if (ln(off) > EPS) return;                                                                          // l'extrémité n'est pas sur la droite du côté
        add(E, dir, cen && dot(d, sub(cen, E)) < 0 ? d.map(v => -v) : d, o.i);
      });
    }));
    prims.forEach((p, pi) => {                                                                              // (3) sommets à 90° d'un polygone
      if (kind(p) !== 'poly' || !p.p || p.p.length > 8 || p.nort) return;
      const P = p.p, n = P.length;
      P.forEach((V, i) => add(V, un(sub(P[(i + n - 1) % n], V)), un(sub(P[(i + 1) % n], V)), pi));
    });
    return out;
  }

  /* ---------- Vignettes explicatives des lignes de calcul (au survol, après 200 ms) ----------
     rowHelp(onglet, catégorie, nom de la ligne) → une ou deux phrases qui disent de quoi il s'agit (null si inconnu). */
  function rowHelp(tab, cat, n) {
    let m;
    const seg = s => s.replace(/[–\s]/g, '');
    if (tab === 'quad') {
      if (cat === 'Côtés' && /^[A-D]{2}$/.test(n)) return `Longueur du côté ${n} du faisceau`;
      if (cat === 'Diagonales') return `Longueur de la diagonale ${n} du faisceau`;
      if ((m = /^∠([A-D])$/.exec(n))) return `Angle du faisceau au coin ${m[1]}`;
      if ((m = /^bis ([A-D])$/.exec(n))) return `Bissectrice du coin ${m[1]} : la demi-droite qui partage l'angle de ce coin en deux angles égaux. La valeur est la moitié de l'angle.`;
      return ({
        h: 'Hauteur du faisceau : distance, mesurée perpendiculairement, entre le milieu du côté AB et la droite qui porte le côté CD.',
        l: 'Largeur du faisceau : distance, mesurée perpendiculairement, entre le milieu du côté BC et la droite qui porte le côté DA.',
        'm ↕': 'Médiane verticale : segment qui relie le milieu du côté du haut (AB) au milieu du côté du bas (CD).',
        'm ↔': 'Médiane horizontale : segment qui relie le milieu du côté droit (BC) au milieu du côté gauche (DA).',
        P: 'Périmètre du faisceau : longueur de son contour, somme des quatre côtés.',
        S: 'Surface éclairée par le faisceau (aire du quadrilatère ABCD, formule du lacet).',
        G: 'Centre de gravité du faisceau : son point d\'équilibre. Les coordonnées sont dans le plan de l\'écran (x vers la droite, z en hauteur).',
        Forme: 'Nom de la forme du faisceau (rectangle, trapèze, quadrilatère quelconque…), déduit du parallélisme de ses côtés opposés.',
      })[n] || null;
    }
    if (tab === 'scr') {
      if (cat === 'Côtés' && /^[E-H]{2}$/.test(n)) return `Longueur du côté ${n} de l'écran`;
      if (cat === 'Diagonales') return `Longueur de la diagonale ${n} de l'écran`;
      if ((m = /^∠([E-H])$/.exec(n))) return `Angle de l'écran au coin ${m[1]}`;
      if ((m = /^bis ([E-H])$/.exec(n))) return `Bissectrice du coin ${m[1]} : elle partage l'angle droit du coin en deux angles de 45°.`;
      return ({
        'Larg.': 'Largeur de l\'écran, d\'un bord à l\'autre (le réglage « Largeur »).',
        'Haut.': 'Hauteur de l\'écran, du bas au haut (le réglage « Hauteur »).',
        'Diag.': 'Diagonale de l\'écran, aussi donnée en pouces (″), l\'unité courante pour la taille d\'un écran.',
        Format: 'Rapport largeur / hauteur de l\'écran : 1,78 : 1 correspond au 16:9, 1,33 : 1 au 4:3.',
        P: 'Périmètre de l\'écran : longueur de son contour, 2 × (largeur + hauteur).',
        S: 'Surface de l\'écran : largeur × hauteur.',
        Sf: 'Surface éclairée par le faisceau, qu\'elle tombe sur l\'écran ou à côté.',
        'S∩': 'Surface commune au faisceau et à l\'écran : la partie de l\'image qui tombe réellement sur l\'écran.',
        'Sécran−S∩': 'Partie de l\'écran que le faisceau n\'éclaire pas. Elle est nulle quand l\'écran est entièrement couvert.',
        'Sf−S∩': 'Lumière projetée en dehors de l\'écran : la surface du faisceau moins celle qui recouvre l\'écran.',
        IoU: 'Recouvrement faisceau / écran : surface commune ÷ surface totale couverte par l\'un ou l\'autre (en jaune clair sur le graphique). Il baisse dès que l\'écran n\'est pas couvert ou que de la lumière déborde : un écran couvert à 100 % par un faisceau 2,7 fois plus grand ne donne que 37 %. 100 % = le faisceau épouse l\'écran.',
        E: 'Éclairement moyen sur l\'écran, en lux : flux lumineux du projecteur (lumens) divisé par la surface du faisceau. Valeur indicative.',
      })[n] || null;
    }
    if (tab === 'px') {
      if ((m = /^↳ (gauche|droite|haut|bas)$/.exec(n))) return `Pixels perdus parce qu'ils tombent au-delà du bord ${m[1]} de l'écran : ils sont projetés mais ne se voient pas.`;
      return ({
        'Rés.': 'Résolution native du panneau du projecteur : nombre de pixels en largeur et en hauteur.',
        Total: 'Nombre total de pixels du panneau. L\'image formée par tous ces pixels est le faisceau.',
        Utiles: 'Pixels projetés à l\'intérieur de l\'écran, donc réellement visibles. La part est donnée en pourcentage du total.',
        Perdus: 'Pixels projetés hors de l\'écran : le total moins les pixels utiles.',
        Zone: 'Dimensions (largeur × hauteur en pixels) du plus petit rectangle qui contient toute l\'image utile.',
        'Densité': 'Nombre de pixels utiles par mètre carré d\'écran : plus il est élevé, plus l\'image est fine.',
        Pixel: 'Taille moyenne d\'un pixel une fois projeté sur l\'écran, en millimètres.',
      })[n] || null;
    }
    /* VP à écran : lignes de shapes.js (points, segment, triangle, polygone) */
    if (cat === 'Points (x,y,z)') {
      if (/^[A-I]$/.test(n)) return `Coordonnées du point ${n} dans le repère de l'application : x vers la droite, y vers le public (le recul), z vers le haut ; l'origine est au centre de la base de l'écran.`;
      if (/^milieu/.test(n)) return 'Milieu du segment : la moyenne des coordonnées des deux points.';
      if (/^pied de h/.test(n)) return 'Pied de la hauteur : le point où la perpendiculaire abaissée du sommet rencontre le côté opposé.';
      if (/^orthocentre/.test(n)) return 'Orthocentre : le point où se coupent les trois hauteurs du triangle.';
      if (/^centre de gravité/.test(n)) return 'Centre de gravité de la forme : son point d\'équilibre (pour un triangle, l\'intersection des médianes).';
      if (/centre I/.test(n)) return 'Centre du cercle inscrit : le point à égale distance des trois côtés, à l\'intersection des bissectrices.';
      if (/centre O/.test(n)) return 'Centre du cercle circonscrit : le point à égale distance des trois sommets.';
      if (/^intersection des diagonales/.test(n)) return 'Point où se coupent les deux diagonales du quadrilatère.';
      if (/normale/.test(n)) return 'Vecteur de longueur 1 perpendiculaire au plan de la forme : il en donne l\'orientation.';
      return 'Coordonnées x, y, z d\'un point remarquable de la forme.';
    }
    if (cat === 'Longueurs' && /^[A-I]–[A-I]$/.test(n)) return `Distance en ligne droite entre les points ${n[0]} et ${n[2]}, calculée avec x, y et z.`;
    if (n === 'Δx') return 'Décalage latéral entre les deux points : différence de leurs x, en valeur absolue.';
    if (n === 'Δy') return 'Décalage en profondeur (recul) entre les deux points : différence de leurs y.';
    if (n === 'Δz') return 'Décalage en hauteur entre les deux points : différence de leurs z.';
    if (n === 'au sol') return 'Distance entre les deux points mesurée à plat, sur le sol, sans tenir compte de la différence de hauteur.';
    if (n === 'dans l’écran') return 'Distance entre les deux points une fois projetés sur le plan de l\'écran (le recul est ignoré).';
    if (n === 'avec l’écran') return 'Angle entre le segment et le plan de l\'écran : 0° si le segment est dans l\'écran, 90° s\'il lui est perpendiculaire.';
    if (n === 'avec le sol') return 'Angle entre le segment et le sol : 0° si le segment est à l\'horizontale, 90° s\'il est vertical.';
    if (n === 'avec le plan vertical ⟂ écran') return 'Angle entre le segment et le plan vertical perpendiculaire à l\'écran (le plan « de côté »).';
    if (n === 'pente') return 'Pente du segment : dénivelé divisé par la distance horizontale, en pourcentage.';
    if (n === 'direction au sol') return 'Orientation du segment vu de dessus, par rapport à l\'axe du recul (y) : 0° signifie perpendiculaire à l\'écran.';
    if ((m = /^avec l’axe ([xyz])$/.exec(n))) return `Angle entre le segment et l'axe ${m[1]} du repère (${{ x: 'latéral', y: 'recul', z: 'hauteur' }[m[1]]}).`;
    if ((m = /^([abc]) = ([A-C])–([A-C])$/.exec(n))) return `Longueur du côté ${m[2]}–${m[3]} du triangle, opposé au sommet ${{ a: 'A', b: 'B', c: 'C' }[m[1]]}.`;
    if (cat === 'Côtés' && /^[A-I]–[A-I]$/.test(n)) return `Longueur du côté ${n} de la forme : distance entre deux sommets consécutifs.`;
    if (cat === 'Diagonales') return `Diagonale ${n} : segment qui relie deux sommets non consécutifs.`;
    if (n === 'périmètre') return 'Périmètre : longueur du contour de la forme, somme de ses côtés.';
    if (n === 'demi-périmètre') return 'Moitié du périmètre ; il sert dans plusieurs formules (aire, rayon du cercle inscrit).';
    if ((m = /^∠([A-I])$/.exec(n))) return `Angle intérieur de la forme au sommet ${m[1]}, entre les deux côtés qui s'y rejoignent.`;
    if (cat === 'Angles' && n === 'somme') return 'Somme des angles intérieurs : 180° pour un triangle, (n − 2) × 180° pour un polygone plan à n côtés.';
    if (/^côtés opposés/.test(n)) return 'Angle entre les droites qui portent deux côtés opposés : 0° quand ils sont parallèles.';
    if ((m = /^h_([A-C])$/.exec(n))) return `Hauteur issue du sommet ${m[1]} : distance de ce sommet au côté opposé, mesurée perpendiculairement.`;
    if ((m = /^m_([A-C])$/.exec(n))) return `Médiane issue du sommet ${m[1]} : segment qui relie ce sommet au milieu du côté opposé.`;
    if ((m = /^t_([A-C])$/.exec(n))) return `Bissectrice issue du sommet ${m[1]} : segment qui partage l'angle en deux angles égaux, jusqu'au côté opposé.`;
    if (/^hauteur sur/.test(n)) return `Hauteur relative au côté ${n.replace('hauteur sur ', '')} : la surface divisée par la longueur de ce côté.`;
    if (n === 'hauteur du trapèze') return 'Hauteur du trapèze : distance entre ses deux côtés parallèles (les bases).';
    if ((m = /^([A-I]) sur ([A-I])–([A-I])$/.exec(n))) return `Hauteur du sommet ${m[1]} : distance perpendiculaire de ce sommet à la droite qui porte le côté ${m[2]}–${m[3]}.`;
    if (/^médiane/.test(n)) return 'Médiane du quadrilatère : segment qui relie les milieux de deux côtés opposés.';
    if (n === 'surface' || n === 'surface totale') return 'Surface (aire) de la forme.';
    if (/^triangle A–/.test(n)) return 'Surface d\'un des triangles obtenus en découpant le polygone en éventail à partir du sommet A.';
    if (/^projetée sur l’écran/.test(n)) return 'Surface de l\'ombre de la forme projetée sur le plan de l\'écran (vue de face).';
    if (/^projetée sur le sol/.test(n)) return 'Surface de l\'ombre de la forme projetée sur le sol (vue de dessus).';
    if (/^projetée sur le plan vertical/.test(n)) return 'Surface de l\'ombre de la forme projetée sur le plan vertical perpendiculaire à l\'écran (vue de côté).';
    if (n === 'surface incluse dans l’écran') return 'Partie de la surface de la forme qui se trouve à l\'intérieur de l\'écran.';
    if (n === 'part de l’écran couverte') return 'Pourcentage de la surface de l\'écran recouvert par la forme.';
    if (n === 'cercle inscrit : rayon r') return 'Rayon du cercle inscrit : le plus grand cercle qui tient dans la forme en touchant ses côtés.';
    if (n === 'cercle circonscrit : rayon R') return 'Rayon du cercle circonscrit : le cercle qui passe par tous les sommets de la forme.';
    if (n === 'cercle circonscrit') return 'Un cercle qui passe par les quatre sommets n\'existe que si le quadrilatère est « inscriptible » (angles opposés de somme 180°).';
    if (n === 'cercle inscrit') return 'Un cercle tangent aux quatre côtés n\'existe que si A–B + C–D = B–C + D–A.';
    if (n === 'normale unitaire') return 'Vecteur de longueur 1 perpendiculaire au plan de la forme : il en donne l\'orientation.';
    if (n === 'écart au plan') return 'Écart maximal, en millimètres, entre les sommets et leur plan moyen : proche de 0 quand les points sont dans un même plan.';
    if (n === 'inclinaison par rapport au sol') return 'Angle entre le plan de la forme et le sol : 0° à plat, 90° à la verticale.';
    if (n === 'angle avec le plan de l’écran') return 'Angle entre le plan de la forme et le plan de l\'écran : 0° quand elle est parallèle à l\'écran.';
    if (n === 'angle avec le plan vertical ⟂ écran') return 'Angle entre le plan de la forme et le plan vertical perpendiculaire à l\'écran.';
    return null;
  }

  let vpeProbe = false;                                                  // vrai pendant le recalcul d'une ligne conservée avec ses propres points (voir plus bas)
  function buildDetails(r) {
    const v = vpOf(), Q = r.B.quad, q = r.q, N = ['A', 'B', 'C', 'D'], g = r.geo;
    const L = (n, f, val, hl = [], t) => ({ n, f, val, hl, t });      // t : intitulé affiché en jaune en haut du graphique (par défaut, le nom de la ligne)
    const one = rw => ({ ...rw, one: true });      // ligne valable pour plusieurs traits (les deux côtés parallèles, les deux diagonales) : un appui les touche tous, mais un seul est mis en surbrillance, celui qui a été touché
    const seg = (a, b, vw = 0) => ({ k: 'seg', a, b, vw });
    const poly = (p, fill, vw = 0) => ({ k: 'poly', p, fill, vw });
    const faceBounds = () => { const xs = Q.map(p => p[0]).concat(-S.sw / 2, S.sw / 2), ys = Q.map(p => p[1]).concat(0, S.sh); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; };
    const faceBase = (svg, F) => {
      svg.append(el('rect', { x: F.X(-S.sw / 2), y: F.Y(S.sh), width: F.k * S.sw, height: F.k * S.sh, fill: 'rgba(255,93,93,.10)', stroke: '#ff5d5d', 'stroke-width': 1.5 }));
      svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(77,163,255,.14)', stroke: '#4da3ff', class: 'bglow', 'stroke-width': 1.5 }));
    };
    const cornerOff = i => [i === 0 || i === 3 ? -11 : 11, i < 2 ? -8 : 16];                  // décalage de la lettre par rapport au coin (haut gauche, haut droit, bas droit, bas gauche)
    const corners = (svg, F, P, names, c) => names.forEach((n, i) => lbl(svg, F, P[i], n, ...cornerOff(i), c));      // noms des 4 coins, dans la couleur de leur objet
    /* lettres cliquables : un appui sur la lettre d'un coin sélectionne l'angle de ce coin, puis (appuis suivants) les segments qui en partent : côtés, diagonale */
    const cornerHits = (P, rowsOf) => P.map((p, i) => ({ p, off: cornerOff(i), rows: rowsOf(i) }));
    const sideRows = (sdl, i) => sdl.filter(([, a, b]) => a === i || b === i).map(x => x[0]);
    const angleArc = (P, i, R) => { const p = P[i], a = P[(i + 3) % 4], b = P[(i + 1) % 4]; return { c: p, u1: [a[0] - p[0], a[1] - p[1]], u2: [b[0] - p[0], b[1] - p[1]], r: R, vw: 0 }; };
    const angleRow = (P, i, n, deg, R) => L('∠' + n, 'arccos(u·v / |u||v|)', `${fm(deg, 1)}°`, [{ ...seg(P[i], P[(i + 3) % 4]), ghost: true }, { ...seg(P[i], P[(i + 1) % 4]), ghost: true }, { k: 'arc', ...angleArc(P, i, R) }], 'Angle en ' + n);      // l'arc va d'un côté à l'autre ; les deux côtés sont rappelés en repère
    const bisRow = (P, i, n, deg, R) => L('bis ' + n, 'angle / 2', `${fm(deg / 2, 1)}°`, [{ k: 'bis', ...angleArc(P, i, R) }], 'Bissectrice en ' + n);      // la bissectrice partage l'angle en deux moitiés égales
    const tabs = {};

    const selV = (id, label, opts, cur) => `<label class="fsel"><span>${label}</span><select id="${id}"><option value="">tous</option>${opts.map(o => `<option value="${o.v}"${o.v === cur ? ' selected' : ''}${o.off && o.v !== cur ? ' disabled' : ''}>${o.v}</option>`).join('')}</select></label>`;

    /* --- Faisceau (quadrilatère) --- */
    const sd = [['AB', 0, 1], ['BC', 1, 2], ['CD', 2, 3], ['DA', 3, 0]];
    tabs.quad = {
      label: 'Faisceau', views: [{ b: faceBounds(), draw: (svg, F) => { faceBase(svg, F); corners(svg, F, Q, N, BEAM); }, corners: cornerHits(Q, i => ['∠' + N[i], ...sideRows(sd, i), ...['AC', 'BD'].filter(n => n.includes(N[i])), 'bis ' + N[i]]) }],      // A–D : bleu, comme le faisceau
      rows: [
        { sec: 'Côtés' },
        ...sd.map(([n, i, j]) => L(n, `√((x${N[j]}−x${N[i]})² + (z${N[j]}−z${N[i]})²)`, fm(q.sides[n]) + ' m', [seg(Q[i], Q[j])], 'Côté ' + n)),
        { sec: 'Diagonales' },
        L('AC', 'diagonale', fm(q.diags.AC) + ' m', [seg(Q[0], Q[2])], 'Diagonale AC'),
        L('BD', 'diagonale', fm(q.diags.BD) + ' m', [seg(Q[1], Q[3])], 'Diagonale BD'),
        { sec: 'Angles' },
        ...N.map((n, i) => angleRow(Q, i, n, q.angles[n], 0.18 * Math.min(q.sides.AB, q.sides.BC))),
        { sec: 'Bissectrices' },
        ...N.map((n, i) => bisRow(Q, i, n, q.angles[n], 0.18 * Math.min(q.sides.AB, q.sides.BC))),
        { sec: 'Hauteurs, médianes' },
        L('h', 'hauteur : milieu de AB → droite CD', fm(q.heightTrap) + ' m', [seg(q.mids.AB, q.heightFoot)], 'Hauteur du faisceau'),
        L('l', 'largeur : milieu de BC → droite DA', fm(q.widthTrap) + ' m', [seg(q.mids.BC, q.widthFoot)], 'Largeur du faisceau'),
        L('m ↕', 'médiane : milieu AB → milieu CD', fm(q.medV) + ' m', [seg(q.mids.AB, q.mids.CD)], 'Médiane verticale'),
        L('m ↔', 'médiane : milieu BC → milieu DA', fm(q.medH) + ' m', [seg(q.mids.BC, q.mids.DA)], 'Médiane horizontale'),
        { sec: 'Périmètre, surface' },
        L('P', 'AB + BC + CD + DA', fm(q.perimeter) + ' m', [poly(Q, false)], 'Périmètre du faisceau'),
        L('S', 'formule du lacet (Gauss)', fm(q.area) + ' m²', [poly(Q)], 'Surface du faisceau'),
        L('G', 'centre de gravité', `x = ${fm(q.centroid[0])} m ; z = ${fm(q.centroid[1])} m`, [{ k: 'pt', p: q.centroid }], 'Centre de gravité du faisceau'),
        L('Forme', 'côtés opposés parallèles ?', q.shape, [], 'Forme du faisceau'),
      ]
    };

    /* --- Écran --- */
    const SC = [[-S.sw / 2, S.sh], [S.sw / 2, S.sh], [S.sw / 2, 0], [-S.sw / 2, 0]];
    const M = ['E', 'F', 'G', 'H'], sdS = [['EF', 0, 1], ['FG', 1, 2], ['GH', 2, 3], ['HE', 3, 0]], dgS = ['EG', 'FH'];
    tabs.scr = {
      label: 'Écran', views: [{ b: faceBounds(), draw: (svg, F) => { faceBase(svg, F); corners(svg, F, SC, M, SCREEN); }, corners: cornerHits(SC, i => ['∠' + M[i], ...sideRows(sdS, i), ...dgS.filter(n => n.includes(M[i])), 'bis ' + M[i]]) }],      // E–H : rouge, comme l'écran
      rows: [
        { sec: 'Dimensions' },
        one(L('Larg.', '', fm(S.sw) + ' m', [seg(SC[3], SC[2]), seg(SC[0], SC[1])], 'Largeur de l’écran')),
        one(L('Haut.', '', fm(S.sh) + ' m', [seg(SC[2], SC[1]), seg(SC[3], SC[0])], 'Hauteur de l’écran')),
        one(L('Diag.', '√(l² + h²)', `${fm(r.scr.diag)} m · ${fm(r.scr.diag / 0.0254, 1)}″`, [seg(SC[3], SC[1]), seg(SC[0], SC[2])], 'Diagonale de l’écran')),
        L('Format', 'l / h', fm(S.sw / S.sh) + ' : 1', [], 'Format de l’écran'),
        { sec: 'Côtés' },
        ...sdS.map(([n, i, j]) => L(n, `√((x${M[j]}−x${M[i]})² + (z${M[j]}−z${M[i]})²)`, fm(i % 2 ? S.sh : S.sw) + ' m', [seg(SC[i], SC[j])], 'Côté ' + n)),
        { sec: 'Diagonales' },
        L('EG', 'diagonale', fm(r.scr.diag) + ' m', [seg(SC[0], SC[2])], 'Diagonale EG'),
        L('FH', 'diagonale', fm(r.scr.diag) + ' m', [seg(SC[1], SC[3])], 'Diagonale FH'),
        { sec: 'Angles' },
        ...M.map((n, i) => angleRow(SC, i, n, 90, 0.18 * Math.min(S.sw, S.sh))),
        { sec: 'Bissectrices' },
        ...M.map((n, i) => bisRow(SC, i, n, 90, 0.18 * Math.min(S.sw, S.sh))),
        { sec: 'Périmètre, surface' },
        L('P', '2·(l + h)', fm(r.scr.perimeter) + ' m', [poly(SC, false)], 'Périmètre de l’écran'),
        L('S', 'l × h', fm(r.scr.area) + ' m²', [poly(SC)], 'Surface de l’écran'),
        { sec: 'Faisceau et écran' },
        L('Sf', 'aire du faisceau', fm(q.area) + ' m²', [poly(Q)], 'Surface du faisceau'),
        L('S∩', 'aire commune faisceau ∩ écran', fm(r.ov.ai) + ' m²', r.ov.inter.length > 2 ? [poly(r.ov.inter)] : [], 'Surface commune faisceau ∩ écran'),
        L('Sécran−S∩', 'écran non couvert', `${fm(r.uncovered)} m² · ${r.covered ? '0,0' : fuPct(r.uncoveredPct)} %`, r.uncovered < 1e-6 ? [] : [r.ov.inter.length > 2 ? { k: 'diff', p: SC, hole: r.ov.inter, vw: 0, alpha: 0.55, holeStroke: true } : poly(SC)], 'Écran non couvert'),      // la surface de l'écran que le faisceau n'éclaire pas
        L('Sf−S∩', 'lumière hors écran', `${fm(q.area - r.ov.ai)} m² · ${fm(100 * (q.area - r.ov.ai) / q.area, 1)} %`, q.area - r.ov.ai < 1e-6 ? [] : [r.ov.inter.length > 2 ? { k: 'diff', p: Q, hole: r.ov.inter, vw: 0, alpha: 0.55, holeStroke: true } : poly(Q)], 'Lumière hors écran'),      // le faisceau hors de l'écran ; le bord de l'écran en pointillé, l'écran n'est pas surligné      // le faisceau moins la partie qui recouvre l'écran ; rien à surligner si tout le faisceau est dans l'écran
        L('IoU', 'S∩ / (Sf + Sécran − S∩)', fm(r.ov.iou * 100, 1) + ' %', [poly(Q), { ...poly(SC), nolabel: true, nort: true }], 'Recouvrement faisceau / écran (IoU)'),      // faisceau et écran superposés : l'union en jaune clair, la partie commune plus foncée
        L('E', 'lumens / aire du faisceau', fi(r.lux) + ' lx', r.ov.inter.length > 2 ? [poly(r.ov.inter)] : [], 'Éclairement'),      // l'écran compris dans le faisceau
      ]
    };

    /* --- Points, vues et dessin de base communs au menu « VP à écran » : repère (côté, face, dessus), liste des points candidats, base écran + faisceau --- */
    const P3 = (x, y, z) => [x, y, z];
    const proj = { face: p => [p[0], p[2]], side: p => [p[1], p[2]], top: p => [p[0], -p[1]] };   /* dessus : y inversé → écran en haut, VP en bas */
    const Qx = Q.map(p => p[0]), Qz = Q.map(p => p[1]);
    const hw = S.sw / 2, LET = 'ABCDEFGHI';
    const GRP = ['Projecteur et sol', 'Écran', 'Faisceau'];
    const CAT = [
      { id: 'vp', g: 0, label: 'VP', short: 'VP', p: P3(S.x, S.y, S.z) },
      { id: 'sol', g: 0, label: 'Sol (aplomb VP)', short: 'Sol', p: P3(S.x, S.y, 0) },
      { id: 'base', g: 1, label: 'Base (centre)', short: 'Base', p: P3(0, 0, 0) },
      { id: 'pied', g: 1, label: 'Pied (face au VP)', short: 'Pied', p: P3(S.x, 0, 0) },
      { id: 'P', g: 1, label: 'P (écran en face du VP)', short: 'P', p: P3(S.x, 0, S.z) },
      { id: 'centre', g: 1, label: 'Centre de l’écran', short: 'Centre', p: P3(0, 0, S.sh / 2) },
      { id: 'haut', g: 1, label: 'Haut (centre)', short: 'Haut', p: P3(0, 0, S.sh) },
      { id: 'bordG', g: 1, label: 'Bord gauche (à hauteur du VP)', short: 'Bord G', p: P3(-hw, 0, S.z) },
      { id: 'bordD', g: 1, label: 'Bord droit (à hauteur du VP)', short: 'Bord D', p: P3(hw, 0, S.z) },
      { id: 'HG', g: 1, label: 'Coin haut gauche (HG)', short: 'HG', p: P3(-hw, 0, S.sh) },
      { id: 'HD', g: 1, label: 'Coin haut droit (HD)', short: 'HD', p: P3(hw, 0, S.sh) },
      { id: 'BD', g: 1, label: 'Coin bas droit (BD)', short: 'BD', p: P3(hw, 0, 0) },
      { id: 'BG', g: 1, label: 'Coin bas gauche (BG)', short: 'BG', p: P3(-hw, 0, 0) },
      { id: 'G', g: 2, label: 'Centre du faisceau (G)', short: 'G', p: P3(q.centroid[0], 0, q.centroid[1]) },
      ...N.map((n, i) => ({ id: 'f' + n, g: 2, label: `Coin ${n} du faisceau`, short: 'Fais. ' + n, p: P3(Q[i][0], 0, Q[i][1]) })),
    ];
    const SHORT_LIST = ['vp', 'sol', 'base', 'pied', 'P', 'centre', 'haut', 'G'];
    const KINDS = ['side', 'face', 'top'];
    const cat = id => CAT.find(c => c.id === id);
    const baseOf = kind => ({ face: [[-hw, 0], [hw, S.sh], ...Q], side: [[0, 0], [0, S.sh], ...Q.map(p => [0, p[1]])], top: [[-hw, 0], [hw, 0], [Math.min(...Qx), 0], [Math.max(...Qx), 0]] }[kind]);
    const boundsOf = all => { const xs = all.map(a => a[0]), ys = all.map(a => a[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; };
    const drawBase = (svg, F, kind) => {                                                                     // écran et faisceau, dans la vue demandée
      const ln = (x1, y1, x2, y2, c, w = 3) => svg.append(el('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': w, 'stroke-linecap': 'butt', class: c === BEAM ? 'bglow' : '' }));
      if (kind !== 'top') ln(F.X(F.b[0]), F.Y(0), F.X(F.b[1]), F.Y(0), '#556', 1.5);
      if (kind === 'face') {
        svg.append(el('rect', { x: F.X(-hw), y: F.Y(S.sh), width: F.k * S.sw, height: F.k * S.sh, fill: 'rgba(255,93,93,.12)', stroke: SCREEN, 'stroke-width': 2 }));
        svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(77,163,255,.18)', stroke: BEAM, class: 'bglow', 'stroke-width': 2 }));
      } else if (kind === 'side') {
        ln(F.X(0) - 1.5, F.Y(0), F.X(0) - 1.5, F.Y(S.sh), SCREEN); ln(F.X(0) + 1.5, F.Y(Math.min(...Qz)), F.X(0) + 1.5, F.Y(Math.max(...Qz)), BEAM);
      } else {
        ln(F.X(-hw), F.Y(0) - 1.5, F.X(hw), F.Y(0) - 1.5, SCREEN); ln(F.X(Math.min(...Qx)), F.Y(0) + 1.5, F.X(Math.max(...Qx)), F.Y(0) + 1.5, BEAM);
      }
    };
    const HALO = { stroke: '#0f1216', 'stroke-width': 3.5, 'paint-order': 'stroke' };
    /* disque + lettre + (en plus petit) intitulé ; `at` = position écran, `dx` = décalage horizontal si des points se superposent */
    const mark = (svg, x, y, letter, name, { dx = 0, dim = false, big = false, blue = false } = {}) => {      // blue : le point du VP, toujours en bleu (fond et ligne) et 30 % plus gros
      svg.append(el('circle', { cx: x, cy: y, r: (big ? 6 : 4.5) * (blue ? 1.3 : 1), fill: blue ? BEAM : dim ? 'rgba(168,85,247,.45)' : TRI, stroke: blue ? BEAM : dim ? '#9d86c9' : '#fff', 'stroke-width': 1.2 }));
      svg.append(el('text', { x: x + dx, y: y - 13, 'text-anchor': 'middle', fill: dim ? '#bda8e6' : '#fff', 'font-size': dim ? 11 : 13, 'font-weight': 800, ...HALO }, letter));      // lettre et nom écartés du disque et de l'anneau de surbrillance (rayon 10) pour rester lisibles
      if (name) svg.append(el('text', { x: x + dx, y: y + 20, 'text-anchor': 'middle', fill: dim ? '#9d8cc0' : '#cdb8f5', 'font-size': 9.5, 'font-weight': 600, ...HALO }, name));
    };
    /* Faisceau et Écran : lignes classées par catégorie (sections), « calculs plus exhaustifs » (lignes x), deux filtres propres à chaque onglet, nombre de lignes */
    const finish = (key, T0, cfg) => {
      const D = dfl[key]; let c0 = '';
      const all = []; T0.rows.forEach(rw => { if (rw.sec) { c0 = rw.sec; return; } const rt = rtMarks(rw.hl || [], cfg.edges, cfg.cen), hl = (rw.hl || []).filter(p => !(p.k === 'arc' && rt.some(m => Math.hypot(m.c[0] - p.c[0], m.c[1] - p.c[1]) < 1e-9)));      // angle strictement droit : le carré remplace l'arc
      all.push({ ...rw, hl, cat: c0, x: cfg.x(rw, c0), els: cfg.els(rw), d: rowHelp(key, c0, rw.n), rt: rt.map(m => ({ k: 'rt', vw: 0, ...m })) }); });
      const shownAll = all.filter(rw => D.full || !rw.x);
      if (D.flt[0] && !shownAll.some(rw => rw.cat === D.flt[0])) D.flt[0] = '';
      if (D.flt[1] && !shownAll.some(rw => rw.els.includes(D.flt[1]))) D.flt[1] = '';
      if (D.flt[0] && D.flt[1] && !shownAll.some(rw => rw.cat === D.flt[0] && rw.els.includes(D.flt[1]))) D.flt[1] = '';
      const out = shownAll.filter(rw => (!D.flt[0] || rw.cat === D.flt[0]) && (!D.flt[1] || rw.els.includes(D.flt[1])));
      const rows = []; let last = null;
      out.forEach(rw => { if (rw.cat !== last) { rows.push({ sec: rw.cat }); last = rw.cat; } rows.push(rw); });
      const catOpts = [...new Set(all.map(rw => rw.cat))].map(v => ({ v, off: !shownAll.some(rw => rw.cat === v && (!D.flt[1] || rw.els.includes(D.flt[1]))) }));      // grisé : n'apparaîtrait pas dans les résultats
      const elOpts = cfg.letters.map(v => ({ v, off: !shownAll.some(rw => rw.els.includes(v) && (!D.flt[0] || rw.cat === D.flt[0])) }));
      const n = rows.filter(x => !x.sec).length;
      T0.rows = rows; T0.all = all.map(rw => ({ sk: key + '|' + rw.n, name: rw.n, val: rw.val }));
      rows.forEach(rw => { if (!rw.sec) rw.sk = key + '|' + rw.n; });
      T0.below = `<div class="tflt">${selV('fltA', cfg.l0, catOpts, D.flt[0])}${selV('fltB', cfg.l1, elOpts, D.flt[1])}<label class="chk"><input type="checkbox" id="fltFull"${D.full ? ' checked' : ''}><span>calculs plus exhaustifs</span></label><span class="vcount">${n} ligne${n > 1 ? 's' : ''} de calcul</span></div>`;
    };
    const elsOf = (rw, L4) => { const m = /^∠([A-H])$|^bis ([A-H])$/.exec(rw.n); if (m) return [m[1] || m[2]]; return /^[A-H]{2}$/.test(rw.n) ? rw.n.split('') : L4; };      // éléments d'une ligne : son sommet, les deux extrémités d'un segment, sinon toute la forme
    const edgesOf = P => P.map((p, i) => [p, P[(i + 1) % P.length]]), cenOf = P => [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length];
    finish('quad', tabs.quad, { edges: edgesOf(Q), cen: cenOf(Q), l0: 'Catégorie', l1: 'Sommet', letters: N, x: (rw, c) => c === 'Bissectrices' || c === 'Hauteurs, médianes' || rw.n === 'G' || rw.n === 'Forme', els: rw => elsOf(rw, N) });
    finish('scr', tabs.scr, { edges: [...edgesOf(SC), ...edgesOf(Q)], cen: cenOf(SC), l0: 'Catégorie', l1: 'Coin', letters: M, x: (rw, c) => c === 'Bissectrices' || ['Format', 'IoU', 'E'].includes(rw.n), els: rw => elsOf(rw, M) });

    /* --- VP à écran : on touche les points listés (liste complète ou réduite) dans les 3 vues.
       1 point : ses coordonnées · 2 : + distance (segment) · 3 : triangle · 4 : quadrilatère · 5 : pentagone (test).
       Lignes classées : points, côtés, diagonales, hauteurs, médianes, angles, surfaces et périmètre, cercles… (module shapes.js, option `more`).
       Filtres : formes (catégories + « Points (x,y,z) ») et élément ; « calculs plus exhaustifs » ajoute les lignes secondaires. --- */
    const inV = id => String(id)[0] === '#' || !vpe.short || SHORT_LIST.includes(id);                          // un point créé par ses coordonnées n'est jamais écarté par la liste réduite
    const ptOf = id => vpe.custom.find(c => c.id === id) || cat(id);
    vpe.pts = vpe.pts.filter(inV); vpe.custom = vpe.custom.filter(c => vpe.pts.includes(c.id)); if (vpe.editing && !vpe.custom.some(c => c.id === vpe.editing)) vpe.editing = null;                 // un point créé qu'on retire disparaît                                                                              // liste réduite : un point qui n'y figure plus est désélectionné
    const PV = vpe.pts.map(id => ptOf(id).p), nV = PV.length;
    const ORDER = ['Points (x,y,z)', 'Longueurs', 'Côtés', 'Diagonales', 'Hauteurs', 'Médianes', 'Angles', 'Angles avec les plans', 'Angles avec les axes', 'Bissectrices', 'Surfaces et périmètre', 'Cercles', 'Centres', 'Plan du triangle', 'Plan'];
    const SHOWN_CATS = ['Hauteurs', 'Médianes', 'Diagonales', 'Cercles'];                                      // leurs longueurs sont dans la liste de base de ce menu même quand shapes.js les range dans la liste exhaustive
    const shapeV = nV >= 2 ? VPShapes.analyze(PV, { sw: S.sw, sh: S.sh, more: true }) : null;
    const catV = rw => rw.kind === 'Coordonnées' && rw.n !== 'normale unitaire' ? 'Points (x,y,z)' : rw.cat === 'Surfaces' || /périmètre/.test(rw.n) ? 'Surfaces et périmètre' : rw.cat;
    const arcGeo = (V, A, B, reflex) => {                                                                      // angle au sommet V entre les directions V→A et V→B : les deux côtés (repères) et l'arc de l'un à l'autre, dans le plan de l'angle
      const sb = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], ln = a => Math.hypot(a[0], a[1], a[2]);
      const a = sb(A, V), b = sb(B, V), la = ln(a), lb = ln(b); if (la < 1e-9 || lb < 1e-9) return [];
      const u = a.map(x => x / la), w = b.map(x => x / lb), dt = Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2])), th = Math.acos(dt);
      let nr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const ln2 = ln(nr);
      const legs = [{ t: 'seg', a: V, b: A, ghost: true }, { t: 'seg', a: V, b: B, ghost: true }];
      if (ln2 < 1e-9) return legs;                                                                              // côtés alignés : pas d'arc
      nr = nr.map(x => x / ln2);
      const R = 0.25 * Math.min(la, lb), tn = [nr[1] * u[2] - nr[2] * u[1], nr[2] * u[0] - nr[0] * u[2], nr[0] * u[1] - nr[1] * u[0]], end = reflex ? -(2 * Math.PI - th) : th, path = [];
      for (let i = 0; i <= 20; i++) { const f = end * i / 20, cs = Math.cos(f), sn = Math.sin(f); path.push([0, 1, 2].map(k => V[k] + R * (u[k] * cs + tn[k] * sn))); }      // rotation de u autour de la normale : de A vers B (angle rentrant : par l'autre côté)
      return [...legs, { t: 'path', p: path, c: V }];
    };
    const angleGeo = (c, reflex) => { const n = PV.length; return arcGeo(PV[c], PV[(c + n - 1) % n], PV[(c + 1) % n], reflex); };
    const segAngleGeo = rw => {                                                                                // 2 points : angle du segment AB avec un plan, un axe ou la direction au sol, tracé en A (arc entre AB et sa projection / l'axe)
      const [A, B] = PV, d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(d[0], d[1], d[2]), plane = { 'avec l’écran': 1, 'avec le sol': 2, 'avec le plan vertical ⟂ écran': 0 }[rw.n], ax = { 'avec l’axe x': 0, 'avec l’axe y': 1, 'avec l’axe z': 2 }[rw.n];
      let g = [];
      if (plane !== undefined) g = arcGeo(A, B, [0, 1, 2].map(k => k === plane ? A[k] : B[k]));                    // projection de B sur le plan, ramenée à la hauteur / profondeur / latéral de A
      else if (ax !== undefined) g = arcGeo(A, B, [0, 1, 2].map(k => k === ax ? A[k] + Math.sign(d[k] || 1) * L : A[k]));
      else if (rw.n === 'direction au sol') g = arcGeo(A, [B[0], B[1], A[2]], [A[0], A[1] + Math.sign(d[1] || 1) * Math.hypot(d[0], d[1]), A[2]]);
      else return rw.geo;
      if (g.length < 3) return rw.geo;                                                                          // pas d'arc (angle nul ou projection réduite à un point)
      return [...rw.geo, ...(plane !== undefined || ax !== undefined ? [g[1], g[2]] : g)];                      // AB est déjà dans la ligne : on ne rajoute que l'autre côté et l'arc
    };
    const rawV = [
      ...PV.map((p, c) => ({ cat: 'Points (x,y,z)', n: LET[c], f: ptOf(vpe.pts[c]).label, val: { pt: p }, kind: 'Coordonnées', els: [LET[c]], geo: [{ t: 'pt', p }], x: false, cid: String(vpe.pts[c])[0] === '#' ? vpe.pts[c] : null })),
      ...(shapeV ? shapeV.rows.filter(rw => rw.cat !== 'Forme' && !(rw.cat === 'Points' && /^[A-I]$/.test(rw.n))).map(rw => ({ ...rw, geo: rw.cat === 'Angles' && /^∠[A-I]$/.test(rw.n) ? angleGeo(LET.indexOf(rw.n[1]), rw.val.v > 180.05) : nV === 2 && rw.kind === 'Angle' ? segAngleGeo(rw) : rw.geo, cat: catV(rw), x: rw.x && !(SHOWN_CATS.includes(rw.cat) && rw.kind === 'Longueur') })) : []),
    ];
    if (nV >= 3 && !rawV.some(rw => rw.cat === 'Cercles')) ['circonscrit', 'inscrit'].forEach(k => rawV.push({ cat: 'Cercles', n: 'cercle ' + k, f: 'aucun cercle trouvé pour ces points', val: { txt: nV === 4 ? 'impossible' : 'non disponible' }, kind: 'Autre', els: PV.map((p, i) => LET[i]), geo: [], x: false }));      // « Cercles » est toujours dans le filtre Formes
    const ordV = c => { const i = ORDER.indexOf(c); return i < 0 ? ORDER.length : i; };
    const sortV = list => list.map((rw, i) => ({ rw, i })).sort((a, b) => ordV(a.rw.cat) - ordV(b.rw.cat) || a.i - b.i).map(o => o.rw);
    const fullV = sortV(rawV), allV = sortV(rawV.filter(rw => vpe.full || !rw.x));                                // fullV : toutes les lignes possibles (pour lister les choix des filtres) ; allV : celles proposées
    const catsV = [...new Set(allV.map(rw => rw.cat))], elsV = [...new Set(allV.flatMap(rw => rw.els))].sort((x, y) => x.length - y.length || (x < y ? -1 : 1));
    if (vpe.focus && vpe.pts.length > vpe.focus.charCodeAt(0) - 65) { if (vpe.flt[0] && vpe.flt[0] !== 'Points (x,y,z)') vpe.flt[0] = ''; if (vpe.flt[1] && vpe.flt[1] !== vpe.focus) vpe.flt[1] = ''; }      // le point touché doit être visible dans la liste
    if (vpe.flt[0] && !catsV.includes(vpe.flt[0])) vpe.flt[0] = ''; if (vpe.flt[1] && !elsV.includes(vpe.flt[1])) vpe.flt[1] = '';
    if (vpe.flt[0] && vpe.flt[1] && !allV.some(rw => rw.cat === vpe.flt[0] && rw.els.includes(vpe.flt[1]))) vpe.flt[1] = '';      // les deux filtres ne donneraient aucune ligne : on lâche l'élément
    const tokV = list => [...new Set(list.flatMap(rw => rw.els))].sort((x, y) => x.length - y.length || (x < y ? -1 : 1));
    const catOpts = [...new Set(fullV.map(rw => rw.cat))].map(v => ({ v, off: !allV.some(rw => rw.cat === v && (!vpe.flt[1] || rw.els.includes(vpe.flt[1]))) }));      // grisé : n'apparaîtrait pas dans les résultats avec l'autre filtre et la liste actuelle
    const elOpts = tokV(fullV).map(v => ({ v, off: !allV.some(rw => rw.els.includes(v) && (!vpe.flt[0] || rw.cat === vpe.flt[0])) }));
    const fvV = val => val.pt ? `(${val.pt.map(v => fm(v, 2)).join(' ; ')})` : val.txt != null ? val.txt : ({ m: fm(val.v) + ' m', 'm²': fm(val.v) + ' m²', '°': fm(val.v, 1) + '°', '%': fm(val.v, 1) + ' %', mm: fm(val.v, 1) + ' mm' }[val.u] || fm(val.v));
    const toViewV = (g, kind, vw) => g.t === 'path' ? { k: 'path', p: g.p.map(proj[kind]), c: proj[kind](g.c), vw } : g.ghost ? { k: 'seg', a: proj[kind](g.a), b: proj[kind](g.b), vw, ghost: true } : g.t === 'pt' ? { k: 'pt', p: proj[kind](g.p), vw, ring: true } : g.t === 'seg' ? { k: 'seg', a: proj[kind](g.a), b: proj[kind](g.b), vw } : { k: 'poly', p: g.p.map(proj[kind]), fill: g.fill, vw };
    const skV = rw => `vpe|${rw.cat}|${rw.n}|${vpe.pts.join(',')}`;                                         // clé d'une ligne de VP à écran : dépend des points choisis
    const rowsV = []; let lastV = null;
    allV.filter(rw => (!vpe.flt[0] || rw.cat === vpe.flt[0]) && (!vpe.flt[1] || rw.els.includes(vpe.flt[1]))).forEach(rw => {
      if (rw.cat !== lastV) { rowsV.push({ sec: rw.cat }); lastV = rw.cat; }
      const m3 = rtMarks(rw.geo, nV >= 3 ? PV.map((p, i) => [p, PV[(i + 1) % nV]]) : [], nV ? [0, 1, 2].map(k => PV.reduce((a, p) => a + p[k], 0) / nV) : null);
      const geo = rw.geo.filter(g => !(g.t === 'path' && m3.some(m => Math.hypot(m.c[0] - g.c[0], m.c[1] - g.c[1], m.c[2] - g.c[2]) < 1e-9)));      // angle strictement droit : le carré remplace l'arc
      const row = L(rw.n, rw.f, fvV(rw.val), geo.flatMap(g => KINDS.map((k, vi) => toViewV(g, k, vi)))); if (rw.cid) row.cid = rw.cid; row.d = rowHelp('vpe', rw.cat, rw.n);
      row.rt = [];                                                                                          // angles droits (3D) projetés dans chaque vue ; on les omet quand un des côtés est vu presque de bout
      m3.forEach(m => KINDS.forEach((kd, vi) => {
        const f = proj[kd], c2 = f(m.c), d2 = w => { const q = f(m.c.map((x, k) => x + w[k])); return [q[0] - c2[0], q[1] - c2[1]]; }, u2 = d2(m.u), v2 = d2(m.v);
        if (Math.hypot(...u2) > 0.3 && Math.hypot(...v2) > 0.3) row.rt.push({ k: 'rt', c: c2, u: u2, v: v2, vw: vi, pi: m.pi });
      }));
      row.sk = skV(rw); rowsV.push(row);
      if (sim.checks.includes(row.sk)) sim.snap[row.sk] = { ...sim.snap[row.sk], hl: row.hl, rt: row.rt, t: row.t, val: row.val, x: !!rw.x, pts: vpe.pts.slice(), cust: vpe.custom.filter(c => vpe.pts.includes(c.id)).map(c => ({ ...c, p: c.p.slice() })) };      // ligne cochée : son dessin est gardé avec sa valeur
    });
    /* Lignes conservées : recalculées en direct avec leurs propres points (mémorisés avec la ligne), même s'ils ne sont plus sélectionnés. Le calcul est refait une fois par jeu de points
       en remplaçant provisoirement la sélection ; il met à jour la copie (valeur, dessin) de chaque ligne cochée de ce jeu. */
    if (!vpeProbe) {
      const groups = new Map();
      sim.checks.forEach(k => { const o = sim.snap[k]; if (k.startsWith('vpe|') && o && o.pts && !allV.some(rw => skV(rw) === k)) { const g = o.pts.join(','); const e = groups.get(g); if (!e) groups.set(g, { ...o, x: !!o.x }); else if (o.x) e.x = true; } });
      groups.forEach(o => {
        if (!o.pts.every(id => (o.cust || []).some(c => c.id === id) || cat(id))) return;               // un point du catalogue n'existe plus : on garde la dernière copie
        const save = { pts: vpe.pts, custom: vpe.custom, flt: vpe.flt, full: vpe.full, short: vpe.short, focus: vpe.focus, editing: vpe.editing, lastSig: vpe.lastSig, blink: vpe.blink };
        Object.assign(vpe, { pts: o.pts.slice(), custom: (o.cust || []).map(c => ({ ...c, p: c.p.slice() })), flt: ['', ''], full: !!o.x, short: false, focus: null, editing: null });
        vpeProbe = true;
        try { buildDetails(r); } catch (_) { /* copie conservée telle quelle */ } finally { vpeProbe = false; Object.assign(vpe, save); }
      });
    }
    const keptV = sim.checks.filter(k => k.startsWith('vpe|') && sim.snap[k] && !allV.some(rw => skV(rw) === k));      // lignes cochées de calculs précédents (autres points) : maintenues dans la liste, valeur figée, effaçables seulement en les décochant
    if (keptV.length) {
      rowsV.push({ sec: 'Lignes cochées conservées' });
      keptV.forEach(k => { const o = sim.snap[k]; rowsV.push({ ...L(o.name, o.f || '', o.val, o.hl || [], o.t), sk: k, kept: true, rt: o.rt || [], d: '' });      }); /* cliquée, elle se dessine dans les vues comme une ligne ordinaire */
    }
    if (vpe.focus) { const i = rowsV.findIndex(x => x.n === vpe.focus); if (i >= 0) selRow = i; vpe.focus = null; }
    const vpeView = kind => {
      const cands = [...CAT.filter(it => inV(it.id)), ...vpe.custom];                                          // les points créés par leurs coordonnées se touchent aussi (ils sont toujours sélectionnés)
      const b = boundsOf(baseOf(kind).concat(CAT.map(it => proj[kind](it.p)), PV.map(p => proj[kind](p))));
      b[3] += 0.2 * (b[3] - b[2]);                                                                              // marge en haut : place du nom du point survolé
      let title = null, ring = null, lastF = null;
      const near = (px, py, F) => cands.map((it, i) => { const a = proj[kind](it.p); return { it, i, d: Math.hypot(F.X(a[0]) - px, F.Y(a[1]) - py) }; })
        .filter(h => h.d <= 14).sort((a, c) => Math.round(a.d / 3) - Math.round(c.d / 3) || a.i - c.i);
      return {
        t: kind, b,
        draw: (svg, F) => {
          drawBase(svg, F, kind);
          const at = p => { const a = proj[kind](p); return [F.X(a[0]), F.Y(a[1])]; }, pp = PV.map(at);
          if (nV === 2) svg.append(el('line', { x1: pp[0][0], y1: pp[0][1], x2: pp[1][0], y2: pp[1][1], stroke: TRI, 'stroke-width': 3, 'stroke-linecap': 'round' }));
          else if (nV >= 3) svg.append(el('polygon', { points: pp.map(q => q.join(',')).join(' '), fill: TRI_FILL, stroke: TRI, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
          cands.filter(it => !vpe.pts.includes(it.id)).forEach(it => { const [x, y] = at(it.p), vp = it.id === 'vp'; svg.append(el('circle', { cx: x, cy: y, r: vp ? 5.2 : 4, fill: vp ? BEAM : 'rgba(205,184,245,.2)', stroke: vp ? BEAM : '#cdb8f5', 'stroke-width': 1.3, ...(vp ? { 'data-vp': 1 } : {}) })); });      // le VP : toujours bleu (fond et ligne), 30 % plus gros
          const groups = [];                                                                                     // points sélectionnés qui se superposent dans cette vue : étiquettes écartées
          pp.forEach((p, i) => { const g = groups.find(g2 => Math.hypot(g2.p[0] - p[0], g2.p[1] - p[1]) < 26); if (g) g.ids.push(i); else groups.push({ p, ids: [i] }); });
          groups.forEach(g => g.ids.forEach((i, k) => mark(svg, pp[i][0], pp[i][1], LET[i], ptOf(vpe.pts[i]).short, { dx: (k - (g.ids.length - 1) / 2) * 40, blue: vpe.pts[i] === 'vp' })));
          lastF = F; ring = null;
          title = el('text', { x: 10, y: 22, fill: '#c3ccd6', 'font-size': 13, 'font-weight': 800 }); svg.append(title);       // nom du point survolé
        },
        hover: (px, py, F) => { const h = near(px, py, F)[0]; if (title) title.textContent = h ? h.it.label : ''; },
        leave: () => { if (ring) { ring.remove(); ring = null; } if (title) title.textContent = ''; },
        hl: id => {                                                                                             // survol d'un item du menu : le point est entouré dans la vue et son nom apparaît en haut
          if (ring) { ring.remove(); ring = null; }
          const it = CAT.find(x => x.id === id); if (!it || !title || !lastF) return;
          title.textContent = it.label; const a = proj[kind](it.p);
          ring = el('circle', { cx: lastF.X(a[0]), cy: lastF.Y(a[1]), r: 11, fill: 'rgba(255,255,255,.12)', stroke: '#fff', 'stroke-width': 2, 'pointer-events': 'none' }); title.parentNode.append(ring);
        },
        pick: (px, py, F) => {                                                                                  // appui sur un point : le sélectionne ; s'il l'est déjà (et qu'il ne reste rien d'autre sous le doigt), le désélectionne
          const all = near(px, py, F); if (!all.length) return false;
          const d0 = Math.min(...all.map(h => h.d)), hit = all.filter(h => h.d <= d0 + 3);                      // seuls les points superposés au plus près du doigt comptent (un voisin plus loin ne passe pas devant)
          if (vpe.lock && vpe.pts.length) {                                                                     // verrouillé : pas de nouveau point ; un appui sur un point sélectionné montre ses coordonnées (appuis suivants : le point suivant s'il y en a plusieurs)
            const ls = hit.filter(h => vpe.pts.includes(h.it.id)).map(h => LET[vpe.pts.indexOf(h.it.id)]); if (!ls.length) return false;
            return { focus: ls[(ls.indexOf((rowsV[selRow] || {}).n) + 1) % ls.length] };
          }
          const fresh = hit.find(h => !vpe.pts.includes(h.it.id));
          if (fresh) { if (vpe.pts.length >= VMAX) return false; vpe.pts.push(fresh.it.id); return true; }
          const last = hit.map(h => vpe.pts.indexOf(h.it.id)).sort((a, c) => c - a)[0]; vpe.pts.splice(last, 1); return true;
        },
      };
    };
    const ddItems = GRP.map((g, gi) => { const its = CAT.filter(it => it.g === gi && inV(it.id)); return its.length ? `<div class="ddg">${g}</div>` + its.map(it => `<div class="ddi${vpe.pts.includes(it.id) ? ' off' : ''}" data-v="${it.id}">${it.label}</div>`).join('') : ''; }).join('');      // tous les points (liste réduite ou non) ; ceux déjà pris sont grisés
    const sig = vpe.pts.join(',') + '|' + vpe.custom.map(c => c.p.join(';')).join(',');      // les points ont changé (ajout, retrait, coordonnées) : le contour du cadenas se remet à clignoter, jusqu'à ce qu'on appuie dessus
    if (sig !== vpe.lastSig) { vpe.lastSig = sig; vpe.blink = nV > 0; }
    const locked = vpe.lock && nV > 0, nLines = rowsV.filter(x => !x.sec && !x.kept).length;
    tabs.vpe = {
      all: fullV.map(rw => ({ sk: skV(rw), name: rw.n, val: fvV(rw.val), f: rw.f, cat: rw.cat })),
      label: 'VP à écran', views: KINDS.map(vpeView), rows: rowsV, legendName: shapeV ? shapeV.name : 'point',      // nom affiché dans la légende : la forme (2 points ou plus), sinon « point »
      below: `<div class="vchips">${nV ? vpe.pts.map((id, c) => `<button class="vchip" data-i="${c}" title="${locked ? 'Voir ses coordonnées' : 'Retirer ce point'}"><b>${LET[c]}</b> ${ptOf(id).short}${locked ? '' : ' ✕'}</button>`).join('') : ''}<span class="vhint">${nV ? `${nV} point${nV > 1 ? 's' : ''} sur ${VMAX} maximum` : 'Toucher un point dans l’une des vues'}</span><div class="dd vdd"><button class="ddb" type="button"${locked || nV >= VMAX ? ' disabled' : ''} title="Choisir un point dans la liste">Choisir un point</button><div class="ddl" hidden>${ddItems}</div></div><button class="vaddBtn${vpe.adding ? ' on' : ''}" id="vAdd"${locked || nV >= VMAX ? ' disabled' : ''} title="Créer un point à partir de ses coordonnées x, y, z" aria-label="Créer un point par ses coordonnées">+ x, y, z</button>${vpe.adding && !locked && nV < VMAX ? `<span class="vform">${['x', 'y', 'z'].map((a, k) => `<input id="v${a.toUpperCase()}" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="${a}" aria-label="${a}" value="${vpe.draft[k]}">`).join('')}<button class="hbtn vok" id="vOk">Ajouter</button></span>` : ''}<button class="vlockBtn${locked ? ' on' : ''}${vpe.blink && nV > 0 && !locked ? ' blink' : ''}" id="vLock"${nV ? '' : ' disabled'} aria-pressed="${locked}" title="${locked ? 'Points verrouillés : un appui sur un point affiche ses coordonnées (cliquer pour déverrouiller)' : 'Verrouiller les points sélectionnés'}" aria-label="Verrouiller les points sélectionnés"><svg viewBox="0 0 24 24">${locked ? '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>' : '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>'}</svg></button><button class="vlockBtn" id="vReset"${nV ? '' : ' disabled'} data-tip="Réinitialiser" aria-label="Réinitialiser"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4.5V9h4.5"/></svg></button><span class="vgrow"></span><label class="vchk"><input type="checkbox" id="vShort"${vpe.short ? ' checked' : ''}${locked ? ' disabled' : ''}><span>Liste réduite</span></label></div>
        ${shapeV ? `<div class="vshape"><b>${shapeV.name}</b>${shapeV.warn.map(w => `<span class="twarn">⚠ ${w}</span>`).join('')}</div>` : ''}
        <div class="tflt">${selV('vFrm', 'Formes', catOpts, vpe.flt[0])}${selV('vEl', 'Élément', elOpts, vpe.flt[1])}<label class="chk"><input type="checkbox" id="vFull"${vpe.full ? ' checked' : ''}><span>calculs plus exhaustifs</span></label><span class="vcount">${nLines} ligne${nLines > 1 ? 's' : ''} de calcul</span></div>`,
    };

    /* --- Pixels --- */
    const pxRow = (key, f, vals, _u, hl, t, tail = '', two = false, unit = 'px') => {                 // ligne en pixels : valeur abrégée (3 M, 743 k) ou pleine après un appui sur la valeur
      const full = pxFull.has(key), fmtv = n => full ? fi(n) : pxShort(n);
      const txt = (two ? `${fmtv(vals[0])} × ${fmtv(vals[1])}` : fmtv(vals[0])) + ' ' + unit + tail;
      return { ...L(key, f, txt, hl, t), pxk: key };
    };
    const RW = v.resW, RH = v.resH;
    const sides = ['gauche', 'droite', 'haut', 'bas'];
    const usefulHl = r.ov.inter.length > 2 ? [poly(r.ov.inter)] : [];                                     // les pixels utiles : la partie du faisceau qui recouvre l'écran
    const zoneHl = (() => {                                                                              // boîte englobante de l'image utile (rectangle dans le panneau) ramenée dans le plan de l'écran : un quadrilatère, comme le faisceau
      const U = r.px.usefulPoly; if (!U || U.length < 3) return [];
      const src = Q.map(p => r.panelOf(p)), A = [], bv = [];                                              // homographie panneau → écran, d'après les 4 coins du faisceau
      src.forEach(([x, y], i) => { const [X, Y] = Q[i]; A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); bv.push(X); A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); bv.push(Y); });
      const n = 8, M = A.map((row, i) => [...row, bv[i]]);
      for (let c = 0; c < n; c++) {
        let piv = c; for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
        if (Math.abs(M[piv][c]) < 1e-12) return []; [M[c], M[piv]] = [M[piv], M[c]];
        for (let i = 0; i < n; i++) if (i !== c) { const f = M[i][c] / M[c][c]; for (let k = c; k <= n; k++) M[i][k] -= f * M[c][k]; }
      }
      const h = M.map((row, i) => row[n] / row[i]), map = ([x, y]) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
      const xs = U.map(p => p[0]), ys = U.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return [poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(map))];
    })();
    const lostHl = q.area - r.ov.ai < 1e-6 ? [] : [r.ov.inter.length > 2 ? { k: 'diff', p: Q, hole: r.ov.inter, vw: 0, alpha: 0.55, holeStroke: true } : poly(Q)];      // pixels perdus : les surfaces du faisceau hors de l'écran (bord de l'écran en pointillé, fond plus marqué)
    tabs.px = {
      label: 'Pixels', views: [{
        b: faceBounds(), draw: (svg, F) => {                                                          // même dessin que la vue de face : faisceau (perdu en rouge, utile en vert), écran, coins A–D
          svg.append(el('polygon', { points: pts(F, Q), fill: 'rgba(255,93,93,.35)' }));
          if (r.ov.inter.length > 2) svg.append(el('polygon', { points: pts(F, r.ov.inter), fill: 'rgba(62,207,142,.6)', stroke: USEFUL, 'stroke-width': 1.5 }));
          svg.append(el('rect', { x: F.X(-S.sw / 2), y: F.Y(S.sh), width: F.k * S.sw, height: F.k * S.sh, fill: 'none', stroke: SCREEN, 'stroke-width': 1.5 }));
          svg.append(el('polygon', { points: pts(F, Q), fill: 'none', stroke: BEAM, class: 'bglow', 'stroke-width': 1.5 }));
          corners(svg, F, Q, N, BEAM);
        }
      }],
      rows: [
        { sec: 'Panneau du projecteur' },
        L('Rés.', v.res, `${RW} × ${RH}`, [], 'Résolution du panneau'),
        pxRow('Total', 'largeur × hauteur (= le faisceau)', [r.px.total], ([n]) => n, [poly(Q)], 'Pixels du panneau (= le faisceau)'),
        { sec: 'Bilan' },
        pxRow('Utiles', 'pixels projetés dans l’écran', [r.px.useful], ([n]) => n, r.ov.inter.length > 2 ? [poly(r.ov.inter)] : [], 'Pixels utiles', ` · ${fm(r.px.usefulPct, 1)} %`),
        pxRow('Perdus', 'total − utiles', [r.px.lost], ([n]) => n, lostHl, 'Pixels perdus', ` · ${fm(r.px.lostPct, 1)} %`),
        ...sides.map(s => pxRow('↳ ' + s, 'perdus au-delà du bord ' + s, [r.px.byside[s].px], ([n]) => n, r.px.byside[s].poly.length > 2 ? [poly(r.px.byside[s].poly)] : [], 'Pixels perdus : bord ' + s)),
        { sec: 'Image utile' },
        { ...L('Zone', 'boîte englobante dans le panneau', `${fi(r.px.bbox.w)} × ${fi(r.px.bbox.h)} px`, zoneHl, 'Zone utile dans le panneau (boîte englobante)'), pxk: 'Zone', sub: `= ${(pxFull.has('Zone') ? fi : pxShort)(Math.round(r.px.bbox.w) * Math.round(r.px.bbox.h))} px` },      // sub : 2e ligne du libellé dans le graphique (le résultat de la multiplication)      // dimensions : jamais abrégées
        pxRow('Densité', 'pixels utiles / aire commune', [r.px.perM2], ([n]) => n, usefulHl, 'Densité de pixels', '', false, 'px/m²'),
        L('Pixel', '√(aire commune / pixels utiles)', fm(r.px.pixelMm) + ' mm', usefulHl, 'Taille d’un pixel sur l’écran'),
      ]
    };
    tabs.px.all = tabs.px.rows.filter(rw => !rw.sec).map(rw => ({ sk: 'px|' + rw.n, name: rw.n, val: rw.val }));
    tabs.px.rows.forEach(rw => { if (!rw.sec) { rw.sk = 'px|' + rw.n; rw.d = rowHelp('px', '', rw.n); rw.rt = rtMarks(rw.hl || [], [...edgesOf(SC), ...edgesOf(Q)], cenOf(SC)).map(m => ({ k: 'rt', vw: 0, ...m })); } });
    return { quad: tabs.quad, scr: tabs.scr, vpe: tabs.vpe, px: tabs.px };
  }

  function renderDetails(r) {
    const body = $('dbody'), tabsEl = $('dtabs');
    scrollKeep = body.scrollTop;
    const note = '';
    if (!r || !r.valid) { body.innerHTML = '<p class="sub">Faisceau hors écran : aucun calcul.</p>'; return; }
    const tabs = buildDetails(r), T = tabs[tab] || tabs.quad;
    renderSim(tabs);
    tabsEl.querySelectorAll('button[data-t]').forEach(x => x.remove());
    tabsEl.append(...Object.entries(tabs).map(([k, t]) => { const x = document.createElement('button'); x.dataset.t = k; x.className = k === tab ? 'on' : ''; x.textContent = t.label; return x; }));
    tabsEl.onclick = e => {
      const b = e.target.closest('button[data-t]'); if (b) {
        if (b.dataset.t === tab) { const R = tabs[tab].rows, ok = R.map((x, i) => x.hl && x.hl.length ? i : -1).filter(i => i >= 0); selRow = ok[(ok.indexOf(selRow) + 1) % ok.length]; renderDetails(r); scrollToRow(selRow); return; }
        tab = b.dataset.t; selRow = 1; renderDetails(G.compute(vpOf(), S)); $('dbody').scrollTop = 0;
      }
    };
    const rows = T.rows;
    if (!rows[selRow] || rows[selRow].sec) selRow = rows.findIndex(x => !x.sec);
    const stepTab = tab === 'quad' || tab === 'scr';                   // Faisceau et Écran : deux boutons ronds verts centrés sous le graphique font défiler les lignes de calcul (↑ précédente, ↓ suivante)
    const arrows = stepTab || tab === 'vpe' || tab === 'px';                           // les boutons ↑ ↓ existent aussi dans VP à écran (sans les autres comportements propres à Faisceau / Écran)
    const arrow = d => `<svg class="ic" viewBox="0 0 24 24"><path d="${d}"/></svg>`;
    const stepBtns = arrows ? `<div class="tstep"><button class="roundGreen roundSel" id="rowPrev" title="Ligne de calcul précédente" aria-label="Ligne de calcul précédente">${arrow('M6 15l6-6 6 6')}</button><button class="roundGreen roundSel" id="rowNext" title="Ligne de calcul suivante" aria-label="Ligne de calcul suivante">${arrow('M6 9l6 6 6-6')}</button></div>` : '';
    const legend = `<div class="tleg${arrows ? ' step' : ''}${tab === 'vpe' ? ' wide' : ''}">${tab === 'px' ? '<span><i style="background:#3ecf8e"></i>pixels utiles</span><span><i style="background:#ff5d5d"></i>pixels perdus</span>' + (() => { const n = rows.filter(x => !x.sec).length; return `<span class="vcount">${n} ligne${n > 1 ? 's' : ''} de calcul</span>`; })() : `<span><i style="background:${SCREEN}"></i>écran</span><span><i style="background:${BEAM}"></i>faisceau</span>`}${tab === 'vpe' ? `<span><i style="background:${TRI}"></i>${T.legendName}</span>` : ''}${stepBtns}</div>`;
    const dispHtml = kind => {                                         // VP à écran : zoom · déplacement · Fit, en haut à droite de chaque vue
      const D = dpv[kind], on = d => D.mode === d ? ' class="on"' : '', ar = '<span class="arws"><i></i><i></i><i></i><i></i></span>';
      return `<div class="dispSel dispTop dpv" data-v="${kind}"><div class="r2"><button data-d="zoom"${on('zoom')} aria-label="Zoom de l’affichage" title="Zoom : appuyer et glisser vers le haut (agrandir) ou le bas (reculer)"><svg class="ic" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3 21 21M7.5 10.5h6M10.5 7.5v6"/></svg>${ar}</button><button data-d="pan"${on('pan')} aria-label="Déplacer l’affichage" title="Déplacement : appuyer et glisser pour voyager latéralement et verticalement"><svg class="ic" viewBox="0 0 24 24"><rect x="8" y="8" width="8" height="8" rx="1.5"/><path d="M12 1.5v4M10.3 3.2 12 1.5l1.7 1.7M12 22.5v-4M10.3 20.8 12 22.5l1.7-1.7M1.5 12h4M3.2 10.3 1.5 12l1.7 1.7M22.5 12h-4M20.8 10.3 22.5 12l-1.7 1.7"/></svg>${ar}</button><button data-d="auto"${on('auto')} aria-label="Cadrage automatique" title="Fit : cadre toute la vue">Fit</button></div></div>`;
    };
    const figsHtml = `<div class="figs">${T.views.map(v => tab === 'vpe' ? `<div class="vwin"><svg></svg>${dispHtml(v.t)}</div>` : '<svg></svg>').join('')}${legend}</div>`;
    const nmHtml = x => {                                                // nom donné à une valeur cochée : zone à remplir + validation, ou nom + modification
      if (!simCfg.on || !x.sk || !sim.checks.includes(x.sk)) return '';
      if (sim.editing === x.sk) return `<span class="nm"><input class="nmIn" maxlength="40" placeholder="nom" aria-label="Nom dans les simulations" value="${esc(sim.draft)}"><i class="nmOk" role="button" title="Valider le nom">${ic('ok')}</i></span>`;
      const nm = sim.names[x.sk]; return `<span class="nm">${nm ? `<span class="nmTxt">${esc(nm)}</span>` : ''}<i class="nmEd" role="button" title="${nm ? 'Modifier le nom' : 'Donner un nom'}">${ic('edit')}</i></span>`;
    };
    body.innerHTML = note + `<div class="stk">${figsHtml}${T.below || ''}</div>` +      // VP à écran : vues, points, forme et filtres restent figés en haut quand la liste défile
     
      rows.map((x, i) => x.sec ? `<div class="sec">${x.sec}</div>` :
        tab === 'vpe' && x.cid && vpe.editing === x.cid ? `<div class="m medit sel" data-i="${i}"><span class="n">${x.n}</span><span class="f">${x.f}</span><span class="vedit">${['x', 'y', 'z'].map((a, k) => `<input id="e${a.toUpperCase()}" type="text" inputmode="text" autocomplete="off" spellcheck="false" aria-label="${a}" placeholder="${a}" value="${vpe.edraft[k]}">`).join('')}<button class="hbtn vok" id="eOk">OK</button><button class="hbtn vok" id="eCancel" aria-label="Annuler">✕</button></span></div>` :
        `<div role="button" tabindex="0" class="m ${i === selRow ? 'sel' : ''}" data-i="${i}"${x.d ? ` data-d="${x.d.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"` : ''}>${!simCfg.on ? '' : x.sk ? `<span class="ck${sim.checks.includes(x.sk) ? (sim.checks.indexOf(x.sk) < sim.FIRST ? ' on' : ' on c2') : ''}" role="checkbox" aria-checked="${sim.checks.includes(x.sk)}" data-tip="afficher la valeur dans les simulations"></span>` : '<span></span>'}<span class="n">${x.n}</span><span class="f">${x.f}${x.d ? '<i class="ib" aria-hidden="true">i</i>' : ''}${nmHtml(x)}</span><b${x.pxk ? ` class="pxv" title="${pxFull.has(x.pxk) ? 'Appuyer pour abréger' : 'Appuyer pour la valeur pleine'}"` : ''}>${x.val}</b></div>`).join('');
    body.onclick = e => {
      const nmEl = e.target.closest('.nm');
      if (nmEl) {                                                         // nom : valider / modifier (la ligne n'est pas sélectionnée)
        const k = rows[+nmEl.closest('.m').dataset.i].sk;
        if (e.target.closest('.nmOk')) { const v = sim.draft.trim(); if (v) sim.names[k] = v; else delete sim.names[k]; sim.editing = null; simSave(); renderSimHead(); renderDetails(r); }
        else if (e.target.closest('.nmEd')) { sim.editing = k; sim.draft = sim.names[k] || ''; sim.focusNm = true; renderDetails(r); }
        return;
      }
      const ck = e.target.closest('.ck');
      if (ck) {                                                           // case à cocher : valeur affichée dans les simulations (3 au plus, les autres cases se grisent)
        const k = rows[+ck.closest('.m').dataset.i].sk, at = sim.checks.indexOf(k);
        if (at >= 0) { sim.checks.splice(at, 1); delete sim.names[k]; if (sim.editing === k) sim.editing = null; } else { sim.checks.push(k); sim.editing = k; sim.draft = ''; sim.focusNm = true; }      // cochée : on peut lui donner un nom
        simSave(); renderSimHead(); renderDetails(r); return;
      }
      const b = e.target.closest('.m'); if (!b || e.target.closest('.medit')) return;                    // un appui dans les champs de modification ne redessine pas
      if (+b.dataset.i === selRow && rows[selRow] && rows[selRow].d && !e.target.closest('b.pxv')) { if (tipWas === b) { tipWas = null; return; } showTipNow(b); return; }      // un nouvel appui sur une ligne dont la vignette est ouverte la referme      // ligne déjà active : un nouvel appui ouvre sa vignette (le « i »)
      selRow = +b.dataset.i;
      if (rows[selRow] && rows[selRow].pxk && e.target.closest('b')) { pxFull.has(rows[selRow].pxk) ? pxFull.delete(rows[selRow].pxk) : pxFull.add(rows[selRow].pxk); }      // Pixels : appui sur la valeur = valeur pleine (ou retour à l'abrégée)
      if (tab === 'vpe' && rows[selRow] && rows[selRow].cid && vpe.editing !== rows[selRow].cid) startEdit(rows[selRow].cid);      // ligne d'un point créé : ses coordonnées deviennent modifiables
      renderDetails(r); retip();
    };
    const stepRow = d => () => { const ix = rows.map((x, i) => x.sec ? -1 : i).filter(i => i >= 0); if (!ix.length) return; selRow = ix[(ix.indexOf(selRow) + d + ix.length) % ix.length]; renderDetails(r); scrollToRow(selRow); retip(); };      // ligne de calcul suivante (d = 1) ou précédente (d = −1)
    const nextRow = stepRow(1);
    if (arrows) { $('rowNext').onclick = nextRow; $('rowPrev').onclick = stepRow(-1); }
    if (dfl[tab]) {                                                    // Faisceau, Écran : filtres et « calculs plus exhaustifs »
      const D = dfl[tab], again3 = () => { selRow = -1; renderDetails(r); };
      [['fltA', 0], ['fltB', 1]].forEach(([id, k]) => { const f = $(id); if (f) f.onchange = () => { D.flt[k] = f.value; again3(); }; });
      const ff = $('fltFull'); if (ff) ff.onchange = () => { D.full = ff.checked; again3(); };
    }
    if (tab === 'vpe') {                                               // onglet VP à écran : puces des points, réinitialisation, cases à cocher, filtres
      const again2 = () => { selRow = -1; renderDetails(r); };
      body.querySelectorAll('.vchip').forEach(ch => ch.onclick = () => {
        if (vpe.lock) { vpe.focus = 'ABCDE'[+ch.dataset.i]; const pid = vpe.pts[+ch.dataset.i]; if (String(pid)[0] === '#') startEdit(pid); again2(); scrollToRow(selRow); return; }      // verrouillé : la puce montre les coordonnées du point
        vpe.pts.splice(+ch.dataset.i, 1); again2();
      });
      const rs = $('vReset'); if (rs) rs.onclick = () => { vpe.pts = []; vpe.custom = []; vpe.flt = ['', '']; vpe.lock = false; vpe.adding = false; vpe.editing = null; again2(); };
      const lk = $('vLock'); if (lk) lk.onclick = () => { vpe.lock = !vpe.lock; vpe.blink = false; renderDetails(r); };
      const closeDD = () => body.querySelectorAll('.vdd .ddl').forEach(l => { l.hidden = true; });
      body.onpointerdown = e => { if (!e.target.closest('.dd')) closeDD(); };
      body.querySelectorAll('.vdd').forEach(dd => {
        const list = dd.querySelector('.ddl'), views = T.views, ddb = dd.querySelector('.ddb');
        ddb.onclick = e => { e.stopPropagation(); const op = list.hidden; closeDD(); list.hidden = !op; };
        list.querySelectorAll('.ddi').forEach(it => {
          it.onmouseenter = () => views.forEach(V => V.hl && V.hl(it.dataset.v));                              // survol : le point est mis en surbrillance dans les 3 vues
          it.onmouseleave = () => views.forEach(V => V.leave && V.leave());
          it.onclick = e => { e.stopPropagation(); if (it.classList.contains('off') || vpe.lock || vpe.pts.length >= VMAX) return; vpe.pts.push(it.dataset.v); again2(); };
        });
      });
      const parse3 = v => { const t = String(v).trim().replace(/\s/g, '').replace(',', '.').replace('−', '-'); return t === '' ? 0 : /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN; };
      if ($('eX')) {                                                      // modification des coordonnées d'un point créé
        const commit = () => {
          const p = vpe.edraft.map(parse3), bad = p.map(v => !isFinite(v));
          if (bad.some(Boolean)) { ['eX', 'eY', 'eZ'].forEach((id, k) => $(id).classList.toggle('bad', bad[k])); return; }
          const c = vpe.custom.find(q => q.id === vpe.editing); if (c) { c.p = p; c.label = `Coordonnées (${p.map(v => fm(v, 2)).join(' ; ')})`; vpe.focus = 'ABCDE'[vpe.pts.indexOf(c.id)]; }
          vpe.editing = null; selRow = -1; renderDetails(r);
          if (c) cfgAdopt(c.id);      // les lignes cochées de la config active qui utilisent ce point reprennent ses nouvelles coordonnées
        };
        ['eX', 'eY', 'eZ'].forEach((id, k) => { const i = $(id); i.oninput = () => { vpe.edraft[k] = i.value; i.classList.remove('bad'); }; i.onkeydown = e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') { vpe.editing = null; renderDetails(r); } }; i.onfocus = () => i.select(); });
        $('eOk').onclick = commit; $('eCancel').onclick = () => { vpe.editing = null; renderDetails(r); };
        if (vpe.editNew) { vpe.editNew = false; $('eX').focus(); }
      }
      const ad = $('vAdd'); if (ad) ad.onclick = () => { vpe.adding = !vpe.adding; renderDetails(r); if (vpe.adding && $('vX')) $('vX').focus(); };
      const num3 = v => { const t = String(v).trim().replace(/\s/g, '').replace(',', '.').replace('−', '-'); return t === '' ? 0 : /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN; };      // champ vide = 0 ; texte invalide = NaN
      const addPt = () => {
        if (vpe.draft.every(v => !String(v).trim())) { ['vX', 'vY', 'vZ'].forEach(id => $(id) && $(id).classList.add('bad')); return; }       // rien saisi
        const p = vpe.draft.map(num3), bad = p.map(v => !isFinite(v));
        if (bad.some(Boolean)) { ['vX', 'vY', 'vZ'].forEach((id, k) => $(id) && $(id).classList.toggle('bad', bad[k])); return; }
        const id = '#' + (++vpe.seq); vpe.custom.push({ id, p, label: `Coordonnées (${p.map(v => fm(v, 2)).join(' ; ')})`, short: 'xyz' }); vpe.pts.push(id);
        vpe.draft = ['', '', '']; vpe.adding = false; vpe.focus = 'ABCDE'[vpe.pts.length - 1]; selRow = -1; renderDetails(r); scrollToRow(selRow);       // le nouveau point est sélectionné et sa ligne de coordonnées montrée
      };
      ['vX', 'vY', 'vZ'].forEach((id, k) => { const i = $(id); if (!i) return; i.oninput = () => { vpe.draft[k] = i.value; i.classList.remove('bad'); }; i.onkeydown = e => { if (e.key === 'Enter') addPt(); else if (e.key === 'Escape') { vpe.adding = false; renderDetails(r); } }; });
      const okb = $('vOk'); if (okb) okb.onclick = addPt;
      const sh = $('vShort'); if (sh) sh.onchange = () => { vpe.short = sh.checked; again2(); };
      const fu = $('vFull'); if (fu) fu.onchange = () => { vpe.full = fu.checked; again2(); };
      [['vFrm', 0], ['vEl', 1]].forEach(([id, k]) => { const f = $(id); if (f) f.onchange = () => { vpe.flt[k] = f.value; again2(); }; });
    }
    const ni = body.querySelector('.nmIn');                              // zone du nom d'une valeur cochée
    if (ni) {
      const k = rows[+ni.closest('.m').dataset.i].sk;
      ni.oninput = () => { sim.draft = ni.value; };
      ni.onkeydown = e => {
        e.stopPropagation();
        if (e.key === 'Enter') { const v = sim.draft.trim(); if (v) sim.names[k] = v; else delete sim.names[k]; sim.editing = null; simSave(); renderSimHead(); renderDetails(r); }
        else if (e.key === 'Escape') { sim.editing = null; renderDetails(r); }
      };
      if (sim.focusNm) { sim.focusNm = false; ni.focus(); }
    }
    const frames = [];
    body.querySelectorAll('.figs svg:not(.ic)').forEach((svg, vi) => {
      const V = T.views[vi], [x0, x1, y0, y1] = V.b, Dp = tab === 'vpe' ? dpv[V.t] : null;
      const F = Dp && Dp.manual ? frame(svg, ...manualBounds(svg, Dp), 0) : frame(svg, x0, x1, y0, y1, Math.max(x1 - x0, y1 - y0) * 0.08 + 0.05, false, stepTab || tab === 'px' ? 44 : undefined);      // VP à écran : vue manuelle (zoom / déplacement) ou cadrage automatique
      svg._F = F;      // Faisceau, Écran : place en haut pour l'intitulé
      frames[vi] = F; V.draw(svg, F);
      if (V.t) svg.append(el('text', { x: 8, y: F.H - 8, fill: '#8b98a6', 'font-size': 10.5 }, { face: 'vue de face', side: 'vue de côté', top: 'vue de dessus' }[V.t] || V.t));
      const hlOf = rw => rw.one ? [rw.hl[lastPick && lastPick.row === selRow ? lastPick.i : 0]] : (rw.hl || []);      // trait touché pour une ligne « one » (par défaut le 1er)
      if (rows[selRow]) hlOf(rows[selRow]).filter(p => (p.vw || 0) === vi).forEach(p => drawPrim(svg, F, p));
      if (rows[selRow] && rows[selRow].rt) { const pk = rows[selRow].one ? (lastPick && lastPick.row === selRow ? lastPick.i : 0) : -1; rows[selRow].rt.filter(m => (m.vw || 0) === vi && (pk < 0 || m.pi === pk)).forEach(m => drawPrim(svg, F, m)); }      // angles droits de la ligne (pour une ligne « one » : ceux du trait touché)
      const shown = ((stepTab || tab === 'vpe' || tab === 'px') && rows[selRow] ? hlOf(rows[selRow]).filter(p => (p.vw || 0) === vi) : []).filter(p => !p.ghost && !p.nolabel && p.k !== 'rt');      // les traits de repère ne portent pas de valeur
      (stepTab ? shown : shown.slice(0, 1)).forEach(p => {      // valeur de la ligne sélectionnée, en orange, au niveau de la cote / de l'angle / de la surface
        let txt = String(rows[selRow].val).replace(/<[^>]*>/g, ''); if (tab === 'px') txt = txt.split(' · ')[0];      // Pixels : seulement le nombre de pixels dans le graphique (le pourcentage reste dans la liste)
        let x, y, anchor = 'middle';
        if (p.k === 'seg') {
          const x1 = F.X(p.a[0]), y1 = F.Y(p.a[1]), x2 = F.X(p.b[0]), y2 = F.Y(p.b[1]), dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
          x = (x1 + x2) / 2; y = (y1 + y2) / 2;
          if (l > 8) { let nx2 = -dy / l, ny2 = dx / l; if (ny2 > 0) { nx2 = -nx2; ny2 = -ny2; } x += nx2 * 13; y += ny2 * 13; } else { x += 34; y += 4; }      // à côté du trait (au-dessus), ou à côté du point si le trait est réduit à un point dans cette vue
        } else if (p.k === 'pt') { if (tab === 'vpe') return; x = F.X(p.p[0]) + 14; y = F.Y(p.p[1]) + 4; anchor = 'start'; }      // à droite du point, texte commençant après le disque : il ne le recouvre plus      // VP à écran : les coordonnées restent dans la liste, pas dans le graphique                                    // à droite du point (la lettre est au-dessus, le nom en dessous)
        else if (p.k === 'poly') {                                                                                    // surface ou cercle : au centre
          x = F.X(p.p.reduce((a, q) => a + q[0], 0) / p.p.length); y = F.Y(p.p.reduce((a, q) => a + q[1], 0) / p.p.length);
          if (tab === 'px') {                                                                                         // Pixels : bande trop étroite pour le texte → le texte passe à côté, du côté où il y a de la place
            const xs = p.p.map(q => F.X(q[0])), x0 = Math.min(...xs), x1 = Math.max(...xs);
            const ys = p.p.map(q => F.Y(q[1])), y0 = Math.min(...ys), y1 = Math.max(...ys);
            if (x1 - x0 < txt.length * 7.6 + 8) { if (x < F.W / 2) { x = x0 - 8; anchor = 'end'; } else { x = x1 + 8; anchor = 'start'; } y += 4; }
            else if (y1 - y0 < 20) y = y < F.H / 2 ? y0 - 7 : y1 + 16;                                              // bande trop basse : le texte passe au-dessus (bande du haut) ou au-dessous (bande du bas)
          }
        }
        else if (p.k === 'path') {                                                                                    // arc d'angle : au milieu de l'arc, côté extérieur
          const P = p.p.map(q => [F.X(q[0]), F.Y(q[1])]), mid = P[Math.floor(P.length / 2)], c = [F.X(p.c[0]), F.Y(p.c[1])], d = Math.hypot(mid[0] - c[0], mid[1] - c[1]) || 1;
          x = mid[0] + (mid[0] - c[0]) / d * 30; y = mid[1] + (mid[1] - c[1]) / d * 16 + 4;
        }
        else if (p.k === 'diff') {                                                                                    // zone trouée : le point de la zone le plus éloigné des bords
          const P = p.p.map(q => [F.X(q[0]), F.Y(q[1])]), H = p.hole.map(q => [F.X(q[0]), F.Y(q[1])]), xs = P.map(q => q[0]), ys = P.map(q => q[1]);
          let best = -1; x = F.X(p.p[0][0]); y = F.Y(p.p[0][1]);
          for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
            const c = [Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * i / 24, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * j / 24];
            if (!inPoly(c, P) || inPoly(c, H)) continue;
            const d = Math.min(polyDist(c, P), polyDist(c, H)); if (d > best) { best = d; x = c[0]; y = c[1] + 4; }
          }
          if (best * 2 < txt.length * 7.4) { x = (Math.min(...xs) + Math.max(...xs)) / 2; y = Math.max(...ys) + 20; }      // couronne trop fine pour le texte : il passe sous la forme
        }
        else if (p.k === 'arc' || p.k === 'bis') {                                                                  // angle : à côté de l'arc ; bissectrice : au bout du trait
          const { m } = span(p), c = Math.cos(m), sn = Math.sin(m), len = p.k === 'bis' ? BIS_LEN : 1;
          x = F.X(p.c[0] + len * p.r * c) + 34 * c; y = F.Y(p.c[1] + len * p.r * sn) - 12 * sn + 4;
        }
        else return;
        svg.append(el('text', { x, y, 'text-anchor': anchor, fill: '#f7a414', 'font-size': 13, 'font-weight': 800, stroke: '#0f1216', 'stroke-width': 3.5, 'paint-order': 'stroke' }, txt));
        if (rows[selRow].sub) svg.append(el('text', { x, y: y + 16, 'text-anchor': anchor, fill: '#f7a414', 'font-size': 12, 'font-weight': 700, stroke: '#0f1216', 'stroke-width': 3.5, 'paint-order': 'stroke' }, rows[selRow].sub));      // sous le libellé
      });
      if ((stepTab || tab === 'px') && rows[selRow]) {                                                                                  // intitulé de l'élément calculé, en jaune, en haut du graphique (avec sa valeur s'il n'a pas de zone dessinée)
        const rw = rows[selRow];
        svg.append(el('text', { x: 10, y: 22, fill: HL, 'font-size': 13, 'font-weight': 800 }, (rw.t || rw.n) + (shown.length ? '' : ' : ' + String(rw.val).replace(/<[^>]*>/g, ''))));
      }
      if (V.hover) { svg.onpointermove = ev => { const rc = svg.getBoundingClientRect(); V.hover(ev.clientX - rc.left, ev.clientY - rc.top, F); }; svg.onpointerleave = () => V.leave(); }      // VP à écran : nom du point survolé
      svg.onclick = ev => {
        const rc = svg.getBoundingClientRect(), mx = ev.clientX - rc.left, my = ev.clientY - rc.top;
        const pk = V.pick && V.pick(mx, my, F);
        if (pk) { vpe.focus = pk.focus || null; if (pk.focus) { const pid = vpe.pts['ABCDE'.indexOf(pk.focus)]; if (String(pid)[0] === '#') startEdit(pid); } selRow = -1; renderDetails(r); if (pk.focus) scrollToRow(selRow); retip(); return; }      // VP à écran : appui sur un point = (dé)sélection ; ailleurs, retour au choix d'une ligne par le dessin
        const ci = (V.corners || []).findIndex(c => Math.hypot(mx - F.X(c.p[0]) - c.off[0], my - F.Y(c.p[1]) - c.off[1] + 4) <= 13), cn = V.corners && V.corners[ci];      // lettre d'un coin : angle, puis côtés et diagonale qui en partent
        if (cn) { const seq = cn.rows.map(n => rows.findIndex(x => x.n === n)).filter(i => i >= 0); if (seq.length) { const key = tab + ci, k = lastCorner && lastCorner.key === key && lastCorner.row === selRow ? seq.indexOf(selRow) : -1; selRow = seq[(k + 1) % seq.length]; lastCorner = { key, row: selRow }; renderDetails(r); scrollToRow(selRow); retip(); return; } }      // 1er appui sur ce coin : l'angle ; appuis suivants : côtés, diagonale, puis retour à l'angle
        const hit = hitRows(rows, vi, F, mx, my, stepTab);
        if (!hit.length) return;
        const again = stepTab && lastClick && lastClick.tab === tab && lastClick.row === selRow && Math.hypot(lastClick.x - mx, lastClick.y - my) <= 8;      // Faisceau, Écran : on ne continue la séquence que si l'on retouche le même endroit ; ailleurs, on repart de la 1re ligne
        const k = stepTab && !again ? -1 : hit.indexOf(selRow);          /* clics successifs : ligne suivante parmi celles qui touchent ce point */
        selRow = hit[(k + 1) % hit.length];
        if (stepTab) lastClick = { tab, x: mx, y: my, row: selRow };
        if (rows[selRow].one) { const hl = rows[selRow].hl, ds = hl.map(p => primHit(p, F, [mx, my])); lastPick = { row: selRow, i: ds.indexOf(Math.min(...ds)) }; }      // trait le plus proche de l'appui
        renderDetails(r); scrollToRow(selRow); retip();
      };
    });
    if (tipSticky && tipEl && !tipEl.isConnected) hideTip();      // la ligne de la vignette a disparu (autre onglet, filtre…) : la vignette aussi
    if (scrollKeep != null) { body.scrollTop = scrollKeep; scrollKeep = null; }
  }
  let scrollKeep = null;
  let lastPick = null;      // ligne « one » et trait touché (indice dans hl)
  let lastClick = null;      // dernier appui dans le graphique (onglet, position, ligne choisie) : détecte si l'on retouche le même endroit
  let lastCorner = null;      // dernier coin touché (onglet + indice) et ligne qu'il a sélectionnée : sert à enchaîner angle → côtés → diagonale

  /* ---------- Clic dans la figure → ligne correspondante ---------- */
  const HIT_PX = 7, TIE_PX = 3, FILL = 1000, CENTER_PX = 14;      // CENTER_PX : rayon autour du centre d'une surface où un appui la sélectionne en premier
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  const polyDist = (p, P) => Math.min(...P.map((a, i) => segDist(p, a, P[(i + 1) % P.length])));
  function inPoly(p, P) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++)
      if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    return c;
  }
  /* distance (px) du clic à une primitive, ou Infinity si non touchée ; remplissage = 40 px de « poids » pour passer après les traits */
  function primHit(p, F, m) {
    const X = q => [F.X(q[0]), F.Y(q[1])];
    if (p.ghost) return Infinity;
    if (p.k === 'path') { const P = p.p.map(X), d = Math.min(...P.slice(1).map((q, i) => segDist(m, P[i], q))); return d <= HIT_PX ? d : Infinity; }
    if (p.k === 'seg') { const d = segDist(m, X(p.a), X(p.b)); return d <= HIT_PX ? d : Infinity; }      // le vide n'est pas cliquable : seuls les éléments dessinés répondent
    if (p.k === 'pt') { const d = Math.hypot(m[0] - F.X(p.p[0]), m[1] - F.Y(p.p[1])); return d <= HIT_PX ? d : Infinity; }
    if (p.k === 'poly') {
      const P = p.p.map(X), d = polyDist(m, P);
      return d <= HIT_PX ? d : (p.fill !== false && inPoly(m, P) ? FILL : Infinity);
    }
    if (p.k === 'diff') {                                                                      // la zone hors de l'écran : son contour extérieur, ou son intérieur (hors du trou)
      const P = p.p.map(X), d = polyDist(m, P);
      return d <= HIT_PX ? d : (inPoly(m, P) && !inPoly(m, p.hole.map(X)) ? FILL : Infinity);
    }
    if (p.k === 'arc' || p.k === 'bis') {
      const c = p.c, sp = span(p);
      if (p.k === 'bis') { const d = segDist(m, X(c), X([c[0] + BIS_LEN * p.r * Math.cos(sp.m), c[1] + BIS_LEN * p.r * Math.sin(sp.m)])); return d <= HIT_PX ? d : Infinity; }      // bissectrice : le trait seul
      const path = []; for (let i = 0; i <= 16; i++) { const t = sp.a1 + sp.da * i / 16; path.push(X([c[0] + p.r * Math.cos(t), c[1] + p.r * Math.sin(t)])); }
      const d = Math.min(...path.slice(1).map((q, i) => segDist(m, path[i], q)));
      /* angle : l'arc, et le secteur entre le coin et l'arc (poids des surfaces) */
      return d <= HIT_PX ? d : (inPoly(m, [X(c), ...path]) ? FILL : Infinity);
    }
    return Infinity;
  }
  /* lignes (indices) touchées en m : s'il y a des traits à moins de HIT_PX, seuls les plus proches (à TIE_PX du meilleur) comptent ;
     sinon, les surfaces contenant le point. Ordre = ordre de la liste, pour un défilement stable. */
  function hitRows(rows, vi, F, mx, my, centerFirst) {
    const hits = [];
    rows.forEach((x, i) => {
      if (x.sec || !x.hl) return;
      let best = Infinity;
      x.hl.filter(p => (p.vw || 0) === vi).forEach(p => { const d = primHit(p, F, [mx, my]); if (d < best) best = d; });
      if (best < Infinity) hits.push({ i, d: best });
    });
    const lines = hits.filter(h => h.d < FILL);
    let out;
    if (lines.length) { const m = Math.min(...lines.map(h => h.d)); out = lines.filter(h => h.d <= m + TIE_PX).map(h => h.i); }
    else out = hits.map(h => h.i);
    if (centerFirst) {      /* au centre d'une surface : les surfaces d'abord (dans l'ordre de la liste), puis les lignes qui passent par là (diagonales, médianes…) */
      const ctr = [];
      rows.forEach((x, i) => {
        if (x.sec || !x.hl) return;
        if (x.hl.some(p => { if ((p.vw || 0) !== vi || p.k !== 'poly' || p.fill === false) return false; const cx = p.p.reduce((a, q) => a + q[0], 0) / p.p.length, cy = p.p.reduce((a, q) => a + q[1], 0) / p.p.length; return Math.hypot(mx - F.X(cx), my - F.Y(cy)) <= CENTER_PX && inPoly([mx, my], p.p.map(q => [F.X(q[0]), F.Y(q[1])])); })) ctr.push(i);
      });
      if (ctr.length) out = [...ctr, ...out.filter(i => !ctr.includes(i))];
    }
    return out;
  }
  /* fait défiler la liste pour amener la ligne juste sous la figure fixe */
  function scrollToRow(i) {
    const body = $('dbody'), row = body.querySelector(`.m[data-i="${i}"]`), fig = body.querySelector('.stk') || body.querySelector('.figs');
    if (!row) return;
    const top = body.scrollTop + row.getBoundingClientRect().top - body.getBoundingClientRect().top - (fig ? fig.offsetHeight : 0) - 4;
    body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  /* ---------- Navigation ---------- */
  const titles = { calc: 'Calcul faisceau', vp: 'Projecteurs', ecran: 'Écrans', proj: 'Projets', set: 'Réglages' };
  $('nav').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
    for (const p in titles) $('p-' + p).classList.toggle('hidden', p !== b.dataset.p);
    $('title').textContent = titles[b.dataset.p];
    const calc = b.dataset.p === 'calc';
    $('title').style.display = calc ? 'none' : '';      // pas de titre sur la page Calcul
    ['locks', 'auto', 'cfgBtn', 'calcWrap'].forEach(id => $(id).style.display = calc ? '' : 'none');
    if (!calc) $('details').classList.remove('open');
    if (calc) { refreshVps(); render(); }
  };
  addEventListener('resize', render);

  buildParams(); buildLockPills(); syncRot();
  $('title').style.display = 'none';                 // page Calcul au démarrage
  attachDrag('svgSide', ['y', 'z']); attachDrag('svgTop', ['x', 'y']); renderSimHead(); renderSimSettings(); attachFaceDrag(); attachDisp(); attachDispView('dispSelSide', 'svgSide', false); attachDispView('dispSelTop', 'svgTop', true);
  document.querySelectorAll('.expand').forEach(b => b.onclick = () => { const card = b.closest('.card'); if ($('p-calc').classList.contains('cfg')) { $('cfgBtn').click(); toggleFull(card, true); backToCompact = true; return; } toggleFull(card); });      // en vue compacte : on en sort, puis la vue passe en plein écran
  $('viz').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { locks[c.dataset.k] = !locks[c.dataset.k]; render(); } });
  addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.card.full').forEach(c => toggleFull(c, false)); });
  render();
  /* aides de test : ?details=quad|pos|scr|px  ?auto=1  ?unlock=1  ?adv=lens,trans,rot,off  ?lens=sx,sy (en %)  ?pop=lens  ?scroll=1  ?simdrag=dx,dy (pixels, sur la poignée de la vue de face)  ?src=free|std|maker  ?rot=pan,tilt,roll  ?warn=1 (ouvre la liste des alertes) */
  const qs = new URLSearchParams(location.search);
  if (qs.get('dragnow')) { dragNow = qs.get('dragnow'); render(); }      // aide de test : affiche le nom du mouvement
  if (qs.get('open')) document.querySelectorAll('#params .card').forEach(c => c.classList.remove('collapsed'));      // aide de test : déploie tous les blocs
  if (qs.get('cfg')) $('cfgBtn').click();
  if (qs.get('unlock')) { Object.keys(locks).forEach(k => locks[k] = false); render(); }
  if (qs.get('auto')) { for (let i = 0; i < +qs.get('auto'); i++) $('auto').click(); }
  if (qs.get('adv')) qs.get('adv').split(',').forEach(id => { const c = $('adv_' + id); if (c) { c.checked = true; c.dispatchEvent(new Event('change')); } });
  if (qs.get('src')) { adv.src = qs.get('src'); render(); }
  if (qs.get('rot') && S.rot) { [S.rot.pan, S.rot.tilt, S.rot.roll] = qs.get('rot').split(',').map(Number); render(); }
  if (qs.get('lens')) { const [a, b] = qs.get('lens').split(',').map(Number); S.sx = a / 100; S.sy = b / 100; render(); }
  if (qs.get('pop')) document.querySelector(`.info[data-h=${qs.get('pop')}]`).click();
  if (qs.get('scroll')) $('params').scrollTop = 1e5;
  if (qs.get('simdrag')) {
    const [dx, dy] = qs.get('simdrag').split(',').map(Number), h = document.querySelector('#svgFace .handle'), svg = $('svgFace');
    if (h) {
      const rc = h.getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2, k = svg._F.k, c0 = lastR.q.centroid;
      const ev = (t, px, py) => new PointerEvent(t, { clientX: px, clientY: py, pointerId: 1, bubbles: true });
      h.dispatchEvent(ev('pointerdown', x, y)); svg.dispatchEvent(ev('pointermove', x + dx, y + dy));
      const c1 = lastR.q.centroid; svg.dispatchEvent(ev('pointerup', x + dx, y + dy));
      document.body.dataset.sim = JSON.stringify({ wantX: dx / k, wantZ: -dy / k, gotX: c1[0] - c0[0], gotZ: c1[1] - c0[1], sx: S.sx, sy: S.sy, x: S.x, z: S.z, rot: S.rot });
    } else document.body.dataset.sim = 'no handle';
  }
  if (qs.get('warn')) { warnOpen = true; render(); }
  if (qs.get('full')) toggleFull(document.querySelector('.card.' + qs.get('full')), true);
  if (qs.get('details')) { tab = qs.get('details'); selRow = +qs.get('row') || 1; $('detBtn').click(); }
})();
