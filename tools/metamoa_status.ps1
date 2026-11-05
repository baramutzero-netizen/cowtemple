# 메타모아 등록 심사 상태 확인 (request_key는 server\.dev.vars에서 읽고 화면에 출력하지 않음)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vars = Join-Path $here '..\server\.dev.vars'
$kv = @{}; Get-Content $vars | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $kv[$Matches[1]] = $Matches[2] } }
$r = Invoke-RestMethod -Uri ("https://metamoa.com/api/submit/" + $kv['METAMOA_REQUEST_ID']) -Headers @{ Authorization = 'Bearer ' + $kv['METAMOA_REQUEST_KEY'] }
$r | ConvertTo-Json -Depth 6
