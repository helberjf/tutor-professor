$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$WebDir = Join-Path $RepoRoot 'apps\web'

Set-Location $WebDir
Write-Host ''
Write-Host 'Tutor and Professor Web'
Write-Host "Folder: $WebDir"
Write-Host 'URL: http://localhost:3000'
Write-Host 'Note: this is only the local frontend. The Cloudflare Tunnel for Vercel integration must point to http://localhost:8001.'
Write-Host 'The Cloudflare URL will not appear in this window. Run scripts\run-tunnel.ps1 or use .\start-project.cmd -WithTunnel.'
Write-Host ''

pnpm dev
