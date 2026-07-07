# Show HN post (title + body + author's first comment)

Canal : Hacker News (Show HN) — English

---

========================================
TITLE (paste in the "Title" field)
========================================

Show HN: Claude Max has no usage API, so I parse its local logs on my phone

----------------------------------------
URL (paste in the "URL" field)
----------------------------------------

https://arochab.github.io/claude-eats-tokens/


========================================
FIRST COMMENT (post this yourself, immediately after submitting)
========================================

Author here. Some context on the why and the how.

I'm on Claude Max, and the thing that kept biting me is that there's no usage API. Anthropic gives you zero real-time visibility into how close you are to the 5-hour sliding window that actually throttles you — the one limit that matters day to day. The only place that information exists is the JSONL logs Claude Code writes to ~/.claude/projects/. So I parse those.

How it works:

- A small Python engine streams the JSONL logs line by line (they get big, and occasionally corrupt, so it's streaming + defensive rather than json.load the whole file), aggregates tokens by model and by project, weights a rough cost per model, and emits a single usage.json.
- That gets POSTed to a tiny Flask server on Render (free tier). Render's disk is ephemeral, so the durable store is a private GitHub Gist — a cheap, zero-ops key/value that survives restarts. Auth is a shared secret + HMAC.
- The frontend is a vanilla-JS PWA on GitHub Pages that pulls usage.json. No build step, no framework, no bundler. It falls back to a cached copy when the server is asleep (Render free tier cold-starts take ~50s), and to a demo dataset if you have nothing yet. Add-to-home-screen and it behaves like a native app, with push notifications at 75/90% of your 5h window.

Total infra cost: 0€. GitHub Pages + Render free + a Gist.

The design choice I care most about: it doesn't show you a wall of numbers. It answers one question — "can I keep going, or am I about to get throttled?" — with a traffic light and an ETA. A big usage week gets a "nice, you're ramping up" message instead of a scary red bar, because on Max the weekly/monthly totals are mostly noise; the 5h window is the real throttle.

Two things I didn't expect when I built it, and that turned out to be the parts I actually use:

1. It explains WHY your 5h window is melting, not just that it is. When I broke usage down per task, the biggest eater wasn't me — it was the sub-agents Claude spawns in the background. On one of my own windows that was ~87% of the consumption. I'd never have guessed that from a top-line number. The logs mark sidechain messages, so the share is measured, not inferred.

2. It flags Opus tasks that a lighter model could plausibly have handled, and puts a rough € figure on it. It's framed as "candidates to double-check," never "Sonnet would have been enough" — I genuinely can't know that from a log, and I'd rather under-claim.

On honesty, since HN will (rightly) push on this: the $/€ costs are estimates at API rates — on Max you pay a flat fee, so it's really "what this would have cost on the API," and it says so in the UI. Anthropic publishes no hard quota for Max, so where the app can read the server's own percentage while your PC is on it uses that; otherwise it falls back to a local estimate that's clearly labeled as such. I'd rather show a number with an honest asterisk than a fake-precise one.

Timing note: Anthropic temporarily raised the 5h/weekly limits through July 13, so the wall is a bit further out this week than it'll be next week — which is roughly when I started missing a real-time view again.

One heads-up: the UI is in French for now (I'm French, built it for myself first). The engine and logic are language-agnostic and an English UI is on the roadmap — the traffic light, the numbers, and the demo read fine without French, but I want to be upfront so nobody's surprised on click-through. If there's interest here I'll prioritize it.

Stack: Python (stdlib + Flask), vanilla JS, Chart.js, zero build. Repo is MIT: https://github.com/arochab/claude-eats-tokens — engine is in tools/usage_core.py with tests. Happy to answer anything about the log format or the parsing; that part was the fun bit.

---

**Notes :** TIMING (do this in the July 8-13 window — before the raised limits drop back on July 13):
- Post Tue/Wed/Thu, ~10:00-12:00 US Eastern (that's ~16:00-18:00 Paris). Avoid weekends and Mondays.
- Post the FIRST COMMENT within 1-2 minutes of submitting, then STAY at your desk for the next 2-3 hours and reply to every comment fast. Early author engagement is what HN's ranking rewards. If it doesn't take off in the first 60-90 min, don't repost the same day — try again another morning.

HN RULES / FORMAT (respect these, HN is strict):
- Title MUST start with "Show HN:" and describe what it IS, not sell it — no hype words, no exclamation marks, no ALL CAPS. The one I gave is factual and passes.
- The URL field should point to the LIVE APP (the thing people can try), not the repo. The repo link lives inside the comment. HN prefers "something people can look at."
- Do NOT paste marketing copy as the post body — a Show HN's "body" is the URL; the real pitch is your first comment. That's why the deliverable is a comment, not a body blurb.
- Do NOT mention the Pro plan, pricing, or the 5€/mo anywhere in the thread. HN punishes anything that smells like a sales pitch. Let people find the paywall inside the app. (This is deliberate per the GTM plan — community register only.)
- No fake urgency, no "first 30 users" discount code here (save the founder-pricing offer for Reddit/PH if at all — it's fine there, not on HN).

BEFORE YOU POST (5-min credibility check — HN readers open the repo):
- The repo has a known internal inconsistency the strategy flagged: README says schema v4, CLAUDE.md says v3, the code (pwa/app.js) actually says v5, and tests are cited as "101" in README vs "75" in your notes. I deliberately kept ALL of these OUT of the post so a reader can't catch a contradiction between your words and the repo. But ideally align them in the repo first (pick v5 everywhere, confirm the real test count) — an HN reader who spots README-says-v4 / code-says-v5 will doubt the honest-numbers pitch, which is your whole brand.
- The 87% sub-agent figure and the Waste Radar € logic are REAL (verified in tools/push_usage.py + pwa/format.js) — safe to state. Keep the "one of my own windows" phrasing so it reads as your measured anecdote, not a universal claim.

WHAT I CHANGED vs the existing draft (drafts/show-hn.md):
- Picked the constraint-first title (the draft's #1 preference) but trimmed it so it fits and leads with "no usage API."
- Moved the real pitch into the author's first comment (correct HN shape) instead of a "body" block.
- ADDED the two non-copyable differentiators that were missing from all public comms: the Black Box (sub-agents ~87%) and Waste Radar (€) — per the GTM priority #1.
- ADDED the honest French-UI heads-up and the July-13 timing hook.
- Kept the honesty section (estimates, labeled fallback) because HN specifically rewards it.

AFTER POSTING:
- Add a mobile screenshot to the README/app if you can (the traffic light + the Black Box "these are your sub-agents, not you — 87% of this window" line) — commenters who click will convert better with it, and you can link it in a reply if someone asks "what does it look like?".
- If the thread gets traction, that becomes social proof for the Reddit r/ClaudeCode post and Product Hunt 2-3 days later.
