@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title Publicar versao - Analise de Variaveis Experimentais

REM ============================================================
REM CONFIGURACAO
REM ============================================================
set "GITHUB_OWNER=RafaelSampaio01"
set "GITHUB_REPO=analise-variaveis-experimentais"
set "TARGET_REMOTE=https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%.git"

set "GH_READY=0"
set "PUBLISHED_VERSION="
set "PUBLISHED_VERSION_NUM="
set "VERSION="
set "NEXT_VERSION="

echo ============================================================
echo   ANALISE DE VARIAVEIS EXPERIMENTAIS
echo   PUBLICAR NOVA VERSAO NO GITHUB
echo ============================================================
echo.
echo Conta GitHub : %GITHUB_OWNER%
echo Repositorio  : %GITHUB_REPO%
echo Destino      : %TARGET_REMOTE%
echo.

REM ============================================================
REM VERIFICAR FERRAMENTAS
REM ============================================================
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

if not exist "package.json" (
    echo ERRO: package.json nao encontrado.
    echo Execute este BAT na raiz do projeto.
    pause
    exit /b 1
)

REM ============================================================
REM GARANTIR REPOSITORIO GIT LOCAL
REM ============================================================
if not exist ".git" (
    echo Inicializando repositorio Git local...
    git init || goto :erro
)

REM ============================================================
REM CONFIGURAR REMOTE ORIGIN
REM ============================================================
set "REMOTE_URL="
for /f "delims=" %%I in ('git config --get remote.origin.url 2^>nul') do set "REMOTE_URL=%%I"

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
            echo Publicacao cancelada.
            pause
            exit /b 0
        )
        git remote set-url origin "%TARGET_REMOTE%" || goto :erro
    )
)

echo.
echo Remote configurado:
git remote -v
echo.

REM ============================================================
REM VERIFICAR GITHUB CLI
REM ============================================================
where gh >nul 2>&1
if not errorlevel 1 (
    gh auth status >nul 2>&1
    if not errorlevel 1 (
        set "GH_READY=1"
    )
)

if "!GH_READY!"=="0" (
    echo AVISO: GitHub CLI nao encontrado ou nao autenticado.
    echo Para criar Releases automaticamente, execute:
    echo.
    echo   gh auth login
    echo.
)

REM ============================================================
REM DESCOBRIR VERSAO PUBLICADA
REM ============================================================
echo ============================================================
echo CONSULTANDO VERSAO PUBLICADA
echo ============================================================
echo.

REM Primeiro tenta pela Release mais recente do GitHub.
if "!GH_READY!"=="1" (
    for /f "delims=" %%I in ('gh release list --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --limit 1 --json tagName --jq ".[0].tagName" 2^>nul') do (
        if not defined PUBLISHED_VERSION set "PUBLISHED_VERSION=%%I"
    )
)

REM Fallback: usa a maior tag semantica do Git.
if not defined PUBLISHED_VERSION (
    git fetch --tags origin >nul 2>&1
    for /f "delims=" %%I in ('git tag --list "v[0-9]*" --sort=-v:refname 2^>nul') do (
        if not defined PUBLISHED_VERSION set "PUBLISHED_VERSION=%%I"
    )
)

if defined PUBLISHED_VERSION (
    set "PUBLISHED_VERSION_NUM=!PUBLISHED_VERSION!"
    if /I "!PUBLISHED_VERSION_NUM:~0,1!"=="v" set "PUBLISHED_VERSION_NUM=!PUBLISHED_VERSION_NUM:~1!"

    echo Versao atualmente publicada no GitHub:
    echo.
    echo   !PUBLISHED_VERSION!
    echo.

    for /f "delims=" %%I in ('node -e "const v=process.argv[1].split('.').map(Number); console.log(v[0]+'.'+v[1]+'.'+(v[2]+1));" "!PUBLISHED_VERSION_NUM!" 2^>nul') do (
        set "NEXT_VERSION=%%I"
    )

    if defined NEXT_VERSION (
        echo Proxima versao sugerida:
        echo.
        echo   !NEXT_VERSION!
        echo.
    )
) else (
    echo Nenhuma versao publicada foi encontrada.
    echo Esta pode ser a primeira publicacao.
    echo.
)

REM ============================================================
REM PEDIR NOVA VERSAO
REM ============================================================
echo ============================================================
echo NOVA VERSAO
echo ============================================================
echo.

if defined PUBLISHED_VERSION echo Publicada no GitHub : !PUBLISHED_VERSION!
if defined NEXT_VERSION echo Sugestao            : !NEXT_VERSION!
echo.
echo Digite a versao que deseja publicar.
echo Exemplos: 1.16.7  ^|  1.17.0  ^|  2.0.0
echo.

set /p "VERSION=Nova versao: "

if not defined VERSION (
    echo.
    echo ERRO: Nenhuma versao informada.
    pause
    exit /b 1
)

if /I "!VERSION:~0,1!"=="v" set "VERSION=!VERSION:~1!"
set "VERSION=!VERSION: =!"

REM ============================================================
REM VALIDAR FORMATO X.Y.Z
REM ============================================================
echo.
echo Validando versao !VERSION!...
node -e "process.exit(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(process.argv[1]) ? 0 : 1)" "!VERSION!"

if errorlevel 1 (
    echo.
    echo ERRO: Versao invalida.
    echo Utilize o formato X.Y.Z, por exemplo: 1.16.7
    echo.
    pause
    exit /b 1
)

echo OK - Versao valida: v!VERSION!

REM ============================================================
REM EXIGIR VERSAO MAIOR QUE A PUBLICADA
REM ============================================================
if defined PUBLISHED_VERSION_NUM (
    node -e "const a=process.argv[1].split('.').map(Number),b=process.argv[2].split('.').map(Number);const newer=a[0]>b[0]||(a[0]===b[0]&&(a[1]>b[1]||(a[1]===b[1]&&a[2]>b[2])));process.exit(newer?0:1)" "!VERSION!" "!PUBLISHED_VERSION_NUM!"

    if errorlevel 1 (
        echo.
        echo ERRO: A nova versao precisa ser maior que a versao publicada.
        echo Publicada : v!PUBLISHED_VERSION_NUM!
        echo Informada : v!VERSION!
        echo.
        pause
        exit /b 1
    )
)

REM ============================================================
REM EVITAR TAG DUPLICADA
REM ============================================================
git ls-remote --exit-code --tags origin "refs/tags/v!VERSION!" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo ERRO: A tag v!VERSION! ja existe no GitHub.
    echo Informe uma versao mais recente.
    echo.
    pause
    exit /b 1
)

REM ============================================================
REM ATUALIZAR VERSAO DO PROJETO
REM ============================================================
echo.
echo Atualizando projeto para v!VERSION!...
echo.
node scripts\set-version.cjs "!VERSION!" || goto :erro
node scripts\sync-github-config.cjs || goto :erro

REM ============================================================
REM CONFIRMACAO
REM ============================================================
echo.
echo ============================================================
echo CONFIRMACAO DA PUBLICACAO
echo ============================================================
echo.
if defined PUBLISHED_VERSION echo Versao publicada : !PUBLISHED_VERSION!
echo Nova versao       : v!VERSION!
echo Repositorio       : %GITHUB_OWNER%/%GITHUB_REPO%
echo Destino           : %TARGET_REMOTE%
echo.

set "CONFIRM="
set /p "CONFIRM=Confirma publicar v!VERSION!? [S/N]: "
if /I not "!CONFIRM!"=="S" (
    echo Publicacao cancelada.
    pause
    exit /b 0
)

REM ============================================================
REM DEPENDENCIAS
REM ============================================================
if not exist "node_modules\electron\package.json" (
    echo.
    echo Dependencias nao encontradas. Preparando agora...
    call "%~dp001_preparar_dependencias.bat"
    if errorlevel 1 goto :erro
)

REM ============================================================
REM TESTES
REM ============================================================
echo.
echo ============================================================
echo EXECUTANDO TESTES
echo ============================================================
echo.
call npm.cmd test
if errorlevel 1 goto :erro

REM ============================================================
REM FECHAR PROCESSOS ANTIGOS
REM ============================================================
echo.
echo ============================================================
echo FECHANDO PROCESSOS ANTIGOS
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$root=[System.IO.Path]::GetFullPath('%CD%\dist'); Get-Process -ErrorAction SilentlyContinue ^| ForEach-Object { try { if ($_.Path -and $_.Path.StartsWith($root,[System.StringComparison]::OrdinalIgnoreCase)) { Write-Host ('Fechando: '+$_.ProcessName); Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } } catch {} }"

taskkill /F /IM electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM ============================================================
REM LIMPAR BUILDS ANTIGOS
REM ============================================================
echo.
echo ============================================================
echo LIMPANDO BUILDS ANTIGOS
echo ============================================================
echo.

if exist "dist\windows" rmdir /S /Q "dist\windows"
if exist "dist\linux" rmdir /S /Q "dist\linux"
timeout /t 2 /nobreak >nul

if exist "dist\windows" (
    echo ERRO: Nao foi possivel remover dist\windows.
    echo Feche o aplicativo e tente novamente.
    pause
    exit /b 1
)

REM ============================================================
REM BUILD WINDOWS
REM ============================================================
echo.
echo ============================================================
echo GERANDO WINDOWS v!VERSION!
echo ============================================================
echo.
call npm.cmd run build:win
if errorlevel 1 goto :erro

REM ============================================================
REM VALIDAR ARTEFATOS WINDOWS
REM ============================================================
set "WIN_EXE=dist\windows\Analise-Variaveis-Experimentais-Setup-!VERSION!-x64.exe"
set "WIN_BLOCKMAP=!WIN_EXE!.blockmap"
set "WIN_YML=dist\windows\latest.yml"

if not exist "!WIN_EXE!" (
    echo ERRO: Instalador nao encontrado:
    echo   !WIN_EXE!
    goto :erro
)

echo OK - !WIN_EXE!
if exist "!WIN_BLOCKMAP!" echo OK - !WIN_BLOCKMAP!
if exist "!WIN_YML!" echo OK - !WIN_YML!

REM ============================================================
REM BUILD LINUX VIA WSL
REM ============================================================
echo.
echo ============================================================
echo TENTANDO GERAR LINUX APPIMAGE
echo ============================================================
echo.

where wsl.exe >nul 2>&1
if errorlevel 1 (
    echo WSL nao encontrado. Build Linux sera ignorado.
) else (
    set "WSL_PROJECT="
    for /f "delims=" %%I in ('wsl.exe wslpath -a "%CD%" 2^>nul') do set "WSL_PROJECT=%%I"

    if defined WSL_PROJECT (
        wsl.exe bash -lc "bash '!WSL_PROJECT!/scripts/build-linux.sh' '!WSL_PROJECT!'"
        if errorlevel 1 echo AVISO: Build Linux falhou. Release continuara somente com Windows.
    ) else (
        echo AVISO: Nao foi possivel converter o caminho para WSL.
    )
)

REM ============================================================
REM COMMIT
REM ============================================================
echo.
echo ============================================================
echo CRIANDO COMMIT v!VERSION!
echo ============================================================
echo.

git add -A
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "release: v!VERSION!" || goto :erro
) else (
    echo Nenhuma alteracao encontrada para commit.
)

REM ============================================================
REM TAG
REM ============================================================
git rev-parse "v!VERSION!" >nul 2>&1
if errorlevel 1 (
    git tag -a "v!VERSION!" -m "v!VERSION!" || goto :erro
) else (
    echo ERRO: Tag v!VERSION! ja existe localmente.
    goto :erro
)

REM ============================================================
REM PUSH
REM ============================================================
echo.
echo ============================================================
echo ENVIANDO CODIGO AO GITHUB
echo ============================================================
echo.

git push -u origin HEAD || goto :erro
git push origin "v!VERSION!" || goto :erro

REM ============================================================
REM CRIAR RELEASE
REM ============================================================
if "!GH_READY!"=="0" (
    echo.
    echo Codigo e tag enviados, mas a Release nao foi criada.
    echo Execute gh auth login e rode novamente com uma nova versao.
    goto :fim
)

echo.
echo ============================================================
echo CRIANDO GITHUB RELEASE v!VERSION!
echo ============================================================
echo.

gh release create "v!VERSION!" --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --title "Analise de Variaveis Experimentais v!VERSION!" --generate-notes || goto :erro

REM ============================================================
REM UPLOAD WINDOWS - SOMENTE A VERSAO ATUAL
REM ============================================================
echo.
echo Enviando arquivos Windows...

gh release upload "v!VERSION!" "!WIN_EXE!" --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --clobber || goto :erro

if exist "!WIN_BLOCKMAP!" (
    gh release upload "v!VERSION!" "!WIN_BLOCKMAP!" --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --clobber || goto :erro
)

if exist "!WIN_YML!" (
    gh release upload "v!VERSION!" "!WIN_YML!" --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --clobber || goto :erro
)

REM ============================================================
REM UPLOAD LINUX - SOMENTE A VERSAO ATUAL
REM ============================================================
if exist "dist\linux" (
    for %%F in (
        "dist\linux\*!VERSION!*.AppImage"
        "dist\linux\*!VERSION!*.blockmap"
    ) do (
        if exist "%%~fF" (
            echo Enviando %%~nxF...
            gh release upload "v!VERSION!" "%%~fF" --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --clobber || goto :erro
        )
    )

    if exist "dist\linux\latest-linux.yml" (
        gh release upload "v!VERSION!" "dist\linux\latest-linux.yml" --repo "%GITHUB_OWNER%/%GITHUB_REPO%" --clobber || goto :erro
    )
)

REM ============================================================
REM SUCESSO
REM ============================================================
echo.
echo ============================================================
echo RELEASE PUBLICADA COM SUCESSO
echo ============================================================
echo.
if defined PUBLISHED_VERSION echo Versao anterior : !PUBLISHED_VERSION!
echo Nova versao     : v!VERSION!
echo.
echo Release:
echo https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%/releases/tag/v!VERSION!
echo.
goto :fim

:erro
echo.
echo ============================================================
echo ERRO DURANTE A PUBLICACAO
echo ============================================================
echo.
echo A publicacao nao foi concluida.
echo.
pause
exit /b 1

:fim
echo.
echo ============================================================
echo PUBLICACAO FINALIZADA
echo ============================================================
echo.
echo Repositorio:
echo https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%
echo.
pause
exit /b 0
