$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
} catch {
    Write-Host "Error starting server: $_" -ForegroundColor Red
    Write-Host "Port $port might already be in use. Try closing other server windows." -ForegroundColor Yellow
    Exit
}

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  RatedWorktops Local Web Server is now Running! 🎉" -ForegroundColor Green
Write-Host "  Open your browser and go to:" -ForegroundColor White
Write-Host "  👉 http://localhost:$port/index.html" -ForegroundColor Yellow
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Press [Ctrl + C] in this window to stop the server." -ForegroundColor DarkGray
Write-Host ""

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        
        $urlPath = $req.Url.LocalPath
        if ($urlPath -eq "/") { $urlPath = "/index.html" }
        
        # Map URL to local workspace path
        $localPath = Join-Path $pwd.Path $urlPath.Replace('/', '\').TrimStart('\')
        
        if (Test-Path $localPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            
            # MIME mappings
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            switch ($ext) {
                ".html" { $res.ContentType = "text/html; charset=utf-8" }
                ".css"  { $res.ContentType = "text/css; charset=utf-8" }
                ".js"   { $res.ContentType = "application/javascript; charset=utf-8" }
                ".png"  { $res.ContentType = "image/png" }
                ".jpg"  { $res.ContentType = "image/jpeg" }
                ".jpeg" { $res.ContentType = "image/jpeg" }
                ".svg"  { $res.ContentType = "image/svg+xml" }
                ".json" { $res.ContentType = "application/json" }
                default { $res.ContentType = "application/octet-stream" }
            }
            
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $errMsg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: File $urlPath not found.")
            $res.OutputStream.Write($errMsg, 0, $errMsg.Length)
        }
        $res.OutputStream.Close()
    }
} catch {
    # Silence exit exceptions
} finally {
    $listener.Stop()
}
