/* VP – accès à l'application par mot de passe.

   ⚠ Protection côté navigateur : elle écarte un accès involontaire ou curieux, mais elle n'est pas une sécurité forte
   (les fichiers de l'application restent lisibles par qui les a). Le mot de passe n'est pas écrit en clair ici : seule son empreinte
   SHA-256 (sel « vp-access| » + mot de passe) est conservée.

   CHANGER LE MOT DE PASSE (c'est le propriétaire qui le fait) :
     1. calculer l'empreinte du nouveau mot de passe :
        node -e "console.log(require('crypto').createHash('sha256').update('vp-access|NOUVEAU_MOT_DE_PASSE').digest('hex'))"
        (ou, dans la console du navigateur : VPAccess.hashOf('NOUVEAU_MOT_DE_PASSE'))
     2. remplacer `hash` ci-dessous par cette empreinte et republier l'application.
   Dès lors, l'ancien mot de passe ne fonctionne plus et tout appareil déjà déverrouillé le redemande : l'utilisateur écrit pour obtenir
   le nouveau mot de passe (bouton « demander par mail » de la fenêtre d'ouverture), que le propriétaire lui envoie s'il accepte. */
(function () {
  'use strict';
  const CFG = {
    hash: '57f694c3f184f37c93a65a749232ae9ff7381b72a03c985e3266e1d0137084fd',      // mot de passe par défaut : VPVPVP
    mail: 'pixelsenscene94@gmail.com',
  };
  const VERSION = window.VP_APP_VERSION || '?';      // version de l'application : source unique = version.js (écrit par tools/set-version.js)
  const SALT = 'vp-access|', K_OK = 'vp.access.ok', K_ASK = 'vp.access.ask', K_SES = 'vp.access.session';

  /* SHA-256 (sans dépendance : crypto.subtle n'existe pas hors connexion sécurisée) */
  function sha256(msg) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const b = Array.from(new TextEncoder().encode(msg)), l = b.length * 8;
    b.push(0x80); while (b.length % 64 !== 56) b.push(0);
    for (let i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < b.length; o += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) w[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, bb, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + mj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h = [h[0] + a, h[1] + bb, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map(x => x | 0);
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const hashOf = pw => sha256(SALT + pw);
  const get = (st, k) => { try { return st.getItem(k); } catch (_) { return null; } };
  const set = (st, k, v) => { try { v == null ? st.removeItem(k) : st.setItem(k, v); } catch (_) { /* stockage indisponible */ } };
  const askEvery = () => get(localStorage, K_ASK) === '1';
  /* autorisé : « à chaque ouverture » → déverrouillé pour cette session seulement ; sinon → déjà déverrouillé avec le mot de passe actuel */
  const authorized = () => askEvery() ? get(sessionStorage, K_SES) === CFG.hash : get(localStorage, K_OK) === CFG.hash;


  /* Demande du nouveau mot de passe : formulaire → message préparé que l'utilisateur copie puis envoie lui-même par mail au propriétaire (l'application n'a pas de serveur) */
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  function openAsk() {
    const old = document.getElementById('askWin'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'askWin'; ov.className = 'askWin';
    ov.innerHTML = `<form class="askBox" novalidate>
      <h2>Demande du nouveau mot de passe pour l'application VP - version ${esc(VERSION)}</h2>
      <label><span>Nom ou pseudo <b>*</b></span><input type="text" name="nom" autocomplete="name"></label>
      <label><span>Structure / projet (facultatif)</span><input type="text" name="projet"></label>
      <label><span>Appareil(s) utilisé(s) principalement pour cette appli <b>*</b></span><input type="text" name="appareil"></label>
      <fieldset><legend>Êtes-vous régisseur vidéo ? <b>*</b></legend>
        <label class="askRad"><input type="radio" name="regie" value="oui"> oui</label>
        <label class="askRad"><input type="radio" name="regie" value="non"> non</label>
        <label class="askRad"><input type="radio" name="regie" value="autre"> autre : <input type="text" name="autre" class="askAutre" aria-label="Précisez"></label>
      </fieldset>
      <label><span>Message libre (facultatif)</span><textarea name="message" rows="3"></textarea></label>
      <p class="askBye">Merci d'avance pour vos réponses,<br>Cordialement,<br>S.D.</p>
      <p class="askNote">* champs obligatoires</p>
      <p class="gateErr" hidden></p>
      <div class="askFoot"><button type="button" class="hbtn" data-a="cancel">Annuler</button><button type="submit" class="hbtn primary">Envoyer la demande</button></div>
    </form>`;
    document.body.append(ov);
    const f = ov.querySelector('form'), err = ov.querySelector('.gateErr');
    ov.querySelector('[data-a=cancel]').onclick = () => ov.remove();
    f.querySelector('.askAutre').addEventListener('focus', () => { f.regie.value = 'autre'; });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = n => (f.elements[n].value || '').trim(), regie = f.regie.value, autre = v('autre');
      const miss = [];
      if (!v('nom')) miss.push('votre nom ou pseudo');
      if (!v('appareil')) miss.push('l’appareil utilisé');
      if (!regie) miss.push('« Êtes-vous régisseur vidéo ? »'); else if (regie === 'autre' && !autre) miss.push('la précision de « autre »');
      if (miss.length) { err.textContent = 'À renseigner : ' + miss.join(', ') + '.'; err.hidden = false; return; }
      const sujet = 'Demande de mot de passe pour AppliVP.' + VERSION;
      const corps = ['Bonjour,', 'je souhaiterais avoir accès à l\'application VP - version ' + VERSION, '',
        'mon nom/pseudo : ' + v('nom'), 'Numero de version actuellement utilisée : version ' + VERSION, 'Structure / projet : ' + (v('projet') || '—'), 'Appareil(s) utilisé(s) principalement pour cette appli : ' + v('appareil'),
        'Régisseur vidéo : ' + (regie === 'autre' ? 'autre : ' + autre : regie), '', 'Message libre :', v('message') || '—', '',
        'Si vous l\'acceptez, merci de me renvoyer un code à jour par retour de mail', 'Cordialement,', v('nom')].join('\n');
      f.innerHTML = `<h2>Demande prête</h2>
        <p>Merci de copier coller ce message et de le transmettre sans modifications à cette adresse : <a class="askMail" href="mailto:${esc(CFG.mail)}?subject=${encodeURIComponent(sujet)}"><b>${esc(CFG.mail)}</b></a><br>avec l'objet suivant :</p>
        <div class="askCopyRow"><span class="askSubj">${esc(sujet)}</span><button type="button" class="hbtn" data-copy="subject">Copier</button></div>
        <textarea class="askMsg" readonly rows="11" aria-label="Message à copier">${esc(corps)}</textarea>
        <div class="askFoot"><button type="button" class="hbtn" data-copy="body">Copier le message</button><button type="button" class="hbtn primary" data-a="ok">Fermer</button></div>`;
      const copy = (txt, btn) => {
        const ok = () => { const t = btn.textContent; btn.textContent = 'Copié ✓'; setTimeout(() => { btn.textContent = t; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => fallback(txt, ok)); else fallback(txt, ok);
      };
      const fallback = (txt, ok) => { const t = document.createElement('textarea'); t.value = txt; t.style.cssText = 'position:fixed;opacity:0'; document.body.append(t); t.select(); try { document.execCommand('copy'); ok(); } catch (_) { /* copie manuelle */ } t.remove(); };
      f.querySelector('[data-copy=subject]').onclick = e => copy(sujet, e.currentTarget);
      f.querySelector('[data-copy=body]').onclick = e => copy(corps, e.currentTarget);
      f.querySelector('[data-a=ok]').onclick = () => ov.remove();
      f.querySelector('.askMail').addEventListener('click', e => { e.preventDefault(); window.location.href = 'mailto:' + CFG.mail + '?subject=' + encodeURIComponent(sujet); });      // ouvre un nouveau message dans la messagerie de l'appareil
    });
    setTimeout(() => f.elements.nom.focus(), 30);
  }

  const gate = document.getElementById('gate');
  const show = () => { if (!gate) return; gate.hidden = false; document.body.classList.add('locked'); const p = document.getElementById('gatePw'); if (p) { p.value = ''; setTimeout(() => p.focus(), 50); } };
  const hide = () => { if (gate) gate.hidden = true; document.body.classList.remove('locked'); };
  const unlock = () => { set(localStorage, K_OK, CFG.hash); set(sessionStorage, K_SES, CFG.hash); hide(); };
  const lock = () => { set(localStorage, K_OK, null); set(sessionStorage, K_SES, null); show(); };

  const nv = document.getElementById('navVer'); if (nv) nv.innerHTML = '<b class="navName">Appli VP</b> — version ' + VERSION;
  /* un appui sur « Appli VP — version x.x.x » (menu latéral) ouvre la fenêtre « à propos » : fond flou, 4 lignes centrées ; un appui (ou Échap) la ferme */
  if (nv) nv.addEventListener('click', () => {
    if (document.getElementById('aboutWin')) return;
    const ov = document.createElement('div'); ov.id = 'aboutWin'; ov.className = 'aboutOv';
    ov.innerHTML = `<div class="aboutBox" role="dialog" aria-modal="true"><p class="abVer"><b class="navName">Appli VP</b> — version ${esc(VERSION)}</p><p>Conception : Sébastien Dumont</p><p>Application réalisée via Visual Studio Code et Claude IA</p><p>© pixels en scene 2026</p></div>`;
    const end = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); end(); } };
    document.addEventListener('keydown', key, true); ov.addEventListener('click', end);
    document.body.append(ov);
  });
  if (gate) {
    const gv = document.getElementById('gateVer'); if (gv) gv.textContent = 'version ' + VERSION;
    const form = document.getElementById('gateForm'), err = document.getElementById('gateErr'), pw = document.getElementById('gatePw');
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (hashOf(pw.value) === CFG.hash) { err.hidden = true; unlock(); }
      else { err.hidden = false; pw.value = ''; pw.focus(); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); }
    });
    document.getElementById('gateAsk').addEventListener('click', openAsk);
    if (authorized()) hide(); else show();
  }

  /* Réglages : demander le mot de passe à chaque ouverture · verrouiller maintenant */
  const box = document.getElementById('accessBox');
  if (box) {
    box.innerHTML = '<h3>Accès</h3><label class="accChk"><input type="checkbox" id="accAsk"><span>Demander le mot de passe à chaque ouverture</span></label><p class="sub" id="accNote">Le mot de passe n’est demandé qu’à la première ouverture, ou si le mot de passe a changé.</p><button class="hbtn" id="accLock">Verrouiller maintenant</button>';
    const chk = document.getElementById('accAsk'), note = document.getElementById('accNote'); chk.checked = askEvery(); const showNote = () => { note.hidden = chk.checked; }; showNote();      // le message n'apparaît que si la case est décochée
    chk.addEventListener('change', () => { showNote(); set(localStorage, K_ASK, chk.checked ? '1' : null); if (chk.checked) set(sessionStorage, K_SES, CFG.hash); });      // la session en cours reste déverrouillée
    document.getElementById('accLock').addEventListener('click', lock);
  }
  window.VP_VERSION = VERSION;
  window.VPAccess = { version: VERSION, hashOf, authorized, lock, unlock, askEveryTime: askEvery };
})();
