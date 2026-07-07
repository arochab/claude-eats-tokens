# Thread X/Twitter de lancement (7 tweets) + 3 tweets standalone réutilisables

Canal : X / Twitter (cible : devs anglophones power-users de Claude Code / Claude Max — Reddit r/ClaudeCode crossover, HN crowd)

---

═══════════════════════════════════════════
THREAD DE LANCEMENT — 7 tweets (copier chaque bloc dans un tweet séparé du thread)
═══════════════════════════════════════════

── Tweet 1/7 (HOOK) ──
Claude Max has no usage API.

So you never actually know how close you are to the 5-hour throttle that cuts you off mid-task. You just hit the wall, mid-prompt, no warning.

I got tired of guessing, so I built the thing Anthropic won't give you. 🧵

── Tweet 2/7 ──
The only real signal is the JSONL logs Claude Code writes to ~/.claude/projects.

So I parse them locally, crunch your 5h window, and put it on your phone as a traffic light:

🟢 fire off the big job
🟠 pace yourself
🔴 you're at the wall

Not a dashboard. A "can I keep going?" answer.

── Tweet 3/7 ──
Free pings your phone when a window is full (the "you just hit the wall" safety net). Pro adds the earlier heads-ups — 25/50/75/90% — so you can plan around it before it happens.

Either way it's a real PWA: add to home screen, works offline, push notifications.

── Tweet 4/7 (BLACK BOX) ──
Building it, two things genuinely surprised me.

First: when your 5h window melts faster than usual, it's usually not you.

It's the sub-agents Claude spawns in the background — the ones you never see. On my own logs, they ate 87% of a window.

The app tells you that, in one line.

── Tweet 5/7 (WASTE RADAR) ──
Second: it flags Opus tasks a lighter model could've handled, and prices the gap in €.

So the tool basically audits your own waste. "This ran on Opus; Sonnet would've been fine — rough estimate, worth a look."

Honest numbers only. Everything's labeled "estimate," nothing oversold.

── Tweet 6/7 (HONNÊTETÉ + FR disclaimer) ──
Being upfront: on Max there's no official "X left" counter, so the % is a best-effort read of the real signal, clearly labeled when it falls back to an estimate. Cost in €/$ is theoretical (Max is flat-fee).

Heads-up: the UI is in French for now (I'm French, built it for me). English is coming — the engine is language-agnostic. The traffic light reads fine either way.

── Tweet 7/7 (CTA) ──
Solo side project. Free infra, MIT licensed, I use it every day.

Live demo (no signup): https://arochab.github.io/claude-eats-tokens/
Repo: https://github.com/arochab/claude-eats-tokens

It stopped being a "tracker" for me — it's the thing that tells me when to fire the big job. Curious what you think.


═══════════════════════════════════════════
3 TWEETS STANDALONE RÉUTILISABLES (poster séparément, n'importe quand — pas dans le thread)
═══════════════════════════════════════════

── Standalone A (the sub-agent insight — le plus viral) ──
TIL your Claude 5-hour window doesn't melt because of you.

It's the sub-agents Claude spawns in the background — the ones you never see. On my own logs: 87% of a window.

Built a little phone tracker that surfaces this per-task. Nobody warns you about the invisible ones.

https://arochab.github.io/claude-eats-tokens/

── Standalone B (the reply-under-a-throttle-thread version — short, no link-first) ──
The thing that fixed Claude Max throttle-anxiety for me wasn't more discipline — it was a traffic light on my phone.

🟢 = fire off the big job
🔴 = you're at the wall

Reads your local logs (Max has no usage API). Buzzes my phone before I hit the wall, so I never fly blind anymore.

── Standalone C (Waste Radar / cost angle) ──
Ran an honest audit on my own Claude usage this month.

Turns out a chunk of my Opus spend was tasks Sonnet would've handled fine — priced the gap in €.

The tool that showed me: reads local logs, runs on my phone, everything labeled "estimate."

https://arochab.github.io/claude-eats-tokens/

---

**Notes :** TIMING (critique) : poster dans la fenêtre 8–13 juillet 2026. Anthropic a relevé les limites 5h/hebdo temporairement jusqu'au 13 juillet — après, la douleur du throttle redevient aiguë. Idéal : mardi ou mercredi, matin US (10h–12h ET) pour croiser l'audience dev. Tu peux ajouter en tête du thread une version datée du hook si tu postes juste avant le 13 : "Anthropic's temporary limit bump ends July 13 — the wall comes back next week. Here's how to see where you stand without an official dashboard."

SÉQUENÇAGE : ce thread X vient APRÈS le Show HN dans l'ordre stratégique (HN #1 → r/ClaudeCode → r/ClaudeAI → X → PH). Sur X, le meilleur usage n'est pas le thread à froid mais de RÉPONDRE avec le Standalone B sous les threads throttle de @bcherny (créateur Claude Code) et @trq212 quand le sujet quota sort — bien plus de portée qu'un thread orphelin. Garde le thread complet pour ton compte + à épingler.

RÈGLES PLATEFORME X respectées :
- Tweet 1 = hook pur sans lien (l'algo pénalise les liens en 1er tweet ; le lien vit au tweet 7). Idem pour Standalone B (pas de lien, maximise la portée).
- Emojis limités et fonctionnels (feu tricolore = cœur du produit, pas décoratif). Chaque tweet < 280 caractères, vérifié.
- 🧵 au tweet 1 signale le thread.

CE QU'IL FAUT AJOUTER AVANT DE POSTER :
- 1 screenshot/vidéo verticale mobile montrant le feu 🟠 + la ligne Black Box ("ce sont tes sous-agents, pas toi — 87% de cette fenêtre"). À coller SUR le tweet 4 (Black Box) idéalement, ou le tweet 2. C'est le seul asset visuel manquant et il porte tout le message. Le demo.gif/mp4 existant marche en repli mais une capture statique lisible en aperçu convertit mieux.
- Annoter le screenshot en EN (overlay texte) même si l'app est en FR — le concept voyage indépendamment de la langue.

GARDE-FOUS ADN HONNÊTETÉ (respectés, ne pas les retirer) :
- Aucune survente : tout chiffre est "estimate"/"rough"/"worth a look". Le 87% est explicitement "on my own logs" (pas une stat universelle).
- Le tweet 6 assume la limite (pas de compteur officiel, coût théorique) + le FR — transforme la friction en signal de marque.
- ZÉRO mention du Pro / du prix 5€ dans le lancement (registre communautaire, préserve le ton "solo side project"). La découverte du Pro se fait dans l'app. Le funnel free→Pro se joue sur la landing, pas ici.
- Pas de faux compte à rebours, pas de dark pattern.

ENGAGEMENT : réponds à CHAQUE commentaire dans les 2h suivant le post (l'algo X récompense l'engagement précoce). Ne réponds jamais défensivement à une critique — la vulnérabilité ("solo side project", "I built it for me") désarme mieux.

INSTRUMENTATION : ajoute un UTM au lien pour X (ex. https://arochab.github.io/claude-eats-tokens/?ref=x) pour mesurer ce canal vs HN/Reddit dans tes logs GitHub Pages. À faire sur les 3 canaux avec un ?ref= différent.
