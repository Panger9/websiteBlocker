param(
  [string]$Workspace = (Get-Location).Path,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[create-version] $Message"
}

function Invoke-CheckedCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  $joined = if ($Arguments.Count -gt 0) { "$FilePath $($Arguments -join ' ')" } else { $FilePath }
  Write-Step "Running: $joined"

  $previous = Get-Location
  try {
    Set-Location $WorkingDirectory
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $joined"
    }
  } finally {
    Set-Location $previous
  }
}

function Get-NextVersion {
  param([string]$CurrentVersion)

  if ($CurrentVersion -notmatch '^\d+(?:\.\d+){0,3}$') {
    throw "manifest.json version must use a Chrome extension version with 1 to 4 numeric parts. Found: $CurrentVersion"
  }

  $parts = $CurrentVersion.Split('.') | ForEach-Object { [int]$_ }
  $parts[$parts.Count - 1] += 1
  return ($parts -join '.')
}

$workspacePath = (Resolve-Path $Workspace).Path
$manifestPath = Join-Path $workspacePath "manifest.json"
$zipPath = Join-Path $workspacePath "websiteBlocker.zip"
$includeEntries = @("css", "html", "icons", "js", "manifest.json")

if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found in $workspacePath"
}

$nodeCommand = Get-Command node -ErrorAction Stop
$manifestRaw = Get-Content $manifestPath -Raw
$manifest = $manifestRaw | ConvertFrom-Json
$currentVersion = [string]$manifest.version
$nextVersion = Get-NextVersion $currentVersion

Write-Step "Workspace: $workspacePath"
Write-Step "Current version: $currentVersion"
Write-Step "Next version: $nextVersion"

$jsFiles = Get-ChildItem -Path (Join-Path $workspacePath "js") -Filter *.js -File -ErrorAction SilentlyContinue |
  Sort-Object FullName
foreach ($jsFile in $jsFiles) {
  Invoke-CheckedCommand -FilePath $nodeCommand.Source -Arguments @("--check", $jsFile.FullName) -WorkingDirectory $workspacePath
}

$testFiles = Get-ChildItem -Path (Join-Path $workspacePath "tests") -Filter *.test.js -File -ErrorAction SilentlyContinue |
  Sort-Object FullName
foreach ($testFile in $testFiles) {
  Invoke-CheckedCommand -FilePath $nodeCommand.Source -Arguments @($testFile.FullName) -WorkingDirectory $workspacePath
}

if ($DryRun) {
  Write-Step "Dry run completed. No version bump or zip file changes were made."
  exit 0
}

$updatedManifest = [regex]::Replace(
  $manifestRaw,
  '"version"\s*:\s*"' + [regex]::Escape($currentVersion) + '"',
  '"version": "' + $nextVersion + '"',
  1
)

if ($updatedManifest -eq $manifestRaw) {
  throw "Failed to update version in manifest.json"
}

Set-Content -Path $manifestPath -Value $updatedManifest -NoNewline
Write-Step "Updated manifest.json to version $nextVersion"

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
  Write-Step "Deleted existing websiteBlocker.zip"
}

$archiveInputs = $includeEntries | ForEach-Object { Join-Path $workspacePath $_ }
$missingEntries = $archiveInputs | Where-Object { -not (Test-Path $_) }
if ($missingEntries.Count -gt 0) {
  throw "Cannot create zip. Missing entries: $($missingEntries -join ', ')"
}

Compress-Archive -Path $archiveInputs -DestinationPath $zipPath -CompressionLevel Optimal
Write-Step "Created $zipPath"
Write-Step "Release build complete."
