param([string]$Source)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
if (-not $Source) {
    $Source = Join-Path $root 'public/examples/logscan.cpp'
}
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$sample = (Resolve-Path -LiteralPath (Join-Path $root 'public/examples/sample.log')).Path

function New-LogFixture([string]$Name, [string]$Content) {
    $path = Join-Path $scratch $Name
    [System.IO.File]::WriteAllText($path, $Content, [System.Text.Encoding]::ASCII)
    return $path
}

function Get-ExpectedSummary([int]$Info, [int]$Warn, [int]$Errors, [int]$Unknown) {
    return "INFO $Info`nWARN $Warn`nERROR $Errors`nUNKNOWN $Unknown`n"
}

function Assert-Scan {
    param(
        [string]$Name,
        [string[]]$LogPaths = @(),
        [int]$ExitCode = 0,
        [string]$Stdout = '',
        [string]$Stderr = ''
    )

    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $exe
    # Fixture paths are Windows filenames: no double quotes or trailing backslashes.
    $start.Arguments = ($LogPaths | ForEach-Object { '"{0}"' -f $_ }) -join ' '
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    try {
        $process.StartInfo = $start
        if (-not $process.Start()) { throw "Could not run $exe" }
        $outRead = $process.StandardOutput.ReadToEndAsync()
        $errRead = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(10000)) {
            $process.Kill()
            $process.WaitForExit()
            throw "${Name}: logscan did not exit within 10 seconds."
        }
        $actualExitCode = $process.ExitCode
        $actualOut = $outRead.GetAwaiter().GetResult() -creplace '\r\n', "`n"
        $actualErr = $errRead.GetAwaiter().GetResult() -creplace '\r\n', "`n"
    } finally {
        $process.Dispose()
    }

    if ($actualExitCode -ne $ExitCode) {
        throw "${Name}: expected exit $ExitCode, got $actualExitCode. stderr: $actualErr"
    }
    if ($actualOut -cne $Stdout) {
        throw "${Name}: stdout mismatch.`nExpected: [$Stdout]`nActual: [$actualOut]"
    }
    if ($actualErr -cne $Stderr) {
        throw "${Name}: stderr mismatch.`nExpected: [$Stderr]`nActual: [$actualErr]"
    }
    Write-Host "PASS $Name (exit $actualExitCode)"
}

$tempRoot = (Get-Item -LiteralPath ([System.IO.Path]::GetTempPath())).FullName
$scratch = (New-Item -ItemType Directory -Path (Join-Path $tempRoot "LogScan tests $([guid]::NewGuid())")).FullName
try {
    $exe = Join-Path $scratch 'logscan.exe'
    & g++ -std=c++20 -Wall -Wextra -Wpedantic $sourcePath -o $exe
    if ($LASTEXITCODE -ne 0) { throw "g++ failed with exit code $LASTEXITCODE." }

    $empty = New-LogFixture 'empty.log' ''
    $mixed = New-LogFixture 'mixed.log' "  INFO startup`n`tDEBUG WARN`nWARN`tbackoff`n`n`t `ninfo lower-case`nERROR: punctuation`n[INFO] decorated`nERROR"
    $crlf = New-LogFixture 'windows.log' "INFO`r`n`tWARN`r`n`r`nERROR`r`n"
    $asciiSpace = New-LogFixture 'ascii-space.log' "$([char]11)INFO$([char]12)message`n$([char]12)$([char]11)`n"
    $missing = Join-Path $scratch 'missing.log'
    $usage = "Usage: logscan <file>`n"

    Assert-Scan -Name 'sample' -LogPaths $sample -Stdout (Get-ExpectedSummary 3 1 1 0)
    Assert-Scan -Name 'empty' -LogPaths $empty -Stdout (Get-ExpectedSummary 0 0 0 0)
    Assert-Scan -Name 'malformed and unknown, final line without newline' -LogPaths $mixed -Stdout (Get-ExpectedSummary 1 1 1 4)
    Assert-Scan -Name 'Windows CRLF' -LogPaths $crlf -Stdout (Get-ExpectedSummary 1 1 1 0)
    Assert-Scan -Name 'ASCII vertical tab and form feed' -LogPaths $asciiSpace -Stdout (Get-ExpectedSummary 1 0 0 0)
    Assert-Scan -Name 'missing file' -LogPaths $missing -ExitCode 1 -Stderr "logscan: cannot open '$missing'`n"
    Assert-Scan -Name 'no arguments' -ExitCode 2 -Stderr $usage
    Assert-Scan -Name 'too many arguments' -LogPaths @($sample, $empty) -ExitCode 2 -Stderr $usage

    Write-Host 'All 8 LogScan cases passed.'
} finally {
    $resolvedScratch = (Resolve-Path -LiteralPath $scratch).Path
    $separator = [System.IO.Path]::DirectorySeparatorChar
    if ((Split-Path -Parent $resolvedScratch).TrimEnd($separator) -ne $tempRoot.TrimEnd($separator) -or
        (Split-Path -Leaf $resolvedScratch) -notmatch '^LogScan tests [0-9a-f-]{36}$') {
        throw "Refusing to remove an unexpected test directory: $resolvedScratch"
    }
    Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
}
