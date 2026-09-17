@echo off
setlocal
cd /d "%~dp0"

title Build Windows - Analise de Variaveis Experimentais

echo ============================================================
echo   ANALISE DE VARIAVEIS EXPERIMENTAIS
echo   BUILD WINDOWS
echo ============================================================
echo.

REM ============================================================
REM VERIFICAR NODE / NPM
REM ============================================================

where node >nul 2>&1 || (
    echo ERRO: Node.js nao encontrado.
    pause
    exit /b 1
)

where npm.cmd >nul 2>&1 || (
    echo ERRO: npm nao encontrado.
    pause
    exit /b 1
)

REM ============================================================
REM FECHAR PROCESSOS ELECTRON ANTIGOS
REM ============================================================

echo Fechando processos Electron anteriores...

taskkill /F /IM electron.exe >nul 2>&1

REM Fecha qualquer programa sendo executado de dentro de dist\windows
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$root = [System.IO.Path]::GetFullPath('%CD%\dist\windows');" ^
"Get-Process -ErrorAction SilentlyContinue | ForEach-Object {" ^
"  try {" ^
"    if ($_.Path -and $_.Path.StartsWith($root,[System.StringComparison]::OrdinalIgnoreCase)) {" ^
"      Write-Host ('Fechando: ' + $_.ProcessName);" ^
"      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue" ^
"    }" ^
"  } catch {}" ^
"}"

echo Aguardando liberacao dos arquivos...
timeout /t 2 /nobreak >nul

REM ============================================================
REM LIMPAR BUILD ANTERIOR
REM ============================================================

echo.
echo Limpando build anterior...

if exist "dist\windows" (
    rmdir /s /q "dist\windows"
)

REM Pequena espera para Windows liberar handles
timeout /t 2 /nobreak >nul

REM ============================================================
REM VERIFICAR SE CONSEGUIU LIMPAR
REM ============================================================

if exist "dist\windows" (
    echo.
    echo ERRO: Nao foi possivel remover:
    echo %CD%\dist\windows
    echo.
    echo Algum programa ainda esta utilizando os arquivos.
    echo.
    echo Feche:
    echo   - Analise de Variaveis Experimentais
    echo   - Electron
    echo   - Explorer aberto dentro da pasta win-unpacked
    echo.
    pause
    exit /b 1
)

REM ============================================================
REM BUILD
REM ============================================================

echo.
echo ============================================================
echo Iniciando build Windows...
echo ============================================================
echo.

call npm run build:win

if errorlevel 1 goto :erro

echo.
echo ============================================================
echo BUILD WINDOWS CONCLUIDO
echo ============================================================
echo.

echo Arquivos gerados em:
echo.
echo   %CD%\dist\windows
echo.

if exist "dist\windows" (
    explorer "dist\windows"
)

pause
exit /b 0


:erro
echo.
echo ============================================================
echo ERRO NO BUILD WINDOWS
echo ============================================================
echo.
echo Verifique as mensagens acima.
echo.
pause
exit /b 1