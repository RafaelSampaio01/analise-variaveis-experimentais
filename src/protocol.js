'use strict';

// Versão esperada do firmware incluído com esta aplicação.
// A revisão V03/4 usa UART a 115200 baud e aquisição sem período fixo.
const REQUIRED_FIRMWARE = 'V03/4';

const sensors = [
  ['Sensor de temperatura', '°C'],
  ['Sensor de som', 'ADC'],
  ['Fotocélula (LDR)', 'ADC'],
  ['Sensor de nível da água', 'ADC'],
  ['Umidade do solo', '%'],
  ['Potenciômetro rotativo', 'V'],
  ['Temperatura LM35', '°C'],
  ['Efeito Hall', ''],
  ['Fim de curso', ''],
  ['Botão táctil', ''],
  ['Toque capacitivo', ''],
  ['Sensor de impacto', ''],
  ['Sensor de inclinação', ''],
  ['Interruptor magnético', ''],
  ['Sensor de chama', '']
].map(([name, unit], id) => ({ id, name, unit, scale: id === 2 ? 1 : 100 }));

function inputPorts(sensor) {
  return sensor < 7 ? ['A0', 'A1', 'A2', 'A3'] : sensor === 14 ? ['A6/A7'] : ['D5', 'D6', 'D7', 'D8', 'D9'];
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

// Frames may be fragmented or concatenated; a new # resynchronizes reception.
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
        if (raw === '#OK.') frames.push({ type: 'ack' });
        else if ((match = /^#STD([01])([01])\.$/.exec(raw))) frames.push({ type: 'status', healthy: match[1] === '1', configured: match[2] === '1' });
        else if ((match = /^#V([^#\r\n.]{1,24})V\.$/.exec(raw))) frames.push({ type: 'version', version: match[1] });
        else if ((match = /^#D(-?\d{1,10})\.$/.exec(raw))) frames.push({ type: 'data', raw: Number(match[1]) });
      }
      if (this.buffer.length > 64) this.buffer = '';
    }
    return frames;
  }
}

function configurationCommands(config) {
  if (!config || !Number.isInteger(config.sensor) || !sensors[config.sensor]) throw new Error('Selecione um sensor válido.');
  if (!inputPorts(config.sensor).includes(config.input)) throw new Error('Porta de entrada inválida.');
  if (!['D5', 'D6', 'D7', 'D8', 'D9'].includes(config.output) || config.output === config.input) throw new Error('A saída deve usar outra porta digital.');
  if (![0, 1, 2].includes(config.comparison) || ![0, 1, 2].includes(config.actuator) || ![0, 1].includes(config.level)) throw new Error('Configuração de saída inválida.');
  const ref = typeof config.reference === 'number' ? config.reference : Number(String(config.reference).trim().replace(',', '.'));
  const scaled = Math.round(ref * sensors[config.sensor].scale);
  if (String(config.reference).trim() === '' || !Number.isFinite(ref) || scaled < -32768 || scaled > 32767) throw new Error('Referência fora do intervalo de 16 bits do firmware.');
  return [config.sensor, config.input, config.comparison, scaled, config.actuator, config.output, config.level].map((value, index) => `#CP${index + 1}${value}.\n`);
}

module.exports = { sensors, inputPorts, FrameParser, configurationCommands, REQUIRED_FIRMWARE, normalizeFirmware, firmwareCompatible };
