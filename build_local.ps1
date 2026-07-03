$actions = @(
    "packages/auth/register",
    "packages/auth/login",
    "packages/image/presign",
    "packages/image/complete",
    "packages/image/optimize",
    "packages/image/metadata",
    "packages/image/thumbnail",
    "packages/image/list",
    "packages/image/delete",
    "packages/user/profile"
)

foreach ($action in $actions) {
    if (Test-Path "$action\package.json") {
        Write-Host "----------------------------------------"
        Write-Host "Building action: $action"
        Write-Host "----------------------------------------"
        
        Push-Location $action
        
        # 1. Clean old files
        Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
        
        # 2. Install dependencies (runs prisma generate locally)
        npm install --no-audit
        
        # 3. Clean up heavy development-only dependencies and cached binaries
        Remove-Item -Recurse -Force node_modules/prisma -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force node_modules/@prisma/engines -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force node_modules/.cache -ErrorAction SilentlyContinue
        
        # 4. Clean up Windows specific query engines to reduce upload size
        Get-ChildItem -Path node_modules -Filter "*windows*" -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        Get-ChildItem -Path node_modules -Filter "*.exe" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
        Get-ChildItem -Path node_modules -Filter "*.dll.node" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
        
        Pop-Location
    }
}
Write-Host "Local build & prune complete! 🚀"
