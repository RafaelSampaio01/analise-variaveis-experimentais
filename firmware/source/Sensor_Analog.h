//
double Resultado = 0;
double Resposta_AN = 0;

//--------------------------------------------------------------------------------------------------------
//            ---------- FUNÇÃO PARA FILTRO DA ENTRADA ANALÓGICA -----------
int Filtro_Analog(int porta, int amostra, int diferenca){    // GERALMENTE USA 15 PARA AMOSTRA, 8 PARA DIFERENÇA
 
    long reads = 0;
    long lastread = 0;
    long correntread = 0;
      
    for(int ii=0;ii<amostra;ii++){      
        reads+=analogRead(porta);      
    }
      
    correntread=reads/amostra;
      
    if((abs(correntread - lastread))>diferenca){      
        lastread=correntread;      
    } 
    
  return lastread;
}
// ------------------------------------ FIM DA FUNÇÃO DE FILTRO--------------------------------------------

long Temperatura_0(int porta_s){   // SENSOR NTC

    Resposta_AN = Filtro_Analog(porta_s, 15, 8);
    //Resultado = log(((10240000/Resposta_AN) - 10000));
    //Resultado = 1/(0.001129148 + (0.000234125 + (0.0000000876741 * Resultado * Resultado)) * Resultado);
    //Resultado = Resultado - 273.15;
    Resultado = ((0.1611 * Resposta_AN) - 32.667) * 100.00;
    //Resultado = Resposta_AN;

    return Resultado;
}

long Som_1(int porta_s){   // SENSOR DE SOM

    Resposta_AN = Filtro_Analog(porta_s, 15, 8);
    Resultado = Resposta_AN;

    return Resultado;
}

long LDR_2(int porta_s){   // SENSOR FOTOCELULA

    Resposta_AN = Filtro_Analog(porta_s, 15, 8);
    Resultado = (Resposta_AN);

    return Resultado;
}

long Agua_3(int porta_s){   // SENSOR DE AGUA

    Resposta_AN = Filtro_Analog(porta_s, 15, 8);
    if(Resposta_AN > 450) Resultado = 100;
    else Resultado = 0;

    return Resultado;
}

long Umidade_4(int porta_s){   // SENSOR DE HUMIDADE DO SOLO

    Resposta_AN = Filtro_Analog(porta_s, 15, 8);
    //Resultado = map(Resposta_AN, 0, 615, 0, 100); //Transforma os valores analógicos em uma escala de 0 a 100
    Resultado = (0.1626 * Resposta_AN * 100);

    //Resultado = Resposta_AN;

    return Resultado;
}

long Potenciometro_5(int porta_s){   // SENSOR POTENCIOMETRO

    Resposta_AN = Filtro_Analog(porta_s, 15, 8);
    Resultado = ((Resposta_AN * 500) / 1023);       // CONVERTE EM TENSÃO

    return Resultado;
}

long Lm35_6(int porta_s)    // SENSOR LM35
{   

    Resposta_AN = Filtro_Analog(porta_s, 15, 8);
    Resultado = (Resposta_AN * ((5.0 / 1023.0) / 0.01)) * 100;   // CONVERTE EM GRAUS °C
    //Resultado = (500 * Resposta_AN) /1024;;

    return Resultado;
}