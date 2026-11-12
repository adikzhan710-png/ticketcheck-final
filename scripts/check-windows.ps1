$ErrorActionPreference = 'Stop'
$previousOptions = $env:NODE_OPTIONS
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $compatUri = ([System.Uri](Join-Path $PSScriptRoot 'windows-realpath-compat.mjs')).AbsoluteUri
    $env:NODE_OPTIONS = "$previousOptions --import=$compatUri".Trim()
    foreach ($taskName in @('build', 'test', 'demo', 'typecheck')) {
        & npm.cmd run $taskName
        if ($LASTEXITCODE -ne 0) { throw "Verification failed: $taskName" }
    }
} finally {
    $env:NODE_OPTIONS = $previousOptions
    Pop-Location
}
