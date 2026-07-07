# Product Hunt launch (tagline + description + first maker comment + key points)

Canal : Product Hunt — anglais (cible internationale devs/power-users Claude Code)

---

═══════════════════════════════════════════════
 1. NAME (le champ "Name" du produit)
═══════════════════════════════════════════════

Claude Eats Tokens

═══════════════════════════════════════════════
 2. TAGLINE  (max 60 caractères — celle-ci = 59)
═══════════════════════════════════════════════

Know if you can fire the big job before you hit the wall

  ── Alternatives si tu préfères (toutes ≤ 60 car.) ──
  • Your Claude Max throttle, on your phone before the wall  (56)
  • Not a usage dashboard — a Claude throttle assistant       (57)
  • See how close your Claude Max quota is, on your phone     (55)

═══════════════════════════════════════════════
 3. DESCRIPTION  (le champ court sous la tagline — ~260 car.)
═══════════════════════════════════════════════

Claude Max gives you no usage API, so you never know how close you are to the 5-hour throttle. This reads your local Claude Code logs and shows it on your phone — with alerts before the wall, an audit of your wasted Opus spend (in €), and why your window is really melting.

═══════════════════════════════════════════════
 4. FIRST COMMENT (MAKER)  — à coller en 1er commentaire dès la mise en ligne
═══════════════════════════════════════════════

Hey Product Hunt 👋

I'm Adam, solo maker, and I built this because Claude Max drove me a little crazy: there's **no usage API**. On the Max plan you genuinely can't see how close you are to the 5-hour sliding window that actually throttles you — unless you're sitting at your desk staring at Claude Code. Every other tracker I found was a desktop dashboard. I wanted to know from my phone, between meetings, whether I could fire off a big job or was about to hit the wall.

So this isn't really a usage dashboard — it's a **throttle assistant**. It reads the JSONL logs Claude Code writes locally, and instead of a wall of numbers it gives you a traffic light: green / orange / red on your real 5-hour window, plus an ETA to the wall and plain-language advice. A big week gets a "nice, you're ramping up" — not a scary red bar. And it pushes a notification to your phone at 75% / 90%, so you pace yourself instead of getting cut off mid-task.

Two things surprised me while building it, and they're the parts I'm proudest of:

**1. Waste Radar** — it flags Opus tasks that a lighter model could've handled, and puts a € number on it. On my own logs it kept finding avoidable premium spend I had no idea about. It basically audits your own waste.

**2. Black Box** — when your 5-hour window melts faster than usual, it tells you *why* in one sentence. Usually it's not you — it's the sub-agents Claude spawns in the background that you never see. On one of my windows that was **87%** of the whole thing. No other tracker surfaces this per-task, on your phone.

Honesty is kind of the whole point of this thing, so let me be upfront:
• Anthropic publishes no hard quota for Max, so the "%" uses the real server signal when your PC is on and falls back to a clearly-labeled local estimate when it isn't.
• The €/$ cost is an **estimate** at API rates — on Max you pay a flat fee, so it's "what this would've cost." I'd rather say that than pretend the numbers are more precise than they are. Waste Radar shows *candidates* to double-check, never verdicts.

**Heads up:** the UI is in French for now (I'm French, built it for myself). English is on the roadmap — the engine and logic are language-agnostic, and honestly the traffic light + the numbers read fine either way. If there's interest here I'll prioritize it. The demo works with no account, so you can see the whole thing in one tap.

It's free to run and free to use (GitHub Pages + Render + Supabase, all free tiers), MIT-licensed engine, 146 tests. There's an optional Pro at 5€/mo that unlocks the full Waste Radar detail and history — and for anyone who comes from this launch, the first 30 supporters get founder pricing at 3€/mo for life (just DM me or drop a comment). No pressure at all: Free already answers "can I keep going?" completely.

I'll be around all day — genuinely want to hear where the honest-vs-estimate line feels right or wrong to you, and whether the sub-agent insight matches what you see in your own logs. Thanks for taking a look 🙏

— Adam

Live app: https://arochab.github.io/claude-eats-tokens/
Repo (MIT): https://github.com/arochab/claude-eats-tokens

═══════════════════════════════════════════════
 5. KEY POINTS  (les "bullets" / highlights du produit — 5)
═══════════════════════════════════════════════

• Only Claude tracker built for your phone — a real installable PWA with push alerts, not a desktop dashboard you have to sit at.

• A throttle assistant, not a stat wall — traffic light + ETA to the wall + plain-language advice on your real 5-hour window (the one that actually throttles Max).

• Waste Radar — audits your own usage and flags Opus tasks a lighter model could've handled, quantified in € (candidates to verify, not verdicts).

• Black Box — explains WHY your 5-hour window is melting: usually the invisible sub-agents Claude spawns in the background (87% of one of my windows).

• Honest by design & free to run — "estimate" vs "official" clearly labeled, MIT engine, 146 tests, 0€ infra. Optional Pro at 5€/mo.

---

**Notes :** TIMING (important) — Poster entre le 8 et le 13 juillet 2026. Anthropic a temporairement relevé les limites 5h/hebdo jusqu'au 13 juillet ; après, le mur du throttle redevient douloureux pour les abonnés Max. Idéalement lancer le HN d'abord (mardi-jeudi ~10h-12h ET), puis PH 2-3 jours après pour surfer la traction/les stars GitHub. Sur PH, publier à 00:01 PT (heure de reset du classement) pour maximiser la fenêtre de 24h.

ORDRE DE PRIORITÉ des canaux (rappel stratégie) : Show HN #1 → r/ClaudeCode → r/ClaudeAI → Product Hunt en DERNIER (canal de repli structuré, pas prioritaire). Ne PAS tout poster le même jour.

BLOQUANT VISUEL — PH exige des images. Il te faut au minimum 1 screenshot mobile vertical en première image (pas le gif en premier, il est moins lisible en aperçu). Idéal = les 3 captures recommandées : (1) feu tricolore VERT + ETA, (2) notif tél de palier "75%" sur écran verrouillé, (3) Waste Radar avec un montant € réel. Annote-les en anglais (overlay texte) puisque l'app est en FR. Le gif/mp4 existant peut venir en dernière position de la galerie. SANS au moins une image mobile propre, ne lance pas le PH.

RÈGLES PLATEFORME PH à respecter :
- Tagline STRICTEMENT ≤ 60 caractères (celle fournie = 59, OK).
- Le "Name" ne doit pas répéter la tagline.
- Choisis 3-4 "topics" pertinents : Developer Tools, Artificial Intelligence, Productivity, Open Source.
- Le 1er commentaire maker doit être posté par TOI (le maker), immédiatement après la mise en ligne — c'est lui qui porte le récit.
- Réponds à CHAQUE commentaire dans les 2h le jour du lancement (l'algo PH récompense l'engagement précoce). Ton : reconnaissant, jamais défensif ; si on critique l'estimation ou le FR, remercie et confirme que c'est assumé.
- N'utilise PAS de faux compte à rebours ni de "hunter" payé : l'offre founder (3€/mois à vie, 30 premiers) est RÉELLE et limitée en nombre, pas en fausse date — c'est le seul levier d'urgence compatible avec l'ADN honnêteté.

COHÉRENCE CHIFFRES avant de poster (l'audience PH/HN vérifie le repo) : le prix affiché doit être 5€ partout (purger le résidu 3€ de la roadmap Phase 5, sauf l'offre founder qui est bien 3€ à vie), et le nombre de tests = 146 partout. Une incohérence visible dans le repo MIT sabote le différenciateur "honnêteté".

DISCLAIMER FR : la ligne "UI in French for now, English on the roadmap" est volontairement dans le commentaire maker — elle désamorce la surprise au clic et renforce la marque honnêteté. Ne la retire pas.

PRO / FUNNEL : le Pro (5€) et l'offre founder sont mentionnés une seule fois, en bas du commentaire, sur un ton "no pressure, Free already answers the question" — pas de pitch de vente agressif (casserait le ton communautaire qui convertit sur PH). Le récit de valeur est ancré sur Waste Radar en € ("audits your own waste"), jamais sur "débloquer des features".
