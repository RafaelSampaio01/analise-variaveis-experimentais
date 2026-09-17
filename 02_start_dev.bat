@echo off
setlocal
cd /d "%~dp0"
title DEV - Analise de Variaveis Experimentais

if not exist "node_modules\electron\package.json" (
  echo Dependencias ainda nao foram preparadas.
  call "%~dp001_preparar_dependencias.bat"
  if errorlevel 1 exit /b 1
)

set NODE_ENV=development
call npm run dev
