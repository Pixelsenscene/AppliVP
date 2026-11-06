/* VP – fenêtre d'import / export de fichiers .json, commune aux configurations, aux vidéo-projecteurs et aux écrans.
   Fichier JSON : texte lisible, ouvrable dans tout éditeur, et c'est le format déjà utilisé par le parc de projecteurs.

   VPIO.open(spec) :
     spec = {
       title, noun: ['configuration', 'configurations'], file: 'préfixe-du-fichier',
       list():   éléments actuels  → [{ id, label, sub }]
       presets:  [{ id, label, ids() }]           raccourcis de sélection à l'export (le premier est « tout »)
       build(ids): objet à écrire dans le fichier (contenu complet)
       parse(texte): lit un fichier → { entries: [{ key, label, sub }], apply(keys) → nombre importé (peut être asynchrone) } ; lève une Error(message) si le fichier ne convient pas
     } */
(() => {
'use strict';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, [one, many]) => `${n} ${n > 1 ? many : one}`;

/* Enregistre un fichier JSON en demandant la destination quand le navigateur le permet (Chrome, Edge) ;
   sinon (Safari, Firefox) c'est un téléchargement classique : le navigateur choisit ou demande le dossier selon ses réglages. */
async function saveJson(filename, obj) {
  const text = JSON.stringify(obj, null, 2);
  const download = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return 'download';
  };
  /* Sélecteur de fichier du navigateur (Chrome, Edge) : demande la destination. Il n'est PAS utilisé dans Electron (navigateur intégré de VS Code…) : il y crée un fichier vide,
     et un repli par téléchargement donnait alors deux fichiers. Là, un téléchargement unique : l'environnement demande lui-même la destination. */
  if (window.showSaveFilePicker && !/Electron\//i.test(navigator.userAgent)) {
    let h;
    try {
      h = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'Fichier JSON', accept: { 'application/json': ['.json'] } }] });
      const w = await h.createWritable(); await w.write(text); await w.close();
    } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; return h ? 'fail' : download(); }      // le fichier n'a pas été choisi : téléchargement ; il l'a été mais l'écriture a échoué : pas de second fichier
    let empty = false;
    try { empty = (await (await h.getFile()).text()).length === 0; } catch (e) { empty = false; }
    return empty ? 'fail' : 'saved';
  }
  return download();
}

function toast(text) {      // confirmation brève après la fermeture de la fenêtre
  const t = document.createElement('div'); t.className = 'ioToast'; t.textContent = text; document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show')); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

function open(spec, startTab) {
  const old = document.getElementById('ioWin'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'ioWin'; ov.className = 'ioOv';
  ov.innerHTML = `<div class="ioWin" role="dialog" aria-modal="true"><div class="ioHead"><h4>${esc(spec.title)}</h4><button type="button" class="ioX" data-io="close" aria-label="Fermer">✕</button></div>
    <div class="ioTabs"><button type="button" data-io="tab" data-t="export">Exporter</button><button type="button" data-io="tab" data-t="import">Importer</button></div><div class="ioBody"></div></div>`;
  document.body.append(ov);
  const body = ov.querySelector('.ioBody'), N = spec.noun, pp = (n, w) => w + (spec.fem ? 'e' : '') + (n > 1 ? 's' : '');      // accord du participe (spec.fem : nom féminin)
  let tab = startTab || 'export', msg = '', checked = null, imp = null, impChecked = new Set(), items = [];
  const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape' && !document.getElementById('defWarn')) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);

  const listHtml = (rows, set, attr) => rows.length ? rows.map(r => `<label class="ioRow"><input type="checkbox" ${attr}="${esc(r.id ?? r.key)}"${set.has(r.id ?? r.key) ? ' checked' : ''}><span class="ioNm">${esc(r.label)}</span><small>${esc(r.sub || '')}</small></label>`).join('') : '<p class="ioNone">Aucun élément.</p>';
  function draw() {
    ov.querySelectorAll('.ioTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'export') {
      items = spec.list();
      if (!checked) checked = new Set(items.map(r => r.id));      // par défaut, tout est sélectionné
      const n = items.filter(r => checked.has(r.id)).length, same = ids => ids.length === n && ids.every(id => checked.has(id));
      body.innerHTML = `<p class="ioHelp">Choisis ce qui est exporté, puis « Exporter » : le navigateur demande la destination du fichier <b>.json</b>.</p>
        <div class="ioPre"><label><input type="checkbox" data-pre="all"${n === items.length && n ? ' checked' : ''}> Sélectionner tout</label>${spec.presets.slice(1).map(p => `<label><input type="checkbox" data-pre="${esc(p.id)}"${same(p.ids()) ? ' checked' : ''}> ${esc(p.label)}</label>`).join('')}</div>
        <div class="ioList">${listHtml(items, checked, 'data-ck')}</div>
        <div class="ioFoot"><span class="ioMsg">${msg}</span><button type="button" class="hbtn primary" data-io="export"${n ? '' : ' disabled'}>Exporter ${plural(n, N)}</button></div>`;
    } else {
      body.innerHTML = `<p class="ioHelp">Choisis un fichier <b>.json</b> exporté par VP : les éléments qu'il contient s'affichent, tu importes tout ou une partie.</p>
        <button type="button" class="hbtn" data-io="pick">Choisir un fichier…</button><input type="file" accept=".json,application/json" hidden>
        ${imp ? `<p class="ioFile">« ${esc(imp.name)} » : ${plural(imp.entries.length, N)}</p><div class="ioAll"><button type="button" class="lnk" data-io="all">Tout cocher</button><button type="button" class="lnk" data-io="none">Aucune</button></div>
          <div class="ioList">${listHtml(imp.entries, impChecked, 'data-ik')}</div>` : ''}
        <div class="ioFoot"><span class="ioMsg">${msg}</span>${imp ? `<button type="button" class="hbtn primary" data-io="import"${impChecked.size ? '' : ' disabled'}>Importer ${plural(impChecked.size, N)}</button>` : ''}</div>`;
      const fi = body.querySelector('input[type=file]');
      fi.onchange = async () => {
        const f = fi.files[0]; fi.value = ''; if (!f) return;
        try {
          const text = (await f.text()).replace(/^\uFEFF/, '');
          if (!text.trim()) throw new Error(`« ${f.name} » est vide (${f.size} octet${f.size > 1 ? 's' : ''}) : le fichier exporté n'a pas été écrit correctement. Refais l'export, puis choisis le bon fichier.`);
          try { JSON.parse(text); } catch (e) { throw new Error(`« ${f.name} » n'est pas un fichier JSON lisible (${f.size} octets, début : « ${text.slice(0, 30).replace(/\s+/g, ' ')} »).`); }
          const p = spec.parse(text); imp = { name: f.name, entries: p.entries, apply: p.apply }; impChecked = new Set(p.entries.map(e => e.key)); msg = ''; }
        catch (e) { imp = null; msg = `<span class="ioBad">${esc(e.message || 'Fichier non reconnu')}</span>`; }
        draw();
      };
    }
  }
  ov.onclick = async e => {
    if (e.target === ov) return close();
    const b = e.target.closest('[data-io]'); if (!b) return; const a = b.dataset.io;
    if (a === 'close') close();
    else if (a === 'tab') { tab = b.dataset.t; msg = ''; draw(); }
    else if (a === 'pick') body.querySelector('input[type=file]').click();
    else if (a === 'all' || a === 'none') { impChecked = new Set(a === 'all' ? imp.entries.map(x => x.key) : []); draw(); }
    else if (a === 'export') {
      const ids = items.filter(r => checked.has(r.id)).map(r => r.id); if (!ids.length) return;
      const r = await saveJson(`${spec.file}-${new Date().toISOString().slice(0, 10)}.json`, spec.build(ids));
      if (r === 'saved' || r === 'download') { close(); toast(`${plural(ids.length, N)} ${pp(ids.length, 'exporté')}${r === 'download' ? ' (fichier téléchargé)' : ''}.`); return; }      // export fait : la fenêtre se ferme
      msg = r === 'fail' ? `<span class="ioBad">Le fichier choisi n'a pas pu être écrit (il est vide). Refais l'export en choisissant un autre emplacement.</span>` : 'Export annulé.';
      draw();
    } else if (a === 'import') {
      const keys = imp.entries.filter(x => impChecked.has(x.key)).map(x => x.key); if (!keys.length) return;
      let n = 0; try { n = await imp.apply(keys); } catch (e) { msg = `<span class="ioBad">${esc(e.message || 'Import impossible')}</span>`; draw(); return; }
      if (n) { close(); toast(`${plural(n, N)} ${pp(n, 'importé')}.`); return; }      // importation faite : la fenêtre se ferme
      msg = 'Import annulé.'; draw();
    }
  };
  ov.onchange = e => {
    const t = e.target;
    if (t.dataset.pre !== undefined) {      // « Sélectionner tout » ; un raccourci supplémentaire (ex. configurations par défaut) coché ne garde que ses éléments, décoché il revient à tout
      const all = items.map(r => r.id), p = spec.presets.find(x => x.id === t.dataset.pre);
      checked = new Set(t.dataset.pre === 'all' ? (t.checked ? all : []) : (t.checked ? p.ids() : all)); draw();
    } else if (t.dataset.ck !== undefined) { t.checked ? checked.add(t.dataset.ck) : checked.delete(t.dataset.ck); draw(); }
    else if (t.dataset.ik !== undefined) { t.checked ? impChecked.add(t.dataset.ik) : impChecked.delete(t.dataset.ik); draw(); }
  };
  draw();
}

window.VPIO = { open, saveJson };
})();
