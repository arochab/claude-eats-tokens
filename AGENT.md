# AGENT.md — mémoire vivante de l'agent sur ce projet

> **Ce fichier est un organe, pas une archive.** Il est lu au début de chaque
> session (via `CLAUDE.md`) et **réécrit à la fin**. Si tu es l'agent qui lit
> ceci : tu es responsable de le laisser plus utile que tu ne l'as trouvé.

---

## 0. Protocole d'auto-amélioration (à exécuter, pas à survoler)

**En début de session**
1. Lis ce fichier en entier. Il contient des pièges qui t'auraient coûté du temps.
2. Lis `## 4. Chantiers ouverts` : c'est là que la session précédente a laissé
   ses fils non tirés.

**Pendant la session**
3. Dès que tu perds du temps sur quelque chose de non évident (un piège Windows,
   un faux positif, une hypothèse fausse), c'est un **candidat pour § 2**.
   Note-le mentalement, ne le perds pas.

**En fin de session (obligatoire si tu as appris quelque chose)**
4. Mets à jour ce fichier :
   - Un piège rencontré → **§ 2. Pièges** (avec le symptôme ET le remède).
   - Une décision produit tranchée par Adam → **§ 3. Décisions gravées**.
   - Un chantier laissé en plan → **§ 4. Chantiers ouverts**.
   - Une observation sur l'app qui mérite un futur travail → **§ 5. Backlog qualité**.
5. **Supprime ce qui est devenu faux.** Une mémoire qui ment est pire que pas de
   mémoire. Si une entrée ne correspond plus au code, tue-la.
6. Reste **court**. Ce fichier doit rester lisible d'une traite. Si une section
   enfle, c'est qu'elle doit être condensée ou déplacée dans la vraie doc
   (`SCHEMA.md`, `DEPLOIEMENT.md`, etc.).

**Règle d'or** : n'écris ici que ce qui n'est **pas déductible du code**. Le code
dit *quoi*. Ce fichier dit *pourquoi*, *attention à*, et *ne refais pas ça*.

---

## 1. Comment travailler avec Adam

- **Non technique.** Français simple, pas de jargon. Explique l'effet, pas
  l'implémentation. « Le moteur qui envoie tes chiffres était mort » vaut mieux
  que « le service worker n'invalidait pas son cache ».
- **Décide à sa place.** Il déteste les validations en chaîne. Quand tu as assez
  d'éléments, tranche, agis, et dis ce que tu as fait. Ne demande que si la
  décision est vraiment sienne (goût, argent, mise en ligne publique).
- **Exigence de qualité très haute.** « Peaufine » veut dire « rends ça
  irréprochable », pas « bricole vite fait ». Il voit les détails.
- **Zéro marqueur IA dans TOUT texte visible** (UI, posts, emails, README) :
  aucun cadratin, demi-cadratin, points de suspension unicode, puce, flèche.
  Ponctuation naturelle uniquement. **Vérifie avec un scan UTF-8, pas avec
  `grep -c`** (voir § 2).
- **Jamais de push en prod sans son OK explicite** (« pousse », « go go »). Tu
  peux committer librement, jamais pousser de ton propre chef.
- **Jamais rien sur le Bureau.** Tout vit dans le dossier du projet ou dans le
  scratchpad de session.

---

## 2. Pièges de ce projet (chèrement appris, ne les repaie pas)

### Faux positifs de vérification
- **`grep -c '[—…]'` MENT sur ce dépôt.** En locale non-UTF-8, les accents
  français (à, é, œ) matchent les classes de caractères unicode et créent des
  faux positifs massifs. Pour scanner les marqueurs IA, **utilise un script
  Python en `encoding='utf-8'`** qui teste `if char in text`, jamais grep.
- **Un rapport d'agent qui dit « PROPRE » n'est pas une preuve.** Vérifie
  toi-même le résultat. Un sous-agent a déjà affirmé avoir tout nettoyé alors
  qu'il avait cassé un `split()` au passage.

### Données et environnement local
- **`data/usage.json` du dépôt est un artefact de test, pas la vérité.** Le
  moteur pousse vers Render, pas vers ce fichier. S'il est périmé, l'app locale
  affiche des symptômes qui **n'existent pas en prod** (dates de reset dans le
  passé → « just reset » partout, « Synced 3 d ago »). **Avant de diagnostiquer
  un bug d'affichage en local, rafraîchis-le :**
  `cp ~/.config/claude-eats/usage.json data/usage.json`
- Le Waste Radar affiche les **vrais titres de sessions d'Adam** (souvent en
  français, parfois des prompts d'agents). Ce n'est pas un bug, c'est la vraie
  donnée. Il l'assume.

### Windows / shell
- **`call secret.local.bat` en chemin relatif échoue** sur cette machine. Il faut
  `call "%~dp0secret.local.bat"`.
- Heredocs et guillemets courbes : les scripts node/python inline dans Bash se
  font régulièrement casser par le quoting. **Écris le script dans un fichier**
  du scratchpad et exécute-le, c'est plus fiable qu'un `-e "..."`.
- `console.dev` renvoie **403 sans user-agent navigateur**. Toute veille dessus
  doit passer par `curl -A "Mozilla/5.0 ..."`.

### CSS / UI
- **Le canvas ne suit pas les media queries.** `radar-hero.js` peint ses couleurs
  en JS : si tu changes le fond d'une carte qui contient un canvas, tu dois aussi
  adapter les couleurs du canvas (il détecte désormais la luminance de son hôte).
- Le **service worker vit à la RACINE** et doit être **bumpé à chaque changement**
  de `app.js` / `styles.css` / `index.html` / i18n, sinon les utilisateurs
  gardent l'ancienne version. Bump = nouveau fichier `sw.vN+1.js` + `CACHE`
  dedans + `SW_FILE` dans `pwa/app.js`.

---

## 3. Décisions gravées (ne pas re-débattre)

- **Le héro suit le thème.** Carte claire en light, nuit chaude en dark. La carte
  noire en plein light mode lisait comme un bug de rendu. Tranché le 14 juil 2026.
- **Une seule question, pas un mur de chiffres.** L'app répond « puis-je
  continuer maintenant ? ». Tout le reste est secondaire, à un tap de profondeur.
- **Une grosse semaine est une BONNE nouvelle**, jamais une alarme. Le ton est
  calme et positif, jamais anxiogène.
- **Honnêteté mesuré / estimé.** La fenêtre 5h est un chiffre officiel exact ; le
  coût en euros est une estimation au tarif API. L'UI doit toujours le dire.
- **Mobile pixel-identique.** Le responsive n'ajoute que des `min-width`. Ne
  jamais modifier une règle mobile existante sans bug avéré.

---

## 4. Chantiers ouverts (le fil à tirer par la prochaine session)

- **Veille Console.dev** : routine cloud `trig_012Xv1oQc7kqiwr5NCVfGtXb`, tourne
  chaque lundi 10h. Elle doit envoyer un email à Adam si l'app apparaît dans le
  RSS. **Son 1er run de test n'a jamais été vérifié** : ouvrir
  https://claude.ai/code/routines/trig_012Xv1oQc7kqiwr5NCVfGtXb et confirmer
  qu'elle affiche bien « NOT YET » (et pas « CHECK FAILED »).
- **Le SW n'a pas été bumpé** depuis le commit `a4b6abd` (héro + header). Il faut
  un `sw.v40.js` avant de pousser ces changements en prod.

---

## 5. Backlog qualité (observations non traitées)

- Le donut du héro pourrait être un cran plus grand sur mobile (retour jury).
- Sur un partage public, les titres de sessions du Waste Radar exposent les vrais
  prompts d'Adam. Envisager une troncature plus agressive **si** il en fait la
  demande (il a explicitement dit que ça ne le dérangeait pas).

---

## 6. Journal des passes (une ligne par session, la plus récente en haut)

- **14 juil 2026** — Héro thémé (fin de la carte noire en light) + header sur une
  ligne à toutes les largeurs. Création de ce fichier. Découvert que le « bug »
  du double « just reset » n'existait pas : c'était `data/usage.json` périmé en
  local.
- **13 juil 2026** — Lancement produit : article dev.to, r/SideProject,
  Console.dev, formulaire officiel Anthropic, awesome-claude-code, ccusage.
  Purge des marqueurs IA de tout le texte visible. SW v39.
- **11-12 juil 2026** — Responsive « double-page » validé par jury (8,7/10).
  Moteur de push v2 (pythonw + watchdog 5 min) après 2 jours de panne silencieuse.
