$ErrorActionPreference = 'Stop'

$source = Get-Content -Raw -LiteralPath 'apps/web/src/app/study/page.tsx'
$dashboardButton = "<TabButton active={activeTab === 'dashboard'}"
$englishButton = "<TabButton active={activeTab === 'english'}"
$dashboardButtonIndex = $source.IndexOf($dashboardButton)
$englishButtonIndex = $source.IndexOf($englishButton)

if ($dashboardButtonIndex -lt 0 -or $englishButtonIndex -lt 0) {
  throw 'Nao foi possivel localizar as abas Dashboard e Ingles.'
}

if ($dashboardButtonIndex -ge $englishButtonIndex) {
  throw 'A aba Dashboard precisa aparecer antes da aba Ingles.'
}

$dashboardFunctionIndex = $source.IndexOf('function DashboardTab(')
$statisticsRenderIndexes = [regex]::Matches($source, '<StudyStatisticsPanel />') | ForEach-Object { $_.Index }

if ($statisticsRenderIndexes.Count -ne 1 -or $statisticsRenderIndexes[0] -le $dashboardFunctionIndex) {
  throw 'StudyStatisticsPanel deve ser renderizado uma unica vez dentro de DashboardTab.'
}

Write-Output 'Study dashboard layout test passed.'
