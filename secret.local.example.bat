@echo off
REM ===========================================================================
REM  Copie ce fichier en "secret.local.bat" (meme dossier) et remplis TES valeurs.
REM  secret.local.bat est ignore par git : rien ne partira JAMAIS en ligne.
REM ===========================================================================

set PUSH_URL=https://claude-eats-tokens.onrender.com

REM --- Version simple (recommandee) : ton code de connexion ---
REM  Ouvre l'app, bouton Compte, cree ton compte : tu recois un code qui
REM  commence par "cet_". Colle-le juste apres le "=" ci-dessous.
set CET_API_KEY=colle-ici-ton-code-de-connexion-cet_xxxx

REM --- Version experte (self-hosted) : si tu heberges TON propre serveur ---
REM  Dans ce cas, laisse CET_API_KEY vide au-dessus et remplis plutot :
REM set PUSH_SECRET=le-meme-secret-que-sur-ton-serveur

REM (optionnel) usage facture a l'API :
REM set ANTHROPIC_ADMIN_KEY=sk-ant-admin-xxxx
