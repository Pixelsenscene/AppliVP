# VP – Calculs de projection pour la régie vidéo

Application web (future PWA) pour placer et choisir des vidéoprojecteurs face à un écran : faisceau réaliste
(avec déformation en trapèze), pixels utiles / perdus, propositions de placement automatiques.
Pensée d'abord pour l'**iPad** (paysage et portrait), utilisable aussi sur Mac et iPhone.

> Version de travail : `1.1.1`. Les modules Projecteurs, Écrans, Projets et Réglages sont encore des pages vides.

## Utilisation

Application 100 % statique, sans installation ni dépendance.

```sh
cd VP
python3 -m http.server 8000      # puis ouvrir http://localhost:8000
```

En ligne (GitHub Pages, une fois activé) : <https://pixelsenscene.github.io/AppliVP/>

## Fonctions

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
- **∑ Calculs** : fenêtre annexe avec les calculs détaillés (côtés, diagonales, angles et bissectrices, hauteurs,
  médianes, périmètre, surfaces, triangle VP–écran, angles de champ, pixels), formules affichées et schéma
  surligné au toucher.

## Modèle géométrique

- Repère en mètres : origine au centre de la **base** de l'écran, `x` vers la droite, `y` vers le public, `z` vers le haut.
- Écran dans un plan frontal (il est défini par un plan, donc l'inclinaison reste possible plus tard).
- VP orienté vers le centre de l'écran, sans roulis. Pas encore de décalage optique (lens shift).
- Ratio de projection = distance le long de l'axe optique / largeur de l'image ; le zoom interpole entre
  ratio min et ratio max.
- Éclairement indicatif = lumens / aire du faisceau.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Structure et styles |
| `app.js` | Interface : réglages, verrous, vues, glisser, Auto, calculs détaillés |
| `geometry.js` | Moteur de calcul pur (sans DOM) : faisceau, trapèze, pixels, optimisation |
| `data.js` | Parc de projecteurs (repris de `vp_data.json`) |
| `manifest.webmanifest` | Début de la PWA |

## À faire

- Service worker et icônes (installation sur l'écran d'accueil, usage hors ligne).
- Modules Projecteurs et Écrans (édition et sauvegarde), Projets, Réglages.
- Décalage optique (lens shift) et écran incliné.
- Vue 3D (Three.js).
