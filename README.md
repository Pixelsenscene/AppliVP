# VP – Calculs de projection pour la régie vidéo

Application web (future PWA) pour placer et choisir des vidéoprojecteurs face à un écran : faisceau réaliste
(avec déformation en trapèze), pixels utiles / perdus, propositions de placement automatiques.
Pensée d'abord pour l'**iPad** (paysage et portrait), utilisable aussi sur Mac et iPhone.

> Version de travail : `1.1.2`. Le module Projecteurs est en place ; Écrans, Projets et Réglages sont encore des pages vides.

## Utilisation

Application 100 % statique, sans installation ni dépendance.

```sh
cd VP
python3 -m http.server 8000      # puis ouvrir http://localhost:8000
```

En ligne (GitHub Pages, une fois activé) : <https://pixelsenscene.github.io/AppliVP/>

## Fonctions

- **Parc de projecteurs** (menu Projecteurs, `parc.js`) : liste + fiche complète par projecteur (identité, image, optique, divers),
  toute donnée pouvant être inconnue. Ajout, modification, duplication, suppression, enregistrement (navigateur),
  export / import JSON (fusion ou remplacement). Regroupement par famille, fabricant, propriétaire, technologie ou résolution ;
  recherche et tri. Les données *nécessaires aux calculs* manquantes sont signalées, avec une valeur standard proposée
  champ par champ ou d'un bloc. Les cases à cocher choisissent les projecteurs proposés dans la page Calcul.

- **Faisceau réaliste** : le VP vise le centre de l'écran ; le faisceau est calculé en 3D puis projeté sur l'écran
  (rectangle, trapèze ou quadrilatère quelconque, avec angles A, B, C, D).
- **Pixels** : pixels utiles et pixels perdus (total et par côté), calculés sur le panneau natif du projecteur.
  Pastille « Pixels perdus » colorée selon le pourcentage, et « Écran couvert / non couvert ».
- **Verrous** : chaque paramètre (largeur, hauteur d'écran, recul, centrage, hauteur du VP, zoom, choix du VP)
  et chaque groupe peut être verrouillé. Violet = verrouillé, neutre = libre.
- **Auto** : cherche le réglage qui maximise la surface commune faisceau ∩ écran en ne touchant qu'aux
  paramètres libres. Jusqu'à 3 propositions différentes, en boucle à chaque appui.
- **Saisie** : appui sur une valeur pour la taper ; appui sur « Recul », « Hauteur (z) » ou « Centrage (x) »
  pour recentrer (mi-course, centre de l'écran, dans l'axe).
- **Vues** : face, côté et dessus. Le VP se déplace au doigt dans les vues de côté (recul, hauteur) et de dessus
  (centrage, recul). Plein écran avec cotes, et les deux autres vues en petit.
- **Optique avancée** (carte du panneau de réglages) : trois options à cocher, **combinables** :
  - **A · Lens shift** : décalage optique de l'image, sans déformation. Source des limites au choix :
    *Constructeur* (fiche du projecteur, si renseignée), *Standard* (±30 % vertical, ±10 % horizontal) ou *Libre*.
  - **B · Translation du VP** : l'orientation est figée, donc déplacer le VP (x, y, z) décale l'image et désaxe le faisceau.
  - **C · Rotation du VP** : pan, tilt et roll manuels (départ = visée actuelle), avec bouton « Viser le centre de l'écran ».
    L'image se déplace mais se déforme en trapèze.
  - **Throw offset** : décalage vertical fixe de l'image par rapport à l'axe de l'objectif (standard +60 %), appliqué
    seulement si la case est cochée.
  - Une icône « i » à côté de chaque option ouvre une bulle d'aide.
- **Glisser le faisceau dans la vue de face** : une poignée au centre de l'image déplace le faisceau ; un sélecteur
  (A / B / C) choisit l'option qui reçoit le mouvement. Les vues de côté et de dessus suivent.
- **Alertes de cohérence** : rien n'est interdit, mais une pastille orange compte les alertes (lens shift hors plage
  réaliste, plage constructeur incohérente, throw offset inhabituel, pan/tilt/roll excessifs, trapèze > 10 %, image hors
  écran). Un appui ouvre la liste ; le message apparaît aussi sous le curseur concerné.
- **∑ Calculs** : fenêtre annexe avec les calculs détaillés (côtés, diagonales, angles et bissectrices, hauteurs,
  médianes, périmètre, surfaces, triangle VP–écran, angles de champ, pixels), formules affichées et schéma
  surligné au toucher.

## Modèle géométrique

- Repère en mètres : origine au centre de la **base** de l'écran, `x` vers la droite, `y` vers le public, `z` vers le haut.
- Écran dans un plan frontal (il est défini par un plan, donc l'inclinaison reste possible plus tard).
- Orientation du VP : **visée automatique** sur le centre de l'écran par défaut. Dès que B ou C est cochée, elle devient
  **manuelle** (`S.rot = {pan, tilt, roll}` en degrés ; pan > 0 vers +x, tilt > 0 vers le haut ; 0/0/0 = axe perpendiculaire
  à l'écran). Sans B ni C, la visée automatique est rétablie.
- Décalages de l'image (lens shift `sx`, `sy` + throw offset `oy`) : fractions de la largeur / hauteur de l'image, ajoutées
  aux rayons du panneau. Ils déplacent l'image sans la déformer ; seule la rotation produit un trapèze.
- Ratio de projection = distance le long de l'axe optique / largeur de l'image ; le zoom interpole entre
  ratio min et ratio max.
- Éclairement indicatif = lumens / aire du faisceau.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Structure et styles |
| `app.js` | Interface : réglages, verrous, vues, glisser, Auto, calculs détaillés |
| `geometry.js` | Moteur de calcul pur (sans DOM) : faisceau, trapèze, pixels, optimisation, valeurs standard (`STD`), seuils d'alerte (`REAL_MAX`), `checkSetup` |
| `data.js` | Parc de projecteurs (repris de `vp_data.json`). Champs optionnels : `lensShift {v:[min,max], h:[min,max]}` et `throwOffset` |
| `manifest.webmanifest` | Début de la PWA |

## À faire

- Service worker et icônes (installation sur l'écran d'accueil, usage hors ligne).
- Modules Projecteurs et Écrans (édition et sauvegarde), Projets, Réglages.
- Écran incliné.
- **Calibration dans Réglages** : rendre modifiables les paramètres aujourd'hui fixés dans le code, notamment les valeurs
  standard (`STD` : lens shift ±30 % / ±10 %, throw offset +60 %), les seuils d'alerte (`REAL_MAX`), la course des
  curseurs en mode libre et les pas du glisser.
- Menu Projecteurs : saisie de `lensShift` et `throwOffset` par modèle (les valeurs standard servent à défaut).
- Auto : y intégrer éventuellement lens shift et orientation (aujourd'hui il ne règle que position, zoom et écran).
- Vue 3D (Three.js).

## Tests rapides

Paramètres d'URL utiles pour vérifier un réglage sans manipuler l'interface :
`?adv=lens,trans,rot,off` · `?lens=sx,sy` (en %) · `?src=free|std|maker` · `?rot=pan,tilt,roll` · `?pop=lens` ·
`?warn=1` · `?scroll=1` · `?simdrag=dx,dy` (glisser simulé sur la poignée de la vue de face) · `?auto=1` · `?unlock=1` ·
`?details=quad|pos|scr|px` · `?full=side|top`.
Le moteur (`geometry.js`) s'exporte en module Node : `require('./geometry.js')` permet de le tester en ligne de commande.
