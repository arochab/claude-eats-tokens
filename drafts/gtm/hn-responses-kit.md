# Show HN — Responses Kit

> Copy-paste answers to the objections and comments most likely to show up in the
> thread. Tone: honest, humble, technically correct, never defensive, never
> selling. Written for Adam to fire back fast (<30 min) in English.
>
> **How to use:** find the objection, paste the reply, tweak one detail if the
> commenter said something specific. Keep it short — HN rewards concise.

---

## GOLDEN RULES DURING THE THREAD

- **Reply fast.** Aim for under 30 minutes on every comment for the first 2-3
  hours. Early author engagement is the single biggest thing HN's ranking
  rewards. Stay at your desk after posting.
- **Never defensive.** If someone is right, say "you're right." If someone is
  half-right, agree with the true half first, then add the nuance. You never win
  by arguing on HN — you win by being reasonable.
- **Thank the critics.** The harsh comments are free QA and free credibility.
  "Fair point," "good catch," "yeah, that's a real limitation" all read well.
- **Never sell Pro.** Do not mention the 5€/mo plan, paywalled features, pricing,
  or "upgrade" anywhere. If someone directly asks about the business model,
  answer factually in one line (see objection #13) and move on. HN punishes
  anything that smells like a pitch.
- **Concede limitations openly.** French UI, cost-is-an-estimate, n=1 data —
  lead with the honest asterisk. That IS the brand.
- **If it gets downvoted / doesn't take off,** don't repost the same day. Don't
  argue with downvotes. Try another morning (Tue/Wed/Thu, ~10-12 ET).
- **Link the code, not claims.** When a technical point comes up, point to the
  actual file (`tools/usage_core.py`, `pwa/format.js`). The repo is your proof.
- **It's fine to say "I don't know" or "I hadn't thought of that."** Humility
  reads as honesty here.

---

## 1. "Yet another Claude tracker / just use cctally / ccusage"

> Totally fair — there are a lot of these now (I counted ~20+ in June alone), and
> cctally is genuinely good. I use ccusage-style CLIs too. The gap I kept hitting
> is that they're all desktop dashboards: I have to be at my machine, in a
> terminal or a localhost tab, to know if I'm about to get throttled. This one is
> the opposite bet — it's a phone app you add to your home screen, and instead of
> a wall of numbers it answers one question ("can I keep going, or am I about to
> hit the 5h wall?"). So I'd frame it as a complement to cctally, not a
> replacement — different surface, different job. If cctally already covers your
> workflow you probably don't need this.

---

## 2. "Why not just use the API? / doesn't Anthropic show you this already?"

> That's exactly the thing that made me build it: on **Max**, there is no usage
> API. Anthropic exposes usage endpoints for pay-as-you-go API keys, but a Max
> *subscription* gives you no programmatic "how close am I to the limit" number —
> and no real-time view of the 5-hour sliding window that's the only limit that
> actually throttles you day to day. The only place that data exists is the JSONL
> logs Claude Code writes to `~/.claude/projects/`. So the whole app is basically
> a workaround for a missing API: parse the logs, because the logs *are* the data.
> If Anthropic ever ships a real Max usage API, most of this becomes unnecessary
> and I'd happily gut it.

---

## 3. "Privacy — you're sending my data to your server?"

> Reasonable concern, so to be precise about what actually leaves your machine:
> it's **aggregated numbers** — token counts per model, per day, per project,
> rolled-up window percentages — plus session *titles* (the project/folder name).
> **Not the content of your conversations.** The prompts, the code, the
> completions never leave your machine; the parser only reads token accounting
> out of the logs.
>
> Two more things: (1) the raw logs stay local — the engine runs on your PC and
> only POSTs the aggregate. (2) It's MIT and self-hostable, so if you don't want
> to touch my server at all, you point it at your own Flask instance with a shared
> secret and nothing goes anywhere I can see. The hosted server is just the
> zero-setup default, not a requirement.

---

## 4. "`uv tool install` from git / curl | sh is sketchy — supply chain?"

> Legit instinct, and I'd rather you be suspicious than not. A few things that
> should make it auditable rather than a leap of faith:
>
> - The only `curl | sh` is **uv's own installer** (Astral's), not mine — same
>   line their docs give you. If you already have uv, skip it entirely.
> - `uv tool install "git+…@v1"` installs from a **pinned tag** on a public MIT
>   repo, not `main` and not a moving target. You can read every line before you
>   run it, or clone and install from your local checkout.
> - The background piece is a **per-user** service (schtasks / launchd /
>   systemd --user) — no admin, no root, and `claude-push uninstall` removes it in
>   one command. It only ever reads `~/.claude` and POSTs aggregates.
>
> Nothing here needs elevated privileges and nothing is obfuscated. If you spot
> something that looks off in the install path, tell me — I'd want to fix it.

---

## 5. "The € cost is wrong / misleading on Max (it's a flat fee)"

> You're right, and the app says so. On Max you pay a **flat subscription**, so
> the $/€ figure is explicitly *not* a bill — it's "what this usage would have
> cost at API rates," labeled as an estimate in the UI. I keep it because it's a
> useful sense of *scale* (and of which model is eating your budget), not because
> it's money you owe. I went back and forth on whether to show it at all;
> labeling it honestly felt better than hiding it. If the label isn't clear
> enough in the UI I'd take the feedback — not wanting to mislead is kind of the
> whole point of the project.

---

## 6. "87% sub-agents seems really high / made up"

> Fair to be skeptical of a round-ish number. To be clear about what it is: that's
> **n=1**, on one of my *own* 5-hour windows, not a universal claim. It's measured,
> not guessed — Claude Code marks sidechain (sub-agent) messages in the logs with
> an `isSidechain` flag, so the app just sums tokens where that flag is set and
> divides. On that particular window it came out to ~87%, which genuinely
> surprised me — I'd assumed *I* was the big consumer, and it was the background
> agents. Your mileage will vary a lot depending on how much you use sub-agents.
> The point isn't "it's always 87%," it's "the logs let you actually see the
> split instead of guessing." The code that reads the flag is in the repo if you
> want to check the logic.

---

## 7. "The UI is in French"

> Guilty — I built it for myself first and I'm French, so the UI is French for
> now. I want to be upfront about that so nobody's surprised on click-through. The
> good news is the engine and all the logic are language-agnostic, and the parts
> that matter most on the demo — the traffic light, the big numbers, the charts —
> read fine without French. An English UI is on the roadmap; if there's interest
> here I'll bump it up the list. Genuinely useful to know how many people would
> want it, so this comment thread is good signal for me.

---

## 8. "How is this different from just reading the logs myself?"

> Honestly, if you're happy grepping JSONL you may not need it. The difference is
> three things I didn't want to do by hand every time:
>
> 1. **It decides for you.** Not "here are your token counts" but "you're at ~X%
>    of your 5h window, at this rate you'll get throttled in ~1h10, hold big
>    tasks till the reset" — a traffic light with an ETA, not a spreadsheet.
> 2. **It's on my phone.** The whole reason I built it: I'm often not at my
>    desk when I want to know if I can kick off a big run. Grepping logs doesn't
>    help from the couch.
> 3. **It surfaces the non-obvious stuff** — like the sub-agent share of a window,
>    and Opus tasks a lighter model *might* have handled (framed as "candidates to
>    double-check," never a verdict) — which I never noticed eyeballing raw logs.

---

## 9. "Is it open source? Can I self-host?"

> Yes to both. Repo is MIT: github.com/arochab/claude-eats-tokens. The server is a
> small Flask app you can deploy anywhere (there's a Render blueprint, but it's
> just gunicorn); point the engine at your own instance with a `PUSH_SECRET`
> shared secret and none of your data touches my server. The whole thing is built
> to run at 0€ on free tiers, so self-hosting is a first-class path, not an
> afterthought.

---

## 10. "Device pairing — how does it actually work / is it secure?"

> It's the OAuth 2.0 device authorization flow (RFC 8628), the same pattern as
> Stripe CLI or `gh auth login`. When you run `claude-push pair`, the engine asks
> the server for a short code and prints it, e.g. `XXXX-XXXX`. You open the app,
> see the code it's expecting, and confirm only if the two match. The point of
> showing the code in both places is anti-phishing: a malicious page can't get you
> to approve a pairing you didn't start, because you're eyeballing that the code
> on your screen matches the one your own terminal printed. Once confirmed, the
> server hands the engine a per-user key, which it stores locally in
> `~/.config/claude-eats/config.json`. No API key ever gets copy-pasted, and you
> can revoke a device from your side. Happy to go deeper on the flow if you want.

---

## 11. Enthusiastic comment ("nice, I hit this wall constantly!")

> Thank you — that's exactly the itch it came from, so it's really good to hear
> it's not just me. If you try it, I'd love to know where it's wrong or confusing:
> the traffic-light thresholds and the wording of the advice are the parts I'm
> least sure about, and real usage patterns other than mine would help me
> calibrate. Feedback (or issues on the repo) very welcome.

*(Variant, shorter:)*

> Ha, thanks — this was 100% built to scratch my own itch, so glad it resonates.
> If you give it a spin, tell me what breaks or feels off; I'm actively iterating
> and other people's usage patterns are the thing I most need.

---

## 12. Deep technical question on the log parsing

> Good question — that part was the fun bit. Short version: the engine streams the
> JSONL line by line rather than `json.load`-ing whole files, because they get
> large and occasionally have a corrupt line (which it counts and skips rather
> than crashing on). It dedups entries, merges model variants into families,
> attributes each session to a real project via the `cwd` (so all the
> `.claude/worktrees/*` of one repo collapse into a single project), and buckets
> tokens by day / model / project / sliding window. The pure logic lives in
> `tools/usage_core.py` and is covered by tests — that's the file to read if you
> want the exact behavior, and `tools/push_usage.py` is just the I/O shell around
> it. Happy to answer specifics — [tweak: address their exact detail, e.g. "on
> your point about cache tokens, those are read at 0.1× weight because…"]. If you
> find an edge case the parser mishandles, an issue or PR would be very welcome.

---

## 13. "What's the business model? / how do you make money? / is there a paid tier?"

> *(Answer factually, once, in one line — do NOT pitch.)*
>
> It's MIT and free to self-host; the hosted version has a small paid tier for
> some extras, but everything in this post — the traffic light, the real
> percentages, the stats — is on the free side, and honestly I built it for myself
> before it was anything else. Not trying to sell anything here; happy to talk
> about the tech.

---

## BONUS — objections you might also see

### "Render free tier cold-starts / it was slow when I tried it"

> Yeah — Render's free tier sleeps after inactivity, so the very first request can
> take ~50s to wake it. The app falls back to a cached `usage.json` so it's not a
> blank screen while that happens, but the cold start is real. It's the tradeoff
> for 0€ infra; a self-host or a paid dyno removes it.

### "This will break the moment Anthropic changes the log format"

> True, and that's the inherent fragility of parsing an undocumented local format
> instead of a real API — I'm at the mercy of the log schema. It's held stable so
> far, the parser is defensive about lines it doesn't recognize (counts and skips
> rather than crashing), and the parsing logic is isolated in one tested file so a
> format change is a localized fix. But you're right that a proper Max usage API
> would make the whole approach obsolete, and I'd welcome that.

### "Why a PWA and not a native app?"

> Mostly reach and cost: a PWA installs from a URL on any phone, needs no app
> store, no build step, and no separate iOS/Android codebases — which for a
> one-person free project is the difference between shipping and not. Add-to-home-
> screen plus push notifications covers ~everything I needed. If it outgrows the
> PWA ceiling I'd reconsider, but so far it hasn't.

### "The 5h window / limits changed recently — is your data even right?"

> Good catch on the moving target: Anthropic temporarily raised the 5h/weekly
> limits (through mid-July), so the wall is further out this week than it'll be
> after. The app reads the server's *own* percentage when your PC is on, so the
> official number tracks whatever the current limits are; the local *estimate*
> fallback is the one that can drift, and it's labeled as an estimate precisely
> because of stuff like this.

---

## PHRASES TO NEVER SAY

- ❌ "The best / only Claude tracker" — never claim superlatives; there are many
  good ones. → say "a different take" / "a complement."
- ❌ "You should upgrade to Pro for…" / any mention of 5€, pricing, paywall,
  "unlock." → don't bring up the paid tier at all; if directly asked, use #13.
- ❌ "This will save you money" — on Max it's a flat fee; the cost is an estimate.
  Don't imply savings. → "gives you a sense of scale, labeled as an estimate."
- ❌ "It's 100% accurate / precise" — it's estimates + n=1 anecdotes. → "measured
  where I can, labeled where it's an estimate."
- ❌ "cctally / ccusage doesn't do X" as an attack. → praise them, position as
  complementary, never knock a competitor.
- ❌ "87% of your usage is sub-agents" as a general fact. → always "on one of *my*
  windows," n=1.
- ❌ "Just install it, it's totally safe, trust me." → invite auditing instead;
  point to the pinned tag and the MIT source.
- ❌ Any hype word: "revolutionary," "game-changer," "insane," exclamation-heavy
  replies, ALL CAPS. HN reads that as marketing.
- ❌ Defensive openings: "Actually…", "That's not true…", "You clearly didn't…".
  → open with agreement: "Fair," "You're right," "Good point."
- ❌ Promising features on a deadline ("English UI next week," "I'll add X by
  Friday"). → "on the roadmap," "if there's interest I'll prioritize it."
