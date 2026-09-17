@echo off
setlocal
cd /d "%~dp0"
title Build Linux via WSL - Analise de Variaveis Experimentais

where wsl.exe >nul 2>&1 || (
  echo ERRO: WSL nao encontrado no Windows.
  echo Instale/configure o WSL antes de gerar o pacote Linux.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%I in (`wsl.exe wslpath -a "%CD%"`) do set "WSL_PROJECT=%%I"
if "%WSL_PROJECT%"=="" (
  echo ERRO: nao foi possivel converter o caminho para WSL.
  pause
  exit /b 1
)

echo Projeto no WSL: %WSL_PROJECT%
wsl.exe bash -lc "bash '%WSL_PROJECT%/scripts/build-linux.sh' '%WSL_PROJECT%'"
if errorlevel 1 (
  echo.
  echo ERRO no build Linux.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo Build Linux concluido.
echo AppImage: dist\linux
echo Launcher: iniciar_linux.sh
echo ============================================================
pause
exit /b 0
