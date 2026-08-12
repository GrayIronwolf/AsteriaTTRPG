param(
  [string]$Destination = ""
)

$ErrorActionPreference = "Stop"
$source = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $Destination) {
  $Destination = Join-Path (Split-Path $source -Parent) "ASTERIA-UNIFIED-LIVE-DASHBOARD-WINDOWS-v1.zip"
}
$destinationPath = [System.IO.Path]::GetFullPath($Destination)

if (Test-Path -LiteralPath $destinationPath) {
  throw "Destination already exists: $destinationPath"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$stream = [System.IO.File]::Open($destinationPath, [System.IO.FileMode]::CreateNew)
$archive = [System.IO.Compression.ZipArchive]::new(
  $stream,
  [System.IO.Compression.ZipArchiveMode]::Create,
  $false
)

try {
  Get-ChildItem -LiteralPath $source -Recurse -File -Force | ForEach-Object {
    $relative = $_.FullName.Substring($source.Length + 1)
    $segments = $relative -split "[\\/]"
    $excluded = $segments -contains "node_modules" -or
      $segments -contains ".git" -or
      $_.Extension -eq ".zip" -or
      $_.Name -like "asteria-react-server*.log"

    if (-not $excluded) {
      $entryName = "Asteria Website/" + $relative.Replace("\", "/")
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive,
        $_.FullName,
        $entryName,
        [System.IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
  }
}
finally {
  $archive.Dispose()
  $stream.Dispose()
}

$verification = [System.IO.Compression.ZipFile]::OpenRead($destinationPath)
try {
  $indexEntry = $verification.GetEntry("Asteria Website/index.html")
  if (-not $indexEntry -or $verification.Entries.Count -lt 100) {
    throw "ZIP verification failed."
  }
  [PSCustomObject]@{
    Path = $destinationPath
    Entries = $verification.Entries.Count
    IndexBytes = $indexEntry.Length
    SizeBytes = (Get-Item -LiteralPath $destinationPath).Length
  }
}
finally {
  $verification.Dispose()
}
