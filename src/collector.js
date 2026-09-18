'use strict';

const { EventEmitter } = require('node:events');
const { FrameParser, sensors, configurationCommands, REQUIRED_FIRMWARE, firmwareCompatible } = require('./protocol');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class Collector extends EventEmitter {
  constructor(SerialPort) {
    super();
    this.SerialPort = SerialPort;
    this.rows = [];
    this.parser = new FrameParser();
    this.port = null;
    this.config = null;
    this.timer = null;
    this.intentionalClose = false;
    this.silentTransport = false;

    this.state = {
      connected: false,
      configured: false,
      healthy: false,
      running: false,
      busy: false,
      searching: false,
      version: '—',
      requiredVersion: REQUIRED_FIRMWARE,
      firmwareCompatible: false,
      protocolResponsive: false,
      updateReason: '',
      baudRate: 0,
      versionCheckInProgress: false,
      versionCheckComplete: false,
      path: '',
      demo: false
    };
  }

  update(patch) {
    Object.assign(this.state, patch);
    this.emit('state', { ...this.state });
  }

  async list() {
    return this.SerialPort.list();
  }

  waitOptional(predicate, timeout = 1500) {
    return new Promise(resolve => {
      const cleanup = () => {
        clearTimeout(timer);
        this.off('frame', onFrame);
      };
      const onFrame = frame => {
        if (predicate(frame)) {
          cleanup();
          resolve(frame);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeout);
      this.on('frame', onFrame);
    });
  }

  isValidSerialPath(port) {
    const serialPath = String(port?.path || '');

    // Windows: portas seriais tradicionais (COM3, COM34, ...).
    if (process.platform === 'win32') {
      return /^COM\d+$/i.test(serialPath);
    }

    // Linux/WSL: dispositivos USB CDC/ACM e conversores USB-seriais.
    // Ignora /dev/ttyS0, /dev/ttyS1... do WSL, que não são a coletora USB.
    if (process.platform === 'linux') {
      return (
        /^\/dev\/ttyACM\d+$/i.test(serialPath) ||
        /^\/dev\/ttyUSB\d+$/i.test(serialPath)
      );
    }

    // macOS: portas seriais USB normalmente aparecem em /dev/cu.* ou /dev/tty.*.
    if (process.platform === 'darwin') {
      return (
        serialPath.startsWith('/dev/cu.') ||
        serialPath.startsWith('/dev/tty.')
      );
    }

    // Em plataformas desconhecidas, não bloqueia a enumeração.
    return Boolean(serialPath);
  }

  candidateScore(port) {
    const text = [
      port.manufacturer,
      port.friendlyName,
      port.pnpId,
      port.vendorId,
      port.productId,
      port.path
    ].filter(Boolean).join(' ').toLowerCase();

    let score = 0;
    const vid = String(port.vendorId || '').replace(/^0x/i, '').toLowerCase();
    const pid = String(port.productId || '').replace(/^0x/i, '').toLowerCase();

    if (/arduino|uno/.test(text)) score += 100;
    if (/wch|ch340|ch341|qinheng/.test(text)) score += 80;
    if (/usb.serial|usb serial|serial usb|ftdi|cp210/.test(text)) score += 50;

    // VIDs comuns em Arduino Uno e conversores USB-seriais usados em clones.
    if (['2341', '2a03'].includes(vid)) score += 120; // Arduino/Genuino
    if (vid === '1a86') score += 90;                 // WCH CH340/CH341
    if (vid === '10c4') score += 70;                 // Silicon Labs CP210x
    if (vid === '0403') score += 70;                 // FTDI
    if (vid === '067b') score += 60;                 // Prolific
    if (port.vendorId) score += 20;
    // Prioriza caminhos seriais típicos de cada sistema operacional.
    // Isso ajuda inclusive quando o driver não informa fabricante/VID/PID.
    const serialPath = String(port.path || '');
    if (/^COM\d+$/i.test(serialPath)) score += 20;
    if (/^\/dev\/ttyACM\d+$/i.test(serialPath)) score += 50;
    if (/^\/dev\/ttyUSB\d+$/i.test(serialPath)) score += 40;
    if (/^\/dev\/(cu|tty)\./i.test(serialPath)) score += 30;

    if (/bluetooth/.test(text)) score -= 200;
    void pid;
    return score;
  }

  async autoConnect() {
    if (this.state.connected || this.state.busy) return { ...this.state };

    this.update({ searching: true });
    let ports = [];
    try {
      ports = await this.list();
    } catch (error) {
      this.update({ searching: false });
      throw error;
    }

    ports = ports
      // No Linux/WSL, remove /dev/ttyS* e mantém apenas portas USB seriais
      // (/dev/ttyACM* e /dev/ttyUSB*). No Windows mantém COM*.
      .filter(port => this.isValidSerialPath(port))
      .filter(port => !/bluetooth/i.test([
        port.manufacturer,
        port.friendlyName,
        port.pnpId,
        port.path
      ].filter(Boolean).join(' ')))
      .map(port => ({ ...port, _score: this.candidateScore(port) }))
      .sort((a, b) => b._score - a._score);

    for (const port of ports) {
      // V03/5 trabalha em 115200. Se o USB for claramente um Arduino/USB-Serial,
      // a porta permanece aberta mesmo quando outro firmware não entende #REQUI.
      // Isso permite abrir o atualizador automaticamente usando a porta serial detectada.
      const likelyHardware = port._score >= 70;
      if (!likelyHardware && port._score < 20) continue;

      try {
        await this.connect({
          path: port.path,
          baudRate: 115200,
          dataBits: 8,
          stopBits: 1,
          parity: 'none'
        }, {
          silent: true,
          auto: true,
          acceptUnresponsive: likelyHardware
        });

        if (this.state.connected) {
          this.update({ searching: false });
          return { ...this.state };
        }
      } catch {
        // Continua procurando outra porta. Uma porta fortemente identificada como
        // Arduino/CH340/CP210 normalmente é retida por acceptUnresponsive.
      }
    }

    this.update({ searching: false });
    return { ...this.state };
  }

  async connect(options, internal = {}) {
    if (this.state.connected || this.state.busy) throw new Error('Já existe uma conexão ou operação em andamento.');
    if (!options || typeof options.path !== 'string' || !options.path) throw new Error('Porta serial inválida.');

    this.update({ busy: true });
    this.parser = new FrameParser();
    this.silentTransport = !!internal.silent;

    try {
      if (options.path === 'DEMO') {
        this.update({
          connected: true,
          demo: true,
          healthy: true,
          configured: false,
          version: 'DEMO',
          requiredVersion: REQUIRED_FIRMWARE,
          firmwareCompatible: true,
          protocolResponsive: true,
          updateReason: '',
          baudRate: 115200,
          versionCheckInProgress: false,
          versionCheckComplete: true,
          path: 'Demonstração'
        });
        return;
      }

      if (![9600, 19200, 38400, 57600, 115200].includes(options.baudRate)
        || ![5, 6, 7, 8].includes(options.dataBits)
        || ![1, 1.5, 2].includes(options.stopBits)
        || !['none', 'even', 'odd', 'mark', 'space'].includes(options.parity)) {
        throw new Error('Parâmetros seriais inválidos.');
      }

      const port = new this.SerialPort({
        path: options.path,
        baudRate: options.baudRate,
        dataBits: options.dataBits,
        stopBits: options.stopBits,
        parity: options.parity,
        autoOpen: false
      });

      this.port = port;
      this.intentionalClose = false;

      port.on('data', chunk => this.receive(chunk));
      port.on('error', error => {
        if (!this.silentTransport) this.emit('notice', error.message);
        this.emit('transport-error', error);
      });
      port.on('close', () => {
        if (!this.intentionalClose) {
          this.emit('transport-error', new Error('Porta serial desconectada.'));
          if (!this.silentTransport) this.emit('notice', 'A placa foi desconectada. O software tentará reconectar automaticamente.');
        }
        this.update({
          connected: false,
          configured: false,
          running: false,
          healthy: false,
          firmwareCompatible: false,
          protocolResponsive: false,
          updateReason: '',
          baudRate: 0,
          version: '—',
          versionCheckInProgress: false,
          versionCheckComplete: false,
          path: ''
        });
      });

      await new Promise((resolve, reject) => port.open(error => error ? reject(error) : resolve()));

      this.update({
        connected: true,
        demo: false,
        configured: false,
        healthy: false,
        version: '—',
        requiredVersion: REQUIRED_FIRMWARE,
        firmwareCompatible: false,
        protocolResponsive: false,
        updateReason: '',
        baudRate: options.baudRate,
        versionCheckInProgress: true,
        versionCheckComplete: false,
        path: options.path
      });

      // O Arduino Uno costuma reiniciar quando a porta serial é aberta.
      // Durante esse período a presença USB já é conhecida, mas ainda não se
      // conclui nada sobre o firmware.
      await delay(internal.auto ? 1500 : 1900);

      // Handshake explícito em 115200. O firmware esperado responde rapidamente.
      // Se a porta USB for reconhecida como hardware provável, ausência de resposta
      // NÃO descarta a COM: ela é mantida para permitir a gravação automática.
      let versionFrame = null;
      let statusFrame = null;
      const attempts = internal.auto ? 2 : 3;
      const replyTimeout = options.baudRate === 115200 ? 900 : 2200;

      for (let attempt = 0; attempt < attempts; attempt++) {
        const versionWait = this.waitOptional(frame => frame.type === 'version', replyTimeout);
        const statusWait = this.waitOptional(frame => frame.type === 'status', replyTimeout);

        await this.write('#REQUI.\n');
        [versionFrame, statusFrame] = await Promise.all([versionWait, statusWait]);

        if (versionFrame && statusFrame) break;
        if (versionFrame || statusFrame) break;
        if (attempt + 1 < attempts) await delay(120);
      }

      const protocolResponsive = !!(versionFrame || statusFrame || this.state.healthy);
      const compatible = !!versionFrame && firmwareCompatible(this.state.version);

      if (!protocolResponsive && !internal.acceptUnresponsive) {
        throw new Error('A porta serial não respondeu ao protocolo da placa.');
      }

      let updateReason = '';
      if (!protocolResponsive) updateReason = 'no-response';
      else if (!versionFrame) updateReason = 'version-missing';
      else if (!compatible) updateReason = 'version-mismatch';
      else if (!statusFrame || !this.state.healthy) updateReason = 'status-invalid';

      this.update({
        firmwareCompatible: compatible && !!statusFrame && this.state.healthy,
        protocolResponsive,
        updateReason,
        versionCheckInProgress: false,
        versionCheckComplete: true
      });

    } catch (error) {
      await this.close({ silent: true });
      throw error;
    } finally {
      this.silentTransport = false;
      this.update({ busy: false });
    }
  }

  receive(chunk) {
    for (const frame of this.parser.push(chunk)) {
      if (frame.type === 'status') this.update({ healthy: frame.healthy, configured: frame.configured, protocolResponsive: true });
      if (frame.type === 'version') this.update({ version: frame.version, firmwareCompatible: firmwareCompatible(frame.version), protocolResponsive: true });
      if (frame.type === 'data' && this.config && this.state.running) this.sample(frame.raw);
      this.emit('frame', frame);
    }
  }

  sample(raw) {
    if (this.rows.length >= 250000) {
      this.pause().catch(error => this.emit('notice', error.message));
      this.emit('notice', 'Limite de 250.000 amostras atingido. Exporte e limpe a coleta para continuar.');
      return;
    }

    const sensor = sensors[this.config.sensor];
    const now = new Date();
    const row = {
      id: this.rows.length,
      date: now.toLocaleDateString('pt-BR'),
      time: now.toLocaleTimeString('pt-BR', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      }),
      value: raw / sensor.scale,
      sensor: sensor.name,
      unit: sensor.unit
    };
    this.rows.push(row);
    this.emit('sample', row);
  }

  expect(predicate, action, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.off('frame', onFrame);
        this.off('transport-error', onError);
      };
      const onError = error => {
        cleanup();
        reject(error);
      };
      const onFrame = frame => {
        if (predicate(frame)) {
          cleanup();
          resolve(frame);
        }
      };
      const timer = setTimeout(() => onError(new Error('A placa não respondeu no tempo esperado.')), timeout);
      this.on('frame', onFrame);
      this.on('transport-error', onError);
      Promise.resolve().then(action).catch(onError);
    });
  }

  async write(command) {
    if (!this.port?.isOpen) throw new Error('Porta serial não está aberta.');
    await new Promise((resolve, reject) => this.port.write(command, error => {
      if (error) return reject(error);
      this.port.drain(error => error ? reject(error) : resolve());
    }));
  }

  async configure(config) {
    const commands = configurationCommands(config);
    if (!this.state.connected || !this.state.healthy || this.state.busy || this.state.running) throw new Error('A placa ainda não está pronta para receber o experimento.');
    if (!this.state.demo && !this.state.firmwareCompatible) throw new Error(`Firmware incompatível. Atualize a placa para ${REQUIRED_FIRMWARE}.`);

    this.update({ busy: true, configured: false });
    try {
      for (let i = 0; i < commands.length; i++) {
        if (this.state.demo) await delay(40);
        else await this.expect(frame => frame.type === 'ack', () => this.write(commands[i]));
        this.emit('progress', i + 1);
      }

      // O firmware revisado nao anuncia mais o estado espontaneamente apos CP7.
      // Depois de receber o ACK do CP7, o software consulta explicitamente a placa
      // com #REQUI. e so considera a configuracao pronta quando recebe #STD11.
      if (!this.state.demo && !this.state.configured) {
        await this.expect(
          frame => frame.type === 'status' && frame.configured,
          async () => {
            await this.write('#REQUI.\n');
          },
          3500
        );
      }

      this.config = { ...config };
      this.update({ configured: true });
    } catch (error) {
      await this.close({ silent: true });
      throw error;
    } finally {
      this.update({ busy: false });
    }
  }

  async play() {
    if (!this.state.connected || !this.state.configured || !this.config || this.state.busy) throw new Error('O experimento ainda não foi preparado.');
    if (this.state.running) return;
    if (this.rows.length >= 250000) throw new Error('Exporte e limpe os dados antes de iniciar outra coleta.');

    if (this.state.demo) {
      this.timer = setInterval(() => {
        const id = this.config.sensor;
        const wave = Math.sin(this.rows.length / 8);
        let value;

        if (id >= 7) {
          // Sensores digitais: 0 ou 1.
          value = Number(wave > 0);
        } else if (id === 2) {
          // LDR em ADC.
          value = 500 + wave * 200;
        } else if (id === 3) {
          // Nível de água em ADC.
          value = 520 + wave * 260;
        } else if (id === 5) {
          // Potenciômetro V03/5 em ADC bruto.
          value = 512 + wave * 450;
        } else if (id === 1) {
          // Som mantém a escala histórica do protocolo (x100).
          value = 5 + wave * 2;
        } else if (id === 4) {
          // Umidade em percentual.
          value = 50 + wave * 25;
        } else {
          // Temperaturas.
          value = 25 + wave * 5;
        }

        this.sample(Math.round(value * sensors[id].scale));
      }, 20);
    } else {
      await this.write('#PLAY_.\n');
    }

    this.update({ running: true });
  }

  async pause() {
    if (this.state.busy) throw new Error('Aguarde a operação atual.');
    if (this.state.connected && !this.state.demo) await this.write('#PAUSA.\n');
    clearInterval(this.timer);
    this.update({ running: false });
  }

  async close({ silent = false } = {}) {
    clearInterval(this.timer);
    const port = this.port;
    this.intentionalClose = true;

    if (port?.isOpen) {
      try {
        await this.write('#STOP_.\n');
      } catch (error) {
        if (!silent) this.emit('notice', error.message);
      }
      await new Promise(resolve => port.close(() => resolve()));
    }

    this.port = null;
    this.config = null;
    this.update({
      connected: false,
      configured: false,
      running: false,
      healthy: false,
      demo: false,
      version: '—',
      requiredVersion: REQUIRED_FIRMWARE,
      firmwareCompatible: false,
      protocolResponsive: false,
      updateReason: '',
      baudRate: 0,
      versionCheckInProgress: false,
      versionCheckComplete: false,
      path: ''
    });
    this.intentionalClose = false;
  }

  clear() {
    this.rows = [];
    this.emit('reset');
  }
}

module.exports = { Collector };
