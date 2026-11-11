# Installs Gitgotchi from its latest GitHub release on Windows. Run it again to update.
#
#   irm https://raw.githubusercontent.com/nicvazquezdev/gitgotchi/main/install.ps1 | iex
#
# $env:GITGOTCHI_VERSION = '0.1.0' installs that version instead of the latest.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the progress bar makes Invoke-WebRequest very slow in Windows PowerShell

$repo = 'nicvazquezdev/gitgotchi'
$version = $env:GITGOTCHI_VERSION
if (-not $version) { $version = (Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest").tag_name }
$version = $version.TrimStart('v')
if ($version -notmatch '^\d+\.\d+\.\d+') { throw "gitgotchi: could not find a release (got '$version')" }

$file = "Gitgotchi-$version-win-x64.exe"
$url = "https://github.com/$repo/releases/download/v$version"
$tmp = Join-Path ([IO.Path]::GetTempPath()) "gitgotchi-$([guid]::NewGuid())"
New-Item -ItemType Directory $tmp | Out-Null

try {
  # The manifest is what the updater reads: it has the sha512 of the installer
  Invoke-WebRequest "$url/latest.yml" -OutFile "$tmp\latest.yml" -UseBasicParsing
  $entry = [regex]::Match((Get-Content "$tmp\latest.yml" -Raw), "url: $([regex]::Escape($file))\s+sha512: (\S+)")
  if (-not $entry.Success) { throw "gitgotchi: $file is not in latest.yml" }

  Write-Host "Downloading $file"
  Invoke-WebRequest "$url/$file" -OutFile "$tmp\$file" -UseBasicParsing
  $stream = [IO.File]::OpenRead("$tmp\$file")
  try { $got = [Convert]::ToBase64String([Security.Cryptography.SHA512]::Create().ComputeHash($stream)) }
  finally { $stream.Dispose() }
  if ($got -ne $entry.Groups[1].Value) { throw "gitgotchi: $file does not match its checksum" }

  # It installs for your user (no admin rights) and closes a running Gitgotchi first. The updater runs the same installer.
  Write-Host 'Installing'
  $installer = Start-Process "$tmp\$file" -ArgumentList '/S' -Wait -PassThru
  if ($installer.ExitCode -ne 0) { throw "gitgotchi: the installer failed (exit code $($installer.ExitCode))" }
}
finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Gitgotchi $version is installed."
$exe = Join-Path $env:LOCALAPPDATA 'Programs\Gitgotchi\Gitgotchi.exe'
if (Test-Path $exe) { Start-Process $exe } else { Write-Host 'Open it from the Start menu.' }
