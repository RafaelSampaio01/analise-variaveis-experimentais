# Análise de Variáveis Experimentais — v1.16.1

## Antes de executar os .BAT

**Extraia o ZIP inteiro para uma pasta do Windows. Não execute os arquivos .BAT de dentro do ZIP.**

Fluxo recomendado:

1. Execute `00_verificar_ambiente.bat` se quiser conferir Node/npm.
2. Execute `01_preparar_dependencias.bat` para rodar `npm install`.
3. Execute `02_start_dev.bat` para abrir em desenvolvimento.

O instalador de dependências agora grava `logs\dependencias.log` e mantém a janela aberta em caso de erro.

# Análise de Variáveis Experimentais

Aplicação Electron para aquisição de dados do Arduino/KEYStudio, configuração de experimentos, gráficos em tempo real, atualização do firmware da placa e atualização online do próprio aplicativo.

## Estrutura do projeto

```text
.
├── src/                         # Aplicação Electron
│   ├── main.js
│   ├── preload.js
│   ├── collector.js
│   ├── protocol.js
│   ├── firmware.js
│   ├── csv.js
│   └── renderer/
├── firmware/                    # .hex usado pelo atualizador da placa
├── manual/                      # PDF aberto pelo botão Manual
├── test/                        # testes de protocolo/coleta/CSV
├── config/
│   └── release.config.json      # GitHub usado para atualização online
├── build/
│   └── electron-builder.config.cjs
├── scripts/
│   ├── build-linux.sh
│   ├── set-version.cjs
│   └── sync-github-config.cjs
├── 01_preparar_dependencias.bat
├── 02_start_dev.bat
├── 03_build_windows.bat
├── 04_build_linux.bat
├── 05_publicar_git.bat
└── iniciar_linux.sh
```

## Fluxo rápido no Windows

### 1. Preparar dependências

Execute:

```bat
01_preparar_dependencias.bat
```

Ele executa `npm install` e os testes do projeto.

### 2. Desenvolvimento

```bat
02_start_dev.bat
```

### 3. Gerar Windows

```bat
03_build_windows.bat
```

Saída:

```text
dist/windows/
```

O build de produção usa instalador **NSIS .exe**, necessário para o fluxo de atualização online do Windows.

### 4. Gerar Linux pelo Windows + WSL

```bat
04_build_linux.bat
```

O script cria uma cópia temporária em filesystem Linux, instala dependências Linux e gera o AppImage em:

```text
dist/linux/
```

Também existe `iniciar_linux.sh`, que localiza e executa o AppImage mais recente.

### 5. Publicar uma versão

Exemplo:

```bat
05_publicar_git.bat 1.16.0
```

O script:

1. atualiza `package.json` para a versão informada;
2. sincroniza `config/release.config.json` com o `remote origin` do GitHub, quando possível;
3. executa testes;
4. gera Windows;
5. tenta gerar Linux via WSL;
6. cria commit `release: vX.Y.Z`;
7. cria tag `vX.Y.Z`;
8. faz `git push` do commit e da tag;
9. se a GitHub CLI (`gh`) estiver instalada e autenticada, cria a GitHub Release e envia os instaladores e arquivos `latest*.yml` usados pelo atualizador.

## Configurar GitHub

Se o projeto já possuir um `remote origin` apontando para GitHub, os scripts tentam detectar automaticamente `owner/repo`.

Também é possível editar manualmente:

```text
config/release.config.json
```

Exemplo:

```json
{
  "github": {
    "owner": "minha-organizacao",
    "repo": "analise-variaveis-experimentais"
  },
  "channel": "latest"
}
```

## Atualização online do aplicativo

O projeto usa `electron-updater`.

Ao iniciar uma versão empacotada:

1. a interface mostra a versão instalada no botão **Sistema vX.Y.Z**;
2. após alguns segundos o software consulta a release mais recente;
3. se não existir versão nova, mantém a versão atual;
4. se existir uma versão superior, o botão muda para **Atualizar vX.Y.Z**;
5. ao clicar, o software baixa a atualização e mostra o progresso;
6. quando terminar, o botão muda para **Reiniciar e atualizar**;
7. ao clicar novamente, o programa fecha, instala e reinicia na nova versão.

No modo `npm run dev`, a atualização online fica desabilitada de propósito.

### Arquivos necessários na GitHub Release

Para Windows, a release deve conter o instalador `.exe`, o arquivo `latest.yml` e os arquivos auxiliares gerados pelo electron-builder.

Para Linux/AppImage, deve conter o `.AppImage`, `latest-linux.yml` e arquivos auxiliares gerados.

O `05_publicar_git.bat` envia esses arquivos automaticamente quando `gh` estiver disponível.

## Firmware da placa

O software espera atualmente:

```text
Firmware: V03/4
Serial: 115200 baud
Handshake: #REQUI.
```

O firmware incluído em `firmware/firm_keystudio.ino.hex` foi verificado e contém a identificação `V03/4` e os comandos do protocolo atual.

## Requisitos

### Windows

- Node.js 22 ou superior
- npm
- Git para publicação
- GitHub CLI (`gh`) para criar/upload de GitHub Releases automaticamente
- WSL somente para o build Linux

### WSL/Linux

- Node.js + npm instalados dentro do Linux
- ferramentas padrão de shell/tar

## Observações de distribuição

- `node_modules/`, `dist/` e `artifacts/` não fazem parte do projeto fonte.
- O `package-lock.json` é criado/atualizado pelo `01_preparar_dependencias.bat` na primeira preparação.
- Para produção pública, considere assinatura de código do instalador Windows.
- O repositório usado pelo atualizador precisa disponibilizar as Releases aos computadores clientes. Em repositórios privados, será necessária uma estratégia de autenticação/distribuição apropriada.


## v1.16.2
O instalador de dependencias agora mostra o `npm install` diretamente na janela, sem redirecionar a saida para arquivo. Se houver falha, a janela permanece aberta com o erro. O arquivo `01b_npm_install_diagnostico.bat` executa `npm install --verbose`.


## v1.16.3
- Corrigido teste intermitente do modo demonstração no Windows.
- O teste agora aguarda a quantidade de amostras com timeout, em vez de depender de 550 ms exatos do scheduler.
- `01_preparar_dependencias.bat` fica dedicado à instalação (`npm install`).
- Adicionado `06_testar_projeto.bat` para executar os testes separadamente.

### Publicar uma versão pelo Windows

O arquivo `05_publicar_git.bat` agora pode ser aberto com duplo clique. Se nenhuma versão for passada na linha de comando, ele pergunta interativamente a versão e pede confirmação do repositório remoto antes de qualquer `push`.

Também continua aceitando uso por terminal:

```bat
05_publicar_git.bat 1.16.4
```

Antes de publicar, confira com atenção o repositório exibido na tela.


## GitHub configurado
A publicacao e as atualizacoes online estao configuradas para `RafaelSampaio01/analise-variaveis-experimentais`. O script `05_publicar_git.bat` corrige o `origin` se ele ainda apontar para outro repositorio e, com GitHub CLI autenticado, pode criar o repositorio e a Release.
