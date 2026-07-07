# Audit UX/UI — Vagues B & C restantes (pour décision d'Adam)

> Suite à l'audit world-class (Apple HIG · Material 3 · Linear · Geist · PAIR ·
> Microsoft AI UX · WCAG 2.2 · Web Vitals). **La Vague A (quick wins) est déjà
> faite et commitée** (commit `417e85e`). Ce doc liste ce qui reste — chantiers
> plus lourds ou plus subjectifs, à trancher avec Adam.
>
> Rapport visuel complet : voir l'Artifact généré par l'audit.

---

## Vague B — chantiers moyens (édition + CSS/JS ciblé)

### B1 · Faire RESSENTIR le feu tricolore en démo ⚠️ critique
**Problème :** en démo le feu est neutralisé en gris « Exemple » — le cœur produit
est éteint pile quand il faut convaincre un nouveau visiteur.
**Fix :** appeler `CET.status(d, Date.now())` sur les vraies données de
`usage.demo.json` (qui portent déjà w5h/w7d), réglées pour tomber sur un **orange
crédible**. Badge « Exemple » + sous-titre « Voilà le verdict que tu verras avec
tes vraies données ». Replier la longue traîne analytique sous `<details>`.
**Garde-fou :** aucune urgence fabriquée, aucune animation d'alarme simulée — la
couleur sort du calcul réel sur données maîtrisées. Registre « aperçu ».
**Pourquoi pas en autonomie :** touche la première impression + choix du dataset
démo = décision produit à valider.

### B2 · Animer l'entrée des bottom-sheets
**Problème :** `display:none↔flex` n'est pas animable → les 5 sheets apparaissent
d'un coup, plein écran. Détail « cheap » vs Linear/Apple.
**Fix (spec fournie) :**
```css
.sheet{display:flex;opacity:0;visibility:hidden;transition:opacity .25s var(--ease),visibility 0s linear .25s}
.sheet.open{opacity:1;visibility:visible;transition-delay:0s}
.sheet-inner{transform:translateY(16px);transition:transform .28s var(--ease)}
.sheet.open .sheet-inner{transform:none}
```
+ filtrer `_focusables` sur `visibility!=='hidden'` pour que Tab n'atteigne pas une
sheet fermée. **Risque :** interaction avec le focus-trap → à tester soigneusement.

### B3 · Réparer l'animation des jauges (transition morte)
**Problème :** les barres naissent en `innerHTML` déjà à leur largeur finale → la
transition `width` ne joue jamais.
**Fix :** poser 0%, forcer un reflow, puis la cible via `requestAnimationFrame`.
**Garde obligatoire :** n'armer qu'au PREMIER affichage de chaque carte
(`dataset.filled`), sinon re-remplissage à chaque tick de polling (30s) = lecture
nerveuse + fausse fraîcheur.

### B4 · Promouvoir « Caler sur ma vraie barre 5 h »
**Problème :** la fonction qui installe la confiance (estimation vs officiel) est
en jargon et enterrée en 2e position d'un groupe expert.
**Fix :** label « Aligner sur le vrai % de Claude » + small explicatif. La remonter
en tête du groupe « Mon forfait Max ». Replier Budgets/Fenêtres/Crédits sous un
`<summary>` « Réglages avancés ». Ne pas toucher aux `id` des champs.

### B5 · Transition d'état unifiée du feu + canal texte sur les jauges
**Problème :** seul `background` a une transition (le feu change à moitié). Et les
3 jauges portent leur niveau par la **couleur seule** (WCAG 1.4.1 : un daltonien
ne distingue pas ambre/vert).
**Fix :** transition sur background+border-color+color du feu ; préfixer les jauges
warn/red d'un glyphe non-chromatique (⚠ / ●) + suffixe « — ça chauffe ».

### B6 · Boîte noire : « terme réel + glose » + badge « détecté auto »
**Problème :** « sous-agents », « cache expiré » = jargon sur une carte payante.
**Fix :** « les tâches que Claude a lancées en arrière-plan (ses sous-agents) » ;
cache-miss → « reparti à recharger le contexte mis de côté quelques minutes plus
tôt ». Badge « détecté auto » (réutilise `.hint`).
**Garde-fou :** garder le % chiffré partout (c'est une PART, pas une totalité).

---

## Vague C — gros chantiers (nouvelle UI / refactor)

### C1 · Le parcours « compte → code → installer → coller » ⚠️ critique + bloquant
**Problème :** un user s'inscrit sur mobile, obtient une clé `cet_…`, et **rien ne
relie** cette clé au PC. **VÉRIFIÉ DANS LE CODE :** `DEMARRER.bat` refuse de
démarrer si `PUSH_SECRET` est vide et **n'utilise jamais `CET_API_KEY`**. La clé
multi-tenant ne se passe aujourd'hui qu'en ligne de commande (HOSTED-SETUP.md).
**→ Écrire dans l'UI « colle ta clé dans secret.local.bat » enverrait l'utilisateur
dans le mur.** C'est un pré-requis d'OUTILLAGE, pas juste du wording.
**Fix en 2 volets, DANS L'ORDRE :**
1. **Outillage (à faire AVANT le wording) :** adapter `secret.local.example.bat`
   pour accepter `CET_API_KEY`, lever la garde `PUSH_SECRET` de `DEMARRER.bat`
   quand la clé est présente (miroir de la logique déjà correcte de push_usage.py).
2. **Sheet `#setup-sheet` à 5 étapes** (une visible à la fois, barre « Étape 2/5 »)
   qui nomme le fichier réel une fois qu'il accepte la clé.
**Court terme faisable maintenant (wording seul) :** renommer « clé API » → « code
de connexion » (garder format `cet_`), poser « garde cette page ouverte, on te
demandera de le coller à l'installation ». Mais **NE PAS nommer un fichier où
coller** tant que le volet 1 n'est pas fait (= dark pattern involontaire).

### C2 · Consolider les tokens (design system)
**Problème :** ~21 tailles de police, 7 rayons hors-token, marges 14/15/16/18/20
sans grille, couleurs d'état en triple (CSS + JS), 6 durées de motion. Invisible à
l'unité, décisif en cumul pour le « niveau grande marque ».
**Fix :** formaliser 5 échelles fermées dans `:root` (typo ~9 crans, rayons,
espacement base-4, couleurs sémantiques distinctes de l'accent marque, motion 3
durées) **sans restyler** (reprendre les valeurs à l'écran). Exposer
`const CET_COLORS = {ok,warn,danger}` en tête d'app.js. Unifier les valeurs qui
divergent (vert JS #7E9E6D ≠ --sage #7E9466 ; rouge JS #B5563A ≠ --danger).
**À faire d'un bloc, avec tests visuels mobile, APRÈS le reste.**

---

## AVANCEMENT (mode autonome, 7 juil)

**FAIT + commité local (non poussé) :**
- ✅ Vague A complète (`417e85e`)
- ✅ C1 volet 1 — DEMARRER.bat accepte CET_API_KEY (`b75b4c6`) — débloquait tout
- ✅ Vague B : B2 (sheets animés), B4 (réglages avancés repliés), B5 (transition
  feu + canal texte), B6 (Boîte noire glosée) — `ca970a0`
- ✅ B1 — feu réel en démo + badge « Exemple » (`ed1e626`)
- ✅ C1 court-terme — « clé API » → « code de connexion » + modèle mental (`236162b`)

**RESTE (à valider/faire avec Adam) :**
- ⏳ **B3** — jauges animées (poser 0% → reflow → cible). NON fait : `innerHTML`
  recrée les spans à chaque tick de polling 30s → risque de clignotement. Demande
  de porter `dataset.filled` sur un conteneur stable (refonte du cycle de rendu
  des cartes). À faire avec soin + test visuel.
- ⏳ **C1 volet 2** — sheet `#setup-sheet` à 5 étapes. Le pré-requis (volet 1) est
  fait, donc c'est désormais honnête à construire. Nouvelle UI substantielle → à
  concevoir/valider visuellement avec Adam (parcours qu'il n'a pas encore vu).
- ⏳ **C2** — consolidation des tokens design system (~40 sélecteurs). Le rapport
  le met explicitement EN DERNIER, « sans restyler », « avec tests visuels mobile ».
  Risque de régression diffuse élevé en autonomie → réservé à un passage avec Adam.

## Recommandation d'ordre (de l'audit)

1. **Vague A — FAIT**.
2. **B4, B6, B2, B5, B1, C1v1, C1-CT — FAITS**.
3. **B3** (jauges) — à faire avec soin (anti-clignotement).
4. **C1 volet 2** (sheet setup 5 étapes) — fort impact onboarding, à concevoir avec Adam.
5. **C2** (tokens) — chantier de fond, en dernier, avec tests visuels.

## Ce qu'il ne faut PAS toucher (garde-fou anti-sur-correction)
Le ton (tutoiement, français simple), les garde-fous d'honnêteté (« candidats à
vérifier »), la métaphore « ta fenêtre fond », « Opus » déjà glosé, le token comme
unité (pas l'euro), l'archi d'accessibilité existante (focus-trap/Échap), les
icônes par état du feu, la stack vanilla, `DEMARRER.bat` nommé dans le bandeau
(c'est le geste réel), `prefers-reduced-motion` déjà géré.
