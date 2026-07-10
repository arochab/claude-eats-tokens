/* i18n/index.js — moteur de traduction.
   Exposé sur window.CETI18N (aussi importable en Node via globalThis).
   Dépend de CET_LANG_FR et CET_LANG_EN (chargés avant dans index.html). */
(function (root) {
  "use strict";

  var LANG_KEY = "tokenTracker.lang.v1";
  var _lang = null;

  /* Détection initiale : 1) localStorage, 2) navigator.language, 3) EN par défaut */
  function detectLang() {
    try {
      var s = typeof localStorage !== "undefined" && localStorage.getItem(LANG_KEY);
      if (s === "fr" || s === "en") return s;
    } catch (e) {}
    if (typeof navigator !== "undefined") {
      var nav = (navigator.language || "").slice(0, 2).toLowerCase();
      if (nav === "fr") return "fr";
    }
    return "en";  // EN par défaut (pour HN et les nouveaux utilisateurs)
  }

  function getLang() {
    if (!_lang) _lang = detectLang();
    return _lang;
  }

  function setLang(code) {
    if (code !== "fr" && code !== "en") return;
    _lang = code;
    try { if (typeof localStorage !== "undefined") localStorage.setItem(LANG_KEY, code); } catch (e) {}
  }

  /* t(key, vars) — résout la clé dans la langue courante avec interpolation {var}.
     Fallback : FR si la clé manque en EN, puis la clé elle-même (jamais de crash). */
  function t(key, vars) {
    var lang = getLang();
    var dict = lang === "fr" ? root.CET_LANG_FR : root.CET_LANG_EN;
    var str = (dict && dict[key] != null) ? dict[key]
            : (root.CET_LANG_FR && root.CET_LANG_FR[key] != null) ? root.CET_LANG_FR[key]
            : key;
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : "{" + k + "}";
    });
  }

  /* locale() — retourne la locale BCP 47 courante (pour toLocaleString, etc.) */
  function locale() {
    return t("locale");  // "fr-FR" ou "en-GB"
  }

  /* applyI18nToDOM() — remplace les textes des éléments marqués [data-i18n].
     data-i18n="key"              -> textContent (si noeud texte seul)
     data-i18n-attr="placeholder" -> attribut ciblé
     data-i18n-attr="aria-label"  -> attribut ciblé
     Appelée au DOMContentLoaded et à chaque changement de langue. */
  function applyI18nToDOM() {
    if (typeof document === "undefined") return;
    var els = document.querySelectorAll("[data-i18n]");
    [].forEach.call(els, function (el) {
      var key = el.getAttribute("data-i18n");
      var attr = el.getAttribute("data-i18n-attr");
      var val = t(key);
      if (attr) {
        el.setAttribute(attr, val);
      } else {
        /* Remplacement sûr : on ne touche qu'au premier nœud texte direct,
           pour ne pas écraser des éléments enfants (ex: <b>, <small>). */
        var found = false;
        [].forEach.call(el.childNodes, function (node) {
          if (!found && node.nodeType === 3 && node.nodeValue.trim()) {
            node.nodeValue = val;
            found = true;
          }
        });
        /* Si pas de nœud texte trouvé (élément vide ou pur enfant), on set textContent
           uniquement si l'élément n'a pas d'enfants éléments. */
        if (!found && el.children.length === 0) {
          el.textContent = val;
        }
      }
    });
    /* Met à jour l'attribut lang du <html> */
    var html = document.documentElement;
    if (html) html.setAttribute("lang", getLang() === "fr" ? "fr" : "en");
  }

  /* Sélecteur de langue dans les réglages : marque le bouton actif */
  function markLangButtons() {
    if (typeof document === "undefined") return;
    var seg = document.getElementById("lang-seg");
    if (!seg) return;
    [].forEach.call(seg.querySelectorAll("button[data-lang]"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-lang") === getLang());
    });
  }

  /* switchLang(code) — change la langue, met à jour le DOM et re-render si possible */
  function switchLang(code) {
    setLang(code);
    applyI18nToDOM();
    markLangButtons();
    /* Re-render si app.js a exposé une fonction render() globale */
    if (typeof root.CET_RERENDER === "function") root.CET_RERENDER();
  }

  /* Auto-init au DOMContentLoaded */
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        applyI18nToDOM();
        markLangButtons();
      });
    } else {
      applyI18nToDOM();
      markLangButtons();
    }
  }

  var api = { t: t, getLang: getLang, setLang: setLang, detectLang: detectLang,
              locale: locale, applyI18nToDOM: applyI18nToDOM,
              markLangButtons: markLangButtons, switchLang: switchLang };
  root.CETI18N = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof window !== "undefined" ? window : globalThis);
