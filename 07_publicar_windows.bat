@echo off
setlocal
cd /d "%~dp0"

where gh >nul 2>nul
if errorlevel 1 (
  echo ERRO: GitHub CLI ^(gh^) nao encontrado.
  pause
  exit /b 1
)

echo.
echo Publicando somente WINDOWS pelo GitHub Actions...
gh workflow run publicar-windows.yml
if errorlevel 1 (
  echo Falha ao iniciar workflow Windows.
  pause
  exit /b 1
)

echo.
echo Workflow Windows iniciado.
echo Acompanhe com:
echo gh run watch
pause
