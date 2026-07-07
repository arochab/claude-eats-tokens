# Sales / landing page copy (hero + benefits + how-it-works + pricing + FAQ)

Canal : Landing page publique (README top / future .com / lien depuis Reddit-HN-PH). Anglais — cible early adopters anglophones Claude Code.

---

# Claude Eats Tokens

## HERO

**Headline:**
Know if you can fire off that big job — or if you're about to hit your Claude Max wall.

**Sub-headline:**
Claude Max has no usage API. You can't see how close you are to the 5-hour window that actually throttles you — unless you're sitting at your desk staring at Claude Code. This reads your local logs and puts the answer on your phone: a traffic light that says *keep going* or *pump the brakes*, before you hit the wall.

**Primary button:** Try the live demo — no signup
**Secondary button:** See it on GitHub (MIT)

**Trust line (small, under the buttons):**
Free, installable web app · works on Windows too · your data stays on your machine · open-source engine · 146 tests

**Honest heads-up (one small line, keep it):**
Heads-up: the app UI is in French for now (I'm French, built it for myself). The traffic light and the numbers read fine without it — English is on the roadmap.

---

## THE ONE-LINER (reuse everywhere — under the hero, in posts, in the repo)

It doesn't just count your tokens — it audits your waste (in €) and shows you where your quota actually went: the sub-agents you never see.

*Not a usage dashboard. A throttle assistant.*

---

## 3 BENEFIT BLOCKS

### 1. It lives on your phone, and it warns you before the wall

Every other Claude tracker is a desktop dashboard you have to be sitting at. This one installs on your phone like a normal app — check your runway from the couch, the train, a meeting. And it pings you *before* you get cut off: a notification when your 5-hour window crosses 75%, 90%, 100%. No more hitting the throttle mid-task with zero warning.

It's the only Claude tracker that actually lives in your pocket.

### 2. Waste Radar — it audits your own spending, in euros

Running Opus on a task Sonnet could've handled? Waste Radar flags it, per task, and puts a real number on it: *"~14€ of avoidable Opus spend this month — tasks a lighter model could have run."* Computed on **your** actual logs, not a generic tip.

It's the one feature that pays for itself: catch one wasteful habit and Pro has already covered its own cost. (Every figure is labeled an estimate and framed as a candidate to double-check — never a verdict. That's the whole point.)

### 3. Black Box — it tells you *why* your 5-hour window is melting

Your window is draining twice as fast as usual and you don't know why? Black Box answers in one plain sentence. Usually it's not you — it's the sub-agents Claude spawns in the background, invisible to every other tracker. On my own logs, those sub-agents ate **87% of a single 5-hour window**. No other tool surfaces this, per task, on your phone.

This is the thing 23 other trackers can't copy: per-task data, on the device in your pocket.

---

## HOW IT WORKS

**1. Claude already writes down everything it eats.**
Claude Code logs every token it burns to local files on your machine (`~/.claude/projects`). There's no cloud API for Max usage — those logs *are* the data. Nothing to instrument, no hooks to inject.

**2. A tiny engine reads them and does the math.**
A small script on your PC streams those logs, aggregates by model, project, and rolling window, and figures out where you stand. It runs quietly in the background (auto-start on Windows, no terminal to keep open).

**3. Your phone shows the answer.**
Open the installable app and get one verdict — 🟢 keep going / 🟠 heating up / 🔴 ease off — plus an ETA before you'd get throttled, your real windows, Waste Radar, and Black Box. The engine can run entirely local first (see your real numbers on your PC in a minute); creating an account is only for pushing them to your phone.

*Honest by design: only the 5-hour window — the one real throttle on Max — can turn the light orange or red. A big week gets a "you're ramping up," not a scary red bar. Cost in € is an estimate at API rates (on Max you pay a flat fee). Any limit percentage falls back to a clearly-labeled estimate when your PC is off — never a made-up number dressed up as official.*

---

## PRICING

**Free — the answer to "can I keep going right now?"**
- Traffic-light verdict (green / orange / red) + ETA before throttle
- Your real official 5-hour and weekly window percentages
- Today / this week / your pace, 7-day trend, projects list
- "Where you land" — Discovery → Regular → Heavy → Power-user
- One safety-net push notification: window full (100%)
- A real, numbered preview of Waste Radar — your total avoidable spend this month

**Pro — 5€/month — memory, anticipation, and the whole thing on your phone**
- Step notifications at 25 / 50 / 75 / 90 / 95% — warned *before* the wall, not after
- Full history (30 days → unlimited) + month-over-month comparisons
- End-of-month projection
- Project drill-down (donut, per-session breakdown), CSV / PNG export
- **Waste Radar** — full per-task breakdown of avoidable Opus spend, in €
- **Black Box** — the one-sentence "why your window is melting" card

Annual: **40€/year** (two months free — ~3.33€/mo).

*Why 5€: it's less than a coffee and a half, and Waste Radar is built to pay it back — the first wasteful task it catches covers the month. No fixed cost on my side, so nothing here depends on locking you in. The engine stays MIT open-source; you can always self-host the whole thing for free.*

**Button:** Go Pro — 5€/mo
**Under button:** Cancel anytime · billing handled by Lemon Squeezy (EU VAT, invoices, no account juggling)

---

## SHORT FAQ

**Is this an official Anthropic tool?**
No. It's an independent, open-source side project. Anthropic doesn't publish hard quotas for Max, so wherever the app can't get the real server percentage, it says so and falls back to a labeled estimate. It never invents a number and calls it official.

**Do you see my data / my code?**
The engine reads your Claude Code logs on your own machine. Free/self-hosted, nothing leaves your PC. If you create an account to see your numbers on your phone, only the aggregated usage totals are synced — never your prompts, your code, or the content of your sessions.

**Does it work on Windows?**
Yes — Windows included, with a one-time auto-start setup so you never touch a terminal again. Most Claude trackers are macOS/Linux only; this one isn't.

**Is the €/$ cost my real bill?**
No — on Max you pay a flat fee. The cost figure is "what this would've cost at API rates," clearly labeled as an estimate. It's there to power Waste Radar, not to invoice you.

**Why another tracker?**
Fair. Most are desktop analytics dashboards — great at showing you what already happened. This one is built around a different question: *should I fire off this job now, or wait?* It's on your phone, it warns you before the wall, and it's the only one that shows you the invisible sub-agents draining your window. If you just want charts, the others are excellent. If you want a heads-up in your pocket, this is the one.

**What do I need to get started?**
A Claude Max/Pro subscription and Claude Code. Open the live demo now (no signup) to see exactly what it looks like; run the local engine when you want your real numbers.

---

**Notes :** USAGE / TIMING
- Langue: écrit en ANGLAIS car les canaux d'acquisition (Reddit r/ClaudeCode, HN, Product Hunt, X) visent des anglophones. C'est le copy à mettre en haut du README (remplace/complète la section "Why this one?"), sur le futur .com, et à lier depuis chaque post. Une version FR pourra reprendre le H1 fonctionnel + la métaphore "pèse-personne" en sous-titre chaleureux pour l'app elle-même.
- Timing prioritaire: viser la fenêtre 8-13 juillet 2026. Anthropic a relevé temporairement les limites 5h/hebdo jusqu'au 13 juillet; après, la douleur du throttle revient. Le hero surfe pile cette douleur — publier avant que l'urgence retombe.

GARDE-FOUS ADN "HONNÊTETÉ" (respectés dans le copy, à NE PAS diluer si tu édites)
- Le "87%" est présenté comme un fait mesuré sur MES propres logs ("On my own logs"), jamais comme une promesse universelle. Ne pas le transformer en "87% for everyone".
- Waste Radar et tout % de limite sont étiquetés "estimate / candidate to double-check". Ne jamais retirer ces qualificatifs — c'est le différenciateur de marque, pas une précaution optionnelle.
- Aucun dark pattern: pas de faux compte à rebours, pas de "il ne reste que X places". Le "5€ se rembourse seul" est ancré sur une économie réelle chiffrée (Waste Radar en €), seul argument de valeur non-manipulatoire.
- Le disclaimer FR est volontairement dans le hero: il désamorce la surprise au clic ET renforce la marque honnêteté. Le garder.

COHÉRENCE CHIFFRES (à aligner AVANT diffusion — repéré dans la synthèse, sinon un lecteur HN doute de tout)
- Prix: 5€ partout. Purger le résidu "3€" dans hosted-version-strategy.md (Phase 5, ligne 141) avant de montrer le repo.
- Tests: README dit 101, MEMORY.md dit 75 — mettre MEMORY à jour à 101.
- Schéma: README/SCHEMA disent v4, CLAUDE.md dit v3 — trancher v4 et corriger CLAUDE.md.
Ces trois-là sont dans des fichiers publics du repo MIT que les posts pointent; une incohérence sabote le seul actif marketing gratuit (l'honnêteté affichée).

À AJOUTER (non fourni ici, bloquant pour PH, réclamé par tous les drafts)
- 1 screenshot mobile vertical montrant le feu tricolore ORANGE + la phrase Black Box "sous-agents 87%" dessous. C'est l'image qui prouve les 2 moats d'un coup (mobile + insight non-copiable). Annoter en EN. Éviter le screenshot "radar 3D + courbes" qui nous range chez les dashboards. 20 min avec le simulateur mobile du navigateur, 0€.

MESURE (pour savoir si ce copy convertit)
- Mettre un UTM par canal sur le lien (?ref=hn / ?ref=reddit-cc / ?ref=ph) + un analytics gratuit (GoatCounter/Plausible self-host). Suivre GitHub stars/jour comme proxy HN, et compter free/Pro dans Supabase vs objectif (20 free / 5 Pro à 1 mois).

RÈGLES PLATEFORME
- Ne PAS coller ce copy commercial tel quel dans un post Reddit/HN (ils détestent la pub). Ce copy est la DESTINATION (landing) vers laquelle les posts communautaires (ton "solo side project", registre humble) renvoient. Les drafts Reddit/HN gardent leur ton perso; seule la landing porte le pricing.
- Product Hunt: le hero + les 3 blocs + FAQ conviennent directement à la page produit PH.
