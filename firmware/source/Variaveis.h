// PAGINA COM AS VARIAVEIS UTILIZADAS NESTE PROJETO

//---------- VERSAO DA PROGRAMACAO ----------
// V03/4: UART 115200 e aquisicao sem periodo fixo.
const char Vsoft[] = "V03/4";
//------------------------------------------


//---------- CONTROLE DA COMUNICACAO SERIAL ----------

const long seri_al = 115200;        // VELOCIDADE DE COMUNICACAO

String dadosin = "";                // RECEBE A STRING DA COMUNICACAO SERIAL
int START = 0;                      // FLAG DO INICIO DA PALAVRA RECEBIDA
boolean stringcompleta = false;     // PALAVRA SERIAL COMPLETA

char buffer1[5];
char buffer2[5];
char buffer3[5];
char buffer4[5];
char buffer5[5];
char dadosout[36];

// O firmware fica inativo ate o software fazer o handshake com #REQUI.
bool Handshake_OK = false;

//----------------------------------------------------


//------------- VARIAVEIS DA SITUACAO DA PLACA---------------
bool Sit_placa = 0;
bool Config_placa = 0;

//------------- VARIAVEIS DO PLAY OU STOP ---------------
bool Flag_Play = 0;
bool Flag_Pausa = 0;
long Envia_Soft = 0;        // ULTIMO VALOR MEDIDO A SER ENVIADO AO SOFTWARE

//------------- VARIAVEIS QUE RECEBEM AS CONFIGURACOES DA PLACA ---------------

int Val_Sensor = 0;
int Val_PortIn = 0;
int Val_Compar = 0;
int Val_Refere = 0;
int Val_Atuador = 0;
int Val_PortOut = 0;
int Val_Saida = 0;

//-------------- BUFFER DO FRAME DE DADOS -------------
char bufferData[20];
