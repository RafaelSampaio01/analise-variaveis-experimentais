//
//#include "Sensor_Analog.h"

//--------------------------------------------------------------------------------------------------------
void situacao_placa()
{
  // Responde imediatamente ao pedido do software.
  // Nao ha mais delay de 800 ms antes da versao/estado.
  Sit_placa = 1;

  Serial.print(F("#V"));
  Serial.print(Vsoft);
  Serial.print(F("V."));

  Serial.print(F("#STD"));
  Serial.print(Sit_placa ? '1' : '0');
  Serial.print(Config_placa ? '1' : '0');
  Serial.print('.');
}

//--------------------------------------------------------------------------------------------------------
void Verifica_dadosin()
{

    // O software precisa iniciar explicitamente o handshake.
    // Antes de #REQUI. nenhum comando de configuracao/coleta e executado.
    if(dadosin == "#REQUI.")
    {
      Handshake_OK = true;
      situacao_placa();
      dadosin = "";
      stringcompleta = false;
      return;
    }

    if(!Handshake_OK)
    {
      dadosin = "";
      stringcompleta = false;
      return;
    }

    if(dadosin == "#STOP_.") 
    {
     Sit_placa = 0;
     Config_placa = 0;
     Flag_Pausa = 0;
     funcReset();
    }

    if(dadosin == "#PAUSA.") 
    {
      //Flag_Pausa = 1;
      Flag_Play = 0;
    }

    if(dadosin == "#PLAY_.")
    {
      Flag_Play = 1;
      //Serial.print( String(Val_Sensor) + String(Val_PortIn) + String(Val_Compar) + String(Val_Refere) + String(Val_Atuador) + Val_PortOut + String(Val_Saida));
    }

    if(dadosin.substring(0, 3) == "#CP")    // #CP1123.
    {
      int CP = 0;
      int CP_Len = 0;
      int CP_Val = 0;
      String St_Aux = "";
      String St_Aux2 = "";

      CP_Len = dadosin.length();
      St_Aux = dadosin[3];
      St_Aux2 = dadosin.substring(4,(CP_Len - 1));
      CP = St_Aux.toInt();
      CP_Val = St_Aux2.toInt();

      switch(CP)
      {
        case 1:
        Val_Sensor = CP_Val;
        Serial.write("#OK.");
            break;

        case 2:
        St_Aux2 = St_Aux2[1];
        CP_Val = St_Aux2.toInt();
        Val_PortIn = CP_Val;
        //Val_PortIn = St_Aux2;
        Serial.write("#OK.");
            break;

        case 3:
        Val_Compar = CP_Val;
        Serial.write("#OK.");
            break;

        case 4:
        Val_Refere = CP_Val;
        Serial.write("#OK.");
            break;

        case 5:
        Val_Atuador = CP_Val;
        Serial.write("#OK.");
            break;

        case 6:
        St_Aux2 = St_Aux2[1];
        CP_Val = St_Aux2.toInt();
        Val_PortOut = CP_Val;
        Serial.write("#OK.");
            break;

        case 7:
        Val_Saida = CP_Val;
        Serial.write("#OK.");
        //digitalWrite(5,1);
        Config_placa = 1;
        // A versao/estado so sera enviada novamente se o software pedir #REQUI.
            break;
      }
    }

    dadosin = "";
    stringcompleta = false;
}
//--------------------------------------------------------------------------------------------------------
int compara(long X)
{
//Serial.print("Val_Compar = ");
//Serial.println(Val_Compar);
int Estado_saida2 = 0;

  switch (Val_Compar)
  {
    //Serial.println("Val_Compar");
    case 0:
     //Serial.print("menor ");
     //Serial.print(resposta);
     //Serial.print(" - ");
     //Serial.println(Val_Refere);
          if (X < Val_Refere) Estado_saida2 = !Val_Saida;
          else Estado_saida2 = Val_Saida;
          break;

    case 1:
    //Serial.println("igual");
          if (X == Val_Refere) Estado_saida2 = !Val_Saida;
          else Estado_saida2 = Val_Saida;
          break;

    case 2:
    //Serial.println("maior");
         //Serial.print(resposta);
     //Serial.print(" - ");
     //Serial.println(Val_Refere);
          if (X > Val_Refere) Estado_saida2 = !Val_Saida;
          else Estado_saida2 = Val_Saida;
          break;   
  }

  return Estado_saida2;

}


//--------------------------------------------------------------------------------------------------------
void Play()
{

  long resposta = 0;
  int Estado_saida = 0;

  switch(Val_Sensor)    // -------------------- SWITCH PARA RECEBER DADOS DOS SENSORES -------------------------------
  {
    case  0:      // SENSOR DE TEMP. ANALOGICA
          resposta = Temperatura_0(Val_PortIn);
          //Serial.println(resposta);
          break;

    case  1:      // SENSOR DE SOM
          resposta = Som_1(Val_PortIn);
          //Serial.println(resposta);
          break;

    case  2:      // SENSOR LDR
          resposta = LDR_2(Val_PortIn);
          //Serial.println(resposta);
          break;

    case  3:      // SENSOR DE CHUVA
          resposta = Agua_3(Val_PortIn);
          //Serial.println(resposta);
          break;

    case  4:      // SENSOR DE UMIDADE DO SOLO
          resposta = Umidade_4(Val_PortIn);
          //Serial.println(resposta);
          break;
  
    case  5:      // SENSOR POTENCIOMETRO
          resposta = Potenciometro_5(Val_PortIn);
          //Serial.println(resposta);
          break;
          
    case  6:      // SENSOR LM35
          resposta = Lm35_6(Val_PortIn);
          //Serial.println(resposta);
          break;
            
    case  7:    // SENSOR HALL
          pinMode (Val_PortIn, INPUT);
          resposta = (digitalRead(Val_PortIn) * 100);
          //Serial.println(resposta);
          break;
          
    case  8:      // CHAVE
          pinMode (Val_PortIn, INPUT);
          resposta = digitalRead(Val_PortIn) * 100;
          //Serial.println(resposta);
          break;
           
    case  9:      // SENSOR BOTAO
          pinMode (Val_PortIn, INPUT);
          resposta = digitalRead(Val_PortIn) * 100;
          //Serial.println(resposta);
          break;
           
    case  10:     // SENSOR DE TOQUE
          pinMode (Val_PortIn, INPUT);
          resposta = digitalRead(Val_PortIn) * 100;
          //Serial.println(resposta);
          break;
           
    case  11:     // SENSOR DE KNOCK
          pinMode (Val_PortIn, INPUT);
          resposta = digitalRead(Val_PortIn) * 100;
          //Serial.println(resposta);
          break;
           
    case  12:     // INCLINAÇÃO
          pinMode (Val_PortIn, INPUT);
          resposta = digitalRead(Val_PortIn) * 100;
          //Serial.println(resposta);
          break;
          
    case  13:
          pinMode (Val_PortIn, INPUT);
          resposta = digitalRead(Val_PortIn) * 100;
          //Serial.println(resposta);
          break;
          
    case  14:     // SENSOR DE CHAMA
          pinMode (Val_PortIn, INPUT);
          resposta = digitalRead(Val_PortIn) * 100;
          //Serial.println(resposta);
          break;                            
  }

 Estado_saida = compara(resposta);



  switch(Val_Atuador)       // -------------------- SWITCH PARA ACIONAR A SAIDA -------------------------------
  {
    //Serial.println("Val_Atuador");
    case 0:
    //Serial.println("led");
          digitalWrite(Val_PortOut,Estado_saida);
          break;

    case 1:
    //Serial.println("buzzer1");
          digitalWrite(Val_PortOut,Estado_saida);
          break;

    case 2:
    //Serial.println("buzzer2");
          //digitalWrite(Val_PortOut, (Estado_saida * 50));
          if(Estado_saida == 1) tone(Val_PortOut,800);
          else noTone(Val_PortOut);
          
          break;
  }

  Envia_Soft = resposta;
  //Serial.println("finalizou");
  
}
//--------------------------------------------------------------------------------------------------------