# Simple HTTP Server for Skinship Beauty System
# This script serves files from the current directory on localhost:8000

param(
    [int]$Port = 8000
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host "=== Skinship Beauty System Server ===" -ForegroundColor Green
Write-Host "Server started at: http://localhost:$Port/" -ForegroundColor Yellow
Write-Host "Available pages:" -ForegroundColor Cyan
Write-Host "  - Main: http://localhost:$Port/index.html" -ForegroundColor White
Write-Host "  - Login: http://localhost:$Port/Login.html" -ForegroundColor White
Write-Host "  - Dashboard: http://localhost:$Port/dashboard.html" -ForegroundColor White
Write-Host "  - Customer: http://localhost:$Port/customer.html" -ForegroundColor White
Write-Host "  - Staff: http://localhost:$Port/staff.html" -ForegroundColor White
Write-Host "  - Calendar: http://localhost:$Port/calendar.html" -ForegroundColor White
Write-Host "  - Forgot Password: http://localhost:$Port/forgotpassword.html" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Red
Write-Host "Serving files from: $PWD" -ForegroundColor Gray

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $localPath = $request.Url.LocalPath
        $localPath = $localPath.TrimStart('/')
        
        if ([string]::IsNullOrEmpty($localPath)) {
            $localPath = "index.html"
        }
        
        $filePath = Join-Path $PWD $localPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $content = Get-Content $filePath -Raw -Encoding UTF8
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
            
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.StatusCode = 200
            
            Write-Host "✓ Served: $localPath" -ForegroundColor Green
        } else {
            $response.StatusCode = 404
            $notFound = "File not found: $localPath"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($notFound)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            
            Write-Host "✗ 404: $localPath" -ForegroundColor Red
        }
        
        $response.Close()
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
    Write-Host "Server stopped." -ForegroundColor Yellow
}
