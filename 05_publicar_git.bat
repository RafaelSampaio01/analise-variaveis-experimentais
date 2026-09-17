@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Publicar versao - Analise de Variaveis Experimentais

set "GITHUB_OWNER=RafaelSampaio01"
set "GITHUB_REPO=analise-variaveis-experimentais"
set "TARGET_REMOTE=https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%.git"

echo ============================================================
echo   ANALISE DE VARIAVEIS EXPERIMENTAIS - PUBLICAR NO GITHUB
echo ============================================================
echo.
echo Conta GitHub: %GITHUB_OWNER%
echo Repositorio: %GITHUB_REPO%
echo Destino: %TARGET_REMOTE%
echo.

where git >nul 2>&1 || (
  echo ERRO: Git nao encontrado.
  pause
  exit /b 1
)
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

rem ------------------------------------------------------------
rem Garante repositorio Git local.
rem ------------------------------------------------------------
if not exist ".git" (
  echo Inicializando repositorio Git local...
  git init || goto :erro
)

rem ------------------------------------------------------------
rem Ajusta o remote origin para RafaelSampaio01.
rem ------------------------------------------------------------
set "REMOTE_URL="
for /f "usebackq delims=" %%I in (`git config --get remote.origin.url 2^>nul`) do set "REMOTE_URL=%%I"

if not defined REMOTE_URL (
  echo Configurando remote origin...
  git remote add origin "%TARGET_REMOTE%" || goto :erro
) else (
  if /I not "!REMOTE_URL!"=="%TARGET_REMOTE%" (
    echo.
    echo ATENCAO: o remote origin atual aponta para:
    echo   !REMOTE_URL!
    echo.
    echo Ele sera alterado para:
    echo   %TARGET_REMOTE%
    echo.
    set "CHANGE_REMOTE="
    set /p "CHANGE_REMOTE=Deseja alterar o remote origin? [S/N]: "
    if /I not "!CHANGE_REMOTE!"=="S" (
      echo Publicacao cancelada. Nenhuma alteracao foi enviada.
      pause
      exit /b 0
    )
    git remote set-url origin "%TARGET_REMOTE%" || goto :erro
  )
)

echo.
echo Remote configurado:
git remote -v

rem ------------------------------------------------------------
rem Se gh estiver disponivel, verifica/cria o repositorio remoto.
rem ------------------------------------------------------------
where gh >nul 2>&1
if not errorlevel 1 (
  gh auth status >nul 2>&1
  if not errorlevel 1 (
    gh repo view "%GITHUB_OWNER%/%GITHUB_REPO%" >nul 2>&1
    if errorlevel 1 (
      echo.
      echo O repositorio %GITHUB_OWNER%/%GITHUB_REPO% ainda nao existe ou nao esta acessivel.
      set "CREATE_REPO="
      set /p "CREATE_REPO=Deseja cria-lo agora? [S/N]: "
      if /I "!CREATE_REPO!"=="S" (
        echo.
        echo Escolha a visibilidade:
        echo   1 - Publico
        echo   2 - Privado
        set "VISIBILITY="
        set /p "VISIBILITY=Opcao [1/2]: "
        if "!VISIBILITY!"=="2" (
          gh repo create "%GITHUB_OWNER%/%GITHUB_REPO%" --private --description "Analise de Variaveis Experimentais" || goto :erro
        ) else (
          gh repo create "%GITHUB_OWNER%/%GITHUB_REPO%" --public --description "Analise de Variaveis Experimentais" || goto :erro
        )
      ) else (
        echo.
        echo Crie primeiro o repositorio em sua conta GitHub e execute novamente.
        pause
        exit /b 1
      )
    )
  ) else (
    echo.
    echo AVISO: GitHub CLI encontrado, mas nao autenticado.
    echo Para criar Release automaticamente, execute: gh auth login
  )
) else (
  echo.
  echo AVISO: GitHub CLI nao encontrado.
  echo O script ainda pode usar Git, mas o repositorio precisa existir no GitHub.
)

rem ------------------------------------------------------------
rem Versao: aceita parametro ou pergunta ao usuario.
rem ------------------------------------------------------------
set "VERSION=%~1"
if "%VERSION%"=="" (
  echo.
  echo Informe a nova versao que sera publicada.
  echo Exemplo: 1.16.5
  echo.
  set /p "VERSION=Nova versao: "
)
if "%VERSION%"=="" (
  echo ERRO: Nenhuma versao informada.
  pause
  exit /b 1
)
if /I "%VERSION:~0,1%"=="v" set "VERSION=%VERSION:~1%"

node scripts\set-version.cjs "%VERSION%"
if errorlevel 1 goto :erro
node scripts\sync-github-config.cjs
if errorlevel 1 goto :erro

echo.
echo ============================================================
echo CONFIRMACAO DA PUBLICACAO
echo ============================================================
echo Conta: %GITHUB_OWNER%
echo Repositorio: %GITHUB_REPO%
echo Versao: v%VERSION%
echo Destino: %TARGET_REMOTE%
echo.
set "CONFIRM="
set /p "CONFIRM=Confirma publicar v%VERSION%? [S/N]: "
if /I not "!CONFIRM!"=="S" (
  echo Publicacao cancelada.
  pause
  exit /b 0
)

rem ------------------------------------------------------------
rem Dependencias e testes.
rem ------------------------------------------------------------
if not exist "node_modules\electron\package.json" (
  echo.
  echo Dependencias ainda nao foram preparadas. Preparando agora...
  call "%~dp001_preparar_dependencias.bat"
  if errorlevel 1 goto :erro
)

echo.
echo ============================================================
echo Executando testes...
echo ============================================================
call npm.cmd test
if errorlevel 1 goto :erro

rem ------------------------------------------------------------
rem Build Windows.
rem ------------------------------------------------------------
echo.
echo ============================================================
echo Gerando instalador Windows v%VERSION%...
echo ============================================================
call npm.cmd run build:win
if errorlevel 1 goto :erro

rem ------------------------------------------------------------
rem Build Linux via WSL.
rem ------------------------------------------------------------
echo.
echo ============================================================
echo Tentando gerar AppImage Linux via WSL...
echo ============================================================
where wsl.exe >nul 2>&1
if errorlevel 1 (
  echo AVISO: WSL nao encontrado. A release seguira sem artefato Linux.
) else (
  set "WSL_PROJECT="
  for /f "usebackq delims=" %%I in (`wsl.exe wslpath -a "%CD%"`) do set "WSL_PROJECT=%%I"
  if defined WSL_PROJECT (
    wsl.exe bash -lc "bash '!WSL_PROJECT!/scripts/build-linux.sh' '!WSL_PROJECT!'"
    if errorlevel 1 echo AVISO: Build Linux falhou. Continuando apenas com os artefatos disponiveis.
  ) else (
    echo AVISO: Nao foi possivel converter o caminho para WSL.
  )
)

rem ------------------------------------------------------------
rem Commit/tag/push.
rem ------------------------------------------------------------
echo.
echo ============================================================
echo Criando commit e tag v%VERSION%...
echo ============================================================
git add -A

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "release: v%VERSION%" || goto :erro
) else (
  echo Nenhuma alteracao de codigo para commit.
)

git rev-parse "v%VERSION%" >nul 2>&1
if errorlevel 1 (
  git tag -a "v%VERSION%" -m "v%VERSION%" || goto :erro
) else (
  echo Tag v%VERSION% ja existe localmente.
)

echo.
echo Enviando codigo para %GITHUB_OWNER%/%GITHUB_REPO%...
git push -u origin HEAD || goto :erro

echo Enviando tag v%VERSION%...
git push origin "v%VERSION%" || goto :erro

rem ------------------------------------------------------------
rem GitHub Release.
rem ------------------------------------------------------------
where gh >nul 2>&1
if errorlevel 1 (
  echo.
  echo GitHub CLI nao encontrado. Codigo e tag foram enviados.
  echo Instale gh para criar Releases automaticamente.
  goto :fim
)

gh auth status >nul 2>&1
if errorlevel 1 (
  echo.
  echo GitHub CLI nao autenticado. Codigo e tag foram enviados.
  echo Execute: gh auth login
  goto :fim
)

gh release view "v%VERSION%" --repo "%GITHUB_OWNER%/%GITHUB_REPO%" >nul 2>&1
if errorlevel 1 (
  gh release create "v%VERSION%" --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --title "v%VERSION%" --generate-notes || goto :erro
)

for %%F in ("dist\windows\*.exe" "dist\windows\*.yml" "dist\windows\*.blockmap" "dist\linux\*.AppImage" "dist\linux\*.yml" "dist\linux\*.blockmap") do (
  if exist "%%~fF" (
    echo Enviando %%~nxF...
    gh release upload "v%VERSION%" "%%~fF" --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --clobber || goto :erro
  )
)

echo.
echo Release v%VERSION% publicada com suporte a atualizacao online.
goto :fim

:erro
echo.
echo ============================================================
echo ERRO durante a publicacao da versao.
echo ============================================================
echo.
pause
exit /b 1

:fim
echo.
echo ============================================================
echo Publicacao finalizada: v%VERSION%
echo Repositorio: https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%
echo ============================================================
echo.
pause
exit /b 0
