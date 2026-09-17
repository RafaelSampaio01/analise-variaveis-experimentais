@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Testes - Analise de Variaveis Experimentais

cls
echo ============================================================
echo   ANALISE DE VARIAVEIS EXPERIMENTAIS
echo   TESTES DO PROJETO
echo ============================================================
echo.

if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  pause
  exit /b 2
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERRO: npm nao encontrado.
  pause
  exit /b 3
)

if not exist "node_modules" (
  echo Dependencias ainda nao foram instaladas.
  echo Execute primeiro: 01_preparar_dependencias.bat
  echo.
  pause
  exit /b 4
)

echo Executando npm test...
echo.
call npm.cmd test
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
  echo ============================================================
  echo   UM OU MAIS TESTES FALHARAM
  echo ============================================================
  echo Codigo de erro: %RC%
  echo.
  pause
  exit /b %RC%
)

echo ============================================================
echo   TODOS OS TESTES PASSARAM
 echo ============================================================
echo.
pause
exit /b 0
