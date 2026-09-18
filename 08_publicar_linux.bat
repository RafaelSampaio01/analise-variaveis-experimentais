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
echo Publicando somente LINUX pelo GitHub Actions...
gh workflow run publicar-linux.yml
if errorlevel 1 (
  echo Falha ao iniciar workflow Linux.
  pause
  exit /b 1
)

echo.
echo Workflow Linux iniciado.
echo Acompanhe com:
echo gh run watch
pause
