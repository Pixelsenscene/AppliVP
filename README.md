# VP – Calculs de projection pour la régie vidéo

Application web (future PWA) pour placer et choisir des vidéoprojecteurs face à un écran : faisceau réaliste
(avec déformation en trapèze), pixels utiles / perdus, propositions de placement automatiques.
Pensée d'abord pour l'**iPad** (paysage et portrait), utilisable aussi sur Mac et iPhone.

> Version de travail : `1.1.11` (source unique : `version.js`). Le module Projecteurs est en place ; Écrans, Projets et Réglages sont encore des pages vides.

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
  Règle stricte, sans tolérance : l'écran est couvert si et seulement si il est entièrement dans le quadrilatère du
  faisceau (les 4 coins de l'écran sont dans le faisceau, bords compris). Un seul point de l'écran hors du faisceau
  suffit à le déclarer non couvert.
- **Verrous** : chaque paramètre (largeur, hauteur d'écran, recul, centrage, hauteur du VP, zoom, choix du VP)
  et chaque groupe peut être verrouillé. Violet = verrouillé, neutre = libre.
- **Auto** : place le VP pour que l'écran soit couvert (règle stricte ci-dessus), avec le moins de pixels perdus possible.
  - Il ne déplace que le recul (y), le centrage (x) et la hauteur (z) **libres** ; il ne touche jamais à la taille de
    l'écran, au projecteur, au zoom ni à l'optique avancée (lens shift, throw offset), et vise toujours le centre de
    l'écran. Les positions sont arrondies au centimètre.
  - Chaque appui applique la proposition suivante, en boucle. Les propositions sont sensiblement différentes
    (écart de position), classées par pixels perdus croissants.
  - **Appui maintenu 1 s** : un curseur apparaît à droite du bouton (« mini » … « max », point = valeur par défaut).
    Niveau 1 = 1 proposition · 2 (défaut) = 3 · 3 = 5 · 4 = 8 · 5 = sans fin (une nouvelle proposition à chaque appui).
    La barre bleue au-dessus de « AUTO » montre le niveau (vide = 1, pleine = 5). Le curseur disparaît une fois le choix
    fait, ou à l'appui suivant sur Auto.
  - **Rotation de l'octogone** : c'est un cadran des propositions. La proposition 1 est toujours point noir en haut, puis chaque
    appui avance d'un cran : 1 proposition = un tour complet par appui ; 3 = un tiers de tour ; 5 = un cinquième ; 8 = un huitième ;
    le retour à la proposition 1 ramène le point en haut. Après un changement de configuration (nouveau cycle), la proposition 1
    ramène aussi le point en haut. Sans fin : un dixième de tour par appui, indéfiniment (le premier appui part du haut).
  - Si aucune position ne couvre l'écran : message « L'écran ne peut pas être couvert » et, en sous-texte, les
    paramètres de position verrouillés en cause. Un appui sur l'un d'eux le libère (violet → blanc), un second le
    reverrouille. Si même toute la position libre ne suffit pas, le message le dit (changer zoom, projecteur ou écran).
- **Derniers paramètres modifiés** : un curseur qui bouge devient jaune intense avec un halo lumineux ; relâché, il reste jaune (#e3ce10) et le
  contour de son cadenas aussi, pour suggérer de le verrouiller ou non. Plusieurs paramètres modifiés d'un même geste
  (VP glissé en x et y, deux doigts, Auto, liste d'écrans) restent jaunes ensemble. Dès qu'un autre paramètre est modifié,
  le jaune passe sur lui ; changer de projecteur ou toucher à l'optique avancée l'efface. Jamais sur un paramètre verrouillé.
- **Paramètres verrouillés** : leur valeur s'affiche en violet partout dans les vues (« x = … », « y = … », « z = … », cotes du plein écran,
  largeur et hauteur de l'écran).
- **Aimants** : en déplaçant le VP (curseurs, vues de côté et de dessus, translation dans la vue de face), la hauteur se colle à
  z = 0 (VP au ras du sol) et le centrage à x = 0 (VP dans l'axe de l'écran) quand on passe tout près ; on peut continuer de part
  et d'autre. La saisie au clavier et les boutons ± ne sont pas aimantés.
- **Saisie** : appui sur une valeur pour la taper ; appui sur « Recul », « Hauteur (z) » ou « Centrage (x) »
  pour recentrer (mi-course, centre de l'écran, dans l'axe).
- **Vues** : face, côté et dessus (dessus : écran en haut, VP en bas ; x < 0 à gauche, x > 0 à droite, comme en vue de face). Le VP se déplace au doigt dans les vues de côté (recul, hauteur) et de dessus
  (centrage, recul). Plein écran avec cotes, et les deux autres vues en petit.
- **Zoom et déplacement des vues de côté et de dessus** : en bas à droite de chaque vue (aussi quand elle est agrandie), les mêmes icônes que la vue de face : zoom (glisser vers le haut pour agrandir, vers le bas pour reculer), déplacement, et **Fit** (cadrage automatique, comme « Auto » de la vue de face ; pas de « Référence = »). Zoom ou déplacement rendent la vue manuelle jusqu'à Fit. Absentes des petites vues et de la vue compacte ; chaque vue garde son propre cadrage. Même chose, en haut à droite de chacune des 3 vues, dans ∑ Calculs › VP à écran.
- **Affichage de la vue de face** : en bas à droite, trois icônes blanches sous le mot « affichage », avec « Référence = FIT / VP /
  écran » sous l'icône Auto. Une seule est toujours active ; zoom et déplacement, une fois actifs, se réduisent un peu et des flèches apparaissent autour (comme les icônes du haut). « Référence = » se grise quand Auto n'est pas actif, et un appui dessus (même grisée) réactive Auto. *Auto* (par défaut) : cadrage automatique, qui dépend de la référence
  (FIT = tout le faisceau et l'écran, VP, écran). *Zoom* : appuyer et glisser vers le haut pour agrandir, vers le bas pour prendre du
  recul. *Déplacement* : appuyer et glisser pour voyager latéralement et verticalement (le dessin suit le doigt). Zoom et déplacement
  rendent la vue manuelle (elle ne suit plus le faisceau) ; Auto la remet en cadrage automatique. Absent des petites vues et de la
  vue compacte.
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
- **VP à écran, barre de commandes** : après le menu « Choisir un point » et le bouton « + x, y, z » viennent le cadenas puis un bouton rond à flèche circulaire (retour en arrière) qui réinitialise les points ; son nom « Réinitialiser » s'affiche en vignette après 800 ms de survol. Le contour du cadenas clignote dès qu'un point est renseigné, jusqu'à ce qu'on appuie dessus, et ne reclignote qu'après un changement de points.
- **VP à écran (∑ Calculs)** : menu à 3 vues (côté, face, dessus). On touche les points listés (liste complète, ou « Liste réduite ») : un appui sélectionne, un nouvel appui sur un point
  déjà sélectionné le désélectionne (ou la puce ✕ sous les vues ; « Réinitialiser » efface tout). Le **cadenas** à droite du compteur de points (« 4 points sur 5 maximum ») (ON = fermé et coloré, OFF = ouvert) : en OFF on peut retirer un point en le retouchant ; en ON, plus aucun point n'est ajouté ni retiré (la case « Liste réduite » est alors grisée) et un appui sur un point déjà sélectionné (ou sur sa puce) amène sa ligne de coordonnées dans la liste. « Réinitialiser » efface les points et déverrouille. À droite du cadenas, le menu **Choisir un point** liste tous les points (18, ou 8 en « Liste réduite »), groupés par Projecteur et sol / Écran / Faisceau : le survol d'un item entoure le point dans les 3 vues et affiche son nom, un appui l'ajoute ; les points déjà pris sont grisés, et le menu est grisé quand les points sont verrouillés ou au maximum. Ensuite, le bouton **+ x, y, z** ouvre trois champs (virgule ou point décimal, un champ vide vaut 0) : « Ajouter » (ou Entrée) crée un point, sélectionné à la suite des autres et affiché dans les 3 vues ; il disparaît quand on le retire. Le bouton est grisé si les points sont verrouillés ou si le maximum est atteint. Les coordonnées d'un point créé se modifient : un appui sur sa ligne de coordonnées dans la liste (ou, cadenas fermé, sur le point dans les vues ou sur sa puce) transforme la ligne en trois champs ; OK ou Entrée valide, ✕ ou Échap annule, et tous les calculs sont refaits. La case « Liste réduite » est sur la même ligne que les points ; juste dessous, le nom de la forme (en vert, petit), puis les filtres ; dans les filtres, les choix qui ne donneraient aucune ligne (avec l'autre filtre et la liste actuelle, exhaustive ou non) sont grisés. tout cela reste figé en haut avec les vues quand la liste défile. Le nombre de lignes de calcul proposées s'affiche en bas à droite de cette zone figée, et la légende des vues donne le nom de la forme actuelle (« point » tant qu'il y a moins de 2 points). « Cercles » est toujours proposé dans Formes à partir de 3 points (« non disponible » / « impossible » si aucun cercle). Les points sont nommés A, B, C… dans l'ordre des appuis, 5 au maximum (constante `VMAX`, test). 1 point : ses coordonnées ;
  2 : + distance, décalages et angles avec les plans ; 3 : triangle ; 4 : quadrilatère ; 5 : pentagone. Lignes classées : points (x,y,z), côtés, diagonales, hauteurs, médianes, angles, surfaces et périmètre, cercles inscrit / circonscrit
  (« impossible » si le quadrilatère n'en a pas). Filtres : **Formes** (les catégories, plus « Points (x,y,z) » ; la nature de la forme s'affiche au-dessus) et **Élément** ; « calculs plus exhaustifs » (décochée par défaut) ajoute
  les lignes secondaires. Un appui sur le dessin d'une ligne la sélectionne, comme dans les autres menus. Le point du VP est toujours en bleu (fond et ligne) et 30 % plus gros que les autres, sélectionné ou non ; une ligne de point sélectionnée l'entoure d'un anneau jaune. Un angle (∠A…) se dessine comme un arc de cercle qui va d'un côté à l'autre, avec les deux côtés rappelés en trait discret (aussi dans les onglets Faisceau et Écran). Calculs : module `shapes.js` (segment, triangle, polygone ; sommets reliés dans l'ordre A → B → C…) avec l'option `more`.
- **Calculs détaillés : nombre de lignes, calculs plus exhaustifs, filtres** : sous les vues (zone figée), chaque onglet affiche en bas à droite le nombre de lignes de calcul proposées. *Faisceau* et *Écran* ont chacun la case « calculs plus exhaustifs » (décochée par défaut) et deux filtres qui leur sont propres : Faisceau = *Catégorie* + *Sommet* (A–D), Écran = *Catégorie* + *Coin* (E–H) ; les choix sans résultat sont grisés. Lignes réservées aux calculs plus exhaustifs : Faisceau = bissectrices, hauteurs et médianes, centre de gravité G, forme ; Écran = bissectrices, format, IoU, éclairement. *Pixels* n'a ni filtres ni case, mais les mêmes flèches ↑ ↓ que les autres onglets. Dans *Pixels*, les nombres de pixels sont abrégés par défaut (2,07 M px, 743 k px…) ; un appui sur la valeur dans la liste affiche la valeur pleine (2 073 600 px), un second appui l'abrège de nouveau (la zone en largeur × hauteur et la résolution ne sont jamais abrégées). La ligne choisie s'affiche aussi dans le graphique : sa valeur en orange (le nombre de pixels seulement ; placée à côté de la zone quand celle-ci est trop étroite ou trop basse pour la contenir) et son intitulé en jaune en haut à gauche. Le graphique de *Pixels* est le même que la vue de face (faisceau déformé, écran, pixels utiles en vert et perdus en rouge, coins A–D) ; les lignes (total, utiles, perdus, perdus par côté) y sont surlignées à leur place.
- **Graphiques d'Écran et de Pixels** : *Sécran−S∩* surligne la surface de l'écran que le faisceau n'éclaire pas ; *Sf−S∩* surligne le faisceau hors de l'écran (bord de l'écran en pointillé, l'écran n'est pas surligné) ; *IoU* superpose le faisceau et l'écran (l'union en jaune clair, la partie commune plus foncée) : c'est la surface commune divisée par la surface totale qu'ils couvrent ensemble, donc plus basse que la part de l'écran couvert (un écran couvert à 100 % par un faisceau 2,7 fois plus grand donne 37 %) ; *E* surligne l'écran compris dans le faisceau. Dans *Pixels* : *Zone* dessine la boîte englobante de l'image utile (un rectangle dans le panneau, un quadrilatère dans le plan de l'écran, comme le faisceau) ; *Densité* et *Pixel* surlignent les pixels utiles.
- **Angles droits** : dans les graphiques de ∑ Calculs, un petit repère carré blanc et discret apparaît à chaque angle droit de la ligne surlignée : deux traits qui se rejoignent à 90° (angle ∠ de 90°), un trait qui arrive à 90° sur un côté (médiane, hauteur, largeur d'écran…), ou un sommet à 90° d'une forme surlignée (périmètre, surface). Seuls les angles strictement droits (90° exactement, aux erreurs d'arrondi de calcul près ; 90,005° n'en reçoit pas) en reçoivent ; dans VP à écran, l'angle est calculé en 3D et le repère n'est dessiné que dans les vues où il reste lisible.
- **Accès par mot de passe** (`access.js`) : fenêtre d'ouverture au premier lancement (mot de passe par défaut : `VPVPVP`), puis plus demandé sur l'appareil. *Réglages › Accès* : case « Demander le mot de passe à chaque ouverture » (déverrouillage valable pour la session) et bouton « Verrouiller maintenant ». Seule l'empreinte SHA-256 du mot de passe est dans le code. Pour **changer le mot de passe** (propriétaire) : calculer `node -e "console.log(require('crypto').createHash('sha256').update('vp-access|NOUVEAU').digest('hex'))"`, remplacer `hash` dans `access.js`, republier : l'ancien mot de passe ne marche plus et chaque appareil le redemande. La fenêtre d'ouverture propose « Demander un mot de passe par mail » : un formulaire (nom ou pseudo *, structure / projet, appareil(s) *, régisseur vidéo oui / non / autre *, message libre) produit un message complet avec un bouton « Copier », et l'objet « Demande de mot de passe pour AppliVP.1.1.7 » (aussi avec « Copier ») ; l'utilisateur colle le tout dans un mail à pixelsenscene94@gmail.com (adresse cliquable), sans modification, et le propriétaire répond avec le nouveau mot de passe s'il accepte. ⚠ Protection côté navigateur seulement : elle écarte l'accès involontaire, pas une personne qui disposerait des fichiers.
- **Valeurs dans les simulations** : au centre du haut de ∑ Calculs, un bouton rond vert suivi d'un menu « Choisir une configuration ». Tant que le bouton n'est pas actif, le menu est inactif et aucune case ni valeur n'apparaît ; une fois actif, le menu propose les configurations (Config A, B, C, les configurations ajoutées, « ＋ ajouter une config », « ✎ modifier / supprimer une config ») et chaque ligne de calcul reçoit à gauche une case à cocher (vignette : « afficher la valeur dans les simulations »), sans limite de nombre. Les 3 premières cases cochées (par ordre de cochage) sont en #07a61c, les suivantes en #93b509. Dès qu'une case est cochée, une zone à remplir apparaît après le texte de la ligne pour **nommer** la valeur (✓ pour valider, ✎ pour modifier) : ce nom remplace le texte bleu dans les simulations (« Recul VP : 4,31 m » au lieu de « AC : 4,31 m »). Les valeurs se mettent à jour avec la simulation, même panneau fermé : la **vue principale** montre les 3 premières sous la zone des vues ; la **vue agrandie** les 3 premières en bas du grand graphique, au-dessus du bouton Auto et des indicateurs ; la **vue compacte** toutes les valeurs, 3 par ligne, tout en bas sous les options avancées, dans une fenêtre à faire défiler si elles sont trop nombreuses. Une configuration mémorise une sélection de lignes et leurs noms ; elle se crée, se modifie (nom, noms des valeurs, retrait, reprise de la sélection actuelle) et se supprime (deux appuis) dans une petite fenêtre à l'avant-plan sur fond flouté, aussi depuis la page **Réglages**. Configurations, mode et sélection sont mémorisés (localStorage). **Config A par défaut** : au premier lancement (rien en mémoire), la Config A est chargée avec 3 valeurs nommées (taille des pixels, ligne VP–centre de la base, base du faisceau D–C) ; elles sont dans `DEFAULT_CFG_A` (`app.js`), et *Réglages > Rétablir la Config A par défaut* (deux appuis) y revient. Une ligne qui n'existe plus (autres points sélectionnés dans VP à écran) est décochée.
- **Vignettes explicatives** : dans les 4 onglets de ∑ Calculs, une vignette décrit en une phrase ou deux de quoi il s'agit. Elle s'ouvre (1) en survolant 200 ms le texte bleu à gauche de la ligne, ou (2) sur une ligne active (cliquée) : un « i » dans un cercle apparaît après son texte et un nouvel appui sur la ligne ouvre la vignette. Elle s'affiche sur la ligne elle-même, entre le texte de gauche (nom bleu et formule grise, « i » compris) et le résultat (à droite), qu'elle ne couvre pas. Une vignette ouverte par un appui reste affichée quand on bouge le curseur et suit sa ligne quand la liste défile ; si la ligne active change alors (flèches ↑ ↓, appui sur une autre ligne ou dans le graphique), elle s'ouvre pour la nouvelle ligne (rien ne s'ouvre si aucune vignette n'était visible). Elle se ferme par un nouvel appui sur sa ligne, un appui ailleurs, ou un changement d'onglet ; la vignette de survol se ferme dès qu'on quitte le texte bleu. Côtés, diagonales et angles de Faisceau et d'Écran sont réduits à une courte phrase (« Longueur du côté AB du faisceau ») ; Larg., Haut. et Diag. de l'écran et tout VP à écran gardent leurs explications. Les textes sont dans la fonction `rowHelp` (`app.js`).
- **∑ Calculs** : fenêtre annexe à 4 onglets : *Faisceau*, *Écran*, *VP à écran*, *Pixels*. Elle contient les calculs détaillés (côtés, diagonales, angles et bissectrices, hauteurs,
  médianes, périmètre, surfaces, triangle VP–écran, angles de champ, pixels), formules affichées et schéma
  surligné au toucher. Onglet *Faisceau* : coins A–D en bleu (couleur du faisceau) ; onglet *Écran* : coins E (haut gauche), F (haut droit), G (bas droit), H (bas gauche) en rouge
  (couleur de l'écran). Dans ces deux onglets, deux boutons ronds verts centrés sous le graphique (↑ et ↓) font défiler les lignes de calcul dans un sens ou dans l'autre. Dans le graphique,
  seuls les éléments dessinés (point, ligne, surface) sont cliquables : un appui dans le vide ne fait rien. Un appui sur la lettre d'un coin (A–D, E–H) sélectionne l'angle de ce coin, puis, aux appuis suivants, les côtés et la diagonale qui en partent, puis revient à l'angle
  (l'onglet Écran a pour cela ses lignes Côtés EF…HE, Diagonales EG, FH et Angles ∠E…∠H).
  Un appui au centre d'une surface affiche d'abord les surfaces, puis les diagonales et autres lignes qui passent par là ; sur un côté de l'écran, la dimension (largeur ou hauteur) vient en premier. Ailleurs que sur le même endroit,
  la séquence repart de la 1re ligne. La ligne sélectionnée s'affiche dans le graphique avec sa valeur en orange (sur le côté, au centre de la surface, au bout de la bissectrice) et son intitulé en jaune en haut de la vue.
  Angles et bissectrices sont des lignes distinctes (angle : arc ; bissectrice : trait pointillé ; la séquence d'un coin les enchaîne : angle, côtés, diagonale, bissectrice). Dans l'onglet Écran, un appui sur un côté ou une diagonale
  ne met en surbrillance que celui qui est touché (pas son parallèle ni l'autre diagonale), et « Lumière hors écran » surligne le faisceau privé de la partie qui recouvre l'écran (rien si le faisceau est entièrement dans l'écran).

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
