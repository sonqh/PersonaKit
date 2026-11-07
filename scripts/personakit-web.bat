@echo off
rem PersonaKit web app launcher for Windows. Double-click this file to start PersonaKit.
rem It needs the one-time install: Node.js 22 and "npm link" in the PersonaKit folder.
rem Keep the window open while you use the app. Close it to stop PersonaKit.
where personakit >nul 2>nul
if errorlevel 1 (
  echo PersonaKit is not installed. Install Node.js 22, then run "npm link" in the PersonaKit folder.
  pause
  exit /b 1
)
call personakit serve --open
pause
