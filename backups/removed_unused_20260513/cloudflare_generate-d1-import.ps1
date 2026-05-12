param(
  [string]$InputPath = "./access-codes.json",
  [string]$OutputPath = "./cloudflare/import-codes-d1.sql"
)

$json = Get-Content $InputPath -Raw | ConvertFrom-Json
$codes = @($json.codes | ForEach-Object { [string]$_ } | Sort-Object -Unique)

if ($codes.Count -eq 0) {
  throw "No codes found in $InputPath"
}

$values = $codes | ForEach-Object { "('$_', 0)" }

$sql = @(
  "BEGIN TRANSACTION;",
  "DELETE FROM quiz_access_codes;",
  "INSERT INTO quiz_access_codes (code, is_used) VALUES",
  ($values -join "`,`n") + ";",
  "COMMIT;"
) -join "`n"

Set-Content -Path $OutputPath -Value $sql -Encoding UTF8
Write-Host "Generated $OutputPath with $($codes.Count) codes"
