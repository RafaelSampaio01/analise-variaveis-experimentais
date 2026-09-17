'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'config', 'release.config.json');
let config = { github: { owner: 'RafaelSampaio01', repo: 'analise-variaveis-experimentais' }, channel: 'latest' };
try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}

function parseGithubRemote(value) {
  if (!value) return null;
  const remote = value.trim().replace(/\\/g, '/');
  let match = remote.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (!match) match = remote.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (!match) match = remote.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, '') };
}

const owner = String(config.github?.owner || '').trim();
const repo = String(config.github?.repo || '').trim();
if (!owner || !repo) {
  console.error('ERRO: config/release.config.json sem owner/repo.');
  process.exit(1);
}

let detected = null;
try {
  const origin = execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  detected = parseGithubRemote(origin);
} catch {}

console.log(`GitHub configurado: ${owner}/${repo}`);
if (detected) {
  if (detected.owner.toLowerCase() === owner.toLowerCase() && detected.repo.toLowerCase() === repo.toLowerCase()) {
    console.log(`Remote origin correto: ${detected.owner}/${detected.repo}`);
  } else {
    console.log(`Remote origin atual: ${detected.owner}/${detected.repo}`);
    console.log(`Remote desejado: ${owner}/${repo}`);
  }
} else {
  console.log('Remote origin ainda nao configurado.');
}
