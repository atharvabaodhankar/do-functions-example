# deploy_serverless.ps1
# Clean deploy script — wipes ALL node_modules before each deploy
# so the upload ZIP stays under the 48MB limit.
# .deployignore handles frontend/ exclusion automatically.

$allActions = @(
    "auth/register",
    "auth/login",
    "image/health",
    "image/presign",
    "image/complete",
    "image/optimize",
    "image/metadata",
    "image/thumbnail",
    "image/list",
    "image/delete",
    "user/profile"
)

# Load env variables from .env
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
    }
}

# Wipe ALL package node_modules and deployer zips before starting
Write-Host "Cleaning all node_modules and deployer artifacts..."
Get-ChildItem "packages" -Recurse -Directory -Filter "node_modules" |
    Where-Object { $_.FullName -notmatch "node_modules\\node_modules" } |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Get-ChildItem "." -Recurse -Filter "__deployer__.zip" | Remove-Item -Force -ErrorAction SilentlyContinue
Write-Host "Clean done."

# Deploy each function one-by-one (remote build handles npm install)
$failed = @()
foreach ($action in $allActions) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host " Deploying: $action"
    Write-Host "========================================"

    doctl serverless deploy . --include $action
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $action" -ForegroundColor Red
        $failed += $action
    } else {
        Write-Host "OK: $action" -ForegroundColor Green
    }

    # Clean up deployer zip left by doctl
    Get-ChildItem "." -Recurse -Filter "__deployer__.zip" | Remove-Item -Force -ErrorAction SilentlyContinue
}

Write-Host ""
if ($failed.Count -eq 0) {
    Write-Host "All functions deployed successfully!" -ForegroundColor Green
} else {
    Write-Host "Failed functions: $($failed -join ', ')" -ForegroundColor Red
}
