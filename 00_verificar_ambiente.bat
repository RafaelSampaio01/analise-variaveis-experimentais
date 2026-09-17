@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Diagnostico - Analise de Variaveis Experimentais

echo ============================================================
echo   DIAGNOSTICO DO AMBIENTE
echo ============================================================
echo.
echo Pasta atual:
echo %CD%
echo.

echo [1] package.json
if exist "package.json" (echo OK) else (echo NAO ENCONTRADO)
echo.

echo [2] Node.js
where node.exe
if errorlevel 1 echo NAO ENCONTRADO NO PATH
node.exe -v 2>nul
echo.

echo [3] npm
where npm.cmd
if errorlevel 1 echo NAO ENCONTRADO NO PATH
call npm.cmd -v 2>nul
echo.

echo [4] Git
where git.exe
if errorlevel 1 echo Git nao encontrado - necessario apenas para publicar no Git.
echo.

echo [5] Conteudo da pasta
 dir /b
 echo.
 echo ============================================================
 echo Copie esta tela caso precise me enviar o diagnostico.
 echo ============================================================
 echo.
 pause
