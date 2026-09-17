// PROJETO DE COLETOR DE DADOS COMANDADO PELO SOFTWARE DE GERENCIAMENTO
// REVISAO DE HANDSHAKE:
// - ao iniciar, a placa nao anuncia versao sozinha;
// - aguarda o software enviar #REQUI.;
// - responde imediatamente com versao + estado;
// - configuracao/coleta so sao aceitas depois do handshake.
// - UART a 115200 baud e envio de dados sem delay/periodo fixo.

//---------------- FUNCAO PARA RESETAR O ARDUINO ---------
void (*funcReset)() = 0;
//--------------------------------------------------------

#include "Variaveis.h"
#include "Sensor_Analog.h"
#include "Funcoes.h"

//----------------------------- SETUP INICIAL -------------------------
void setup() {
  pinMode(5, OUTPUT);
  pinMode(6, OUTPUT);
  pinMode(7, OUTPUT);
  pinMode(8, OUTPUT);
  pinMode(9, OUTPUT);

  digitalWrite(5, LOW);
  digitalWrite(6, LOW);
  digitalWrite(7, LOW);
  digitalWrite(8, LOW);
  digitalWrite(9, LOW);

  Serial.begin(seri_al);

  // Evita realocacoes frequentes do String durante o parser serial.
  dadosin.reserve(24);

  // IMPORTANTE:
  // Nao envia versao/status no setup. O software deve pedir #REQUI.
  Handshake_OK = false;
  Sit_placa = 0;
  Config_placa = 0;

}
//---------------------------------------------------------------------


//------------------------- LOOP MAIN ---------------------------------
void loop() {
  if (stringcompleta == true) {
    Verifica_dadosin();
  }

  // Coleta na maior taxa sustentavel pela leitura do sensor + UART.
  // Nao existe delay nem periodo fixo de envio.
  // O teste do buffer TX evita bloquear o loop quando a serial estiver cheia.
  if (Handshake_OK && Flag_Play == 1 && Serial.availableForWrite() >= 16) {
    Play();

    const int tamanho = snprintf(bufferData, sizeof(bufferData), "#D%05ld.", Envia_Soft);
    if (tamanho > 0 && tamanho < (int)sizeof(bufferData)) {
      Serial.write((const uint8_t*)bufferData, tamanho);
    }
  }
}
//---------------------------------------------------------------------


//-----------------------------------------------------------------------------
// FUNCAO PARA RECEBER DADOS DA CONEXAO SERIAL
void serialEvent() {
  while (Serial.available()) {
    char porta = (char)Serial.read();

    // Novo inicio de quadro: descarta qualquer lixo/parcial anterior.
    if (porta == '#') {
      START = 1;
      dadosin = "#";
      continue;
    }

    if (START == 1) {
      dadosin += porta;

      // Protecao contra quadro invalido/grande demais.
      if (dadosin.length() > 24) {
        START = 0;
        stringcompleta = false;
        dadosin = "";
        continue;
      }

      if (porta == '.') {
        START = 0;

        // Comandos fixos atuais tem 7 caracteres; #CP possui tamanho variavel.
        if ((dadosin.length() == 7) || (dadosin.substring(0, 3) == "#CP")) {
          stringcompleta = true;
        } else {
          stringcompleta = false;
          dadosin = "";
        }
      }
    }
  }
}
//-----------------------------------------------------------------------------
