[CmdletBinding()]
param(
    [string]$ApiBaseUrl = "http://127.0.0.1:8010"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DocsPath = Join-Path $ProjectRoot "docs"
$BackendEnvPath = Join-Path $ProjectRoot "backend\.env"
$OpenApiPath = Join-Path $DocsPath "openapi.json"
$SchemaPath = Join-Path $DocsPath "database_schema.sql"
$SchemaTempPath = Join-Path $DocsPath "database_schema.sql.tmp"

New-Item -ItemType Directory -Path $DocsPath -Force | Out-Null

Write-Host "[1/2] Capturing OpenAPI from $ApiBaseUrl/openapi.json ..."
$OpenApiTempPath = Join-Path $DocsPath "openapi.json.tmp"
try {
    Invoke-WebRequest -Uri "$($ApiBaseUrl.TrimEnd('/'))/openapi.json" -OutFile $OpenApiTempPath -UseBasicParsing
    $openApiObject = Get-Content -Path $OpenApiTempPath -Raw | ConvertFrom-Json
    if (-not $openApiObject.openapi -or -not $openApiObject.paths) {
        throw "The response is not a valid OpenAPI document (openapi/paths fields missing)."
    }
    Move-Item -Path $OpenApiTempPath -Destination $OpenApiPath -Force
    Write-Host "Saved and validated: $OpenApiPath" -ForegroundColor Green
} catch {
    if (Test-Path $OpenApiTempPath) { Remove-Item $OpenApiTempPath -Force }
    throw "Unable to capture the current API schema. Confirm backend is running and check $ApiBaseUrl. Details: $($_.Exception.Message)"
}

Write-Host "[2/2] Capturing MySQL table definitions without application rows ..."
$dumpCommand = Get-Command "mysqldump" -ErrorAction SilentlyContinue
if (-not $dumpCommand) {
    Write-Warning "mysqldump was not found on PATH. OpenAPI was saved, but SQL schema was not exported. Add the MySQL bin folder to PATH or run mysqldump manually; do not use a full data dump."
    Write-Host "Expected schema output path: $SchemaPath"
    exit 0
}

if (-not (Test-Path $BackendEnvPath)) {
    Write-Warning "backend/.env was not found. OpenAPI was saved; SQL schema export skipped."
    exit 0
}

$dbUrlLine = Get-Content -Path $BackendEnvPath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $dbUrlLine) {
    Write-Warning "DATABASE_URL was not found in backend/.env. OpenAPI was saved; SQL schema export skipped."
    exit 0
}

$dbUrl = ($dbUrlLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
if ($dbUrl -notmatch '^mysql\+pymysql://') {
    Write-Warning "DATABASE_URL is not in the expected mysql+pymysql:// format. OpenAPI was saved; SQL schema export skipped."
    exit 0
}

try {
    $uriText = $dbUrl -replace '^mysql\+pymysql://', 'mysql://'
    $dbUri = [System.Uri]$uriText
    $userInfo = $dbUri.UserInfo -split ':', 2
    $dbUser = [System.Uri]::UnescapeDataString($userInfo[0])
    $dbName = [System.Uri]::UnescapeDataString($dbUri.AbsolutePath.Trim('/'))
    $dbHost = $dbUri.Host
    $dbPort = $dbUri.Port
    if ($dbPort -le 0) { $dbPort = 3306 }
    if ([string]::IsNullOrWhiteSpace($dbUser) -or [string]::IsNullOrWhiteSpace($dbName)) {
        throw "Database user or database name could not be parsed from DATABASE_URL."
    }
} catch {
    Write-Warning "Could not parse DATABASE_URL safely. OpenAPI was saved; SQL schema export skipped. Details: $($_.Exception.Message)"
    exit 0
}

Write-Host "Database host: $dbHost`:$dbPort"
Write-Host "Database name: $dbName"
Write-Host "Database user: $dbUser"
Write-Host "The password will be requested by mysqldump and is not saved by this script."

if (Test-Path $SchemaTempPath) { Remove-Item $SchemaTempPath -Force }
& $dumpCommand.Source --host=$dbHost --port=$dbPort --user=$dbUser --no-data --skip-comments --skip-dump-date "--result-file=$SchemaTempPath" -p $dbName
if ($LASTEXITCODE -ne 0) {
    if (Test-Path $SchemaTempPath) { Remove-Item $SchemaTempPath -Force }
    throw "mysqldump failed with exit code $LASTEXITCODE. No schema file was published."
}

if (-not (Test-Path $SchemaTempPath) -or (Get-Item $SchemaTempPath).Length -eq 0) {
    if (Test-Path $SchemaTempPath) { Remove-Item $SchemaTempPath -Force }
    throw "mysqldump completed without producing a non-empty schema file."
}

Move-Item -Path $SchemaTempPath -Destination $SchemaPath -Force
Write-Host "Saved schema only (no application rows): $SchemaPath" -ForegroundColor Green
Write-Host "Capture completed. Review both files and ensure the intended development database was used."
