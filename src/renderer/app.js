'use strict';

const $ = id => document.getElementById(id);
const api = window.collector;

let sensors = [];
let experiments = [];
let state = {};
let rows = [];
let series = [];
let view = 'live';
let pending = false;
let requiredFirmware = 'V03/5';
let updaterReady = false;
let bundledFirmwareReady = false;
let lastFirmwarePrompt = '';
let autoConnectInFlight = false;
let configuredConfigKey = null;
let firmwareUpdating = false;
let firmwarePromptTimer = null;
let renderScheduled = false;
let appVersion = '1.16.0';
let appUpdateState = { status: 'idle', currentVersion: appVersion, availableVersion: '', progress: 0, message: '' };

const paletteSeries = {
  turquesa: ['#20d4bd', '#ff9d5a', '#a88aff', '#ff6f9e'],
  azul: ['#4da3ff', '#64d8ff', '#a88aff', '#ff8ea1'],
  roxo: ['#9b8cff', '#d17cff', '#55d6be', '#ff9d5a'],
  ambar: ['#f2b84b', '#ff7b54', '#70c1b3', '#8ea7ff']
};
let activePalette = 'turquesa';
let colors = paletteSeries[activePalette];
const zoom = { size: 300, offset: 0 };
const yZoom = { factor: 1 };
let drag = null;

const number = value => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function applyPalette(name, persist = true) {
  const next = paletteSeries[name] ? name : 'turquesa';
  activePalette = next;
  colors = paletteSeries[next];
  document.documentElement.dataset.palette = next;

  const select = $('palette-select');
  if (select && select.value !== next) select.value = next;

  if (persist) {
    try { localStorage.setItem('ave-palette', next); } catch {}
  }

  requestAnimationFrame(() => {
    if ($('chart')) chart();
  });
}

function loadPalette() {
  let saved = 'turquesa';
  try { saved = localStorage.getItem('ave-palette') || 'turquesa'; } catch {}
  applyPalette(saved, false);
}


function renderAppUpdateState() {
  const button = $('app-update-button');
  if (!button) return;

  const current = appUpdateState.currentVersion || appVersion || '—';
  const available = appUpdateState.availableVersion || '';
  const progress = Math.round(Number(appUpdateState.progress) || 0);
  button.classList.remove('available', 'downloading', 'ready', 'error');

  switch (appUpdateState.status) {
    case 'checking':
      button.textContent = `Verificando v${current}`;
      button.disabled = true;
      break;
    case 'available':
      button.textContent = `Atualizar v${available}`;
      button.classList.add('available');
      button.disabled = false;
      break;
    case 'downloading':
      button.textContent = `Baixando ${progress}%`;
      button.classList.add('downloading');
      button.disabled = true;
      break;
    case 'downloaded':
      button.textContent = 'Reiniciar e atualizar';
      button.classList.add('ready');
      button.disabled = false;
      break;
    case 'error':
      button.textContent = `Sistema v${current}`;
      button.classList.add('error');
      button.disabled = false;
      break;
    default:
      button.textContent = `Sistema v${current}`;
      button.disabled = false;
      break;
  }

  button.title = appUpdateState.message || 'Clique para verificar atualização do software';
}

async function handleAppUpdateClick() {
  try {
    if (appUpdateState.status === 'available') {
      message(`Baixando atualização ${appUpdateState.availableVersion}…`);
      await api.downloadAppUpdate();
      return;
    }
    if (appUpdateState.status === 'downloaded') {
      message('Reiniciando para instalar a atualização…');
      await api.installAppUpdate();
      return;
    }
    const result = await api.checkAppUpdate();
    if (result?.status === 'current') message(`Você já está na versão mais recente (${result.currentVersion}).`);
  } catch (error) {
    message(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);
  }
}


function message(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
}

async function run(action) {
  if (pending) return;
  pending = true;
  controls();
  try {
    await action();
  } catch (error) {
    message(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);
  } finally {
    pending = false;
    controls();
  }
}

function option(value, label) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
}

function safeOutput(input) {
  return ['D9', 'D8', 'D7', 'D6', 'D5'].find(port => port !== input) || 'D9';
}

function defaultReference(sensor) {
  if (!sensor) return 0;
  if (Number.isFinite(Number(sensor.defaultReference))) return Number(sensor.defaultReference);
  return sensor.id >= 7 ? 1 : 100;
}

function defaultComparison(sensor) {
  if (!sensor) return 2;
  if (Number.isInteger(Number(sensor.defaultComparison))) return Number(sensor.defaultComparison);
  return sensor.id >= 7 ? 1 : 2;
}

function buildExperiments() {
  const potentiometer = sensors.find(sensor => /potenciômetro/i.test(sensor.name));
  const list = [];

  if (potentiometer) {
    list.push({
      id: 'manual-pot-led',
      label: 'Potenciômetro + LED · exemplo do manual',
      title: 'Potenciômetro rotativo com LED',
      description: 'Potenciômetro em A0, referência de 500 ADC, condição maior ou igual e LED em D5 com estado normal desligado.',
      portLabel: 'A0 → D5',
      config: {
        sensor: potentiometer.id,
        input: 'A0',
        comparison: 4,
        reference: 500,
        actuator: 0,
        output: 'D5',
        level: 0
      }
    });
  }

  const firstSensor = sensors[0];
  if (firstSensor) {
    const input = firstSensor.inputs[0];
    list.push({
      id: 'custom',
      label: 'Configuração personalizada · sensor + condição + atuador',
      title: 'Experimento personalizado',
      description: 'Escolha o sensor, a porta de entrada, a condição menor/igual/maior, o valor de referência e a saída que o firmware deve controlar.',
      portLabel: 'EDITAR',
      config: {
        sensor: firstSensor.id,
        input,
        comparison: defaultComparison(firstSensor),
        reference: defaultReference(firstSensor),
        actuator: 0,
        output: safeOutput(input),
        level: 0
      }
    });
  }

  for (const sensor of sensors) {
    if (potentiometer && sensor.id === potentiometer.id) continue;
    const input = sensor.inputs[0];
    list.push({
      id: `read-${sensor.id}`,
      label: `Leitura · ${sensor.name}`,
      title: sensor.name,
      description: `Use ${sensor.name.toLowerCase()} em ${input}. Você pode alterar abaixo a porta, a condição, a referência e o atuador antes de iniciar.`,
      portLabel: input,
      config: {
        sensor: sensor.id,
        input,
        comparison: defaultComparison(sensor),
        reference: defaultReference(sensor),
        actuator: 0,
        output: safeOutput(input),
        level: 0
      }
    });
  }

  experiments = list;
}

function currentExperiment() {
  return experiments.find(experiment => experiment.id === $('experiment').value) || experiments[0];
}

function selectedSensor() {
  return sensors[Number($('sensor').value)] || sensors[0];
}

function updateInputOptions(preferred = null) {
  const sensor = selectedSensor();
  if (!sensor) return;
  const previous = preferred || $('input').value;
  $('input').replaceChildren(...sensor.inputs.map(port => option(port, port)));
  if (sensor.inputs.includes(previous)) $('input').value = previous;
  updateOutputOptions();
  updateSensorNote();
  updateConditionSummary();
}

function updateOutputOptions(preferred = null) {
  const previous = preferred || $('output').value;
  const values = ['D5', 'D6', 'D7', 'D8', 'D9'].filter(port => port !== $('input').value);
  $('output').replaceChildren(...values.map(port => option(port, port)));
  if (values.includes(previous)) $('output').value = previous;
  updateConditionSummary();
}

function updateSensorNote() {
  const sensor = selectedSensor();
  if (!sensor) return;
  if (sensor.id === 14) {
    $('sensor-note').textContent = 'Sensor de chama V03/5: entrada fixa A6. O firmware lê o ADC6 e converte o sinal para 0 ou 1.';
  } else if (sensor.id === 5) {
    $('sensor-note').textContent = 'Potenciômetro rotativo: leitura analógica ADC de 0 a 1023. Padrão: maior ou igual a 500.';
  } else if (sensor.id === 3) {
    $('sensor-note').textContent = 'Sensor de nível da água: leitura analógica ADC de 0 a 1023.';
  } else if (sensor.id === 1) {
    $('sensor-note').textContent = 'Sensor de som: a escala histórica do protocolo é preservada. Referência padrão: 1.';
  } else {
    $('sensor-note').textContent = `Referência em ${sensor.unit || '0 / 1'}. Quando a condição é verdadeira, o firmware inverte o estado normal configurado para a saída.`;
  }
}

function comparisonLabel(value) {
  return ({
    0: 'menor que',
    1: 'igual a',
    2: 'maior que',
    3: 'menor ou igual a',
    4: 'maior ou igual a'
  })[Number(value)] || 'comparado com';
}

function actuatorLabel(value) {
  return ({ 0: 'LED', 1: 'buzzer ativo', 2: 'buzzer passivo' })[Number(value)] || 'atuador';
}

function configFromForm() {
  const referenceText = String($('reference').value).trim().replace(',', '.');
  return {
    sensor: Number($('sensor').value),
    input: $('input').value,
    comparison: Number($('comparison').value),
    reference: referenceText,
    actuator: Number($('actuator').value),
    output: $('output').value,
    level: Number($('level').value)
  };
}

function configKey(config) {
  return JSON.stringify(config);
}

function updateConditionSummary() {
  const sensor = selectedSensor();
  if (!sensor || !$('output').value) return;
  const normalOn = Number($('level').value) === 1;
  const trueAction = normalOn ? 'DESLIGAR' : 'LIGAR';
  const falseAction = normalOn ? 'ligado' : 'desligado';
  const ref = String($('reference').value || '—').trim();
  const unit = sensor.unit ? ` ${sensor.unit}` : '';
  $('condition-text').innerHTML = `Se <strong>${sensor.name}</strong> em <strong>${$('input').value}</strong> ficar <strong>${comparisonLabel($('comparison').value)} ${ref}${unit}</strong>, o <strong>${actuatorLabel($('actuator').value)}</strong> em <strong>${$('output').value}</strong> será <strong>${trueAction}</strong>. Caso contrário, permanece ${falseAction}.`;
}

function applyConfigToForm(config) {
  if (!config) return;
  $('sensor').value = String(config.sensor);
  updateInputOptions(config.input);
  $('input').value = config.input;
  updateOutputOptions(config.output);
  $('comparison').value = String(config.comparison);
  $('reference').value = config.reference;
  $('actuator').value = String(config.actuator);
  $('level').value = String(config.level);
  if ([...$('output').options].some(node => node.value === config.output)) $('output').value = config.output;
  updateSensorNote();
  updateConditionSummary();
}

function renderExperiment() {
  const experiment = currentExperiment();
  if (!experiment) return;
  $('experiment-title').textContent = experiment.title;
  $('experiment-description').textContent = experiment.description;
  $('experiment-port').textContent = experiment.portLabel;
  applyConfigToForm(experiment.config);
  configuredConfigKey = null;
  $('config-progress').value = 0;

  if (state.running) {
    run(async () => {
      await api.pause();
      message('Experimento alterado. A coleta foi pausada. Ajuste a configuração e clique em Iniciar coleta.');
    });
  }

  controls();
}

function firmwareState() {
  if (!state.connected) return { label: `Necessário ${requiredFirmware}`, cls: '' };
  if (!state.versionCheckComplete || state.versionCheckInProgress) return { label: 'verificando…', cls: '' };
  if (state.firmwareCompatible) return { label: `${state.version} · compatível`, cls: 'ok' };
  if (state.updateReason === 'no-response' || state.protocolResponsive === false) return { label: 'sem resposta · atualizar', cls: 'warn' };
  if (state.updateReason === 'version-missing') return { label: 'versão não identificada · atualizar', cls: 'warn' };
  return { label: `${state.version || '—'} · atualizar`, cls: 'warn' };
}

function controls() {
  const busy = pending || state.busy;
  const firmwareOk = !!state.firmwareCompatible;

  $('play').textContent = state.running ? '▶ Coletando' : busy ? 'Preparando…' : '▶ Iniciar coleta';

  $('experiment').disabled = state.running || busy;
  $('config-fields').disabled = state.running || busy;
  $('reset-config').disabled = state.running || busy;
  // O botão continua disponível mesmo sem placa: ao clicar, a aplicação força uma nova busca automática.
  $('play').disabled = busy || state.running;
  $('pause').disabled = busy || !state.running;
  $('open').disabled = state.running || busy;

  for (const id of ['save', 'clear', 'add-series', 'clear-series', 'export-image', 'zoom-in', 'zoom-out', 'zoom-y-in', 'zoom-y-out', 'zoom-reset', 'zoom-fit', 'fullscreen-graph']) {
    $(id).disabled = busy;
  }
  if (series.length >= 4) $('add-series').disabled = true;

  const connected = !!state.connected;
  const protocolOk = !!state.healthy && !!state.protocolResponsive;
  const searching = !connected && (state.searching || state.busy);

  $('connection').textContent = connected
    ? `● Cabo conectado${state.path ? ` · ${state.path}` : ''}`
    : searching
      ? '● Cabo desconectado · procurando placa…'
      : '● Cabo desconectado';

  $('connection').classList.toggle('connected', connected);
  $('connection').classList.toggle('disconnected', !connected);

  $('device-dot').classList.toggle('connected', connected);
  $('device-dot').classList.toggle('disconnected', !connected);
  $('device-dot').classList.toggle('searching', searching);

  $('device-card').classList.toggle('usb-connected', connected);
  $('device-card').classList.toggle('usb-disconnected', !connected);

  $('device-title').textContent = connected
    ? protocolOk ? 'Arduino Uno conectado' : 'Arduino Uno detectado no USB'
    : searching
      ? 'Cabo USB desconectado · procurando'
      : 'Cabo USB desconectado';

  $('device-detail').textContent = connected
    ? protocolOk
      ? `Conexão ativa${state.path ? ` em ${state.path}` : ''}. Firmware respondendo normalmente.`
      : `USB reconhecido${state.path ? ` em ${state.path}` : ''}, mas o firmware não respondeu ao protocolo esperado. A atualização será oferecida automaticamente.`
    : 'Conecte o cabo USB do Arduino Uno. Assim que a placa aparecer, a conexão será feita automaticamente.';

  const fw = firmwareState();
  $('firmware').textContent = state.connected ? `${state.version || '—'} / esperado ${requiredFirmware}` : requiredFirmware;
  $('firmware-chip').textContent = `Firmware ${fw.label}`;
  $('firmware-chip').classList.remove('ok', 'warn');
  if (fw.cls) $('firmware-chip').classList.add(fw.cls);
  $('firmware-update').hidden = !state.connected || !state.versionCheckComplete || state.firmwareCompatible || !$('firmware-modal').hidden;

  $('run-state').textContent = state.busy
    ? 'Preparando'
    : state.running
      ? 'Coletando'
      : state.connected
        ? 'Pronto'
        : 'Aguardando';

  $('mode').textContent = state.running
    ? 'Aquisição em tempo real'
    : state.connected && !state.versionCheckComplete
      ? 'Verificando firmware da placa…'
      : connected && firmwareOk && protocolOk
        ? 'Conexão e firmware validados'
        : connected && state.updateReason === 'no-response'
          ? 'USB reconhecido · firmware sem resposta'
          : connected
            ? 'Atualização de firmware necessária'
            : 'Conexão automática ativa';

  $('board-status').textContent = !state.connected
    ? 'Conecte o Arduino Uno. A detecção da porta é automática.'
    : !state.versionCheckComplete
      ? 'USB encontrado. Solicitando a identificação do firmware…'
      : state.updateReason === 'no-response'
        ? `USB reconhecido${state.path ? ` em ${state.path}` : ''}, mas o firmware não respondeu. Atualize para ${requiredFirmware}.`
        : !firmwareOk
          ? `Firmware ${state.version && state.version !== '—' ? state.version : 'não identificado'}. Atualize para ${requiredFirmware}.`
          : state.running
            ? 'Coleta em andamento. Observe o gráfico em tempo real.'
            : 'Placa pronta. Configure o sensor e clique em Iniciar coleta.';
}

function metrics() {
  const last = rows.at(-1);
  $('count').textContent = number(rows.length);
  $('latest').textContent = last ? `${number(last.value)} ${last.unit}` : '—';
  $('reading-sensor').textContent = last?.sensor || 'Aguardando coleta';
}

function table() {
  $('rows').replaceChildren(...rows.slice(-500).map(row => {
    const tr = document.createElement('tr');
    for (const value of [row.id, row.date, row.time, number(row.value), row.unit, row.sensor]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    return tr;
  }));
}

function chartSource() {
  const sourceSets = view === 'analysis' ? series : [{ name: 'Coleta', rows }];
  const maxLength = sourceSets.reduce((max, set) => Math.max(max, set.rows.length), 0);
  if (!maxLength) return { sets: sourceSets.map(set => ({ ...set, rows: [] })), maxLength: 0, start: 0, end: 0, visible: 0 };

  const size = clamp(Math.round(zoom.size), Math.min(20, maxLength), maxLength);
  const maxOffset = Math.max(0, maxLength - size);
  zoom.offset = clamp(Math.round(zoom.offset), 0, maxOffset);

  const end = maxLength - zoom.offset;
  const start = Math.max(0, end - size);
  const sets = sourceSets.map(set => ({ ...set, rows: set.rows.slice(start, end), baseIndex: start }));
  return { sets, maxLength, start, end, visible: end - start };
}

function updateZoomLabel(meta) {
  if (!meta.maxLength) {
    $('zoom-label').textContent = 'Sem dados';
    return;
  }
  $('zoom-label').textContent = `${meta.visible} · Y ${yZoom.factor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`;
  const suffix = zoom.offset ? ` · ${zoom.offset} atrás` : ' · tempo real';
  $('chart-caption').textContent = view === 'analysis'
    ? `Comparação por índice de amostra · ${meta.visible} visíveis${zoom.offset ? ` · deslocamento ${zoom.offset}` : ''}`
    : `${meta.visible} amostras visíveis${suffix} · todos os dados são preservados na exportação`;
}

function chart() {
  if (view === 'table') return;

  const canvas = $('chart');
  const bounds = canvas.getBoundingClientRect();
  const w = bounds.width;
  const h = bounds.height;
  const ratio = window.devicePixelRatio || 1;
  if (!w || !h) return;

  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.fillStyle = '#0a1018';
  ctx.fillRect(0, 0, w, h);

  const meta = chartSource();
  updateZoomLabel(meta);
  const sets = meta.sets;

  let low = Infinity;
  let high = -Infinity;
  let length = 0;
  for (const set of sets) {
    length = Math.max(length, set.rows.length);
    for (const row of set.rows) {
      low = Math.min(low, row.value);
      high = Math.max(high, row.value);
    }
  }

  if (!length) {
    ctx.fillStyle = '#65768b';
    ctx.font = '13px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(view === 'analysis' ? 'Adicione arquivos para comparar as medições' : 'Inicie a coleta para visualizar as medições', w / 2, h / 2);
    return;
  }

  const rawCenter = (high + low) / 2;
  const rawSpan = (high - low) || 2;
  const paddedSpan = rawSpan * 1.30;
  const visibleSpan = paddedSpan / yZoom.factor;
  low = rawCenter - visibleSpan / 2;
  high = rawCenter + visibleSpan / 2;

  const left = 64;
  const right = w - 22;
  const top = 28;
  const bottom = h - 38;
  const x = i => left + i / Math.max(1, length - 1) * (right - left);
  const y = value => bottom - (value - low) / (high - low) * (bottom - top);

  ctx.font = '10px Segoe UI';
  for (let i = 0; i <= 5; i++) {
    const value = low + (high - low) * i / 5;
    const py = y(value);
    ctx.strokeStyle = '#1d2936';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();

    ctx.fillStyle = '#66778b';
    ctx.textAlign = 'right';
    ctx.fillText(number(value), left - 10, py + 4);

    const index = Math.round((length - 1) * i / 5);
    const actualIndex = meta.start + index;
    ctx.textAlign = 'center';
    const liveId = view === 'live' ? sets[0].rows[index]?.id : actualIndex;
    ctx.fillText(String(liveId ?? actualIndex), x(index), h - 14);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#728399';
  ctx.fillText(view === 'analysis' ? 'Valor · unidades conforme legenda' : (rows.at(-1)?.unit || 'Estado (0 / 1)'), left, 14);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
  ctx.clip();

  sets.forEach((set, index) => {
    if (!set.rows.length) return;
    ctx.strokeStyle = colors[index];
    ctx.fillStyle = colors[index];
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = Math.max(1, Math.ceil(set.rows.length / Math.max(1, Math.floor(w))));
    const points = [];
    for (let i = 0; i < set.rows.length; i += step) {
      let min = i;
      let max = i;
      for (let j = i + 1; j < Math.min(i + step, set.rows.length); j++) {
        if (set.rows[j].value < set.rows[min].value) min = j;
        if (set.rows[j].value > set.rows[max].value) max = j;
      }
      points.push(...[...new Set([i, min, max, Math.min(i + step - 1, set.rows.length - 1)])].sort((a, b) => a - b));
    }

    points.forEach((i, j) => {
      if (j) ctx.lineTo(x(i), y(set.rows[i].value));
      else ctx.moveTo(x(i), y(set.rows[i].value));
    });
    ctx.stroke();

    if ($('markers').checked && set.rows.length <= 300) {
      for (const i of points) {
        ctx.beginPath();
        ctx.arc(x(i), y(set.rows[i].value), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if ($('labels').checked) {
      ctx.textAlign = 'center';
      ctx.font = '9px Segoe UI';
      for (let i = 0; i < set.rows.length; i += Math.max(1, Math.ceil(set.rows.length / 20))) {
        ctx.fillText(number(set.rows[i].value), x(i), y(set.rows[i].value) - 9);
      }
    }
  });
  ctx.restore();
}

function render() {
  metrics();
  if (view === 'table') table();
  else chart();
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

function switchView(next) {
  view = next;
  zoom.offset = 0;
  zoom.size = 300;
  yZoom.factor = 1;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('table-panel').hidden = view !== 'table';
  $('graph-panel').hidden = view === 'table';
  $('analysis-tools').hidden = view !== 'analysis';
  $('chart-title').textContent = view === 'analysis' ? 'Comparação de séries' : 'Série temporal';
  render();
}

function zoomBy(factor) {
  const meta = chartSource();
  if (!meta.maxLength) return;
  const previous = zoom.size;
  zoom.size = clamp(Math.round(zoom.size * factor), Math.min(20, meta.maxLength), meta.maxLength);
  if (zoom.offset && zoom.size > previous) zoom.offset = Math.max(0, zoom.offset - Math.round((zoom.size - previous) / 2));
  chart();
}

function resetZoom() {
  zoom.size = 300;
  zoom.offset = 0;
  yZoom.factor = 1;
  chart();
}

function fitZoom() {
  const meta = chartSource();
  zoom.size = Math.max(1, meta.maxLength || 300);
  zoom.offset = 0;
  yZoom.factor = 1;
  chart();
}

function zoomYBy(factor) {
  if (!chartSource().maxLength) return;
  yZoom.factor = clamp(yZoom.factor * factor, 1, 20);
  chart();
}

async function ensureAutoConnection(showFeedback = false) {
  if (state.connected || state.busy || autoConnectInFlight) return state.connected;
  autoConnectInFlight = true;
  try {
    if (showFeedback) message('Procurando o Arduino Uno automaticamente…');
    const result = await api.autoConnect();
    if (result) state = result;
    controls();
    maybePromptFirmware();
    if (state.connected) {
      if (showFeedback) {
        if (state.healthy && state.firmwareCompatible) message('Arduino Uno localizado e firmware validado.');
        else message('Hardware reconhecido no USB. O firmware será verificado/atualizado.', true);
      }
      return true;
    }
    if (showFeedback) message('Arduino Uno não localizado. Conecte a placa ao USB; a busca continuará automaticamente.', true);
    return false;
  } catch (error) {
    if (showFeedback) message(error.message, true);
    return false;
  } finally {
    autoConnectInFlight = false;
  }
}

async function startCollection() {
  const experiment = currentExperiment();
  if (!experiment) throw new Error('Não foi possível carregar a configuração base.');

  if (!state.connected) {
    const connected = await ensureAutoConnection(true);
    if (!connected) return;
  }

  if (!state.firmwareCompatible || !state.healthy || state.protocolResponsive === false) {
    await openFirmwareModal(true);
    return;
  }

  const config = configFromForm();
  const key = configKey(config);

  $('play').textContent = 'Preparando…';
  $('config-progress').value = 0;
  if (configuredConfigKey !== key || !state.configured) {
    await api.configure(config);
    configuredConfigKey = key;
  }

  zoom.offset = 0;
  await api.play();
  const sensor = selectedSensor();
  message(`Coleta iniciada: ${sensor?.name || 'sensor'} em ${config.input}. Condição ${comparisonLabel(config.comparison)} ${config.reference}.`);
}

// ------------------------------------------------------------
// Firmware embutido
// ------------------------------------------------------------

async function openFirmwareModal(auto = false) {
  $('firmware-current').textContent = state.version && state.version !== '—' ? state.version : 'Não identificado';
  $('firmware-required').textContent = requiredFirmware;
  $('firmware-modal').hidden = false;
  $('flash-log').hidden = true;
  $('flash-log').textContent = '';
  $('flash-firmware').textContent = 'Iniciar atualização';

  let toolInfo = null;
  let firmwareInfo = null;
  try {
    [toolInfo, firmwareInfo] = await Promise.all([api.firmwareToolInfo(), api.bundledFirmwareInfo()]);
  } catch {}

  updaterReady = !!toolInfo?.available;
  bundledFirmwareReady = !!firmwareInfo?.available;

  $('bundled-firmware-name').textContent = firmwareInfo?.available ? `firmware/${firmwareInfo.name}` : 'firmware/firm_keystudio.ino.hex';
  $('updater-status').classList.toggle('ok', updaterReady && bundledFirmwareReady);
  $('updater-status').classList.toggle('error', !(updaterReady && bundledFirmwareReady));

  if (!bundledFirmwareReady) {
    $('updater-status').textContent = 'Nenhum firmware .hex foi encontrado na pasta firmware.';
  } else if (!updaterReady) {
    $('updater-status').textContent = 'AVRDUDE não encontrado. Instale o Arduino IDE para habilitar a atualização.';
  } else {
    $('updater-status').textContent = `Pronto para atualizar · ${toolInfo.source}`;
  }

  $('flash-firmware').disabled = !(updaterReady && bundledFirmwareReady && state.connected) || firmwareUpdating;
  if (auto) {
    if (state.updateReason === 'no-response' || state.protocolResponsive === false) {
      message(`USB reconhecido em ${state.path || 'porta serial'}, mas o firmware não respondeu. Atualize para ${requiredFirmware}.`, true);
    } else {
      const detected = state.version && state.version !== '—' ? state.version : 'não identificada';
      message(`Versão ${detected}. É necessário atualizar para ${requiredFirmware}.`, true);
    }
  }
}

function closeFirmwareModal() {
  if (firmwareUpdating) return;
  $('firmware-modal').hidden = true;
}

function maybePromptFirmware() {
  // A atualização não depende do usuário clicar no botão do card.
  // Assim que uma porta válida é aberta e a versão não é a esperada
  // (inclusive quando a versão não é informada), a janela é exibida sozinha.
  // Nunca abre o atualizador apenas porque a porta acabou de abrir.
  // Primeiro o Collector precisa concluir o pedido #REQUI. e marcar
  // versionCheckComplete=true.
  if (!state.connected || !state.versionCheckComplete || state.versionCheckInProgress || state.busy || state.firmwareCompatible || firmwareUpdating) {
    if (firmwarePromptTimer) {
      clearTimeout(firmwarePromptTimer);
      firmwarePromptTimer = null;
    }
    if (!state.connected) lastFirmwarePrompt = '';
    return;
  }

  const detected = state.version && state.version !== '—' ? state.version : 'NAO_IDENTIFICADA';
  const key = `${state.path || 'porta'}|${detected}|${requiredFirmware}`;

  // Se já está aberta para esta mesma placa/versão, não cria outra abertura.
  if (!$('firmware-modal').hidden && lastFirmwarePrompt === key) return;

  // Durante a conexão o coletor ainda pode estar finalizando o handshake.
  // Um pequeno atraso evita abrir/fechar a janela no meio das atualizações
  // de estado e garante que a versão final já esteja disponível.
  if (firmwarePromptTimer) clearTimeout(firmwarePromptTimer);
  firmwarePromptTimer = setTimeout(async () => {
    firmwarePromptTimer = null;

    if (!state.connected || state.firmwareCompatible || firmwareUpdating) return;

    const currentDetected = state.version && state.version !== '—' ? state.version : 'NAO_IDENTIFICADA';
    const currentKey = `${state.path || 'porta'}|${currentDetected}|${requiredFirmware}`;

    lastFirmwarePrompt = currentKey;
    await openFirmwareModal(true);
  }, 350);
}

async function reconnectAfterFirmware(timeoutMs = 18000) {
  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    const seconds = Math.max(0, Math.ceil((timeoutMs - (Date.now() - started)) / 1000));
    $('updater-status').textContent = `Gravação concluída · aguardando Arduino reiniciar (${seconds}s)`;

    await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 1800 : 900));

    try {
      const newState = await api.autoConnect();
      if (newState) state = newState;
      controls();
      if (state.connected && state.healthy && state.firmwareCompatible) return true;
    } catch {
      // Durante o reset o Arduino pode desaparecer temporariamente da porta COM.
    }
  }

  return false;
}

$('firmware-update').onclick = () => openFirmwareModal(false);
document.querySelectorAll('[data-close-firmware]').forEach(node => node.onclick = closeFirmwareModal);

$('flash-firmware').onclick = () => run(async () => {
  if (!state.connected) throw new Error('O Arduino Uno precisa estar conectado para atualizar.');
  if (!(updaterReady && bundledFirmwareReady)) throw new Error('O atualizador ainda não está pronto.');

  const port = state.path;
  firmwareUpdating = true;
  $('flash-firmware').disabled = true;
  $('flash-firmware').textContent = 'Atualizando…';
  document.querySelectorAll('[data-close-firmware]').forEach(node => { node.disabled = true; });
  $('flash-log').hidden = false;
  $('flash-log').textContent = 'Preparando atualização do firmware…\n';
  $('updater-status').classList.remove('ok', 'error');
  $('updater-status').textContent = 'Gravando firmware no Arduino Uno…';

  try {
    await api.flashBundledFirmware({ port });
    $('updater-status').classList.add('ok');
    $('updater-status').textContent = 'Gravação concluída. Reiniciando e verificando a placa…';

    const recognized = await reconnectAfterFirmware();

    if (recognized) {
      $('firmware-current').textContent = state.version || requiredFirmware;
      $('updater-status').classList.remove('error');
      $('updater-status').classList.add('ok');
      $('updater-status').textContent = `Firmware ${state.version} reconhecido com sucesso.`;
      message(`Firmware ${state.version} atualizado e validado. A placa está pronta para uso.`);
      lastFirmwarePrompt = '';

      // Mostra a confirmação rapidamente e volta sozinho à tela principal.
      await new Promise(resolve => setTimeout(resolve, 850));
      $('firmware-modal').hidden = true;
    } else {
      $('updater-status').classList.remove('ok');
      $('updater-status').classList.add('error');
      $('updater-status').textContent = `A atualização terminou, mas a versão ${requiredFirmware} ainda não foi reconhecida. Verifique o cabo USB e tente novamente.`;
      message('Firmware gravado, mas a placa ainda não confirmou a versão esperada.', true);
    }
  } finally {
    firmwareUpdating = false;
    document.querySelectorAll('[data-close-firmware]').forEach(node => { node.disabled = false; });
    $('flash-firmware').textContent = state.firmwareCompatible ? 'Atualização concluída' : 'Tentar novamente';
    $('flash-firmware').disabled = state.firmwareCompatible || !(updaterReady && bundledFirmwareReady && state.connected);
    controls();
  }
});

api.subscribeFirmware(event => {
  if (event.type !== 'log') return;
  $('flash-log').hidden = false;
  const lines = ($('flash-log').textContent + event.value + '\n').split('\n').slice(-80);
  $('flash-log').textContent = lines.join('\n');
  $('flash-log').scrollTop = $('flash-log').scrollHeight;
});

// ------------------------------------------------------------
// Eventos de interface
// ------------------------------------------------------------

loadPalette();
$('palette-select').onchange = event => applyPalette(event.target.value);
$('manual-button').onclick = () => run(async () => {
  const result = await api.openManual();
  if (result?.name) message(`Manual aberto: ${result.name}`);
});

$('app-update-button').onclick = handleAppUpdateClick;

$('experiment').onchange = renderExperiment;
$('sensor').onchange = () => {
  const sensor = selectedSensor();
  updateInputOptions();

  if (sensor) {
    $('comparison').value = String(defaultComparison(sensor));
    $('reference').value = String(defaultReference(sensor));
  }

  configuredConfigKey = null;
  $('config-progress').value = 0;
  updateSensorNote();
  updateConditionSummary();
};
$('input').onchange = () => {
  updateOutputOptions();
  configuredConfigKey = null;
  $('config-progress').value = 0;
};
for (const id of ['comparison', 'reference', 'actuator', 'output', 'level']) {
  $(id).addEventListener('input', () => {
    configuredConfigKey = null;
    $('config-progress').value = 0;
    updateConditionSummary();
  });
  $(id).addEventListener('change', () => {
    configuredConfigKey = null;
    $('config-progress').value = 0;
    updateConditionSummary();
  });
}
$('reset-config').onclick = () => {
  const experiment = currentExperiment();
  if (experiment) applyConfigToForm(experiment.config);
  configuredConfigKey = null;
  $('config-progress').value = 0;
  message('Configuração restaurada para o experimento selecionado.');
};
$('play').onclick = () => run(startCollection);
$('pause').onclick = () => run(async () => {
  await api.pause();
  message('Coleta pausada. Você pode analisar, exportar ou iniciar novamente.');
});

$('clear').onclick = () => run(async () => {
  if (!rows.length || confirm('Reiniciar o gráfico e apagar os dados atuais? Salve a coleta antes de continuar.')) {
    await api.clear();
    zoom.size = 300;
    zoom.offset = 0;
    yZoom.factor = 1;
    message('Gráfico reiniciado e dados da coleta limpos.');
  }
});

$('save').onclick = () => run(async () => {
  const name = await api.saveData();
  if (name) message(`Arquivo salvo: ${name}`);
});

$('open').onclick = () => run(async () => {
  if (rows.length && !confirm('Substituir os dados atuais pelo arquivo? Salve a coleta antes de continuar.')) return;
  const result = await api.openData(false);
  if (result) {
    rows = result.rows;
    zoom.size = 300;
    zoom.offset = 0;
    yZoom.factor = 1;
    render();
    message(`${result.name}: ${rows.length} amostras carregadas.`);
  }
});

$('add-series').onclick = () => run(async () => {
  if (series.length >= 4) return;
  const result = await api.openData(true);
  if (result) {
    series.push(result);
    const span = document.createElement('span');
    span.className = `series-${series.length - 1}`;
    span.textContent = `${result.name} · ${result.rows[0]?.sensor || 'Sem dados'} (${result.rows[0]?.unit || '0 / 1'})`;
    $('legend').append(span);
    zoom.size = 300;
    zoom.offset = 0;
    yZoom.factor = 1;
    chart();
  }
});

$('clear-series').onclick = () => {
  series = [];
  $('legend').replaceChildren();
  zoom.size = 300;
  zoom.offset = 0;
  yZoom.factor = 1;
  controls();
  chart();
};

$('export-image').onclick = () => run(async () => {
  const source = $('chart');
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height + 100;
  const ctx = output.getContext('2d');
  ctx.fillStyle = '#0a1018';
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.drawImage(source, 0, 0);
  ctx.font = '14px Segoe UI';
  const legends = view === 'analysis'
    ? series.map(item => `${item.name} · ${item.rows[0]?.sensor || ''} (${item.rows[0]?.unit || '0 / 1'})`)
    : [`${rows.at(-1)?.sensor || 'Coleta'} · janela visual do gráfico`];
  legends.forEach((text, index) => {
    ctx.fillStyle = colors[index];
    ctx.fillText(text, 20, source.height + 24 + index * 22);
  });
  const name = await api.saveImage(output.toDataURL('image/png'));
  if (name) message(`Imagem salva: ${name}`);
});

document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => switchView(button.dataset.view));
$('markers').onchange = chart;
$('labels').onchange = chart;
$('zoom-in').onclick = () => zoomBy(0.67);
$('zoom-out').onclick = () => zoomBy(1.5);
$('zoom-y-in').onclick = () => zoomYBy(1.4);
$('zoom-y-out').onclick = () => zoomYBy(1 / 1.4);
$('zoom-reset').onclick = resetZoom;
$('zoom-fit').onclick = fitZoom;

function setGraphMaximized(expanded) {
  const panel = $('graph-panel');
  panel.classList.toggle('graph-maximized', expanded);
  document.body.classList.toggle('graph-maximized-active', expanded);
  $('fullscreen-graph').textContent = expanded ? '↙ Voltar' : '⛶ Ampliar gráfico';
  $('fullscreen-graph').setAttribute('aria-pressed', expanded ? 'true' : 'false');
  requestAnimationFrame(() => requestAnimationFrame(chart));
}

$('fullscreen-graph').onclick = () => {
  setGraphMaximized(!$('graph-panel').classList.contains('graph-maximized'));
};

// ------------------------------------------------------------
// Zoom da interface: Ctrl + roda do mouse
// ------------------------------------------------------------
let pageZoomBusy = false;
let pageZoomIndicatorTimer = null;

function showPageZoomIndicator(factor) {
  let indicator = document.getElementById('page-zoom-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'page-zoom-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    Object.assign(indicator.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '99999',
      padding: '9px 12px',
      borderRadius: '10px',
      background: 'rgba(8, 15, 25, .92)',
      color: '#eaf5ff',
      border: '1px solid rgba(73, 179, 255, .45)',
      boxShadow: '0 10px 30px rgba(0,0,0,.28)',
      font: '600 13px Segoe UI, sans-serif',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity .16s ease'
    });
    document.body.append(indicator);
  }

  indicator.textContent = `Zoom da página: ${Math.round(factor * 100)}%`;
  indicator.style.opacity = '1';
  clearTimeout(pageZoomIndicatorTimer);
  pageZoomIndicatorTimer = setTimeout(() => { indicator.style.opacity = '0'; }, 900);
}

async function changePageZoom(action) {
  if (pageZoomBusy) return;
  pageZoomBusy = true;
  try {
    const factor = await api.pageZoom(action);
    showPageZoomIndicator(Number(factor) || 1);
  } catch (error) {
    console.error('Falha ao alterar zoom da página:', error);
  } finally {
    setTimeout(() => { pageZoomBusy = false; }, 45);
  }
}

// Captura antes do canvas para que Ctrl + Scroll sempre controle a página,
// inclusive quando o ponteiro estiver sobre o gráfico.
document.addEventListener('wheel', event => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  changePageZoom(event.deltaY < 0 ? 'in' : 'out');
}, { passive: false, capture: true });

document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key === '0') {
    event.preventDefault();
    changePageZoom('reset');
    return;
  }

  if (event.key === 'Escape' && $('graph-panel').classList.contains('graph-maximized')) {
    setGraphMaximized(false);
  }
});

$('chart').addEventListener('wheel', event => {
  event.preventDefault();
  if (event.shiftKey) {
    if (event.deltaY < 0) zoomYBy(1.18);
    else zoomYBy(1 / 1.18);
    return;
  }
  if (event.deltaY < 0) zoomBy(0.8);
  else zoomBy(1.25);
}, { passive: false });

$('chart').addEventListener('dblclick', resetZoom);
$('chart').addEventListener('pointerdown', event => {
  const meta = chartSource();
  if (!meta.maxLength || meta.maxLength <= meta.visible) return;
  drag = {
    x: event.clientX,
    offset: zoom.offset,
    width: Math.max(1, $('chart').getBoundingClientRect().width),
    visible: meta.visible,
    maxLength: meta.maxLength
  };
  $('chart').setPointerCapture(event.pointerId);
  $('chart').classList.add('dragging');
});

$('chart').addEventListener('pointermove', event => {
  if (!drag) return;
  const delta = event.clientX - drag.x;
  const samples = Math.round((delta / drag.width) * drag.visible);
  const maxOffset = Math.max(0, drag.maxLength - drag.visible);
  zoom.offset = clamp(drag.offset + samples, 0, maxOffset);
  chart();
});

function endDrag(event) {
  if (!drag) return;
  try { $('chart').releasePointerCapture(event.pointerId); } catch {}
  drag = null;
  $('chart').classList.remove('dragging');
}
$('chart').addEventListener('pointerup', endDrag);
$('chart').addEventListener('pointercancel', endDrag);

new ResizeObserver(chart).observe($('chart'));

// ------------------------------------------------------------
// Eventos do coletor e inicialização
// ------------------------------------------------------------

api.subscribeAppUpdate(update => {
  appUpdateState = { ...appUpdateState, ...update };
  appVersion = appUpdateState.currentVersion || appVersion;
  renderAppUpdateState();

  if (update.status === 'available') message(`Nova versão ${update.availableVersion} disponível. Clique em “Atualizar” no topo para baixar.`);
  if (update.status === 'downloaded') message('Atualização baixada. Clique em “Reiniciar e atualizar” para instalar.');
});

api.subscribe(event => {
  if (event.type === 'state') {
    state = event.value;
    requiredFirmware = state.requiredVersion || requiredFirmware;
    controls();
    maybePromptFirmware();
  }
  if (event.type === 'progress') $('config-progress').value = Number(event.value) || 0;
  if (event.type === 'samples') {
    if (Array.isArray(event.value) && event.value.length) {
      rows.push(...event.value);
      scheduleRender();
    }
  }
  if (event.type === 'notice') message(event.value, true);
  if (event.type === 'reset') {
    rows = [];
    zoom.size = 300;
    zoom.offset = 0;
    yZoom.factor = 1;
    render();
  }
});

run(async () => {
  const initial = await api.bootstrap();
  sensors = initial.sensors;
  state = initial.state;
  rows = initial.rows;
  requiredFirmware = initial.requiredFirmware || state.requiredVersion || requiredFirmware;
  appVersion = initial.appVersion || appVersion;
  appUpdateState = { ...appUpdateState, ...(initial.appUpdate || {}), currentVersion: initial.appVersion || appUpdateState.currentVersion || appVersion };
  renderAppUpdateState();

  $('sensor').replaceChildren(...sensors.map(sensor => option(sensor.id, sensor.name)));
  buildExperiments();
  $('experiment').replaceChildren(...experiments.map(experiment => option(experiment.id, experiment.label)));
  if (experiments[0]) $('experiment').value = experiments[0].id;
  renderExperiment();
  render();
  controls();

  setTimeout(() => $('splash').classList.add('hide'), 3000);
  setTimeout(() => $('splash').remove(), 3850);

  await ensureAutoConnection(false);
  // Garantia adicional: depois que a busca automática terminou, verifica
  // novamente a versão e abre o atualizador sem exigir clique do usuário.
  maybePromptFirmware();
});

// Tenta reencontrar a placa de forma silenciosa se ela for conectada depois
// ou removida/recolocada durante o uso.
setInterval(() => {
  if (!state.connected && !state.busy && !pending && !autoConnectInFlight) ensureAutoConnection(false);
}, 3500);
