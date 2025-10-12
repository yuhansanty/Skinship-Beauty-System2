@echo off
echo ========================================
echo    Skinship Beauty System Server
echo ========================================
echo.
echo Starting Python HTTP server...
echo The server will be available at: http://localhost:8080
echo.
echo Available pages:
echo   - Main: http://localhost:8080/index.html
echo   - Login: http://localhost:8080/index.html
echo   - Dashboard: http://localhost:8080/dashboard.html
echo   - Customer: http://localhost:8080/customer.html
echo   - Staff: http://localhost:8080/staff.html
echo   - Calendar: http://localhost:8080/calendar.html
echo   - Forgot Password: http://localhost:8080/forgotpassword.html
echo.
echo Press Ctrl+C to stop the server when you're done
echo.
cd /d "%~dp0"
py -m http.server 8080
pause
