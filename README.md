# Claude Eats Tokens — how hungry is Claude today?

> **Claude has a serious appetite. This is the kitchen scale.**
> Claude Code logs every token it devours; a tiny push server beams the numbers to an installable PWA with budgets, live gauges and alerts before Claude eats your whole plan.

### → [**Open the live app**](https://arochab.github.io/claude-eats-tokens/) · [Source](https://github.com/arochab/claude-eats-tokens)

![Claude Eats Tokens](demo.gif)

The joke writes itself — Claude Code is a hungry beast, and you can't see, from your phone, how much it's eaten today. That's not laziness on Anthropic's part: the Max plan genuinely ships **no usage API**, so there's no number to fetch. But Claude Code already writes every token count to local JSONL logs. So this app does the only honest thing: a small script on your PC reads those logs, totals the damage, and pushes it to a free server; an installable web app then shows where you stand — budgets, rolling windows, projections — and pings you before Claude licks the plate clean. Built in the Anthropic design language, free end to end.

---

## How it works

A static PWA + a tiny push server, glued by Claude's own eating habits:

```
   PC reads ~/.claude/projects   ─►  POST /push  ─►  Render (Flask)  ─►  Gist (durable store)
        │  (tools/push_usage.py)                          │
        ▼                                                 │ GET /usage.json
   tallies up the tokens                                  ▼
   (day · week · 5h window)                       PWA on GitHub Pages
                                                   data/usage.json (fallback)
```

1. **The PC is the source of truth.** `tools/push_usage.py` reads Claude Code's local JSONL logs, deduplicates streaming entries, and aggregates tokens by day, model, project, and rolling 5h / 7d windows — there is no cloud API for Max usage, so the logs *are* the data.
2. **A free server holds the latest numbers.** A Flask app on **Render** receives the push (guarded by a shared secret) and stores it in a **private GitHub Gist**, surviving the free tier's ephemeral disk.
3. **The PWA shows you where you stand.** Installable from **GitHub Pages**, it reads the freshest numbers (server → Pages fallback → demo) and renders budget rings, a calendar heatmap, an input/output/cache donut, pace projection, and threshold notifications.

## The honest small print

No hand-waving — here's what's true:

- **There is no official "tokens left" on Max.** The real limit is rolling usage windows (≈5 hours) that reset, not a monthly counter. So you set your *own* ceilings and the app tracks them.
- **The € / $ figure is an estimate.** On Max you pay a flat subscription, not per token. The cost shown is your usage *valued* at public API rates — read it as "what this would've cost on the API", not a bill.
- **The numbers come from your own logs**, parsed locally. Nothing about your prompts leaves your machine — only aggregate token counts are pushed.

## Design system

Built in the Anthropic design language — not bolted on:

- **Palette** — Cream `#F0EEE6` · Slate `#1A1915` · Terracotta `#CC785C` · Clay `#D4A27F` · Sky `#6A8CAF` · Sage `#7E9E6D`
- **Type** — editorial serif for headline numbers, clean sans-serif for UI, generous whitespace
- **Components** — progress rings that shift to amber then terracotta near a limit, GitHub-style intensity calendar, animated donut
- **Tone** — calm, precise, mobile-first. Everything lives in `pwa/styles.css`.

## Run it locally

```bash
git clone https://github.com/arochab/claude-eats-tokens.git
cd claude-eats-tokens

# --- Front end: just open the static site ---
python -m http.server 8000   # → http://localhost:8000

# --- Push server (optional) ---
pip install -r server/requirements.txt
export PUSH_SECRET="a-long-secret"
python server/app.py          # → http://localhost:5000

# --- Push your real numbers from this PC ---
export PUSH_URL="http://localhost:5000"
python tools/push_usage.py --once
```

The app renders fully without the server — it falls back to `data/usage.json`, then to a bundled demo dataset.

## Deploy (free, end to end)

1. **Front → GitHub Pages.** Push to `main`; the workflow in `.github/workflows/pages.yml` publishes the static site to `https://arochab.github.io/claude-eats-tokens/`.
2. **Server → Render.** Deploy `server/` via the `render.yaml` blueprint; set `PUSH_SECRET` (and `GITHUB_TOKEN` + `GIST_ID` for durable storage).
3. **Wire it up.** Put your Render URL in `pwa/config.js` (`window.CLAUDE_EATS_TOKENS_SERVER`).
4. **Run the PC pusher.** Double-click `DEMARRER.bat` (it loops `tools/push_usage.py`).
5. **Install on your phone.** Open the Pages URL → *Add to Home Screen* → enable notifications in ⚙️.

## Set your own budgets

Since Max has no official "tokens left", you set the ceilings: day / week / month / 5h / 7d / API credits, the $→€ rate, the alert threshold, and your active projects with estimated token weights. The app then tells you whether your remaining budget covers what's in flight — i.e. whether Claude is about to eat more than you've plated up. All of it lives in the phone's local storage (⚙️ screen).

## Tech & skills demonstrated

- **PWA** — installable manifest, root-scope service worker, offline cache, threshold Web Notifications.
- **Local-data pipeline** — parsing Claude Code JSONL, deduplication, rolling-window aggregation, cost estimation.
- **Zero-cost durable backend** — Flask on Render + a private GitHub Gist as a database, sidestepping ephemeral disk.
- **CI deployment** — GitHub Actions publishes the PWA to Pages on every push.
- **Data visualization** — budget rings, calendar heatmap, donut and trend deltas in vanilla JS + Chart.js.
- **Design systems** — the Anthropic palette and editorial type reproduced in pure HTML/CSS.

## Repo map

```
index.html              landing + dashboard (front root, for Pages scope)
pwa/                    app.js · styles.css · config.js · manifest · icons
service-worker.js       push + cache (root, for full scope)
data/usage.json         latest numbers (pushed) · usage.demo.json (sample)
server/app.py           Flask push server (Render) + requirements.txt
tools/push_usage.py     PC-side: read logs → aggregate → POST /push
.github/workflows/      pages.yml — deploy PWA on push
DEMARRER.bat            one-click PC pusher (Windows)
```

## License

[MIT](LICENSE) · Built by [Adam Chabbi](https://github.com/arochab) · [☕ Buy me a coffee](https://buymeacoffee.com/arochab)
