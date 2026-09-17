# Configuração de release

`release.config.json` define o repositório GitHub usado pelo `electron-builder` para gravar a origem das atualizações online no aplicativo empacotado.

Os scripts `03_build_windows.bat`, `04_build_linux.bat` e `05_publicar_git.bat` tentam sincronizar este arquivo com o `remote.origin.url` do Git automaticamente.
