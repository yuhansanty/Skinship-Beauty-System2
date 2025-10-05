@echo off
echo Starting test server...
echo.
cd /d "%~dp0"
echo Current directory: %CD%
echo.
echo Starting Python server on port 8080...
py -m http.server 8080
