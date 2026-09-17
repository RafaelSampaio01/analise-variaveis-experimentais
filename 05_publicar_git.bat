@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title Publicar versao automatica - Analise de Variaveis Experimentais

set "GITHUB_OWNER=RafaelSampaio01"
set "GITHUB_REPO=analise-variaveis-experimentais"
set "TARGET_REMOTE=https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%.git"

echo ============================================================
echo   ANALISE DE VARIAVEIS EXPERIMENTAIS
echo   NOVA RELEASE AUTOMATICA
echo ============================================================
echo.
echo Repositorio:
echo   %TARGET_REMOTE%
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

where gh >nul 2>&1 || (
  echo ERRO: GitHub CLI nao encontrado.
  echo Instale o GitHub CLI e execute: gh auth login
  pause
  exit /b 1
)

gh auth status >nul 2>&1 || (
  echo ERRO: GitHub CLI nao esta autenticado.
  echo Execute:
  echo.
  echo   gh auth login
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  pause
  exit /b 1
)

if not exist "package-lock.json" (
  echo ERRO: package-lock.json nao encontrado.
  echo.
  echo Execute primeiro:
  echo   npm install
  echo.
  echo Depois envie o package-lock.json ao repositorio.
  pause
  exit /b 1
)

if not exist ".github\workflows\release.yml" (
  echo ERRO: .github\workflows\release.yml nao encontrado.
  echo Copie o workflow de automacao para o projeto antes de publicar.
  pause
  exit /b 1
)

REM ------------------------------------------------------------
REM Garante remote correto.
REM ------------------------------------------------------------

set "REMOTE_URL="
for /f "delims=" %%I in ('git config --get remote.origin.url 2^>nul') do set "REMOTE_URL=%%I"

if not defined REMOTE_URL (
  git remote add origin "%TARGET_REMOTE%" || goto :erro
) else (
  if /I not "!REMOTE_URL!"=="%TARGET_REMOTE%" (
    echo.
    echo Remote atual:
    echo   !REMOTE_URL!
    echo.
    echo Remote necessario:
    echo   %TARGET_REMOTE%
    echo.
    set "CHANGE="
    set /p "CHANGE=Alterar o remote origin? [S/N]: "
    if /I not "!CHANGE!"=="S" exit /b 0

    git remote set-url origin "%TARGET_REMOTE%" || goto :erro
  )
)

REM ------------------------------------------------------------
REM Consulta a ultima Release publicada.
REM ------------------------------------------------------------

set "PUBLISHED_TAG="
set "PUBLISHED_VERSION="
set "NEXT_VERSION="

echo.
echo ============================================================
echo CONSULTANDO GITHUB
echo ============================================================
echo.

for /f "delims=" %%I in ('gh release view --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --json tagName --jq ".tagName" 2^>nul') do (
  set "PUBLISHED_TAG=%%I"
)

if defined PUBLISHED_TAG (
  set "PUBLISHED_VERSION=!PUBLISHED_TAG!"
  if /I "!PUBLISHED_VERSION:~0,1!"=="v" set "PUBLISHED_VERSION=!PUBLISHED_VERSION:~1!"

  echo Versao publicada:
  echo   !PUBLISHED_TAG!
  echo.

  for /f "delims=" %%I in ('node -e "const v=process.argv[1].split('.').map(Number);console.log(v[0]+'.'+v[1]+'.'+(v[2]+1))" "!PUBLISHED_VERSION!"') do (
    set "NEXT_VERSION=%%I"
  )

  echo Proxima versao sugerida:
  echo   !NEXT_VERSION!
) else (
  echo Nenhuma Release publicada foi encontrada.
)

REM ------------------------------------------------------------
REM Pede a nova versao.
REM ------------------------------------------------------------

echo.
echo ============================================================
echo NOVA VERSAO
echo ============================================================
echo.
set /p "VERSION=Digite a versao que deseja publicar: "

if not defined VERSION (
  echo ERRO: Nenhuma versao informada.
  pause
  exit /b 1
)

if /I "!VERSION:~0,1!"=="v" set "VERSION=!VERSION:~1!"
set "VERSION=!VERSION: =!"

node -e "process.exit(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(process.argv[1])?0:1)" "!VERSION!"
if errorlevel 1 (
  echo.
  echo ERRO: Utilize o formato X.Y.Z, por exemplo 1.16.8
  pause
  exit /b 1
)

if defined PUBLISHED_VERSION (
  node -e "const a=process.argv[1].split('.').map(Number),b=process.argv[2].split('.').map(Number);const ok=a[0]>b[0]||(a[0]===b[0]&&(a[1]>b[1]||(a[1]===b[1]&&a[2]>b[2])));process.exit(ok?0:1)" "!VERSION!" "!PUBLISHED_VERSION!"
  if errorlevel 1 (
    echo.
    echo ERRO: v!VERSION! precisa ser maior que !PUBLISHED_TAG!.
    pause
    exit /b 1
  )
)

git ls-remote --exit-code --tags origin "refs/tags/v!VERSION!" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo ERRO: A tag v!VERSION! ja existe no GitHub.
  pause
  exit /b 1
)

REM ------------------------------------------------------------
REM Atualiza package.json / package-lock.json.
REM ------------------------------------------------------------

echo.
echo Atualizando arquivos para v!VERSION!...

node scripts\set-version.cjs "!VERSION!" || goto :erro
node scripts\sync-github-config.cjs || goto :erro

REM ------------------------------------------------------------
REM Teste local rapido antes de disparar o CI.
REM ------------------------------------------------------------

echo.
echo ============================================================
echo TESTES LOCAIS
echo ============================================================
echo.

call npm.cmd test
if errorlevel 1 goto :erro

REM ------------------------------------------------------------
REM Mostra alteracoes e pede confirmacao.
REM ------------------------------------------------------------

echo.
echo ============================================================
echo ALTERACOES QUE SERAO PUBLICADAS
echo ============================================================
echo.

git status --short

echo.
echo Versao atual no GitHub : !PUBLISHED_TAG!
echo Nova versao            : v!VERSION!
echo.
echo O GitHub Actions ira:
echo   1. validar a versao
echo   2. executar npm ci e os testes
echo   3. gerar o EXE Windows
echo   4. gerar latest.yml e blockmap
echo   5. tentar gerar AppImage Linux
echo   6. criar a GitHub Release
echo   7. anexar todos os arquivos automaticamente
echo.
set "CONFIRM="
set /p "CONFIRM=Continuar? [S/N]: "

if /I not "!CONFIRM!"=="S" (
  echo Publicacao cancelada.
  pause
  exit /b 0
)

REM ------------------------------------------------------------
REM Commit da versao.
REM ------------------------------------------------------------

git add -A || goto :erro

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "release: v!VERSION!" || goto :erro
) else (
  echo Nenhuma alteracao nova para commit.
)

REM ------------------------------------------------------------
REM Push do codigo primeiro.
REM ------------------------------------------------------------

echo.
echo Enviando codigo...
git push -u origin HEAD || goto :erro

REM ------------------------------------------------------------
REM Cria e envia a tag. A TAG dispara o GitHub Actions.
REM ------------------------------------------------------------

echo.
echo Criando tag v!VERSION!...
git tag -a "v!VERSION!" -m "v!VERSION!" || goto :erro

echo Enviando tag...
git push origin "v!VERSION!" || goto :erro

echo.
echo ============================================================
echo RELEASE DISPARADA
echo ============================================================
echo.
echo O build agora acontece no GitHub.
echo Voce nao precisa gerar EXE nem subir latest.yml manualmente.
echo.
echo Actions:
echo   https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%/actions
echo.
echo Release:
echo   https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%/releases/tag/v!VERSION!
echo.

start "" "https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%/actions"

pause
exit /b 0

:erro
echo.
echo ============================================================
echo ERRO
echo ============================================================
echo.
echo A publicacao foi interrompida antes de concluir.
pause
exit /b 1
