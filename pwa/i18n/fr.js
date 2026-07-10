/* i18n/fr.js — dictionnaire français (langue source).
   Exposé sur window.CET_LANG_FR (aussi importable en Node via globalThis). */
(function (root) {
  "use strict";
  root.CET_LANG_FR = {

    /* ---- format.js : ago() ---- */
    "ago.now":   "à l'instant",
    "ago.min":   "il y a {n} min",
    "ago.h":     "il y a {n} h",
    "ago.d":     "il y a {n} j",

    /* ---- format.js : until() ---- */
    "until.done": "réinitialisée",
    "until.min":  "reset dans {n} min",
    "until.h":    "reset dans {n} h {m} min",

    /* ---- format.js : xtimes() ---- */
    "xtimes.same":   "comme d'habitude",
    "xtimes.little": "un peu plus que d'habitude",
    "xtimes.x":      "{r} fois plus que d'habitude",

    /* ---- format.js : xtimesShort() ---- */
    "xtimesShort.same": "comme d'habitude",
    "xtimesShort.x":    "×{r} vs d'habitude",

    /* ---- format.js : hms() ---- */
    "hms.now": "à l'instant",
    "hms.min": "{m} min",
    "hms.hm":  "{h} h {m} min",

    /* ---- format.js : weeklyResetLabel() — jour court ---- */
    "locale": "fr-FR",

    /* ---- format.js : status() — feu tricolore ---- */
    "status.title.green":        "Tout roule",
    "status.title.orange":       "Ça chauffe sur les 5 dernières heures",
    "status.title.red":          "Lève le pied un moment",
    "status.title.green.rising": "Belle semaine — tu montes en puissance",
    "status.msg.rising":         "Tu utilises Claude {xtimes} en ce moment. C'est normal : tu prends de l'élan. Rien ne te bloque.",
    "status.msg.green":          "Rien à signaler : tu peux continuer tranquille.",
    "status.msg.fallback.data":  "Tu peux continuer tranquille, rien ne te freine.",
    "status.msg.fallback.nodata":"Pas encore assez d'historique pour évaluer.",
    "status.5h.red":             "Tu as beaucoup utilisé Claude ces 5 dernières heures — il pourrait te ralentir bientôt.{reset}",
    "status.5h.orange":          "Tu utilises Claude {xtimes} ces 5 dernières heures. Finis ce que tu fais, puis souffle un peu.{reset}",
    "status.5h.green":           "Rien à signaler : tu peux continuer tranquille.",
    "status.5h.reset.now":       " Ça se remet à zéro maintenant.",
    "status.5h.reset.in":        " Ça se remet à zéro dans {hms}.",
    "status.gauge.5h.label":     "Là, maintenant",
    "status.gauge.5h.zero":      "se remet à zéro",
    "status.gauge.5h.in":        "se remet à zéro dans {hms}",
    "status.gauge.7d.label":     "Cette semaine",
    "status.gauge.month.label":  "Ce mois",

    /* ---- format.js : assistant() ---- */
    "assistant.w5h.title.bad":   "Tu vas peut-être être ralenti",
    "assistant.w5h.title.warn":  "Tu utilises beaucoup Claude là",
    "assistant.w5h.msg":         "Ces 5 dernières heures, tu utilises Claude {xtimes}. ",
    "assistant.w5h.msg.bad":     "Si tu continues à ce rythme, Claude pourrait te ralentir dans ~{eta} (avant que ça se remette à zéro à {clock}). Pour les grosses tâches, attends ce moment-là.",
    "assistant.w5h.msg.warn":    "Ça se remet à zéro à {clock}.",
    "assistant.w5h.why":         "Sur Claude Max, c'est ça qui peut te ralentir : trop d'usage en 5 h. On te prévient avant.",
    "assistant.bigday.title":    "Belle journée de travail",
    "assistant.bigday.msg":      "Aujourd'hui tu utilises Claude {xtimes}, et il n'est que {h} h. Tu avances bien.",
    "assistant.bigday.msg.nomedian": "Aujourd'hui tu utilises Claude beaucoup, et il n'est que {h} h. Tu avances bien.",
    "assistant.bigday.why":      "C'est ton rythme du jour — rien ne te bloque.",
    "assistant.opus.title":      "Tu montes en puissance avec Opus",
    "assistant.opus.msg":        "Cette semaine tu utilises Claude {xtimes}, surtout Opus, le modèle le plus puissant. Tu prends de l'élan.",
    "assistant.opus.why":        "Bon à savoir : Opus est le modèle premium. Le seul moment où il peut te ralentir, c'est si tu satures la fenêtre de 5 h.",

    /* ---- format.js : windowsCard() — libellés des fenêtres ---- */
    "windows.row.5h":     "Fenêtre 5 h",
    "windows.row.7d":     "Cette semaine · tous modèles",
    "windows.row.7dOpus": "Cette semaine · Opus",

    /* ---- format.js : windowAlerts() — noms de fenêtre (clés internes) ---- */
    "windows.alert.key.5h":  "fenêtre 5 h",
    "windows.alert.key.7d":  "fenêtre hebdo",

    /* ---- format.js : boiteNoireCard() ---- */
    "boite.title.agents":  "Ce sont tes sous-agents, pas toi",
    "boite.sentence.agents": "Sur {project}, les tâches que Claude a lancées en arrière-plan (ses sous-agents) ont accaparé {share} % de cette fenêtre. C'est pour ça qu'elle a fondu {z}× plus vite que d'habitude.",
    "boite.sentence.agents.noproj": "Les tâches que Claude a lancées en arrière-plan (ses sous-agents) ont accaparé {share} % de cette fenêtre. C'est pour ça qu'elle a fondu {z}× plus vite que d'habitude.",
    "boite.title.cache5":    "Ton contexte est reparti de zéro",
    "boite.sentence.cache5": "Une bonne partie ({pct} %) est repartie à recharger le contexte que Claude avait mis de côté quelques minutes plus tôt sur {project}. Résultat : ta fenêtre a fondu {z}× plus vite.",
    "boite.sentence.cache5.noproj": "Une bonne partie ({pct} %) est repartie à recharger le contexte que Claude avait mis de côté quelques minutes plus tôt. Résultat : ta fenêtre a fondu {z}× plus vite.",
    "boite.title.cache1h":   "Beaucoup de contexte à recharger",
    "boite.sentence.cache1h": "Environ {pct} % de cette fenêtre est parti à recharger le contexte mis de côté il y a plus d'une heure sur {project}. Elle a fondu {z}× plus vite que ta normale.",
    "boite.sentence.cache1h.noproj": "Environ {pct} % de cette fenêtre est parti à recharger le contexte mis de côté il y a plus d'une heure. Elle a fondu {z}× plus vite que ta normale.",
    "boite.title.fallback":  "Ta fenêtre a fondu plus vite",
    "boite.sentence.fallback.proj":     "Sur {project}, cette fenêtre a fondu {z}× plus vite que d'habitude.",
    "boite.sentence.fallback.proj.share": "Sur {project}, cette fenêtre a fondu {z}× plus vite que d'habitude (dont {share} % de sous-agents).",
    "boite.sentence.fallback.noproj":   "Cette fenêtre a fondu {z}× plus vite que d'habitude.",
    "boite.sentence.fallback.noproj.share": "Cette fenêtre a fondu {z}× plus vite que d'habitude (dont {share} % de sous-agents).",

    /* ---- app.js : alertes perso ---- */
    "app.alert.over": "ton repère dépassé ({p}%).",
    "app.alert.pct":  "{p}% de ton repère perso.",

    /* ---- app.js : pro gating ---- */
    "app.pro.cta":           "Passer à Pro",
    "app.pro.pitch.default": "Débloque cette vue avec Pro.",
    "app.pro.pitch.pace":    "Vois où tu atterris en fin de mois.",
    "app.pro.pitch.waste":   "Découvre où part ton Opus — et ce que tu pourrais récupérer.",
    "app.pro.pitch.boite":   "Comprends pourquoi ta fenêtre fond.",

    /* ---- app.js : verdict ---- */
    "app.verdict.badge.demo": "Exemple",
    "app.verdict.reset.now": "Ça repart maintenant.",
    "app.verdict.reset.in":  "Ça repart {u}.",
    "app.verdict.demo":      "Voilà le verdict que tu verras avec tes vraies données.",

    /* ---- app.js : jauges verdict ---- */
    "app.gauge.full":  "plein",
    "app.gauge.hot":   "ça chauffe",

    /* ---- app.js : barre de statut ---- */
    "app.status.loading":   "Chargement…",
    "app.status.demo":      "Démonstration — lance le moteur sur ton PC pour voir tes vrais chiffres",
    "app.status.synced":    "Synchronisé {ago} · {n} messages",
    "app.status.stale":     "⚠ Données possiblement périmées ({ago})",
    "app.status.offline":   "Hors-ligne — aucune donnée en cache.",
    "app.status.waking":    "Connexion au serveur… (~30 s la première fois)",
    "app.status.sleeping":  "Serveur endormi et aucune donnée locale. Réessaie dans ~1 min.",
    "app.status.nodata":    "Aucune donnée pour l'instant. Vérifie que le moteur tourne sur ton PC.",
    "app.status.update":    "Une mise à jour de l'app est disponible (format {sc}).",

    /* ---- app.js : taux €/$ ---- */
    "app.rate.unavail":  "taux €/$ indisponible",
    "app.rate.manual":   "taux manuel {r}",
    "app.rate.fresh":    "taux {freshness}",
    "app.rate.cached":   "⚠ en cache, maj {ago}",

    /* ---- app.js : footer ---- */
    "app.foot.source":   "Source : {src}",
    "app.foot.api":      "API connectée",
    "app.foot.cost":     "Valeur théorique au tarif API{asOf} — sur Max tu paies un forfait fixe{rateInfo}.",

    /* ---- app.js : hero ---- */
    "app.hero.lab":      "Ce mois-ci",
    "app.hero.compare":  "D'habitude tu fais : {median}",
    "app.hero.nohistory":"Pas encore de mois précédent pour comparer",
    "app.hero.day":      "Jour {d} / {total}",

    /* ---- app.js : mini-stats ---- */
    "app.ms.today":      "Aujourd'hui",
    "app.ms.week":       "Cette semaine",
    "app.ms.pace":       "Au rythme actuel",
    "app.ms.vs.yesterday": "vs hier",
    "app.ms.vs.lastweek":  "vs sem. préc.",
    "app.ms.month":      "ce mois",

    /* ---- app.js : bandeau projection ---- */
    "app.pace.banner":   "Au rythme des 7 derniers jours ({slope}/j) : ~{proj} fin de mois (entre {lo} et {hi}). {prev}",
    "app.pace.prev":     "Mois précédents (médiane) : {median}.",
    "app.pace.caveat":   "Valable si le rythme reste constant ; Max = fenêtres 5 h, pas de plafond mensuel officiel.",

    /* ---- app.js : carte fenêtres ---- */
    "app.windows.hint.official":   "officiel",
    "app.windows.hint.stale":      "estimation · en pause",
    "app.windows.zero":            "vient de se remettre à zéro",
    "app.windows.in":              "se remet à zéro {until}",
    "app.windows.freshness":       "estimation — dernière capture {ago}",
    "app.windows.badge.exact":     "chiffre exact",
    "app.windows.badge.stale":     "estimation · en pause",

    /* ---- app.js : carte forfait ---- */
    "app.forfait.5h":    "Limite de 5 heures",
    "app.forfait.7d":    "Cette semaine · tous les modèles",
    "app.forfait.opus":  "Cette semaine · Opus",
    "app.forfait.note":  "Estimation d'après ce que tu as déjà consommé — pas le chiffre exact d'Anthropic (ils ne le partagent pas avec les applis), mais un bon repère.",
    "app.forfait.set":   "définir ma limite",
    "app.forfait.reset.week": "se remet à zéro {date}",

    /* ---- app.js : conseils forfait ---- */
    "app.advice.max":     "Tu as atteint une de tes limites. Pas de panique : ça se débloque tout seul. En attendant, lève le pied ou passe sur un modèle plus léger (Sonnet) pour avancer.",
    "app.advice.opus":    "Attendre ta limite courte ne changera rien cette fois : c'est ta limite de la semaine sur Opus qui est au bout. Elle repart {reset}. D'ici là, Sonnet reste dispo si tu veux continuer.",
    "app.advice.opus70":  "C'est Opus qui chauffe cette semaine — ta ressource la plus rare. Pour le débroussaillage et les tâches carrées, Sonnet fait pareil et te garde Opus pour quand ça compte vraiment.",
    "app.advice.5h":      "Tu pousses fort depuis un moment. Pas de panique : ta limite courte {reset}. Si ce n'est pas urgent, une petite pause et tu repars à neuf.",
    "app.advice.mid":     "Ça monte tranquillement, tu es encore loin du plafond. Rien à changer — juste un œil de temps en temps si tu enchaînes les grosses sessions.",
    "app.advice.ok":      "Tu es large partout. Aucune limite proche, Opus tranquille. Rien à surveiller — vas-y franchement.",

    /* ---- app.js : positionnement ---- */
    "app.pos.verdict.heavy":  "Tu es dans les utilisateurs {tier}s de Claude Max — tu sors vraiment la valeur de ton forfait. C'est une bonne nouvelle, pas une alerte : tu utilises à plein ce que tu paies déjà. Rien ne se bloque tant que la fenêtre de 5 h ne sature pas.",
    "app.pos.verdict.light":  "Tu utilises Claude tranquillement, dans la norme. De la marge partout — tu peux y aller plus franchement si tu veux.",
    "app.pos.repere.ratio":   "≈ {r}× ta semaine habituelle — tu montes en puissance",
    "app.pos.repere.5h":      "Ton pic sur 5 h frôle la limite Max estimée : c'est le seul moment où Claude peut te ralentir un peu.",
    "app.pos.repere.envel":   "≈ {pct}% de l'enveloppe hebdo estimée « tous modèles » d'un forfait Max — il te reste de la marge.",
    "app.pos.repere.perso":   "Ton repère perso (pas une limite Claude)",

    /* ---- app.js : graphique ---- */
    "app.chart.aria": "Évolution : {total} tokens sur la période sélectionnée ({days} jours).",
    "app.chart.hint": "tokens / jour",

    /* ---- app.js : projets ---- */
    "app.proj.noname":       "Sans projet",
    "app.proj.empty.title": "Aucun projet détecté",
    "app.proj.empty.hint":  "Lance le moteur sur ton PC (double-clic sur DEMARRER.bat) : tes projets Claude Code apparaîtront ici, regroupés.",
    "app.proj.aria":        "Détails du projet {name}, {total} tokens",
    "app.proj.sessions.one":  "session",
    "app.proj.sessions.many": "sessions",

    /* ---- app.js : drill-down projet ---- */
    "app.drill.where":    "Où partent les tokens",
    "app.drill.aria":     "Répartition des tokens du projet",
    "app.drill.total":    "Total",
    "app.drill.value":    "Valeur (théorique)",
    "app.drill.sessions": "Sessions",
    "app.drill.models":   "Modèles utilisés",
    "app.drill.recent":   "Discussions récentes",
    "app.drill.input":    "Entrée",
    "app.drill.output":   "Sortie",
    "app.drill.cacheWrite": "Cache créé",
    "app.drill.cacheRead":  "Cache lu",

    /* ---- app.js : Waste Radar ---- */
    "app.waste.noRate":        "quelques € (taux en cours)",
    "app.waste.verdict":       "{money} récupérables cette semaine · {n}",
    "app.waste.empty.title":   "Tout est validé",
    "app.waste.empty.hint":    "Tu as marqué toutes ces tâches comme justifiées. Rien à revoir.",
    "app.waste.justified":     "c'était justifié",

    /* ---- app.js : périodes notif ---- */
    "app.notif.period.month": "mois",
    "app.notif.period.day":   "jour",
    "app.notif.period.week":  "semaine",
    "app.notif.period.7d":    "fenêtre 7 j",

    /* ---- app.js : setup wizard ---- */
    "app.setup.stepno":    "Étape {step}/{total}",
    "app.setup.key.ready": "Compte prêt. Ton code de connexion est affiché.",
    "app.setup.creating":  "Création du compte…",
    "app.setup.key.copied":"Code copié.",

    /* ---- app.js : pair confirm button ---- */
    "app.pair.confirm.btn": "Confirmer — c'est bien mon ordinateur",

    /* ---- app.js : notifications ---- */
    "app.notif.title.budget":  "Tokens — {name}",
    "app.notif.body.hit100":   "Plafond atteint ({p}%).",
    "app.notif.body.hitMark":  "{hit}% du budget consommé ({p}%).",
    "app.notif.hint.free":     "Pro te prévient dès 75 % — avant le mur.",
    "app.notif.win.full.title": "⛔ {label} — plein",
    "app.notif.win.full.body":  "Tu es à {pct}%. Claude risque de te ralentir. Ça repart au reset.",
    "app.notif.win.full.body.free": "Tu es à {pct}%. Claude risque de te ralentir. Ça repart au reset. Pro te prévient dès 75 % — avant le mur.",
    "app.notif.win.90.title":   "🔴 {label} — {mark}%",
    "app.notif.win.90.body":    "Tu es à {pct}%. Lève le pied, tu approches du plafond.",
    "app.notif.win.75.title":   "🟠 {label} — {mark}%",
    "app.notif.win.75.body":    "Tu es à {pct}%. Garde un œil dessus.",
    "app.notif.win.low.title":  "🟢 {label} — {mark}%",
    "app.notif.win.low.body":   "Tu es à {pct}% de ta fenêtre.",
    "app.notif.anomaly.title":  "Ta fenêtre fond ×{z} la normale",
    "app.notif.anomaly.body.agents": "ce sont tes sous-agents, pas toi",
    "app.notif.anomaly.body.generic": "regarde la Boîte noire. Ouvre pour voir.",
    "app.notif.unsupported":     "Non supporté",
    "app.notif.perm.granted":    "Activées ✓",
    "app.notif.perm.denied":     "Refusées",
    "app.notif.activated.title": "Tokens",
    "app.notif.activated.body":  "Notifications activées. Tu seras prévenu aux seuils.",

    /* ---- app.js : partage ---- */
    "app.share.copied": "Lien copié dans le presse-papier ✓",

    /* ---- app.js : auth sheet ---- */
    "app.auth.creating":       "Création…",
    "app.auth.error.email":    "Email invalide.",
    "app.auth.error.generic":  "Erreur.",
    "app.auth.error.network":  "Erreur réseau. Le serveur dort peut-être (~50s).",
    "app.auth.copied":         "Copié ✓",
    "app.auth.error.keyformat":"La clé doit commencer par cet_",
    "app.auth.status.until":   "— actif jusqu'au {date}",
    "app.auth.status.cancel":  "— résiliation programmée",

    /* ---- app.js : pair sheet ---- */
    "app.pair.error.missing": "Entre le code affiché sur ton ordinateur (format XXXX-XXXX).",
    "app.pair.error.noserver":"Pas de serveur configuré. Le branchement se fait depuis la version en ligne de l'app.",
    "app.pair.pending":       "Branchement…",
    "app.pair.error.404":     "Ce code n'existe pas (ou plus). Relance la commande sur ton ordinateur pour en obtenir un nouveau.",
    "app.pair.error.410":     "Ce code a expiré. Relance la commande sur ton ordinateur : un code neuf s'affichera.",
    "app.pair.error.400":     "Code invalide. Vérifie qu'il correspond exactement à celui de ton terminal.",
    "app.pair.error.generic": "Le branchement a échoué. Réessaie dans un instant.",
    "app.pair.error.network": "Pas de réponse du serveur (il dort peut-être ~50 s). Réessaie dans un instant.",
    "app.pair.success":       "C'est branché. Tes chiffres vont apparaître.",

    /* ---- index.html : topbar ---- */
    "html.topbar.sub":     "à quel point Claude a faim aujourd'hui",
    "html.topbar.share":   "Partager",
    "html.topbar.account": "Compte",
    "html.topbar.settings":"Réglages",
    "html.topbar.refresh": "Rafraîchir",

    /* ---- index.html : status ---- */
    "html.status.loading": "Chargement…",

    /* ---- index.html : firstrun ---- */
    "html.firstrun.eyebrow":"Démonstration",
    "html.firstrun.title": "Tu vois un exemple",
    "html.firstrun.body":  "Lance le moteur sur ton ordinateur — il lit Claude Code et envoie tes vrais chiffres ici, en privé.",
    "html.firstrun.cta":   "Connecter mon ordinateur →",

    /* ---- index.html : projfilter ---- */
    "html.filter.label":   "Filtré :",
    "html.filter.clear":   "Tout voir ✕",
    "html.filter.clear.aria": "Retirer le filtre projet",

    /* ---- index.html : verdict ---- */
    "html.verdict.loading":"Analyse…",

    /* ---- index.html : cartes ---- */
    "html.boite.title":    "Boîte noire",
    "html.boite.badge.pro":"pro",
    "html.boite.badge.auto":"détecté auto",
    "html.waste.title":    "Waste Radar",
    "html.waste.badge.pro":"pro",
    "html.waste.sub":      "Des tâches où un modèle plus léger aurait sans doute suffi. À vérifier.",
    "html.windows.title":  "Mes fenêtres",
    "html.windows.badge":  "officiel",
    "html.forfait.title":  "Utilisation du forfait",
    "html.forfait.badge":  "estimation",
    "html.radar.aria":     "Radar des fenêtres : 5 heures, semaine, mois",

    /* ---- index.html : mini-stats ---- */
    "html.ms.today":       "Aujourd'hui",
    "html.ms.week":        "Cette semaine",
    "html.ms.pace":        "Au rythme actuel",

    /* ---- index.html : positionnement ---- */
    "html.pos.title":      "Où je me situe",
    "html.pos.badge":      "repère",
    "html.pos.sub":        "Ta semaine comparée à l'usage typique d'un abonné Claude Max.",
    "html.pos.spectrum.aria": "Position de ton usage sur le spectre des abonnés Max",
    "html.pos.caveat":     "Les paliers s'appuient sur des estimations publiques d'usage Max, pas sur des chiffres officiels Anthropic.",
    "html.pos.tiers.0":    "Découverte",
    "html.pos.tiers.1":    "Régulier",
    "html.pos.tiers.2":    "Intensif",
    "html.pos.tiers.3":    "Power-user",

    /* ---- index.html : évolution ---- */
    "html.chart.title":    "Évolution",
    "html.chart.hint":     "tokens / jour",
    "html.chart.period.aria": "Période d'affichage",
    "html.chart.today":    "Aujourd'hui",
    "html.chart.7d":       "7 jours",
    "html.chart.30d":      "30 jours",
    "html.chart.all":      "Tout",
    "html.chart.canvas.aria": "Courbe de consommation de tokens par jour",

    /* ---- index.html : projets ---- */
    "html.proj.title":     "Projets",
    "html.proj.sort.aria": "Trier les projets",
    "html.proj.sort.tokens": "tokens",
    "html.proj.sort.recent": "récence",

    /* ---- index.html : footer ---- */
    "html.foot.default":   "Données locales, jamais envoyées en ligne.",
    "html.foot.sponsor":   "Soutenir ce projet",
    "html.foot.source":    "Code source",

    /* ---- index.html : réglages ---- */
    "html.settings.title":       "Réglages",
    "html.settings.close.aria":  "Fermer",
    "html.settings.lead":        "Tes plafonds restent sur cet appareil. Modifie-les quand tu veux.",
    "html.settings.setup":       "Connecter mon ordinateur (voir mes vrais chiffres)",
    "html.settings.pair":        "J'ai un code de branchement à confirmer",
    "html.settings.plan.group":  "Mon forfait Claude Max",
    "html.settings.plan.label":  "Mon plan",
    "html.settings.plan.hint":   "règle les limites estimées",
    "html.settings.plan.5x":     "Max 5×",
    "html.settings.plan.20x":    "Max 20×",
    "html.settings.calib.label": "Aligner sur le vrai % de Claude",
    "html.settings.calib.hint":  "quand Claude t'affiche un % sur ta limite, note-le ici : l'app recale ses chiffres sur cette réalité",
    "html.settings.calib.ph":    "ex. 11",
    "html.settings.adv":         "Réglages avancés",
    "html.settings.perso.group": "Repères perso",
    "html.settings.perso.opt":   "(facultatif)",
    "html.settings.perso.day.label":   "Par jour",
    "html.settings.perso.day.hint":    "laisse vide si tu ne sais pas",
    "html.settings.perso.day.ph":      "ex. 5 000 000",
    "html.settings.perso.week.label":  "Par semaine",
    "html.settings.perso.week.ph":     "ex. 30 000 000",
    "html.settings.perso.month.label": "Par mois",
    "html.settings.perso.month.ph":    "ex. 120 000 000",
    "html.settings.limits.group": "Tes limites Max",
    "html.settings.limits.hint":  "Claude Max compte ta conso sur des tranches de temps : 5 h et 7 jours. Quand une tranche est pleine, Claude ralentit un moment, puis ça repart.",
    "html.settings.lim5h.label":  "Limite sur 5 heures",
    "html.settings.lim5h.hint":   "ta tranche de 5 h",
    "html.settings.lim7d.label":  "Limite sur 7 jours",
    "html.settings.lim7d.hint":   "ta tranche hebdomadaire",
    "html.settings.api.group":    "Crédits API",
    "html.settings.api.label":    "Crédits achetés ($)",
    "html.settings.api.ph":       "ex. 5",
    "html.settings.display.group":"Affichage",
    "html.settings.lang.group":   "Langue",
    "html.settings.lang.label":   "Interface",
    "html.settings.eur.label":    "Taux $ → €",
    "html.settings.eur.hint":     "pour l'estimation en euros",
    "html.settings.warn.label":   "Alerte à (%)",
    "html.settings.warn.hint":    "seuil d'avertissement",
    "html.settings.notif.group":  "Notifications",
    "html.settings.notif.label":  "Alertes sur le téléphone",
    "html.settings.notif.hint":   "seuils 50 / 80 / 100 %",
    "html.settings.notif.enable": "Activer",
    "html.settings.proj.group":   "Projets en cours",
    "html.settings.proj.note":    "— poids estimé en tokens",
    "html.settings.proj.add":     "Ajouter un projet",
    "html.settings.proj.ph.name": "Nom du projet",
    "html.settings.proj.ph.tokens": "tokens",
    "html.settings.proj.delete.aria": "Supprimer",
    "html.settings.save":         "Enregistrer",
    "html.settings.reset":        "Réinitialiser les valeurs par défaut",
    "html.settings.about.group":  "Ce projet",
    "html.settings.about.txt":    "Outil perso, open source, gratuit. Si tu l'utilises au quotidien et que tu veux soutenir le projet :",
    "html.settings.about.sponsor":"Sponsor sur GitHub",
    "html.settings.about.source": "Code source (MIT)",

    /* ---- index.html : auth sheet ---- */
    "html.auth.title":       "Connexion",
    "html.auth.close.aria":  "Fermer",
    "html.auth.lead":        "Connecte-toi pour voir tes données depuis n'importe quel appareil.",
    "html.auth.signup.group":"S'inscrire ou se connecter",
    "html.auth.email.label": "Email",
    "html.auth.email.hint":  "ton adresse email",
    "html.auth.email.ph":    "toi@exemple.com",
    "html.auth.submit":      "Obtenir mon code de connexion",
    "html.auth.help":        "Tu recevras un code de connexion (il commence par cet_) à coller une fois dans le moteur, sur ton ordinateur. Pas de mot de passe. Garde cette page ouverte : on te demandera de coller ce code à l'installation.",
    "html.auth.existing.group": "J'ai déjà un code de connexion",
    "html.auth.key.label":   "Code de connexion",
    "html.auth.key.ph":      "cet_...",
    "html.auth.key.submit":  "Me connecter avec mon code",
    "html.auth.success.title":"Compte créé !",
    "html.auth.success.help": "Ton code de connexion est ci-dessous. Copie-le maintenant — il ne sera plus affiché. Tu le colleras dans le moteur, sur ton ordinateur.",
    "html.auth.key.display.label": "Ton code de connexion",
    "html.auth.key.display.hint":  "à garder précieusement",
    "html.auth.key.copy":    "Copier la clé",
    "html.auth.key.done":    "C'est bon, j'ai copié",
    "html.auth.connected.title": "Connecté",
    "html.auth.plan.label":  "Plan :",
    "html.auth.upgrade":     "Passer à Pro",
    "html.auth.logout":      "Se déconnecter",

    /* ---- index.html : setup sheet (onboarding 5 étapes) ---- */
    "html.setup.title":      "Voir mes vrais chiffres",
    "html.setup.step":       "Étape {n}/5",
    "html.setup.progress.aria": "Progression de l'installation",
    "html.setup.s1.lead":    "On va installer un petit outil sur ton ordinateur (pas sur le téléphone). C'est lui qui lit l'activité de Claude Code et l'envoie ici. À faire une seule fois.",
    "html.setup.s1.group":   "1 · Récupérer l'outil",
    "html.setup.s1.body":    "Sur ton ordinateur, télécharge le dossier du projet, puis dézippe-le quelque part où tu le retrouveras (ton Bureau, par exemple).",
    "html.setup.s1.btn":     "Télécharger le dossier (.zip)",
    "html.setup.s1.hint":    "Ce bouton ouvre GitHub sur ton ordinateur. Si tu lis ceci sur ton téléphone, ouvre plutôt cette page depuis ton PC — c'est là que l'outil doit vivre.",
    "html.setup.s2.group":   "2 · Créer ton compte",
    "html.setup.s2.body":    "Un compte relie ton ordinateur à cette page. Tu reçois un code de connexion (il commence par cet_). Pas de mot de passe.",
    "html.setup.s2.email.label": "Ton email",
    "html.setup.s2.email.hint":  "sert juste à retrouver ton compte",
    "html.setup.s2.submit":  "Obtenir mon code de connexion",
    "html.setup.s2.existing":"J'ai déjà un code de connexion",
    "html.setup.s2.key.label":"Code de connexion",
    "html.setup.s2.key.hint": "commence par cet_",
    "html.setup.s2.key.submit":"Utiliser ce code",
    "html.setup.s2.success.title": "Compte créé.",
    "html.setup.s2.success.body":  "Voici ton code. Copie-le maintenant : tu vas le coller sur ton ordinateur à l'étape suivante.",
    "html.setup.s3.group":   "3 · Coller ton code sur l'ordinateur",
    "html.setup.s3.body1":   "Dans le dossier que tu as dézippé, il y a un fichier secret.local.example.bat. Fais-en une copie et renomme-la en secret.local.bat.",
    "html.setup.s3.body2":   "Ouvre secret.local.bat avec le Bloc-notes et colle ton code juste après le signe égal, comme ceci :",
    "html.setup.s3.hint":    "Enregistre le fichier, puis ferme-le. C'est tout pour cette étape.",
    "html.setup.s4.group":   "4 · Lancer l'outil",
    "html.setup.s4.win":     "Sur Windows : double-clique sur DEMARRER.bat dans le dossier. Une fenêtre noire s'ouvre et se met à envoyer tes chiffres. Laisse-la ouverte.",
    "html.setup.s4.win.python": "S'il te dit que Python manque : installe-le depuis python.org et, à l'écran d'installation, coche la case « Add Python to PATH ». Puis relance DEMARRER.bat.",
    "html.setup.s4.mac":     "Sur Mac ou Linux : il n'y a pas de double-clic. Ouvre un terminal dans le dossier et lance python tools/push_usage.py --interval 60 (le fichier secret.local.bat te donne les valeurs à charger).",
    "html.setup.s5.group":   "5 · C'est branché",
    "html.setup.s5.body":    "Tant que la fenêtre reste ouverte sur ton ordinateur, tes chiffres arrivent tout seuls. Reviens ici : la démo laisse la place à tes vraies données, sans rien faire de plus.",
    "html.setup.s5.hint":    "Rien ne s'affiche encore ? Laisse une minute à l'ordinateur pour le premier envoi, puis tire la page vers le bas pour rafraîchir. L'outil est à relancer seulement si tu redémarres l'ordinateur.",
    "html.setup.s5.pair":    "Un code « XXXX-XXXX » s'affiche sur mon ordinateur ? Le confirmer →",
    "html.setup.prev":       "Précédent",
    "html.setup.next":       "Suivant",
    "html.setup.done":       "J'ai compris, fermer",

    /* ---- index.html : pair sheet ---- */
    "html.pair.title":       "Brancher mon ordinateur",
    "html.pair.noauth.lead": "Pour brancher ton ordinateur, connecte-toi d'abord. C'est ta connexion qu'on relie à ce PC.",
    "html.pair.noauth.btn":  "Me connecter / créer un compte",
    "html.pair.noauth.cancel": "Annuler",
    "html.pair.confirm.lead":"Un code vient de s'afficher dans le terminal, sur ton ordinateur. Vérifie qu'il correspond exactement à celui-ci avant de confirmer.",
    "html.pair.code.aria":   "Code de branchement",
    "html.pair.manual.group":"Tape le code de ton terminal",
    "html.pair.manual.label":"Code",
    "html.pair.manual.hint": "affiché sur ton ordinateur",
    "html.pair.manual.ph":   "XXXX-XXXX",
    "html.pair.check":       "Vérifie que ce code est bien celui affiché dans ton terminal, sur ton ordinateur. Ne confirme que s'ils sont identiques.",
    "html.pair.confirm.btn": "Confirmer — c'est bien mon ordinateur",
    "html.pair.cancel":      "Annuler",
    "html.pair.success.title":"C'est branché !",
    "html.pair.success.body": "Ton ordinateur est relié à ton compte. Tes vrais chiffres vont apparaître ici tout seuls — laisse la fenêtre ouverte sur ton PC.",
    "html.pair.success.btn": "Voir mes chiffres",

    /* ---- index.html : pro sheet ---- */
    "html.pro.title":        "Passe à Pro",
    "html.pro.price":        "5 € / mois. Résiliable quand tu veux.",
    "html.pro.hook":         "Arrête de rouvrir l'app pour savoir si tu peux relancer. Ton téléphone te prévient avant que ça bloque.",
    "html.pro.feat1.title":  "Sois prévenu à temps.",
    "html.pro.feat1.body":   "Notifs dès 25, 50, 75 puis 90 % — pas seulement quand c'est trop tard.",
    "html.pro.feat2.title":  "Vois plus loin.",
    "html.pro.feat2.body":   "30 jours et tout l'historique, pas seulement les 7 derniers.",
    "html.pro.feat3.title":  "Anticipe la fin de mois.",
    "html.pro.feat3.body":   "La projection te dit où tu atterris à ce rythme.",
    "html.pro.feat4.title":  "Fouille tes projets.",
    "html.pro.feat4.body":   "Ouvre chaque projet : modèles, sessions, coût détaillé.",
    "html.pro.feat5.title":  "Waste Radar.",
    "html.pro.feat5.body":   "Repère où part ton Opus (le modèle premium, donc le plus cher) quand un modèle plus léger aurait suffi — et ce que tu aurais pu économiser.",
    "html.pro.feat6.title":  "Boîte noire.",
    "html.pro.feat6.body":   "Comprends enfin pourquoi ta fenêtre fond si vite — et quel projet est en cause.",
    "html.pro.feat7.title":  "Exporte tout.",
    "html.pro.feat7.body":   "CSV et PNG pour garder tes chiffres ou les partager.",
    "html.pro.cta":          "Passer à Pro — 5 €/mois",
    "html.pro.reassurance":  "Sans engagement. Le gratuit reste gratuit.",
    "html.pro.export.group": "Exporter mes données",
    "html.pro.export.badge": "pro",
    "html.pro.export.csv":   "Export CSV",
    "html.pro.export.png":   "Export PNG",

    /* ---- index.html : waste sheet ---- */
    "html.waste.sheet.title":"Waste Radar",
    "html.waste.sheet.lead": "Des tâches où tu as utilisé Opus alors qu'un modèle plus léger aurait sans doute suffi. Ce sont des candidats à vérifier, pas un verdict.",

    /* ---- shared ---- */
    "html.verdict.demo.banner": "Exemple — pas encore tes chiffres",
    "html.close":            "Fermer",
    "html.proj.filter":      "Filtrer le tableau de bord sur ce projet",
    "html.setup.copy.aria":  "Copier le code",
    "html.setup.copy.btn":   "Copier",
  };
})(typeof window !== "undefined" ? window : globalThis);
