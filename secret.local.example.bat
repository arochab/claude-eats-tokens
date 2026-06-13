@echo off
REM ===========================================================================
REM  Copie ce fichier en "secret.local.bat" (meme dossier) et remplis tes valeurs.
REM  secret.local.bat est ignore par git : ton secret ne partira JAMAIS en ligne.
REM ===========================================================================
set PUSH_URL=https://claude-eats-tokens.onrender.com
set PUSH_SECRET=colle-ici-le-meme-secret-que-sur-render
REM (optionnel) usage facture a l'API :
REM set ANTHROPIC_ADMIN_KEY=sk-ant-admin-xxxx
