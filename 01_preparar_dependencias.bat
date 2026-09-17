@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Preparar dependencias - Analise de Variaveis Experimentais

cls
echo ============================================================
echo   ANALISE DE VARIAVEIS EXPERIMENTAIS
echo   INSTALACAO DAS DEPENDENCIAS
echo ============================================================
echo.
echo Pasta do projeto:
echo %CD%
echo.

if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  echo Extraia todo o projeto antes de executar este arquivo.
  echo.
  pause
  exit /b 2
)

where node.exe >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado.
  echo.
  pause
  exit /b 3
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERRO: npm nao encontrado.
  echo.
  pause
  exit /b 4
)

echo Node:
node.exe -v
echo.
echo NPM:
call npm.cmd -v
echo.
echo ============================================================
echo Iniciando npm install...
echo O progresso sera mostrado nesta janela.
echo ============================================================
echo.

call npm.cmd install
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
  echo ============================================================
  echo   ERRO NO NPM INSTALL
  echo ============================================================
  echo Codigo de erro: %RC%
  echo.
  echo Copie as ultimas linhas exibidas acima e envie para analise.
  echo.
  pause
  exit /b %RC%
)

echo ============================================================
echo   DEPENDENCIAS INSTALADAS COM SUCESSO
 echo ============================================================
echo.
echo Para iniciar o software, execute:
echo   02_start_dev.bat
echo.
pause
exit /b 0
