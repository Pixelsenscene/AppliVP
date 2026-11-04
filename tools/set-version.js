#!/usr/bin/env node
/* Aligne la version affichée par l'application sur le nom du dossier de travail (…/AppliVP.X.Y.Z/VP).
   Écrit version.js et la ligne « Version de travail » du README. Argument optionnel : node tools/set-version.js 1.2.0 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const m = path.basename(path.dirname(root)).match(/(\d+\.\d+\.\d+[a-z]?)\s*$/i);
const v = process.argv[2] || (m && m[1]);
if (!v) { console.error('Version introuvable : le dossier parent doit se nommer AppliVP.X.Y.Z (ou passer la version en argument).'); process.exit(1); }
const f = path.join(root, 'version.js');
fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/window\.VP_APP_VERSION = '[^']*'/, `window.VP_APP_VERSION = '${v}'`));
const r = path.join(root, 'README.md');
if (fs.existsSync(r)) fs.writeFileSync(r, fs.readFileSync(r, 'utf8').replace(/> Version de travail : `[^`]*` \((?:constante `VERSION` dans `access.js`|source unique : `version.js`)[^)]*\)/, `> Version de travail : \`${v}\` (source unique : \`version.js\`)`));
console.log('Version de l\'application :', v);
