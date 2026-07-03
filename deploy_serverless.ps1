$prismaActions = @(
    "auth/register",
    "auth/login",
    "image/complete",
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

# 1. Rename package.json to package.json.bak for Prisma actions
foreach ($action in $prismaActions) {
    $folder = "packages/$action"
    if (Test-Path "$folder\package.json") {
        Rename-Item -Path "$folder\package.json" -NewName "package.json.bak" -Force
        
        # Prune Windows engine to save upload bandwidth and avoid zip bloat
        Remove-Item -Force "$folder\node_modules\@prisma\client\query-engine-windows.exe" -ErrorAction SilentlyContinue
    }
}

try {
    # 2. Load env variables
    Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#][^=]+)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }

    # 3. Deploy functions one-by-one to avoid the 48MB payload limit
    foreach ($action in $allActions) {
        Write-Host "----------------------------------------"
        Write-Host "Deploying function: $action"
        Write-Host "----------------------------------------"
        
        # If it is a non-Prisma function, we might want remote build for platform modules (like sharp/axios)
        if ($prismaActions -contains $action) {
            # Prisma actions deploy with local prebuilt client
            doctl serverless deploy . --include $action
        } else {
            # Non-Prisma actions deploy with remote build
            doctl serverless deploy . --include $action --remote-build
        }
    }
}
finally {
    # 4. Restore package.json files
    foreach ($action in $prismaActions) {
        $folder = "packages/$action"
        if (Test-Path "$folder\package.json.bak") {
            Rename-Item -Path "$folder\package.json.bak" -NewName "package.json" -Force
        }
    }
    Write-Host "Restored package.json files."
}
