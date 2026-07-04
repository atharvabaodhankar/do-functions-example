# deploy_serverless.ps1
# Unified build & deploy script to prevent 413 Payload Too Large and handle Prisma actions properly.

$prismaActions = @(
    "auth/register",
    "auth/login",
    "image/optimize",
    "image/list",
    "image/delete",
    "user/profile"
)

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

# Clean any existing __deployer__.zip files
Get-ChildItem "." -Recurse -Filter "__deployer__.zip" | Remove-Item -Force -ErrorAction SilentlyContinue

$failed = @()

foreach ($action in $allActions) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host " Preparing & Deploying: $action"
    Write-Host "========================================"

    $folder = "packages/$action"
    $isPrisma = $prismaActions -contains $action

    if ($isPrisma) {
        Write-Host "Running local build and Prisma generation..."
        Push-Location $folder
        
        # 1. Clean old files
        Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
        
        # 2. Install dependencies (generates client schema locally)
        npm install --no-audit --ignore-scripts
        
        # 3. Generate prisma client for linux-musl-openssl-3.0.x target
        $env:PRISMA_CLI_QUERY_ENGINE_TYPE = "library"
        npx prisma generate --schema=schema.prisma
        
        # 4. Clean up heavy dev-only dependencies and cached binaries
        Remove-Item -Recurse -Force node_modules/prisma -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force node_modules/@prisma/engines -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force node_modules/.cache -ErrorAction SilentlyContinue
        
        # 5. Clean up Windows specific query engines to reduce upload size
        Get-ChildItem -Path node_modules -Filter "*windows*" -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        Get-ChildItem -Path node_modules -Filter "*.exe" -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        Get-ChildItem -Path node_modules -Filter "*.dll.node" -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        
        Pop-Location

        # 6. Rename package.json so the remote builder skips npm install
        if (Test-Path "$folder\package.json") {
            Rename-Item -Path "$folder\package.json" -NewName "package.json.bak" -Force
        }
    }

    try {
        # Deploy action
        doctl serverless deploy . --include $action
        if ($LASTEXITCODE -ne 0) {
            Write-Host "FAILED: $action" -ForegroundColor Red
            $failed += $action
        } else {
            Write-Host "OK: $action" -ForegroundColor Green
        }
    }
    finally {
        # Restore package.json for Prisma actions
        if ($isPrisma -and (Test-Path "$folder\package.json.bak")) {
            Rename-Item -Path "$folder\package.json.bak" -NewName "package.json" -Force
        }
        # Clean up deployer zip
        Get-ChildItem "." -Recurse -Filter "__deployer__.zip" | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
if ($failed.Count -eq 0) {
    Write-Host "All functions deployed successfully! 🚀" -ForegroundColor Green
} else {
    Write-Host "Failed functions: $($failed -join ', ')" -ForegroundColor Red
}
