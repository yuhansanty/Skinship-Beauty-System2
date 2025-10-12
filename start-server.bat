@echo off
echo ========================================
echo    Skinship Beauty System Server
echo ========================================
echo.
echo Starting local server...
echo The server will be available at: http://localhost:8000
echo.
echo Available pages:
echo   - Main: http://localhost:8000/index.html
echo   - Landing Page: http://localhost:8000/LandingPage.html
echo   - Dashboard: http://localhost:8000/dashboard.html
echo   - Customer: http://localhost:8000/customer.html
echo   - Staff: http://localhost:8000/staff.html
echo   - Calendar: http://localhost:8000/calendar.html
echo   - Forgot Password: http://localhost:8000/forgotpassword.html
echo.
echo Press Ctrl+C to stop the server when you're done
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
pause
