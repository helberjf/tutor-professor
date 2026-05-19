@echo off
:: Ativa o backend local no Vercel enviando a URL do tunnel Cloudflare.
:: Execute este arquivo depois de iniciar o projeto para que o site
:: consiga se conectar ao backend automaticamente.
::
:: Pré-requisito: configure ENGLISH_TUTOR_VERCEL_SYNC_TOKEN em local.secrets
:: (veja local.secrets.example para instruções)

cd /d "%~dp0"
powershell -NoExit -ExecutionPolicy Bypass -File "scripts\activate-backend.ps1"
