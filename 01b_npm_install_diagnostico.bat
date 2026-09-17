@echo off
setlocal
cd /d "%~dp0"
cls
echo Pasta: %CD%
echo.
echo Executando npm install diretamente...
echo.
call npm.cmd install --verbose
echo.
echo Codigo de retorno: %ERRORLEVEL%
echo.
pause
