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
    # Determine which package this action belongs to
    $package = $action.Split("/")[1] # auth, image, user
    $srcLib = "packages/$package/lib"
    $destLib = "$action/lib"
    
    if (Test-Path $srcLib) {
        Write-Host "Copying $srcLib to $destLib..."
        # Copy the lib directory recursively
        Copy-Item -Path $srcLib -Destination $destLib -Recurse -Force
        
        # Update require statements in the index.js file
        $indexPath = "$action/index.js"
        if (Test-Path $indexPath) {
            Write-Host "Updating require paths in $indexPath..."
            $content = Get-Content $indexPath -Raw
            # Replace "../lib/" with "./lib/"
            $content = $content -replace '\.\./lib/', './lib/'
            Set-Content -Path $indexPath -Value $content -Force
        }
    }
}

Write-Host "Self-containment build ready! 🚀"
