# 메타모아(metamoa.com)에 '소 귀에 경 읽는 절' 등록 신청 (한 번만 실행)
# 응답의 request_key는 화면에 출력하지 않고 server\.dev.vars(깃에 안 올라감)와 Cloudflare 비밀값에만 저장합니다.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $here '..\server'
$vars0 = Join-Path $server '.dev.vars'
if ((Test-Path $vars0) -and (Select-String -Path $vars0 -Pattern '^METAMOA_REQUEST_ID=' -Quiet)) {
  Write-Host '이미 신청했어요 (server\.dev.vars에 신청 번호가 있음). 심사 상태는 이렇게 확인하세요:'
  Write-Host 'powershell -ExecutionPolicy Bypass -File tools\metamoa_status.ps1'
  exit 0
}
$body = @{
  name = '소 귀에 경 읽는 절'
  url = 'https://baramutzero-netizen.github.io/cowtemple/'
  region = 'kr'
  langs = @('ko')
  summary = '말 대신 목탁을 치는 온라인 절. 소들이 한쪽 귀로 경을 들어요'
  api_hookup = $true
  agree = $true
} | ConvertTo-Json -Compress
$r = Invoke-RestMethod -Method Post -Uri 'https://metamoa.com/api/submit' -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
$vars = Join-Path $server '.dev.vars'
$lines = @(); if (Test-Path $vars) { $lines = Get-Content $vars | Where-Object { $_ -notmatch '^METAMOA_(REQUEST_KEY|REQUEST_ID)=' } }
$lines += "METAMOA_REQUEST_ID=$($r.id)"; $lines += "METAMOA_REQUEST_KEY=$($r.request_key)"
Set-Content -Path $vars -Value $lines -Encoding UTF8
Push-Location $server
$r.request_key | npx wrangler secret put METAMOA_REQUEST_KEY | Out-Null
Pop-Location
Write-Host "신청 완료! 신청 번호: $($r.id)"
Write-Host "심사 결과 확인: powershell -ExecutionPolicy Bypass -File tools\metamoa_status.ps1"
