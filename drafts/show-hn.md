# Brouillon — Show HN / Product Hunt

> A soumettre par Adam. Remplacer https://github.com/arochab/claude-eats-tokens et https://arochab.github.io/claude-eats-tokens/ par les vraies URLs.

---

## Show HN

**Titres possibles (par ordre de préférence) :**

1. `Show HN: Claude Max has no usage API, so I parse its local logs into a phone dashboard`
2. `Show HN: I built a mobile tracker for Claude Code usage because Anthropic won't give you one`
3. `Show HN: Claude Eats Tokens – Track your Claude Max usage from your phone via local log parsing`

**Body :**

```
Claude Max subscriptions have no usage API — Anthropic gives you zero
visibility into how close you are to the 5-hour sliding window that
actually throttles you. The only data source is the JSONL logs Claude
Code writes to ~/.claude/projects/.

I built a Python engine that streams those logs, aggregates by model
and project, and pushes to a free Flask server (Render + GitHub Gist
as durable store to dodge ephemeral disk). A vanilla JS PWA on GitHub
Pages pulls the data so I can check from my phone.

The non-obvious bit: the 5h window is the only real throttle. Weekly
and monthly numbers are noise. The app treats a big week as good news,
not an alarm — it tells you "can I keep going?" instead of showing a
wall of numbers.

Stack: Python, vanilla JS, zero build step, zero dependencies beyond
Chart.js. Repo and live demo in the links.
```

Live demo: https://arochab.github.io/claude-eats-tokens/
Repo: https://github.com/arochab/claude-eats-tokens

---

## Product Hunt

**Tagline (58 chars) :**
`See your Claude usage on your phone before you hit the wall`

**Description (3 phrases) :**
Claude Max doesn't tell you how close you are to getting throttled. Claude Eats Tokens reads your local logs, crunches the numbers, and sends alerts to your phone at 25/50/75/90/95% of the 5-hour window that actually matters. Free, installable PWA — check your runway from anywhere.

---

**Notes pour Adam :**
- HN : poster en semaine, matin US (10h-12h ET) pour max de visibilité
- PH : prévoir un screenshot mobile comme first image, le gif en second
- Le titre #1 est le plus fort car il mène avec la contrainte (pas de API) — c'est l'histoire
