@echo off
:: Ativar Backend Completo
:: Um clique: sobe backend, tunnel e envia pra Vercel automaticamente.

cd /d "%~dp0"
powershell -NoExit -ExecutionPolicy Bypass -File "scripts\ativar-tudo.ps1"
