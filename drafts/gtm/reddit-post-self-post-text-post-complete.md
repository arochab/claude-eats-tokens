# Reddit post (self-post / text post) — complete, ready to paste. Includes title, body, and a r/ClaudeCode variant.

Canal : Reddit — primary: r/ClaudeAI · variant: r/ClaudeCode

---

════════════════════════════════════════
PRIMARY POST — r/ClaudeAI
════════════════════════════════════════

TITLE:
I got tired of hitting the Max 5h throttle with zero warning, so I built a phone app that reads Claude's local logs and tells me when I'm about to hit the wall

BODY:

I know — *another* Claude tracker. There are like 23 of them now. I almost didn't post. But I've been using mine every single day for a few months and two things it surfaced genuinely surprised me, so I figured it was worth sharing even if you scroll past.

**The problem I actually had**

On Max there's no usage API. Anthropic gives you zero visibility into how close you are to the 5-hour sliding window — which is the thing that actually throttles you, not the daily or weekly totals. So I'd fire off a big refactor, walk away, come back, and Claude Code was throttled mid-task with no warning. The only real data source is the JSONL logs Claude Code writes to `~/.claude/projects/`.

Most trackers I tried parse those logs and give you a desktop dashboard full of numbers. Two things bugged me:

1. **They're all desktop.** I wanted to glance at this from my phone between meetings, not alt-tab to a terminal I have to be sitting at.
2. **Numbers aren't the question.** I don't want a wall of stats. I want one answer: *can I fire off this big job right now, or am I about to hit the wall?*

So mine is a PWA — add to home screen, it behaves like a normal app. Instead of a dashboard it's basically a **traffic light**: green / orange / red based on your 5h window, plus a rough ETA to the wall. It pings my phone at 75% and 90% so I can pace myself instead of getting cut off mid-task. A big usage week gets a "nice, you're ramping up" message instead of a scary red bar — the light only fires on the one signal that actually throttles you.

**The two things that surprised me building it**

This is the part I didn't expect, and it's why I kept using it:

- **Where my 5h window actually goes.** When my window melts faster than my own typing could possibly explain, the app breaks down *why* — and on my own logs, ~87% of one window was Claude's **background sub-agents**, not me. You never see those spawn. Once the app pointed at it, my usage suddenly made sense. I've never seen another tracker surface this per-task.
- **How much Opus I was burning for nothing.** It flags tasks where I ran Opus (the pricey one) on something a lighter model would've handled fine, and puts a rough € number on it. Turns out I was leaking real money on trivial calls I'd have never caught by eye.

Both of these are estimates, and the app says so — flagged as "candidates to double-check," not gospel. Which brings me to the honesty part.

**Being upfront about the limits**

- There are **no official hard quotas** on Max, so the "percentage" comes from the actual server endpoint when your PC is on, and falls back to a clearly-labeled local estimate when it isn't.
- The $/€ cost is **theoretical** — on Max you pay a flat fee, so it's really "what this would've cost at API rates," not what you paid.
- The sub-agent % and the Opus-waste € are estimates from your own logs, labeled as such. I'd rather say that than pretend the numbers are more precise than they are. Honestly that labeling *is* half the point of the tool.

**Heads-up before you click**

The UI is in French for now — I'm French and built it for myself. English is on the roadmap; the engine and logic are language-agnostic, and the traffic light + numbers read fine regardless of language. If there's interest here I'll prioritize the translation.

It's a solo side project. Free infra (GitHub Pages + Render), open source (MIT). There's a live demo you can poke without installing anything or creating an account.

- Demo (no install): https://arochab.github.io/claude-eats-tokens/
- Repo (MIT): https://github.com/arochab/claude-eats-tokens

Honestly it stopped being a "tracker" for me a while ago — it's the thing that tells me when it's safe to fire off the big job. Curious whether the sub-agent breakdown matches what other people see on their own logs — if you run it, I'd genuinely like to know if you get a similar % or something wildly different.


════════════════════════════════════════
VARIANT — r/ClaudeCode
════════════════════════════════════════

(Tighter, more technical, leads harder with the log-parsing constraint. This sub is the exact target — power users who live the throttle. Post this a few days apart from the r/ClaudeAI one, not the same day.)

TITLE:
Claude Max has no usage API — I parse the local JSONL logs into a phone traffic light that tells me when I'm about to hit the 5h throttle

BODY:

Yeah, another usage tracker. But I built this one around a specific annoyance and it ended up teaching me two things about my own usage I didn't know, so here goes.

**The constraint:** Max has no usage endpoint. The only ground truth is the JSONL Claude Code streams to `~/.claude/projects/`. Every tracker parses those. What I wanted that I couldn't find:

- **On my phone, not a terminal.** It's a PWA — add to home screen, offline, push notifications. I can check my runway from anywhere instead of being parked at the dashboard.
- **A decision, not a dashboard.** Green / orange / red on the 5h sliding window (the only thing that actually throttles), plus an ETA to the wall. Weekly/monthly totals are noise for the "can I keep going?" question, so it doesn't lead with them.

**Stack, for the curious:** Python engine that streams the logs line-by-line (robust to big/corrupted files), aggregates by model + real `cwd` project, cost-weighted per model. Pushes to a free Flask server (Render + a private Gist as durable store to dodge ephemeral disk). Vanilla JS PWA on GitHub Pages, zero build step, ~no deps beyond Chart.js. ~100 tests on the pure calc core.

**The two non-obvious payoffs** (this is the part I actually kept it for):

1. **Sub-agent attribution.** When the 5h window drains faster than my keystrokes can explain, it decomposes *why*. On my logs, ~87% of one window was background sub-agents (`isSidechain`), not my prompts. That reframed how I think about firing off agentic tasks.
2. **Opus waste, in €.** Flags Opus calls a lighter model could've served and estimates the € — "candidates to double-check," not accusations.

**Honest caveats:** no official quotas → % is the server signal when your PC is on, labeled local estimate when it's not. $/€ is API-rate theoretical (Max is flat-fee). The waste/sub-agent figures are log-derived estimates, labeled as such.

**Heads-up:** UI is in French for now (I'm French, built it for me). Engine is language-agnostic; English is on the roadmap and I'll bump it if there's interest here.

Solo project, MIT, free infra. Live demo runs without an account:

- Demo: https://arochab.github.io/claude-eats-tokens/
- Repo: https://github.com/arochab/claude-eats-tokens

If you run it on your own logs I'd love to know whether your sub-agent share lands anywhere near 87% or nothing like it — small-n so far and I'm curious how much it varies.

---

**Notes :** TIMING (important, time-sensitive):
- Anthropic temporarily raised the 5h/weekly limits through ~13 July 2026. After that the throttle pain returns for Max users. Post inside the 8–13 July window and, if you want, add ONE intro line like "with the temporary limit bump ending next week, here's how I know where I stand without an official dashboard." That turns it from "another tracker" into "the tool of the moment." Don't wait for i18n — the window matters more.
- Best slot for a dev sub: weekday morning, Tue–Thu.
- Space the two posts APART (a few days), don't cross-post the same day. Let the r/ClaudeAI one settle first; if it gets traction, mention "someone in r/ClaudeAI asked about X" in the ClaudeCode one for continuity.

ANTI-SELF-PROMO / SUBREDDIT RULES:
- Both subs allow "I built this" show-and-tell IF it's a story + genuine value, not a drop-and-run ad. This post leads with the lived problem (throttled mid-task, no warning) and gives away real insight (the 87% sub-agent finding) before any link — that's what keeps it on the right side of the line.
- Links go at the BOTTOM, framed as demo/repo, not a landing page. Demo needs no account — say so, it lowers the "it's an ad" reflex.
- Do NOT mention the 5€ Pro tier or pricing anywhere in the post. Community register only. Let people discover Pro inside the app. If someone asks in comments how it's funded/whether it's paid, then answer plainly (free tier + optional 5€ Pro) — reactive, never in the post.
- Check the sub's rules for a required flair (e.g. "Built with Claude" / "Showcase" / "Project"). Apply it. r/ClaudeAI sometimes restricts self-promo to specific days/threads — verify before posting; if there's an active "23 trackers" megathread, a comment there (use the shorter middle section) may be safer than a fresh post.

ENGAGEMENT (this is what makes or breaks it):
- Reply to EVERY comment within the first ~2h — both algorithms reward early engagement, and the ended-question ("does your sub-agent % match mine?") is designed to pull replies. Answer curiosity with data, not defensiveness.
- If someone criticizes ("yet another tracker", "just use cctally"): agree warmly, don't get defensive. cctally is great granular desktop analytics — position yours as the phone + decision layer, complementary, not a rival. Vulnerability outperforms defensiveness here.

BEFORE YOU POST (2 quick checks):
- A single clean mobile screenshot lifts this a lot (all drafts have wanted one). Best choice: the ORANGE traffic light + the Black Box sentence about sub-agents visible underneath — it proves both moats (mobile + non-copyable insight) in one image. Annotate labels in EN if you can (text overlay, no app reskin). If you have 20 min, grab it; if not, post anyway — the window beats the screenshot.
- The repo is public and this audience opens it. Make sure the visible numbers are consistent before posting (test count, schema version, price) — an HN/Reddit reader who spots v3-vs-v4 or 75-vs-101 in the repo doubts everything else, and consistency IS your conversion mechanism with this crowd.

HONESTY GUARDRAILS (kept, on purpose):
- Every estimate is labeled "estimate" / "candidates to double-check" in the post. Do not tighten those into hard claims to sound more impressive — the honest framing is the brand differentiator, not a weakness. Keep the "no official quotas" and "theoretical $/€" caveats intact.
- The 87% figure is from Adam's own logs (n=1). It's phrased as a personal finding, not a universal stat, and the closing question invites others to check — keep it that way; don't generalize it to "users see 87%."
