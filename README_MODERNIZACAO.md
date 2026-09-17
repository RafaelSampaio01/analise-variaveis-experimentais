# Modernização v1.16

- Projeto reorganizado para desenvolvimento, build e publicação.
- `01_preparar_dependencias.bat`: instala dependências e testa.
- `02_start_dev.bat`: inicia Electron em desenvolvimento.
- `03_build_windows.bat`: gera instalador NSIS `.exe` x64.
- `04_build_linux.bat`: usa WSL para gerar AppImage Linux e mantém `iniciar_linux.sh`.
- `05_publicar_git.bat X.Y.Z`: versiona, compila, cria commit/tag, envia ao Git e publica GitHub Release quando a CLI `gh` está disponível.
- Atualização online do aplicativo por `electron-updater` + GitHub Releases.
- Botão de versão no cabeçalho informa versão, disponibilidade, progresso de download e instalação.
- Firmware V03/4 / 115200 e atualizador de firmware preservados.
- Manual e firmware continuam empacotados como recursos extras.
- Gráfico ampliado da v1.15 preservado.


## v1.16.3
- Corrigido teste intermitente do modo demonstração no Windows.
- O teste agora aguarda a quantidade de amostras com timeout, em vez de depender de 550 ms exatos do scheduler.
- `01_preparar_dependencias.bat` fica dedicado à instalação (`npm install`).
- Adicionado `06_testar_projeto.bat` para executar os testes separadamente.


## v1.16.5
- destino GitHub fixado em RafaelSampaio01/analise-variaveis-experimentais;
- publicador corrige remote origin antigo;
- com gh autenticado, pode criar repositorio publico/privado;
- Releases e atualizacao online usam explicitamente esse repositorio.
