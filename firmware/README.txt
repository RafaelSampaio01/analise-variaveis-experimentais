FIRMWARE DO ARDUINO UNO — V03/4

Coloque nesta pasta o firmware compilado:
  firm_keystudio.ino.hex

A revisão V03/4 usa:
- 115200 baud
- handshake por #REQUI.
- envio de amostras sem delay/período fixo

O código-fonte está em:
  firmware/source/

O HEX V03/3 de 9600 baud foi movido para:
  firmware/legacy/

Ele é apenas legado e não é usado pelo atualizador v1.13.
