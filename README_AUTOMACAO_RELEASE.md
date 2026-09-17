# Automação completa de Releases

Este pacote muda o fluxo de publicação para **GitHub Actions**.

## Resultado

Depois da configuração inicial, para publicar uma nova versão você usa apenas:

```bat
05_publicar_git.bat
```

O BAT:

1. consulta a última Release publicada;
2. mostra a versão atual;
3. sugere o próximo patch;
4. pede a nova versão;
5. atualiza `package.json` e `package-lock.json`;
6. executa os testes locais;
7. faz commit e push;
8. cria a tag `vX.Y.Z`;
9. envia a tag.

O push da tag dispara `.github/workflows/release.yml`.

O GitHub Actions então:

- executa os testes novamente;
- gera o instalador Windows em uma máquina Windows limpa;
- gera `latest.yml`;
- gera o `.blockmap`;
- tenta gerar o AppImage Linux em uma máquina Linux;
- valida que `latest.yml` corresponde à versão da tag;
- cria a GitHub Release;
- anexa os artefatos automaticamente;
- confere que EXE, blockmap e `latest.yml` estão na Release.

## Vantagens

- não depende de WSL para publicar Windows;
- o Linux é compilado diretamente no GitHub;
- evita misturar EXE de uma versão com `latest.yml` de outra;
- evita enviar artefatos antigos que ficaram em `dist`;
- a Release só é criada depois dos builds;
- `latest.yml` é obrigatório;
- o software instalado encontra os arquivos de atualização no mesmo repositório.

## Instalação

Copie:

```text
.github/workflows/release.yml
05_publicar_git.bat
```

para a raiz do projeto, preservando a pasta `.github`.

## Requisito importante

O repositório precisa conter `package-lock.json`.

Se ainda não existir:

```bat
npm install
git add package-lock.json
git commit -m "build: adicionar package-lock"
git push
```

## Ícones

Windows:

```text
build/icon.ico
```

Linux:

```text
build/icon.png
```

Recomendado para `icon.png`: 512 x 512 px com fundo transparente.

Se `icon.png` não existir, o workflow não bloqueia a Release Windows; apenas ignora o build Linux.

## GitHub Actions

O workflow usa o `GITHUB_TOKEN` fornecido automaticamente pelo GitHub e declara:

```yaml
permissions:
  contents: write
```

Não é necessário criar manualmente um token para um repositório público normal.

## Atualização online

O instalador Windows e o `latest.yml` são gerados juntos. Isso é importante porque o `latest.yml` contém o hash SHA-512 do instalador correspondente.

Nunca reutilize um `latest.yml` de outra versão.
