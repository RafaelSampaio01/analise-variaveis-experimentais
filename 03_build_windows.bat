@echo off
setlocal
cd /d "%~dp0"
title Build Windows - Analise de Variaveis Experimentais

if not exist "node_modules\electron\package.json" (
  call "%~dp001_preparar_dependencias.bat"
  if errorlevel 1 exit /b 1
)

node scripts\sync-github-config.cjs
call npm test || goto :erro

if exist "dist\windows" rmdir /s /q "dist\windows"
call npm run build:win || goto :erro

echo.
echo ============================================================
echo Build Windows concluido.
echo Saida: dist\windows
echo ============================================================
for %%F in ("dist\windows\*.exe") do echo %%~nxF
pause
exit /b 0

:erro
echo.
echo ERRO no build Windows.
pause
exit /b 1
