# Atualização online

## Como funciona

A aplicação usa `electron-updater` com GitHub Releases.

O arquivo `build/electron-builder.config.cjs` lê `config/release.config.json`. Quando `owner/repo` estão configurados, o electron-builder grava no pacote a origem das atualizações e gera os metadados `latest.yml` / `latest-linux.yml`.

A aplicação verifica uma atualização automaticamente alguns segundos após abrir. Também é possível clicar no botão `Sistema vX.Y.Z` no cabeçalho para verificar manualmente.

## Estados do botão

- `Sistema vX.Y.Z`: versão atual / clique para verificar.
- `Verificando vX.Y.Z`: consulta em andamento.
- `Atualizar vX.Y.Z`: versão nova encontrada.
- `Baixando NN%`: download em andamento.
- `Reiniciar e atualizar`: pacote pronto para instalar.

## Windows

A distribuição de produção é NSIS `.exe`. O atualizador usa o instalador da nova versão publicado na GitHub Release.

## Linux

A distribuição é AppImage. O AppImage é gerado dentro do WSL para garantir que dependências nativas sejam instaladas no ambiente Linux.

## Publicação

```bat
05_publicar_git.bat 1.17.0
```

O número da versão precisa ser maior que a versão já publicada para o atualizador considerá-la nova.

## Repositório privado

GitHub Releases privadas exigem autenticação do cliente e não são ideais para atualização pública automática. Para máquinas finais sem token, use um repositório/release acessível publicamente ou troque o provider por um servidor genérico HTTPS controlado pela organização.
