# Brouillon — Comment Reddit r/ClaudeAI "23 trackers"

> A poster par Adam sur le thread listant 23+ trackers.
> AVANT DE POSTER : remplacer REPO_URL et DEMO_URL par les vraies URLs.

---

I know, *another* tracker. I've been using mine daily for a few months though so I figured I'd share what actually stuck for me.

The main thing that bugged me about other trackers: they're all desktop. I wanted to check my usage from my phone between meetings, not alt-tab to a terminal. So I built a PWA — add to home screen and it's just there like any app.

The other thing: most trackers show you numbers, but what I actually care about is "can I keep going or am I about to get throttled?" So instead of showing a dashboard of stats, it basically gives you a traffic light — green/orange/red based on your 5h window, which is the only thing that actually triggers throttling on Max. A big usage week gets a "nice, you're ramping up" message instead of a scary red bar.

It also pings your phone (and PC) when you cross 75% or 90% of the 5h window — I used to hit the throttle wall without warning, now I pace myself.

Worth being upfront about the limitations: Anthropic doesn't publish any hard quotas for Max, so the "percentage" is based on the actual server endpoint when your PC is on, and falls back to a local estimate (clearly labeled) when it's not. The cost in $/€ is also theoretical — on Max you pay a flat fee, so it's more "how much would this have cost at API rates." I'd rather be honest about that than pretend the numbers are more precise than they are.

It's a solo side project, free infra (Render + GitHub Pages), MIT licensed. I use it every day.

[repo](REPO_URL) · [demo on phone (gif)](DEMO_URL)

---

**Notes pour Adam avant de poster :**
- Vérifier que le ton colle au thread (lire les autres réponses d'abord)
- Ajouter un screenshot mobile si possible (plus convaincant que le gif)
- Si le thread est vieux de plusieurs jours, envisager un post séparé plutôt qu'un comment
- Ne pas répondre défensivement si quelqu'un critique — la vulnérabilité marche mieux
