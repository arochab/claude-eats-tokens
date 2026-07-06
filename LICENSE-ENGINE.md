# Licence du moteur d'analyse (source-available)

Le dépôt Claude Eats Tokens est distribué sous licence **MIT** (voir `LICENSE`),
**à une exception près** décrite ci-dessous.

## Portée de cette licence

Cette licence s'applique aux **heuristiques d'analyse propriétaires** du moteur,
c'est-à-dire les fonctions suivantes de `tools/usage_core.py` et tout code qui en
dérive directement :

- `_looks_opus_suspect`
- `select_sessions`
- `opus_waste_suspects`  *(feature « Waste Radar »)*
- `detect_anomalies`  *(feature « Boîte noire »)*

## Ce qui est autorisé (gratuit)

- **Lire** le code, l'étudier, l'utiliser à des fins personnelles ou éducatives.
- **Auto-héberger** l'application pour son propre usage (self-hosting), y compris
  faire tourner ces fonctions dans son instance personnelle.
- **Modifier** le code pour son usage privé non commercial.

## Ce qui est interdit sans autorisation écrite

- **Revendre** ces fonctions ou une œuvre qui les incorpore.
- Les intégrer dans un **produit ou service concurrent**, commercial ou monétisé
  (abonnement, publicité, offre payante), qui reproduit tout ou partie des
  features « Waste Radar » ou « Boîte noire ».
- Redistribuer ces fonctions sous une licence plus permissive (dont MIT).

## Reste du dépôt

Tout le reste (PWA, design, serveur, outils, tests, documentation) demeure sous
licence **MIT** et peut être réutilisé librement, y compris commercialement.

## Contact

Pour une licence commerciale ou une autorisation : Adam Chabbi
(adam.chabbi94@gmail.com).

---

*En résumé : le code est ouvert et auto-hébergeable ; ce qui est interdit, c'est
d'en faire un produit concurrent payant. Le reste du dépôt est MIT sans réserve.*
