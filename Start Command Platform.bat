@echo off
cd /d "%~dp0"
echo.
echo Command Platform wordt gestart...
echo.
echo Laat dit zwarte venster open zolang je de app gebruikt.
echo Sluit dit venster om de app te stoppen.
echo.
start "" "http://localhost:8080"
python -m http.server 8080
if errorlevel 1 (
  echo.
  echo Python is niet gevonden op deze computer.
  echo Installeer Python en vink tijdens installatie "Add Python to PATH" aan.
  pause
)
