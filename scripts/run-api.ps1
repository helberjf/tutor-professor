$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ApiDir = Join-Path $RepoRoot 'apps\api'

Set-Location $ApiDir
Write-Host ''
Write-Host 'English Kids Tutor API'
Write-Host "Folder: $ApiDir"
Write-Host 'URL: http://localhost:8001'
Write-Host ''

python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
