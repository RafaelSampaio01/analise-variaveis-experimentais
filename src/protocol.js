'use strict';

// Firmware mínimo/obrigatório para esta revisão do software.
const REQUIRED_FIRMWARE = 'V03/5';

// Códigos de comparação usados pelo software e pelo firmware V03/5:
// 0 = <
// 1 = =
// 2 = >
// 3 = <=
// 4 = >=
const comparisons = Object.freeze({
  LESS: 0,
  EQUAL: 1,
  GREATER: 2,
  LESS_OR_EQUAL: 3,
  GREATER_OR_EQUAL: 4
});

const sensorDefinitions = [
  // id, nome, unidade, escala do protocolo, comparação padrão, referência padrão
  ['Temperatura PTC',              '°C',  100, comparisons.GREATER,          22],
  ['Sensor de som',                'ADC', 100, comparisons.GREATER,           1],
  ['Fotocélula (LDR)',             'ADC',   1, comparisons.GREATER,         400],
  ['Sensor de nível da água',      'ADC',   1, comparisons.GREATER,         100],
  ['Umidade do solo',              '%',   100, comparisons.LESS_OR_EQUAL,    50],
  ['Potenciômetro rotativo',       'ADC',   1, comparisons.GREATER_OR_EQUAL,500],
  ['Temperatura LM35',             '°C',  100, comparisons.GREATER,          22],
  ['Efeito Hall',                  '',    100, comparisons.EQUAL,              0],
  ['Fim de curso',                 '',    100, comparisons.EQUAL,              0],
  ['Botão táctil',                 '',    100, comparisons.EQUAL,              0],
  ['Toque capacitivo',             '',    100, comparisons.EQUAL,              1],
  ['Sensor de impacto',            '',    100, comparisons.EQUAL,              1],
  ['Sensor de inclinação',         '',    100, comparisons.EQUAL,              1],
  ['Interruptor magnético',        '',    100, comparisons.EQUAL,              0],
  ['Sensor de chama',              '',    100, comparisons.EQUAL,              1],
  ['Sensor de vibração',           '',    100, comparisons.EQUAL,              1]
];

const sensors = sensorDefinitions.map(
  ([name, unit, scale, defaultComparison, defaultReference], id) => ({
    id,
    name,
    unit,
    scale,
    defaultComparison,
    defaultReference
  })
);

function inputPorts(sensor) {
  // Sensores analógicos principais da placa.
  if ([0, 1, 2, 3, 4, 5, 6].includes(sensor)) {
    return ['A0', 'A1', 'A2', 'A3'];
  }

  // O sensor de chama do hardware usa especificamente A6.
  // O firmware V03/5 lê o canal ADC6 e converte o nível para 0/1.
  if (sensor === 14) {
    return ['A6'];
  }

  // Sensores digitais, incluindo o novo sensor de vibração (ID 15).
  return ['D5', 'D6', 'D7', 'D8', 'D9'];
}

function normalizeFirmware(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text || text === '—') return '';
  const compact = text.replace(/[^A-Z0-9]/g, '');
  if (/^\d+$/.test(compact)) return `V${compact}`;
  return compact;
}

function firmwareCompatible(value) {
  return normalizeFirmware(value) === normalizeFirmware(REQUIRED_FIRMWARE);
}

// Frames podem chegar fragmentados ou concatenados.
// Um novo # ressincroniza a recepção.
class FrameParser {
  constructor() { this.buffer = ''; }

  push(chunk) {
    const frames = [];

    for (const char of chunk.toString()) {
      if (char === '#') this.buffer = '#';
      else if (this.buffer) this.buffer += char;

      if (char === '.' && this.buffer) {
        const raw = this.buffer;
        this.buffer = '';
        let match;

        if (raw === '#OK.') {
          frames.push({ type: 'ack' });
        } else if ((match = /^#STD([01])([01])\.$/.exec(raw))) {
          frames.push({
            type: 'status',
            healthy: match[1] === '1',
            configured: match[2] === '1'
          });
        } else if ((match = /^#V([^#\r\n.]{1,24})V\.$/.exec(raw))) {
          frames.push({ type: 'version', version: match[1] });
        } else if ((match = /^#D(-?\d{1,10})\.$/.exec(raw))) {
          frames.push({ type: 'data', raw: Number(match[1]) });
        }
      }

      if (this.buffer.length > 64) this.buffer = '';
    }

    return frames;
  }
}

function configurationCommands(config) {
  if (!config || !Number.isInteger(config.sensor) || !sensors[config.sensor]) {
    throw new Error('Selecione um sensor válido.');
  }

  if (!inputPorts(config.sensor).includes(config.input)) {
    throw new Error('Porta de entrada inválida.');
  }

  if (!['D5', 'D6', 'D7', 'D8', 'D9'].includes(config.output) || config.output === config.input) {
    throw new Error('A saída deve usar outra porta digital.');
  }

  if (![0, 1, 2, 3, 4].includes(config.comparison)
      || ![0, 1, 2].includes(config.actuator)
      || ![0, 1].includes(config.level)) {
    throw new Error('Configuração de saída inválida.');
  }

  const ref = typeof config.reference === 'number'
    ? config.reference
    : Number(String(config.reference).trim().replace(',', '.'));

  const scaled = Math.round(ref * sensors[config.sensor].scale);

  if (String(config.reference).trim() === ''
      || !Number.isFinite(ref)
      || scaled < -32768
      || scaled > 32767) {
    throw new Error('Referência fora do intervalo de 16 bits do firmware.');
  }

  return [
    config.sensor,
    config.input,
    config.comparison,
    scaled,
    config.actuator,
    config.output,
    config.level
  ].map((value, index) => `#CP${index + 1}${value}.\n`);
}

module.exports = {
  sensors,
  comparisons,
  inputPorts,
  FrameParser,
  configurationCommands,
  REQUIRED_FIRMWARE,
  normalizeFirmware,
  firmwareCompatible
};
