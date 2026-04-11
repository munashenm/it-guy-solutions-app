# IT Guy Solutions - Deployment package for cPanel (app subdomain)
# Run from the project root. Produces itguy-deploy.zip

$ErrorActionPreference = "Stop"
$buildDir = "deploy_temp"
$zipFile = "itguy-deploy.zip"

Write-Host "--- IT Guy Deployment Pack ---" -ForegroundColor Cyan

if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
if (Test-Path $zipFile) { Remove-Item -Force $zipFile }

New-Item -ItemType Directory -Path $buildDir | Out-Null
New-Item -ItemType Directory -Path "$buildDir\backend" | Out-Null
New-Item -ItemType Directory -Path "$buildDir\backend\uploads" | Out-Null

# Frontend
Write-Host "Copying frontend..." -ForegroundColor Gray
Copy-Item "index.html" $buildDir\
Copy-Item ".htaccess" $buildDir\
Copy-Item -Recurse "css" $buildDir\
Copy-Item -Recurse "js" $buildDir\

# Backend: full tree except heavy/sensitive/local-only paths (robocopy is reliable on Windows)
Write-Host "Copying backend (no node_modules)..." -ForegroundColor Gray
$robocopyArgs = @(
    "backend", "$buildDir\backend",
    "/E",
    "/XD", "node_modules", "uploads",
    "/XF", "database.sqlite", "test-db.js", ".env"
)
& robocopy @robocopyArgs
# Robocopy: 0–7 = success (see robocopy /?), 8+ = failure
$rc = $LASTEXITCODE
if ($null -eq $rc -or $rc -ge 8) { throw "robocopy failed with exit code $rc" }
# Robocopy success codes 1–7 leave $LASTEXITCODE != 0 and can confuse CI; normalize.
if ($rc -lt 8) { $global:LASTEXITCODE = 0 }

# Ensure empty uploads exists (multer)
if (-not (Test-Path "$buildDir\backend\uploads")) {
    New-Item -ItemType Directory -Path "$buildDir\backend\uploads" | Out-Null
}

# Environment: prefer local .env.production if present (your real credentials); else template
if (Test-Path "backend\.env.production") {
    Write-Host "Using backend\.env.production -> .env" -ForegroundColor Yellow
    Copy-Item "backend\.env.production" "$buildDir\backend\.env"
} elseif (Test-Path "backend\env.template") {
    Write-Host "Using backend\env.template -> .env (edit .env on the server after upload!)" -ForegroundColor Yellow
    Copy-Item "backend\env.template" "$buildDir\backend\.env"
} else {
    throw "Missing backend\env.template"
}

# Docs for hosting
foreach ($doc in @("DEPLOY-CPANEL.txt", "INSTALL-APP-TECHGUY-PL.txt", "SPLIT-DEPLOY-NO-NODE-HOST.txt")) {
    if (Test-Path $doc) { Copy-Item $doc $buildDir\ }
}

Write-Host "Creating $zipFile ..." -ForegroundColor Green
$tempZip = Join-Path $env:TEMP "itguy-deploy-$([Guid]::NewGuid().ToString('n')).zip"
Compress-Archive -Path "$buildDir\*" -DestinationPath $tempZip -Force
Move-Item -LiteralPath $tempZip -Destination $zipFile -Force

Write-Host "--- Done: $zipFile ---" -ForegroundColor Cyan
Write-Host "Next: upload and extract to your subdomain folder, then in cPanel Node.js:" -ForegroundColor White
Write-Host "  Application root: .../backend   Startup file: server.js   Run NPM Install" -ForegroundColor White
