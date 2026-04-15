[CmdletBinding()]
param(
  [string]$ContainerName = 'english-kids-tutor-kokoro',
  [string]$Image = 'ghcr.io/remsky/kokoro-fastapi-cpu:v0.1.4',
  [int]$HostPort = 8880,
  [int]$ContainerPort = 8880
)

$ErrorActionPreference = 'Stop'

function Test-CommandAvailable([string]$Name, [string]$HelpText) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' was not found. $HelpText"
  }
}

function Get-ContainerState([string]$Name) {
  $state = docker container inspect --format "{{.State.Status}}" $Name 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $null
  }

  return ($state | Select-Object -First 1).Trim()
}

Test-CommandAvailable docker 'Install Docker Desktop and try again.'

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop is installed but the Docker daemon is not running. Start Docker Desktop and try again.'
}

Write-Host ''
Write-Host 'English Kids Tutor Kokoro TTS'
Write-Host "Image: $Image"
Write-Host "URL: http://127.0.0.1:$HostPort/v1/audio/speech"
Write-Host ''

$state = Get-ContainerState -Name $ContainerName

if ($state -eq 'running') {
  Write-Host "Kokoro container '$ContainerName' is already running." -ForegroundColor Green
  docker logs --tail 20 -f $ContainerName
  exit $LASTEXITCODE
}

if ($state) {
  Write-Host "Starting existing Kokoro container '$ContainerName'..." -ForegroundColor Cyan
  docker start $ContainerName | Out-Null
  docker logs --tail 20 -f $ContainerName
  exit $LASTEXITCODE
}

Write-Host "Starting new Kokoro container '$ContainerName'..." -ForegroundColor Cyan
docker run --rm --name $ContainerName -p "${HostPort}:${ContainerPort}" $Image
