# 지인 지도 로컬 서버 (PowerShell HttpListener 기반 정적 파일 서버)
# 위치(geolocation) 기능은 localhost 에서만 동작하므로 이 서버로 앱을 띄웁니다.
param([int]$Port = 8090)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "지인 지도 서버 실행 중: http://localhost:$Port/  (중지: Ctrl+C)"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
  ".svg"  = "image/svg+xml"
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.LocalPath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
    $file = Join-Path $root $path
    # 디렉터리 탈출 방지
    $full = [System.IO.Path]::GetFullPath($file)
    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
      $ctx.Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
    } else {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $bytes = [System.IO.File]::ReadAllBytes($full)
    }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
  } catch {
    # 요청 하나가 실패해도 서버는 계속 동작
  }
}
