# Install the Loccy plugin for Claude Code, and keep it updating itself.
[CmdletBinding()]
param(
  [switch]$NoAutoUpdate,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$Repo = 'loccy-dev/monorepo'
$Marketplace = 'loccy'
$Plugin = 'loccy@loccy'

function Say($text) { Write-Host $text -ForegroundColor White }
function Note($text) { Write-Host "  $text" }
function Fail($text) { Write-Host $text -ForegroundColor Red; exit 1 }

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Fail 'claude was not found. Install Claude Code first: https://claude.com/claude-code'
}

Say 'Loccy plugin for Claude Code'

# 1. The marketplace this plugin is published through.
$marketplaces = (claude plugin marketplace list 2>$null | Out-String)
if ($marketplaces -match "(?m)^\s*.\s+$([regex]::Escape($Marketplace))\s*$") {
  Note "marketplace $Marketplace already configured"
} else {
  claude plugin marketplace add $Repo | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "could not add the $Marketplace marketplace" }
  Note "marketplace $Marketplace added"
}

# 2. The plugin itself.
$plugins = (claude plugin list 2>$null | Out-String)
if (-not $Force -and $plugins -match "(?m)^\s*.\s+$([regex]::Escape($Plugin))\s*$") {
  Note "plugin $Plugin already installed (use -Force to reinstall)"
} else {
  claude plugin install $Plugin --yes | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "could not install $Plugin" }
  Note "plugin $Plugin installed"
}

# 3. Auto-update, which is per marketplace and off unless it is asked for. The plugin carries the
# loccy-tool binary, so a plugin left behind is a tool left behind.
if ($NoAutoUpdate) {
  Note 'auto-update left alone (-NoAutoUpdate)'
  Say ''
  Say 'Done. Restart Claude Code to pick the plugin up.'
  exit 0
}

$configDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }
$settingsPath = Join-Path $configDir 'settings.json'

$settings = [pscustomobject]@{}
if (Test-Path $settingsPath) {
  try {
    $settings = Get-Content -Raw -Path $settingsPath | ConvertFrom-Json
  } catch {
    Note "left $settingsPath alone, it does not parse as JSON: $($_.Exception.Message)"
    Note 'turn auto-update on in /plugin instead'
    Say ''
    Say 'Done. Restart Claude Code to pick the plugin up.'
    exit 0
  }
}

function Ensure-Property($object, $name, $value) {
  if (-not $object.PSObject.Properties[$name]) {
    $object | Add-Member -NotePropertyName $name -NotePropertyValue $value
  }
  return $object.$name
}

$known = Ensure-Property $settings 'extraKnownMarketplaces' ([pscustomobject]@{})
$entry = Ensure-Property $known $Marketplace ([pscustomobject]@{})
Ensure-Property $entry 'source' ([pscustomobject]@{ source = 'github'; repo = $Repo }) | Out-Null

if ($entry.PSObject.Properties['autoUpdate'] -and $entry.autoUpdate -eq $true) {
  Note 'auto-update already on'
} else {
  # The written file is read back through the CLI, and put back as it was if that no longer works.
  $backup = "$settingsPath.loccy-backup"
  if (Test-Path $settingsPath) { Copy-Item $settingsPath $backup -Force }

  if ($entry.PSObject.Properties['autoUpdate']) { $entry.autoUpdate = $true }
  else { $entry | Add-Member -NotePropertyName 'autoUpdate' -NotePropertyValue $true }

  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  ($settings | ConvertTo-Json -Depth 100) + "`n" | Set-Content -Path $settingsPath -NoNewline -Encoding utf8

  claude plugin marketplace list 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Note "auto-update on for the $Marketplace marketplace"
    if (Test-Path $backup) { Remove-Item $backup -Force }
  } else {
    if (Test-Path $backup) { Move-Item $backup $settingsPath -Force }
    Fail 'settings.json was put back: Claude Code would not read it with that change'
  }
}

Say ''
Say 'Done. Restart Claude Code to pick the plugin up.'
