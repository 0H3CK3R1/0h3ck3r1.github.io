param(
  [string]$InputPath = "./access-codes.json",
  [string]$OutputPath = "./supabase/import-codes.sql"
)

$json = Get-Content $InputPath -Raw | ConvertFrom-Json
$codes = @($json.codes | ForEach-Object { [string]$_ } | Sort-Object -Unique)

if ($codes.Count -eq 0) {
  throw "No codes found in $InputPath"
}

$values = $codes | ForEach-Object { "('$($_)')" }

$sql = @(
  "begin;",
  "truncate table public.quiz_access_codes;",
  "insert into public.quiz_access_codes(code) values",
  ($values -join ",`n" ) + ";",
  "commit;"
) -join "`n"

Set-Content -Path $OutputPath -Value $sql -Encoding UTF8
Write-Host "Generated $OutputPath with $($codes.Count) codes"
