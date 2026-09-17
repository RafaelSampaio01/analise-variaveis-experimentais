'use strict';

const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

async function newestDirectory(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const dirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    dirs.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
    return dirs[0] ? path.join(root, dirs[0]) : null;
  } catch { return null; }
}

function executableOnPath(name) {
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(command, [name], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0) return result.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean) || null;
  } catch {}
  return null;
}

async function findAvrdude() {
  const fromPath = executableOnPath(process.platform === 'win32' ? 'avrdude.exe' : 'avrdude');
  if (fromPath) return { executable: fromPath, config: null, source: 'PATH' };

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    if (local) {
      const base = path.join(local, 'Arduino15', 'packages', 'arduino', 'tools', 'avrdude');
      const versionDir = await newestDirectory(base);
      if (versionDir) {
        const exeCandidates = [
          path.join(versionDir, 'bin', 'avrdude.exe'),
          path.join(versionDir, 'avrdude.exe')
        ];
        const configCandidates = [
          path.join(versionDir, 'etc', 'avrdude.conf'),
          path.join(versionDir, 'bin', 'avrdude.conf'),
          path.join(versionDir, 'avrdude.conf')
        ];
        const executable = exeCandidates.find(candidate => fssync.existsSync(candidate));
        const config = configCandidates.find(candidate => fssync.existsSync(candidate)) || null;
        if (executable) return { executable, config, source: 'Arduino15' };
      }
    }
  }

  return null;
}

async function validateHex(filePath) {
  if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.hex')) throw new Error('Selecione um arquivo .hex válido.');
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error('O arquivo .hex não foi encontrado.');
  if (stat.size <= 0 || stat.size > 4 * 1024 * 1024) throw new Error('O arquivo .hex possui tamanho inválido.');
  const sample = await fs.readFile(filePath, { encoding: 'utf8' });
  const lines = sample.split(/\r?\n/).filter(Boolean).slice(0, 20);
  if (!lines.length || !lines.every(line => /^:[0-9A-Fa-f]+$/.test(line.trim()))) throw new Error('O arquivo selecionado não parece ser um Intel HEX válido.');
}

async function flashArduinoUno({ port, hexPath, onOutput = () => {} }) {
  if (typeof port !== 'string' || !port.trim()) throw new Error('Porta serial inválida para atualização.');
  await validateHex(hexPath);

  const tool = await findAvrdude();
  if (!tool) throw new Error('AVRDUDE não encontrado. Instale o Arduino IDE ou o pacote avrdude e tente novamente.');

  const args = [];
  if (tool.config) args.push('-C', tool.config);
  args.push(
    '-v',
    '-patmega328p',
    '-carduino',
    '-P', port,
    '-b', '115200',
    '-D',
    '-U', `flash:w:${hexPath}:i`
  );

  onOutput(`Ferramenta: ${tool.executable}`);
  onOutput(`Porta: ${port}`);
  onOutput('Placa: Arduino Uno / ATmega328P');
  onOutput('Iniciando gravação...');

  return new Promise((resolve, reject) => {
    const child = spawn(tool.executable, args, { windowsHide: true });
    let tail = '';
    const push = chunk => {
      const text = chunk.toString();
      tail = (tail + text).slice(-12000);
      for (const line of text.split(/\r?\n/)) if (line.trim()) onOutput(line.trim());
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('error', error => reject(new Error(`Falha ao iniciar o AVRDUDE: ${error.message}`)));
    child.on('close', code => {
      if (code === 0) resolve({ ok: true, tool: tool.source });
      else reject(new Error(`A atualização falhou (código ${code}).\n${tail.slice(-3000)}`));
    });
  });
}

module.exports = { findAvrdude, validateHex, flashArduinoUno };
