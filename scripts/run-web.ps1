$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$WebDir = Join-Path $RepoRoot 'apps\web'

Set-Location $WebDir
Write-Host ''
Write-Host 'English Kids Tutor Web'
Write-Host "Folder: $WebDir"
Write-Host 'URL: http://localhost:3000'
Write-Host ''

pnpm dev
