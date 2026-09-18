'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { FrameParser, configurationCommands } = require('../src/protocol');
const { Collector } = require('../src/collector');
const { encode, decode } = require('../src/csv');
const config = { sensor: 0, input: 'A0', comparison: 2, reference: '25,5', actuator: 0, output: 'D5', level: 0 };

async function waitFor(predicate, { timeout = 2000, interval = 20 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Condição de teste não atingida em ${timeout} ms.`);
}

test('fragmented frames, concatenation, negative values and resynchronization', () => {
  const parser = new FrameParser();
  assert.deepEqual(parser.push('noise#O'), []);
  assert.deepEqual(parser.push('K.#VV03/5V.#STD11.#D-0250.#broken#D00100.'), [
    { type: 'ack' }, { type: 'version', version: 'V03/5' }, { type: 'status', healthy: true, configured: true }, { type: 'data', raw: -250 }, { type: 'data', raw: 100 }
  ]);
  assert.deepEqual(parser.push('#DNaN.#STD99.'), []);
  parser.push('#' + 'x'.repeat(1000)); assert.equal(parser.buffer, '');
});
test('all seven firmware commands retain legacy scaling and port format', () => {
  assert.deepEqual(configurationCommands(config), ['#CP10.\n', '#CP2A0.\n', '#CP32.\n', '#CP42550.\n', '#CP50.\n', '#CP6D5.\n', '#CP70.\n']);
  assert.equal(configurationCommands({ ...config, sensor: 2, reference: 512 })[3], '#CP4512.\n');
  assert.equal(configurationCommands({ ...config, sensor: 3, reference: 700 })[3], '#CP4700.\n');
  assert.equal(configurationCommands({ ...config, sensor: 5, reference: 500, comparison: 4 })[3], '#CP4500.\n');
  assert.equal(configurationCommands({ ...config, sensor: 5, reference: 500, comparison: 4 })[2], '#CP34.\n');
  assert.equal(configurationCommands({ ...config, sensor: 4, reference: 50, comparison: 3 })[2], '#CP33.\n');
  assert.equal(configurationCommands({ ...config, sensor: 14, input: 'A6' })[1], '#CP2A6.\n');
  assert.equal(configurationCommands({ ...config, sensor: 15, input: 'D7' })[0], '#CP115.\n');
  for (const change of [{ reference: '' }, { reference: 'NaN' }, { reference: 1000 }, { sensor: 99 }, { sensor: 7, input: 'D5', output: 'D5' }, { input: 'A0.\n#PLAY_' }]) assert.throws(() => configurationCommands({ ...config, ...change }));
});
test('CSV roundtrip: decimal comma, BOM, quotes, multiline and old repeated headers', () => {
  const rows = [{ id: 0, date: '16/09/2026', time: '10:20:30', value: -2.5, unit: '°C', sensor: 'Sensor; "teste"\nNTC' }];
  assert.deepEqual(decode(encode(rows)), rows);
  assert.equal(decode('ID;DATA;HORA;VALOR;UNIDADE;SENSOR\n0;16/09/2026;10:00;1.5;V;POT\n;;;;;\nID;DATA;HORA;VALOR;UNIDADE;SENSOR\n').length, 1);
  assert.throws(() => decode('ID;DATA;HORA;VALOR;UNIDADE;SENSOR\n0;a;b;abc;c;d'));
  assert.throws(() => decode('bad header'));
});
class FakePort extends EventEmitter {
  static async list() { return [{ path: 'COM-TEST' }]; }
  constructor() { super(); this.sent = []; this.configured = false; }
  open(cb) { this.isOpen = true; cb(); }
  write(command, cb) {
    this.sent.push(command); cb();
    if (command.startsWith('#CP')) {
      if (command.startsWith('#CP7')) this.configured = true;
      setImmediate(() => this.emit('data', Buffer.from('#OK.')));
    }
    if (command === '#REQUI.\n') setImmediate(() => this.emit('data', Buffer.from(this.configured ? '#VV03/5V.#STD11.' : '#VV03/5V.#STD10.')));
  }
  drain(cb) { cb(); }
  close(cb) { this.isOpen = false; this.emit('close'); cb(); }
}
test('serial flow: handshake, ACK sequence, collection, pause and reset on close', async () => {
  const collector = new Collector(FakePort);
  await collector.connect({ path: 'COM-TEST', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
  const port = collector.port;
  await collector.configure(config);
  assert.deepEqual(port.sent.slice(1, 8), configurationCommands(config));
  assert.equal(port.sent[8], '#REQUI.\n');
  await collector.play(); port.emit('data', Buffer.from('#D02550.#D-0100.'));
  assert.deepEqual(collector.rows.map(r => r.value), [25.5, -1]);
  await collector.pause(); port.emit('data', Buffer.from('#D00100.')); assert.equal(collector.rows.length, 2);
  await collector.close(); assert.equal(port.sent.at(-1), '#STOP_.\n'); assert.equal(collector.state.connected, false);
});
test('missing acknowledgements time out and disconnect cancels waits', async () => {
  const collector = new Collector(FakePort);
  await assert.rejects(collector.expect(() => true, () => {}, 15), /não respondeu/);
  await collector.close();
  assert.equal(collector.listenerCount('frame'), 0);
});
test('demo collects, pauses, clears and prevents duplicate starts', async () => {
  const collector = new Collector(FakePort);
  await collector.connect({ path: 'DEMO' });
  await assert.rejects(collector.play(), /preparado/);
  await collector.configure(config); await collector.play(); const timer = collector.timer; await collector.play(); assert.equal(collector.timer, timer);
  // Não dependa de um tempo fixo do scheduler do Windows. Em máquinas ocupadas,
  // setInterval(20) pode ser atrasado e tornar o teste intermitente.
  await waitFor(() => collector.rows.length >= 20, { timeout: 2000, interval: 20 });
  await collector.pause();
  assert.ok(collector.rows.length >= 20); assert.equal(collector.state.running, false);
  collector.clear(); assert.equal(collector.rows.length, 0); await collector.close();
});
