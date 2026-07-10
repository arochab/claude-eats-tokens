/* i18n/en.js — English dictionary.
   Exposé sur window.CET_LANG_EN (aussi importable en Node via globalThis). */
(function (root) {
  "use strict";
  root.CET_LANG_EN = {

    /* ---- format.js : ago() ---- */
    "ago.now":   "just now",
    "ago.min":   "{n} min ago",
    "ago.h":     "{n} h ago",
    "ago.d":     "{n} d ago",

    /* ---- format.js : until() ---- */
    "until.done": "reset",
    "until.min":  "resets in {n} min",
    "until.h":    "resets in {n} h {m} min",

    /* ---- format.js : xtimes() ---- */
    "xtimes.same":   "as usual",
    "xtimes.little": "a bit more than usual",
    "xtimes.x":      "{r}× more than usual",

    /* ---- format.js : xtimesShort() ---- */
    "xtimesShort.same": "as usual",
    "xtimesShort.x":    "×{r} vs usual",

    /* ---- format.js : hms() ---- */
    "hms.now": "just now",
    "hms.min": "{m} min",
    "hms.hm":  "{h} h {m} min",

    /* ---- format.js : weeklyResetLabel() — short day ---- */
    "locale": "en-GB",

    /* ---- format.js : status() — traffic light ---- */
    "status.title.green":        "All clear",
    "status.title.orange":       "Heating up over the last 5 hours",
    "status.title.red":          "Ease off for a bit",
    "status.title.green.rising": "Great week — you're ramping up",
    "status.msg.rising":         "You're using Claude {xtimes} right now. That's momentum — nothing is blocking you.",
    "status.msg.green":          "Nothing to flag: you're good to keep going.",
    "status.msg.fallback.data":  "You're good to keep going, nothing in your way.",
    "status.msg.fallback.nodata":"Not enough history yet to evaluate.",
    "status.5h.red":             "You've used Claude a lot in the last 5 hours — throttling may be coming.{reset}",
    "status.5h.orange":          "You're using Claude {xtimes} over the last 5 hours. Finish what you're doing, then take a breather.{reset}",
    "status.5h.green":           "Nothing to flag: you're good to keep going.",
    "status.5h.reset.now":       " It resets now.",
    "status.5h.reset.in":        " It resets in {hms}.",
    "status.gauge.5h.label":     "Right now",
    "status.gauge.5h.zero":      "just reset",
    "status.gauge.5h.in":        "resets in {hms}",
    "status.gauge.7d.label":     "This week",
    "status.gauge.month.label":  "This month",

    /* ---- format.js : assistant() ---- */
    "assistant.w5h.title.bad":   "You might get throttled soon",
    "assistant.w5h.title.warn":  "You're using Claude heavily right now",
    "assistant.w5h.msg":         "Over the last 5 hours, you've been using Claude {xtimes}. ",
    "assistant.w5h.msg.bad":     "At this rate, Claude could throttle you in ~{eta} (before the window resets at {clock}). Hold off on big tasks until then.",
    "assistant.w5h.msg.warn":    "The window resets at {clock}.",
    "assistant.w5h.why":         "On Claude Max, this is the only thing that can actually slow you down: too much usage in 5 h. We warn you before it happens.",
    "assistant.bigday.title":    "Productive day",
    "assistant.bigday.msg":      "Today you're using Claude {xtimes}, and it's only {h}:00. You're on a roll.",
    "assistant.bigday.msg.nomedian": "Today you're using Claude a lot, and it's only {h}:00. You're on a roll.",
    "assistant.bigday.why":      "That's your daily pace — nothing is blocking you.",
    "assistant.opus.title":      "Ramping up with Opus",
    "assistant.opus.msg":        "This week you're using Claude {xtimes}, mostly Opus, the most powerful model. You're building momentum.",
    "assistant.opus.why":        "Good to know: Opus is the premium model. The only time it can slow you down is if you saturate the 5 h window.",

    /* ---- format.js : windowsCard() — row labels ---- */
    "windows.row.5h":     "5-hour window",
    "windows.row.7d":     "This week · all models",
    "windows.row.7dOpus": "This week · Opus",

    /* ---- format.js : windowAlerts() — internal window names ---- */
    "windows.alert.key.5h":  "5h window",
    "windows.alert.key.7d":  "weekly window",

    /* ---- format.js : boiteNoireCard() ---- */
    "boite.title.agents":  "That's your sub-agents, not you",
    "boite.sentence.agents": "On {project}, the tasks Claude launched in the background (sub-agents) consumed {share}% of this window. That's why it burned {z}× faster than usual.",
    "boite.sentence.agents.noproj": "The tasks Claude launched in the background (sub-agents) consumed {share}% of this window. That's why it burned {z}× faster than usual.",
    "boite.title.cache5":    "Your context reloaded from scratch",
    "boite.sentence.cache5": "A good chunk ({pct}%) went to reloading context Claude had set aside just minutes earlier on {project}. That's why the window burned {z}× faster.",
    "boite.sentence.cache5.noproj": "A good chunk ({pct}%) went to reloading context Claude had set aside just minutes earlier. That's why the window burned {z}× faster.",
    "boite.title.cache1h":   "A lot of context to reload",
    "boite.sentence.cache1h": "About {pct}% of this window went to reloading context set aside over an hour ago on {project}. It burned {z}× faster than your usual pace.",
    "boite.sentence.cache1h.noproj": "About {pct}% of this window went to reloading context set aside over an hour ago. It burned {z}× faster than your usual pace.",
    "boite.title.fallback":  "Your window burned faster than usual",
    "boite.sentence.fallback.proj":       "On {project}, this window burned {z}× faster than usual.",
    "boite.sentence.fallback.proj.share": "On {project}, this window burned {z}× faster than usual ({share}% from sub-agents).",
    "boite.sentence.fallback.noproj":     "This window burned {z}× faster than usual.",
    "boite.sentence.fallback.noproj.share": "This window burned {z}× faster than usual ({share}% from sub-agents).",

    /* ---- app.js : personal alerts ---- */
    "app.alert.over": "personal reference exceeded ({p}%).",
    "app.alert.pct":  "{p}% of your personal reference.",

    /* ---- app.js : pro gating ---- */
    "app.pro.cta":           "Upgrade to Pro",
    "app.pro.pitch.default": "Unlock this view with Pro.",
    "app.pro.pitch.pace":    "See where you'll land by month end.",
    "app.pro.pitch.waste":   "See where your Opus goes — and what you could save.",
    "app.pro.pitch.boite":   "Understand why your window is burning fast.",

    /* ---- app.js : verdict ---- */
    "app.verdict.badge.demo": "Example",
    "app.verdict.reset.now": "It resets now.",
    "app.verdict.reset.in":  "It resets {u}.",
    "app.verdict.demo":      "Here's the verdict you'll see with your real data.",

    /* ---- app.js : verdict gauges ---- */
    "app.gauge.full":  "full",
    "app.gauge.hot":   "heating up",

    /* ---- app.js : status bar ---- */
    "app.status.loading":   "Loading…",
    "app.status.demo":      "Demo — run the engine on your PC to see your real data",
    "app.status.synced":    "Synced {ago} · {n} messages",
    "app.status.stale":     "⚠ Data may be stale ({ago})",
    "app.status.offline":   "Offline — no cached data.",
    "app.status.sleeping":  "Server asleep and no local data. Try again in ~1 min.",
    "app.status.nodata":    "No data yet. Make sure the engine is running on your PC.",
    "app.status.update":    "An app update is available (format {sc}).",

    /* ---- app.js : €/$ rate ---- */
    "app.rate.unavail":  "€/$ rate unavailable",
    "app.rate.manual":   "manual rate {r}",
    "app.rate.fresh":    "rate {freshness}",
    "app.rate.cached":   "⚠ cached, updated {ago}",

    /* ---- app.js : footer ---- */
    "app.foot.source":   "Source: {src}",
    "app.foot.api":      "API connected",
    "app.foot.cost":     "Theoretical value at API rates{asOf} — on Max you pay a flat fee{rateInfo}.",

    /* ---- app.js : hero ---- */
    "app.hero.lab":      "This month",
    "app.hero.compare":  "Your usual: {median}",
    "app.hero.nohistory":"No previous month to compare yet",
    "app.hero.day":      "Day {d} of {total}",

    /* ---- app.js : mini-stats ---- */
    "app.ms.today":      "Today",
    "app.ms.week":       "This week",
    "app.ms.pace":       "At current pace",
    "app.ms.vs.yesterday": "vs yesterday",
    "app.ms.vs.lastweek":  "vs last week",
    "app.ms.month":      "this month",

    /* ---- app.js : projection banner ---- */
    "app.pace.banner":   "At the 7-day pace ({slope}/d): ~{proj} by month end (between {lo} and {hi}). {prev}",
    "app.pace.prev":     "Previous months (median): {median}.",
    "app.pace.caveat":   "Assumes a steady pace; Max uses 5 h windows, not a hard monthly cap.",

    /* ---- app.js : windows card ---- */
    "app.windows.hint.official":   "official",
    "app.windows.hint.stale":      "estimate · paused",
    "app.windows.zero":            "just reset",
    "app.windows.in":              "resets {until}",
    "app.windows.freshness":       "estimate — last captured {ago}",
    "app.windows.badge.exact":     "exact figure",
    "app.windows.badge.stale":     "estimate · paused",

    /* ---- app.js : forfait card ---- */
    "app.forfait.5h":    "5-hour limit",
    "app.forfait.7d":    "This week · all models",
    "app.forfait.opus":  "This week · Opus",
    "app.forfait.note":  "Estimated from your consumption — not Anthropic's exact figure (they don't share that with apps), but a solid reference.",
    "app.forfait.set":   "set my limit",
    "app.forfait.reset.week": "resets {date}",

    /* ---- app.js : forfait advice ---- */
    "app.advice.max":     "You've hit one of your limits. No panic — it unlocks on its own. In the meantime, ease off or switch to a lighter model (Sonnet) to keep going.",
    "app.advice.opus":    "Waiting for your short-term limit won't help this time: it's your weekly Opus limit that's full. It resets {reset}. Until then, Sonnet is still available.",
    "app.advice.opus70":  "Opus is running hot this week — your rarest resource. For exploratory work and straightforward tasks, Sonnet does the same job and saves Opus for when it really counts.",
    "app.advice.5h":      "You've been pushing hard for a while. No panic: your short-term limit {reset}. If it's not urgent, a short break and you'll start fresh.",
    "app.advice.mid":     "Usage is climbing steadily, but you're still well below the ceiling. Nothing to change — just keep an eye out if you're stacking heavy sessions.",
    "app.advice.ok":      "You're well within limits everywhere. No ceiling close, Opus is fine. Nothing to watch — go ahead.",

    /* ---- app.js : position card ---- */
    "app.pos.verdict.heavy":  "You're among the {tier} users of Claude Max — you're really getting value from your subscription. That's a good thing, not a warning: you're using what you're already paying for. Nothing blocks you as long as the 5 h window doesn't saturate.",
    "app.pos.verdict.light":  "You're using Claude at a relaxed pace, well within the norm. Plenty of headroom — you could push harder if you wanted.",
    "app.pos.repere.ratio":   "≈ {r}× your usual week — you're ramping up",
    "app.pos.repere.5h":      "Your 5 h peak is brushing the estimated Max limit: that's the only moment Claude could slow you down a little.",
    "app.pos.repere.envel":   "≈ {pct}% of the estimated weekly envelope ('all models') for a Max plan — you still have headroom.",
    "app.pos.repere.perso":   "Your personal reference (not a Claude limit)",

    /* ---- app.js : chart ---- */
    "app.chart.aria": "Usage over time: {total} tokens for the selected period ({days} days).",
    "app.chart.hint": "tokens / day",

    /* ---- app.js : projects ---- */
    "app.proj.noname":       "No project",
    "app.proj.empty.title": "No projects detected",
    "app.proj.empty.hint":  "Run the engine on your PC (double-click DEMARRER.bat): your Claude Code projects will appear here, grouped.",
    "app.proj.aria":        "Project details for {name}, {total} tokens",
    "app.proj.sessions.one":  "session",
    "app.proj.sessions.many": "sessions",

    /* ---- app.js : project drill-down ---- */
    "app.drill.where":    "Where the tokens go",
    "app.drill.aria":     "Token breakdown for this project",
    "app.drill.total":    "Total",
    "app.drill.value":    "Value (theoretical)",
    "app.drill.sessions": "Sessions",
    "app.drill.models":   "Models used",
    "app.drill.recent":   "Recent conversations",
    "app.drill.input":    "Input",
    "app.drill.output":   "Output",
    "app.drill.cacheWrite": "Cache written",
    "app.drill.cacheRead":  "Cache read",

    /* ---- app.js : Waste Radar ---- */
    "app.waste.noRate":        "a few € (rate loading)",
    "app.waste.verdict":       "{money} recoverable this week · {n}",
    "app.waste.empty.title":   "All clear",
    "app.waste.empty.hint":    "You've marked all these tasks as justified. Nothing to review.",
    "app.waste.justified":     "was justified",

    /* ---- app.js : notification periods ---- */
    "app.notif.period.month": "month",
    "app.notif.period.day":   "day",
    "app.notif.period.week":  "week",
    "app.notif.period.7d":    "7-day window",

    /* ---- app.js : setup wizard ---- */
    "app.setup.stepno":    "Step {step}/{total}",
    "app.setup.key.ready": "Account ready. Your connection code is shown below.",
    "app.setup.creating":  "Creating account…",
    "app.setup.key.copied":"Code copied.",

    /* ---- app.js : pair confirm button ---- */
    "app.pair.confirm.btn": "Confirm — this is my computer",

    /* ---- app.js : notifications ---- */
    "app.notif.title.budget":  "Tokens — {name}",
    "app.notif.body.hit100":   "Limit reached ({p}%).",
    "app.notif.body.hitMark":  "{hit}% of budget used ({p}%).",
    "app.notif.hint.free":     "Pro alerts you from 75% — before the wall.",
    "app.notif.win.full.title": "⛔ {label} — full",
    "app.notif.win.full.body":  "You're at {pct}%. Claude may slow you down. Resets at the next window.",
    "app.notif.win.full.body.free": "You're at {pct}%. Claude may slow you down. Resets at the next window. Pro alerts you from 75% — before the wall.",
    "app.notif.win.90.title":   "🔴 {label} — {mark}%",
    "app.notif.win.90.body":    "You're at {pct}%. Ease off — you're approaching the ceiling.",
    "app.notif.win.75.title":   "🟠 {label} — {mark}%",
    "app.notif.win.75.body":    "You're at {pct}%. Keep an eye on it.",
    "app.notif.win.low.title":  "🟢 {label} — {mark}%",
    "app.notif.win.low.body":   "You're at {pct}% of your window.",
    "app.notif.anomaly.title":  "Your window is burning ×{z} faster than usual",
    "app.notif.anomaly.body.agents": "it's your sub-agents, not you",
    "app.notif.anomaly.body.generic": "check the Black Box. Tap to open.",
    "app.notif.unsupported":     "Not supported",
    "app.notif.perm.granted":    "Enabled ✓",
    "app.notif.perm.denied":     "Denied",
    "app.notif.activated.title": "Tokens",
    "app.notif.activated.body":  "Notifications enabled. You'll be alerted at each threshold.",

    /* ---- app.js : share ---- */
    "app.share.copied": "Link copied to clipboard ✓",

    /* ---- app.js : auth sheet ---- */
    "app.auth.creating":       "Creating…",
    "app.auth.error.email":    "Invalid email.",
    "app.auth.error.generic":  "Error.",
    "app.auth.error.network":  "Network error. The server may be asleep (~50s).",
    "app.auth.copied":         "Copied ✓",
    "app.auth.error.keyformat":"Key must start with cet_",
    "app.auth.status.until":   "— active until {date}",
    "app.auth.status.cancel":  "— cancellation scheduled",

    /* ---- app.js : pair sheet ---- */
    "app.pair.error.missing": "Enter the code shown in your terminal (format XXXX-XXXX).",
    "app.pair.error.noserver":"No server configured. Pairing works from the hosted version of the app.",
    "app.pair.pending":       "Pairing…",
    "app.pair.error.404":     "This code doesn't exist (or no longer does). Re-run the command on your computer to get a new one.",
    "app.pair.error.410":     "This code has expired. Re-run the command on your computer — a new code will appear.",
    "app.pair.error.400":     "Invalid code. Check that it matches exactly what your terminal shows.",
    "app.pair.error.generic": "Pairing failed. Try again in a moment.",
    "app.pair.error.network": "No response from the server (it may be asleep, ~50 s). Try again in a moment.",
    "app.pair.success":       "Paired. Your data will start appearing.",

    /* ---- index.html : topbar ---- */
    "html.topbar.sub":     "how hungry is Claude today",
    "html.topbar.share":   "Share",
    "html.topbar.account": "Account",
    "html.topbar.settings":"Settings",
    "html.topbar.refresh": "Refresh",

    /* ---- index.html : status ---- */
    "html.status.loading": "Loading…",

    /* ---- index.html : firstrun ---- */
    "html.firstrun.title": "You're looking at a demo",
    "html.firstrun.body":  "These numbers are a demo. To track your real usage, you need to run a small tool on your computer (not your phone): it reads your Claude Code activity and sends it here, privately. Without it, you're seeing an example, not your data.",
    "html.firstrun.cta":   "See how to set it up →",

    /* ---- index.html : projfilter ---- */
    "html.filter.label":   "Filtered:",
    "html.filter.clear":   "Show all ✕",
    "html.filter.clear.aria": "Remove project filter",

    /* ---- index.html : verdict ---- */
    "html.verdict.loading":"Analyzing…",

    /* ---- index.html : cards ---- */
    "html.boite.title":    "Black Box",
    "html.boite.badge.pro":"pro",
    "html.boite.badge.auto":"auto-detected",
    "html.waste.title":    "Waste Radar",
    "html.waste.badge.pro":"pro",
    "html.waste.sub":      "Tasks where a lighter model would probably have done the job. Worth a look.",
    "html.windows.title":  "My windows",
    "html.windows.badge":  "official",
    "html.forfait.title":  "Plan usage",
    "html.forfait.badge":  "estimate",
    "html.radar.aria":     "Window radar: 5 hours, week, month",

    /* ---- index.html : mini-stats ---- */
    "html.ms.today":       "Today",
    "html.ms.week":        "This week",
    "html.ms.pace":        "At current pace",

    /* ---- index.html : position ---- */
    "html.pos.title":      "Where I stand",
    "html.pos.badge":      "reference",
    "html.pos.sub":        "Your week compared to typical Claude Max subscriber usage.",
    "html.pos.spectrum.aria": "Your usage position on the Max subscriber spectrum",
    "html.pos.caveat":     "Tiers are based on public estimates of Max usage, not official Anthropic figures.",
    "html.pos.tiers.0":    "Exploring",
    "html.pos.tiers.1":    "Regular",
    "html.pos.tiers.2":    "Heavy",
    "html.pos.tiers.3":    "Power user",

    /* ---- index.html : chart ---- */
    "html.chart.title":    "Usage over time",
    "html.chart.hint":     "tokens / day",
    "html.chart.period.aria": "Display period",
    "html.chart.today":    "Today",
    "html.chart.7d":       "7 days",
    "html.chart.30d":      "30 days",
    "html.chart.all":      "All",
    "html.chart.canvas.aria": "Token consumption curve per day",

    /* ---- index.html : projects ---- */
    "html.proj.title":     "Projects",
    "html.proj.sort.aria": "Sort projects",
    "html.proj.sort.tokens": "tokens",
    "html.proj.sort.recent": "recent",

    /* ---- index.html : footer ---- */
    "html.foot.default":   "Your data stays local, never sent online.",
    "html.foot.sponsor":   "Support this project",
    "html.foot.source":    "Source code",

    /* ---- index.html : settings ---- */
    "html.settings.title":       "Settings",
    "html.settings.close.aria":  "Close",
    "html.settings.lead":        "Your limits stay on this device. Change them whenever you want.",
    "html.settings.setup":       "Connect my computer (see my real data)",
    "html.settings.pair":        "I have a pairing code to confirm",
    "html.settings.plan.group":  "My Claude Max plan",
    "html.settings.plan.label":  "My plan",
    "html.settings.plan.hint":   "sets the estimated limits",
    "html.settings.plan.5x":     "Max 5×",
    "html.settings.plan.20x":    "Max 20×",
    "html.settings.calib.label": "Align with Claude's actual %",
    "html.settings.calib.hint":  "when Claude shows you a % of your limit, enter it here: the app recalibrates its figures to match",
    "html.settings.calib.ph":    "e.g. 11",
    "html.settings.adv":         "Advanced settings",
    "html.settings.perso.group": "Personal references",
    "html.settings.perso.opt":   "(optional)",
    "html.settings.perso.day.label":   "Per day",
    "html.settings.perso.day.hint":    "leave blank if you're not sure",
    "html.settings.perso.day.ph":      "e.g. 5 000 000",
    "html.settings.perso.week.label":  "Per week",
    "html.settings.perso.week.ph":     "e.g. 30 000 000",
    "html.settings.perso.month.label": "Per month",
    "html.settings.perso.month.ph":    "e.g. 120 000 000",
    "html.settings.limits.group": "Your Max limits",
    "html.settings.limits.hint":  "Claude Max tracks your usage in time windows: 5 h and 7 days. When a window is full, Claude slows for a moment, then picks back up.",
    "html.settings.lim5h.label":  "5-hour limit",
    "html.settings.lim5h.hint":   "your 5 h window",
    "html.settings.lim7d.label":  "7-day limit",
    "html.settings.lim7d.hint":   "your weekly window",
    "html.settings.api.group":    "API credits",
    "html.settings.api.label":    "Credits purchased ($)",
    "html.settings.api.ph":       "e.g. 5",
    "html.settings.display.group":"Display",
    "html.settings.lang.group":   "Language",
    "html.settings.lang.label":   "Interface",
    "html.settings.eur.label":    "$ → € rate",
    "html.settings.eur.hint":     "for the euro estimate",
    "html.settings.warn.label":   "Alert at (%)",
    "html.settings.warn.hint":    "warning threshold",
    "html.settings.notif.group":  "Notifications",
    "html.settings.notif.label":  "Phone alerts",
    "html.settings.notif.hint":   "thresholds 50 / 80 / 100%",
    "html.settings.notif.enable": "Enable",
    "html.settings.proj.group":   "Active projects",
    "html.settings.proj.note":    "— estimated token weight",
    "html.settings.proj.add":     "Add a project",
    "html.settings.proj.ph.name": "Project name",
    "html.settings.proj.ph.tokens": "tokens",
    "html.settings.proj.delete.aria": "Delete",
    "html.settings.save":         "Save",
    "html.settings.reset":        "Reset to defaults",
    "html.settings.about.group":  "This project",
    "html.settings.about.txt":    "Personal tool, open source, free. If you use it daily and want to support it:",
    "html.settings.about.sponsor":"Sponsor on GitHub",
    "html.settings.about.source": "Source code (MIT)",

    /* ---- index.html : auth sheet ---- */
    "html.auth.title":       "Sign in",
    "html.auth.close.aria":  "Close",
    "html.auth.lead":        "Sign in to see your data from any device.",
    "html.auth.signup.group":"Sign up or sign in",
    "html.auth.email.label": "Email",
    "html.auth.email.hint":  "your email address",
    "html.auth.email.ph":    "you@example.com",
    "html.auth.submit":      "Get my connection code",
    "html.auth.help":        "You'll receive a connection code (starts with cet_) to paste once into the engine on your computer. No password. Keep this page open: you'll be asked to paste the code during setup.",
    "html.auth.existing.group": "I already have a connection code",
    "html.auth.key.label":   "Connection code",
    "html.auth.key.ph":      "cet_...",
    "html.auth.key.submit":  "Sign in with my code",
    "html.auth.success.title":"Account created!",
    "html.auth.success.help": "Your connection code is below. Copy it now — it won't be shown again. You'll paste it into the engine on your computer.",
    "html.auth.key.display.label": "Your connection code",
    "html.auth.key.display.hint":  "keep this safe",
    "html.auth.key.copy":    "Copy key",
    "html.auth.key.done":    "Got it, copied",
    "html.auth.connected.title": "Signed in",
    "html.auth.plan.label":  "Plan:",
    "html.auth.upgrade":     "Upgrade to Pro",
    "html.auth.logout":      "Sign out",

    /* ---- index.html : setup sheet (onboarding 5 steps) ---- */
    "html.setup.title":      "See my real data",
    "html.setup.step":       "Step {n} of 5",
    "html.setup.progress.aria": "Setup progress",
    "html.setup.s1.lead":    "We'll install a small tool on your computer (not your phone). It reads your Claude Code activity and sends it here. One-time setup.",
    "html.setup.s1.group":   "1 · Get the tool",
    "html.setup.s1.body":    "On your computer, download the project folder, then unzip it somewhere you'll find it (your Desktop, for example).",
    "html.setup.s1.btn":     "Download folder (.zip)",
    "html.setup.s1.hint":    "This button opens GitHub on your computer. If you're reading this on your phone, open this page from your PC instead — that's where the tool needs to live.",
    "html.setup.s2.group":   "2 · Create your account",
    "html.setup.s2.body":    "An account links your computer to this page. You'll receive a connection code (starts with cet_). No password.",
    "html.setup.s2.email.label": "Your email",
    "html.setup.s2.email.hint":  "just to recover your account",
    "html.setup.s2.submit":  "Get my connection code",
    "html.setup.s2.existing":"I already have a connection code",
    "html.setup.s2.key.label":"Connection code",
    "html.setup.s2.key.hint": "starts with cet_",
    "html.setup.s2.key.submit":"Use this code",
    "html.setup.s2.success.title": "Account created.",
    "html.setup.s2.success.body":  "Here's your code. Copy it now — you'll paste it on your computer in the next step.",
    "html.setup.s3.group":   "3 · Paste your code on your computer",
    "html.setup.s3.body1":   "In the folder you unzipped, there's a file called secret.local.example.bat. Make a copy of it and rename it secret.local.bat.",
    "html.setup.s3.body2":   "Open secret.local.bat with Notepad and paste your code right after the equals sign, like this:",
    "html.setup.s3.hint":    "Save the file, then close it. That's it for this step.",
    "html.setup.s4.group":   "4 · Run the tool",
    "html.setup.s4.win":     "On Windows: double-click DEMARRER.bat in the folder. A black window opens and starts sending your data. Leave it open.",
    "html.setup.s4.win.python": "If it says Python is missing: install it from python.org and, on the installation screen, check 'Add Python to PATH'. Then re-run DEMARRER.bat.",
    "html.setup.s4.mac":     "On Mac or Linux: there's no double-click. Open a terminal in the folder and run python tools/push_usage.py --interval 60 (the secret.local.bat file has the values to load).",
    "html.setup.s5.group":   "5 · You're connected",
    "html.setup.s5.body":    "As long as that window stays open on your computer, your data arrives on its own. Come back here: the demo gives way to your real data, no extra steps needed.",
    "html.setup.s5.hint":    "Nothing showing yet? Give your computer a minute for the first push, then pull the page down to refresh. You only need to re-run the tool if you restart your computer.",
    "html.setup.s5.pair":    "Seeing a code like 'XXXX-XXXX' on your computer? Confirm it →",
    "html.setup.prev":       "Back",
    "html.setup.next":       "Next",
    "html.setup.done":       "Got it, close",

    /* ---- index.html : pair sheet ---- */
    "html.pair.title":       "Connect my computer",
    "html.pair.noauth.lead": "To connect your computer, sign in first. It's your account we're linking to this PC.",
    "html.pair.noauth.btn":  "Sign in / create an account",
    "html.pair.noauth.cancel": "Cancel",
    "html.pair.confirm.lead":"A code just appeared in the terminal on your computer. Make sure it matches exactly before confirming.",
    "html.pair.code.aria":   "Pairing code",
    "html.pair.manual.group":"Type the code from your terminal",
    "html.pair.manual.label":"Code",
    "html.pair.manual.hint": "shown on your computer",
    "html.pair.manual.ph":   "XXXX-XXXX",
    "html.pair.check":       "Make sure this code matches exactly what your terminal shows. Only confirm if they're identical.",
    "html.pair.confirm.btn": "Confirm — this is my computer",
    "html.pair.cancel":      "Cancel",
    "html.pair.success.title":"Connected!",
    "html.pair.success.body": "Your computer is linked to your account. Your real data will appear here on its own — leave the window open on your PC.",
    "html.pair.success.btn": "See my data",

    /* ---- index.html : pro sheet ---- */
    "html.pro.title":        "Upgrade to Pro",
    "html.pro.price":        "€5 / month. Cancel anytime.",
    "html.pro.hook":         "Stop reopening the app to check if you can keep going. Your phone tells you before it blocks.",
    "html.pro.feat1.title":  "Get warned in time.",
    "html.pro.feat1.body":   "Alerts at 25, 50, 75 and 90% — not just when it's too late.",
    "html.pro.feat2.title":  "See further ahead.",
    "html.pro.feat2.body":   "30 days and full history, not just the last 7.",
    "html.pro.feat3.title":  "Anticipate month end.",
    "html.pro.feat3.body":   "The projection tells you where you'll land at your current pace.",
    "html.pro.feat4.title":  "Dig into your projects.",
    "html.pro.feat4.body":   "Open each project: models, sessions, detailed cost.",
    "html.pro.feat5.title":  "Waste Radar.",
    "html.pro.feat5.body":   "Spot where your Opus (the premium model) is going when a lighter model would have done the job — and what you could have saved.",
    "html.pro.feat6.title":  "Black Box.",
    "html.pro.feat6.body":   "Finally understand why your window burns so fast — and which project is behind it.",
    "html.pro.feat7.title":  "Export everything.",
    "html.pro.feat7.body":   "CSV and PNG to keep your data or share it.",
    "html.pro.cta":          "Upgrade to Pro — €5/month",
    "html.pro.reassurance":  "No commitment. Free stays free.",
    "html.pro.export.group": "Export my data",
    "html.pro.export.badge": "pro",
    "html.pro.export.csv":   "Export CSV",
    "html.pro.export.png":   "Export PNG",

    /* ---- index.html : waste sheet ---- */
    "html.waste.sheet.title":"Waste Radar",
    "html.waste.sheet.lead": "Tasks where you used Opus when a lighter model would probably have been enough. These are candidates to review, not verdicts.",

    /* ---- shared ---- */
    "html.close":            "Close",
    "html.proj.filter":      "Filter dashboard to this project",
    "html.setup.copy.aria":  "Copy the code",
    "html.setup.copy.btn":   "Copy",
  };
})(typeof window !== "undefined" ? window : globalThis);
