# Firmware V03/4 — 115200 baud / aquisição rápida

Esta revisão altera o protocolo de aquisição para maior velocidade.

## Alterações
- Identificação de firmware: `V03/4`.
- UART: `115200` baud.
- A placa continua aguardando `#REQUI.` antes de liberar configuração/coleta.
- O envio de dados não usa `delay()` nem período fixo.
- Enquanto `#PLAY_.` estiver ativo, a placa mede e envia uma nova amostra assim que houver espaço no buffer TX da UART.
- Os `delay(500)` dos comandos `#CP1...#CP7` foram removidos.
- Corrigido o envio do valor coletado: o firmware não mantém mais um ponteiro para uma variável local de `Play()`.
- O frame permanece no formato `#D<valor>.`.
- O filtro analógico continua com 15 leituras por amostra para preservar o comportamento de medição existente.

## Fluxo
1. Software abre a serial.
2. Software envia `#REQUI.`.
3. Placa responde `#VV03/4V.#STD10.`.
4. Software envia `#CP1...` até `#CP7...`.
5. Cada CP responde `#OK.` sem atraso artificial.
6. Software envia `#REQUI.` e recebe `#VV03/4V.#STD11.`.
7. Software envia `#PLAY_.`.
8. A placa transmite amostras continuamente, sem período fixo.
9. `#PAUSA.` interrompe imediatamente a geração de novas amostras.

## Compilação do .hex
Compile `firm_keystudio.ino` para Arduino Uno e exporte o binário compilado.
Coloque o novo arquivo com o nome:

`firmware/firm_keystudio.ino.hex`

O software v1.13 procura esse arquivo na pasta `firmware`.

O arquivo legado V03/3 / 9600 baud foi movido para `firmware/legacy/` apenas como referência e não deve ser usado com a v1.13.
