# Email sequence (3 emails, plain-text, ready to paste) — welcome / onboarding, free→Pro conversion, gentle re-engagement

Canal : Transactional + lifecycle email (post-signup). Language: English (early-adopter target is anglophone: Reddit/HN/PH). Send via whatever you already have wired to Supabase auth — Lemon Squeezy's built-in emails, a free Resend/Loops/Buttondown account, or even a manual send for the first handful. No new paid tool required.

---

========================================================
EMAIL 1 — WELCOME / ONBOARDING
Trigger: right after account creation (they now have a cet_ code)
========================================================

SUBJECT: Your connection code is ready — 3 steps to your real numbers

Hey,

Thanks for signing up to Claude Eats Tokens. You're all set on the account side — now let's get your actual usage flowing to your phone. It takes about 2 minutes, and you don't touch anything scary.

Quick reality check first: Claude Max has no usage API. Anthropic gives you zero visibility into how close you are to the 5-hour window that actually throttles you. The only place that data exists is the logs Claude Code writes on your own machine. So the setup is really just: run a tiny script that reads those logs and sends the numbers up. That's it.

Here's the whole thing:

1. Download the engine (a zip) from your dashboard and unzip it anywhere.
2. Paste your connection code once. It starts with cet_ and it's here:
   [YOUR cet_ CODE]
   (You can always find it again in Settings → Account.)
3. Start the engine:
   - Windows: double-click DEMARRER.bat. A black window opens and starts sending your numbers. Leave it open.
   - Mac / Linux: open a terminal in the folder and run
     python tools/push_usage.py --interval 60

That's the finish line. Within a minute your real traffic light shows up on the app — green means fire off the big job, red means you're about to hit the wall.

One honest heads-up: if it says Python is missing, grab it from python.org and tick "Add Python to PATH" during install, then start the engine again. That's the only speed bump anyone hits.

A second honest heads-up: the app's UI is in French for now (I'm French, I built it for myself). English is on the roadmap — but a traffic light and a number read fine in any language, and the engine itself is language-agnostic. If you'd like English sooner, just reply and tell me; that's how I'll decide what to prioritize.

Stuck on any step? Reply to this email — it comes straight to me, and I answer.

— Adam
Claude Eats Tokens
[REPO LINK] · [APP LINK]


========================================================
EMAIL 2 — FREE → PRO CONVERSION
Trigger: 5–7 days after activation (i.e. after the engine has been pushing real data for a few days). Do NOT send to accounts that never activated.
========================================================

SUBJECT: Two things your logs know that you probably don't

Hey,

Now that the engine has been running for a few days, it has enough of your real data to show you two things I think are worth your time. Both are estimates — I'll say so plainly, because that's the whole point of this app — but both are grounded in your actual logs, not a demo.

1. Where your quota actually goes (Black Box)
When your 5-hour window melts faster than it feels like it should, it's usually not you typing. It's the sub-agents Claude spawns in the background — the ones no dashboard shows you. On my own logs, that was 87% of a single window. The Black Box card reads your data and tells you, in one sentence, why the window is draining. Once you see it, you can't unsee it.

2. Where your money leaks (Waste Radar)
Waste Radar flags tasks you ran on Opus that a lighter model could have handled, and puts a rough euro figure on it. It's labeled as an estimate and every flag is a candidate to double-check — no overselling. But it's your waste, on your tasks, quantified. The first time it catches one avoidable Opus run, you've basically found the €5.

That's the honest pitch for Pro, at €5/month:
- Free tells you if you can keep going right now.
- Pro tells you where your window went and where your money leaked — plus push alerts at 25/50/75/90/95% so your phone warns you BEFORE the wall, not after, and full history so the trends actually mean something.

No trial countdown, no pressure. If Waste Radar shows you enough avoidable spend to cover the €5, Pro pays for itself and you'll know it from your own numbers. If it doesn't, Free stays genuinely useful and I'd rather you kept it.

Founder note: because you're one of the early ones, [DROP YOUR LAUNCH OFFER HERE — e.g. "the first 30 Pro subscribers get €3/mo for life with code LAUNCH" — or delete this line if you're not running one].

See your Waste Radar total: [APP LINK]

— Adam


========================================================
EMAIL 3 — GENTLE RE-ENGAGEMENT
Trigger: 10–14 days after signup for accounts that created an account but NEVER sent a first push (never activated). Send once. Do not chase.
========================================================

SUBJECT: Did the engine give you trouble?

Hey,

I noticed your Claude Eats Tokens account is set up but the engine hasn't sent any numbers yet — so right now you're still looking at demo data, not your own.

No worries at all, and no nagging. I mostly want to know: did a step trip you up? For almost everyone who gets stuck, it's one of two things:

- Python wasn't installed, or "Add Python to PATH" wasn't ticked during install. Fix: install from python.org, tick that box, restart the engine.
- The connection code didn't get pasted where the setup asked. Your code (starts with cet_) is always in Settings → Account.

If it was something else entirely, just hit reply and tell me what happened — genuinely, that's the most useful thing you could do, because if it snagged you it's probably snagging others, and I'll fix it.

And if you've simply decided it's not for you, that's completely fine — no more emails after this one. The app stays free and self-hostable (it's MIT, the whole engine is open) whenever you want to come back.

Your dashboard, whenever you're ready: [APP LINK]

— Adam
Claude Eats Tokens

---

**Notes :** LANGUE : les 3 emails sont en ANGLAIS, à dessein. Ta cible early-adopter (Reddit/HN/PH) est anglophone, et c'est elle qui crée les comptes. L'aveu honnête "UI in French for now, English on the roadmap" est intégré dans l'email 1 : il désamorce la surprise au clic ET sert de sonde de demande (les réponses te disent s'il faut prioriser l'i18n). Si un jour tu cibles un public FR, il faudra une variante FR — dis-le-moi.

PLACEHOLDERS à remplacer avant envoi (tout le reste est prêt) :
- [YOUR cet_ CODE] → injecté par ton système d'envoi, ou collé à la main pour les premiers.
- [REPO LINK] → https://github.com/arochab/claude-eats-tokens
- [APP LINK] → https://arochab.github.io/claude-eats-tokens/ (ajoute un UTM par email si tu veux mesurer : ?ref=email-welcome / ?ref=email-pro / ?ref=email-winback — lisible dans tes logs Pages, 0€).
- Email 2, "Founder note" → colle ton offre de lancement Lemon Squeezy si tu en crées une (ex. code LAUNCH, 3€/mois à vie pour les 30 premiers). Sinon SUPPRIME la ligne — ne la laisse pas vide.

TIMING / DÉCLENCHEURS (important, sinon les emails sonnent faux) :
- Email 1 : immédiat, à la création du compte.
- Email 2 : J+5 à J+7 APRÈS ACTIVATION (le moteur a poussé des données). Ne l'envoie JAMAIS à un compte non activé — il parle de "your real data" / "your Waste Radar total" ; sans données réelles il ment.
- Email 3 : J+10 à J+14, UNIQUEMENT aux comptes créés mais jamais activés (aucun push reçu). Une seule fois, pas de relance derrière.
- Ces déclencheurs supposent que tu saches qui a activé. C'est exactement le "first_push_at / activated" recommandé dans la stratégie funnel : un simple timestamp côté Supabase/Render suffit. Sans lui, envoie l'email 2 à la main aux 5-10 premiers activés — c'est tenable au début.

ADN RESPECTÉ (garde-fous) :
- Zéro dark pattern : pas de faux compte à rebours, pas de "trial qui expire". L'offre founder (si tu l'actives) est limitée en NOMBRE, pas par une fausse deadline — c'est réel et honnête.
- "Estimate" et "candidate to double-check" sont dits explicitement dans l'email 2 : le prix 5€ est ancré sur une économie réelle chiffrée (Waste Radar), jamais sur "débloque des features".
- L'email 3 promet "no more emails after this one" et le tient : ne relance pas un non-activé une 2e fois, ça brûlerait la marque.

COHÉRENCE CHIFFRES : j'ai utilisé 87% (sous-agents), 5€/mois, paliers 25/50/75/90/95% — alignés sur README/hosted-strategy. Le prix 5€ est correct (le 3€ dans hosted-version-strategy.md Phase 5 est un résidu à purger, comme noté dans la stratégie — les emails ne le reprennent pas).

RÈGLES PLATEFORME : ce sont des emails transactionnels/lifecycle vers des gens qui viennent de s'inscrire (base opt-in), donc pas de contrainte de type "cold outreach". Ajoute quand même un lien de désinscription si ton outil d'envoi ne l'injecte pas automatiquement (Resend/Loops le font ; un envoi manuel Gmail, non — dans ce cas l'email 3 sert déjà de sortie propre). Pas de spam : l'email 2 ne part qu'aux activés, l'email 3 qu'aux non-activés, jamais les deux à la même personne.

OUTIL D'ENVOI SUGGÉRÉ (0€) : Resend free tier (3000 mails/mois) ou Loops — les deux se branchent sur un événement Supabase. Pour tes 20 premiers inscrits, un envoi manuel depuis Gmail marche aussi et te fait lire chaque réponse (précieux au début).
