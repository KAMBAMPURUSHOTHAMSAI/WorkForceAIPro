$ErrorActionPreference = "Stop"

$BaseUrl = "http://127.0.0.1:8010"
$OutputPath = Join-Path (Get-Location) "api-contract-audit.json"

$ModulePattern = (
    "auth|users|employees|departments|attendance|shift|leave|" +
    "payroll|payslip|notification|chat|document|dataset|attrition|" +
    "alert|forecast|intervention|recommend|dashboard|audit|task|" +
    "performance|report|search|workforce"
)

$Methods = @("get", "post", "put", "patch", "delete")

try {
    $Spec = Invoke-RestMethod `
        -Uri "$BaseUrl/openapi.json" `
        -Method Get

    Write-Host "Backend OpenAPI loaded successfully." -ForegroundColor Green
}
catch {
    Write-Host "Could not read backend OpenAPI." -ForegroundColor Red
    Write-Host "Start FastAPI on port 8010 and run this script again."
    Write-Host $_.Exception.Message
    exit 1
}

$Endpoints = @(
    foreach ($PathProperty in $Spec.paths.PSObject.Properties) {
        $Path = $PathProperty.Name

        if ($Path -notmatch $ModulePattern) {
            continue
        }

        foreach ($Method in $Methods) {
            $OperationProperty =
                $PathProperty.Value.PSObject.Properties[$Method]

            if ($null -eq $OperationProperty) {
                continue
            }

            $Operation = $OperationProperty.Value
            $BodyParts = @()

            if ($Operation.requestBody -and
                $Operation.requestBody.content) {

                foreach (
                    $ContentProperty in
                    $Operation.requestBody.content.PSObject.Properties
                ) {
                    $Schema = $ContentProperty.Value.schema
                    $Description = ""

                    if ($Schema.'$ref') {
                        $Description = $Schema.'$ref'
                    }
                    elseif ($Schema.properties) {
                        $Description = @(
                            $Schema.properties.PSObject.Properties.Name
                        ) -join ", "
                    }
                    elseif ($Schema.items.'$ref') {
                        $Description = "Array: " + $Schema.items.'$ref'
                    }
                    else {
                        $Description = $Schema.type
                    }

                    $BodyParts += (
                        $ContentProperty.Name + " => " + $Description
                    )
                }
            }

            $ParameterNames = @(
                foreach ($Parameter in $Operation.parameters) {
                    "$($Parameter.in):$($Parameter.name)"
                }
            )

            [PSCustomObject]@{
                Method      = $Method.ToUpper()
                Path        = $Path
                Tags        = @($Operation.tags) -join ", "
                OperationId = $Operation.operationId
                Summary     = $Operation.summary
                RequestBody = $BodyParts -join " ; "
                Parameters  = $ParameterNames -join ", "
            }
        }
    }
)

$Schemas = @(
    foreach ($SchemaProperty in $Spec.components.schemas.PSObject.Properties) {
        $Schema = $SchemaProperty.Value

        [PSCustomObject]@{
            Name     = $SchemaProperty.Name
            Type     = $Schema.type
            Required = @($Schema.required) -join ", "
            Fields   = @(
                $Schema.properties.PSObject.Properties.Name
            ) -join ", "
        }
    }
)

$Report = [ordered]@{
    GeneratedAt   = (Get-Date).ToString("o")
    BaseUrl       = $BaseUrl
    EndpointCount = $Endpoints.Count
    Endpoints     = $Endpoints
    Schemas       = $Schemas
}

$Report |
    ConvertTo-Json -Depth 60 |
    Set-Content -LiteralPath $OutputPath -Encoding UTF8

Write-Host "`nRelevant API endpoints:" -ForegroundColor Cyan

$Endpoints |
    Sort-Object Path, Method |
    Format-Table Method, Path, Summary, RequestBody -Wrap -AutoSize

Write-Host "`nAudit saved to: $OutputPath" -ForegroundColor Green
Write-Host "Endpoints found: $($Endpoints.Count)"
Write-Host "No application code or database records were changed."