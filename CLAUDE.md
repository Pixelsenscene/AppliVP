# AppliVP

## Version (à vérifier à la première conversation)

Au début de chaque première conversation, vérifier que `version.js` (`window.VP_APP_VERSION`) correspond au nom du dossier parent `AppliVP.X.Y.Z`.
En cas d'écart, lancer `node tools/set-version.js` depuis ce dossier, puis le signaler à l'utilisateur.
`version.js` est la source unique : ne pas le modifier à la main.
