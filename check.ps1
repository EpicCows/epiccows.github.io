# Quick syntax check - run before committing
# Usage: .\check.ps1

$ok = $true
$prevErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"

Write-Host "=== Syntax check ===" -ForegroundColor Cyan

# JS parse check (node --check)
$jsFiles = Get-ChildItem -Path $PSScriptRoot -Filter "app-*.js"
foreach ($f in $jsFiles) {
    $fname = $f.Name
    $result = & node --check $f.FullName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host ("  FAIL: " + $fname) -ForegroundColor Red
        if ($result) { Write-Host ("        " + $result) -ForegroundColor Red }
        $ok = $false
    } else {
        Write-Host ("  OK:   " + $fname) -ForegroundColor Green
    }
}

# CSS brace check
$cssPath = Join-Path $PSScriptRoot "styles.css"
$css = Get-Content -Path $cssPath -Raw
$open  = ($css.ToCharArray() | Where-Object { $_ -eq '{' }).Count
$close = ($css.ToCharArray() | Where-Object { $_ -eq '}' }).Count
if ($open -ne $close) {
    $msg = "  FAIL: styles.css - brace mismatch: " + $open + " open, " + $close + " close"
    Write-Host $msg -ForegroundColor Red
    $ok = $false
} else {
    $msg = "  OK:   styles.css (" + $open + " braces balanced)"
    Write-Host $msg -ForegroundColor Green
}

$ErrorActionPreference = $prevErrorAction

Write-Host ""
if ($ok) {
    Write-Host "All checks passed." -ForegroundColor Green
} else {
    Write-Host "Some checks FAILED - fix before committing." -ForegroundColor Red
    exit 1
}
