'use strict';

const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');

const releaseConfigPath = path.join(
  root,
  'config',
  'release.config.json'
);

let release = { github: {} };

try {
  release = JSON.parse(
    fs.readFileSync(releaseConfigPath, 'utf8')
  );
} catch {
  // Build local continua funcionando sem publicação online.
}

const owner = String(
  process.env.GITHUB_OWNER ||
  release.github?.owner ||
  ''
).trim();

const repo = String(
  process.env.GITHUB_REPO ||
  release.github?.repo ||
  ''
).trim();

const publishReady =
  owner &&
  repo &&
  !/^SEU_/i.test(owner) &&
  !/^SEU_/i.test(repo);

const config = {

  appId: 'br.com.cittius.analisevariaveis',

  productName: 'Análise de Variáveis Experimentais',

  npmRebuild: false,

  asar: true,

  // ==========================================================
  // DIRETÓRIOS
  // ==========================================================

  directories: {
    buildResources: 'build',
    output: 'dist'
  },

  // ==========================================================
  // ARQUIVOS DO SOFTWARE
  // ==========================================================

  files: [
    'src/**/*',
    'package.json'
  ],

  // ==========================================================
  // RECURSOS EXTERNOS
  // ==========================================================

  extraResources: [
    {
      from: 'firmware',
      to: 'firmware'
    },

    {
      from: 'manual',
      to: 'manual'
    },

    // Permite usar o PNG dentro do aplicativo.
    {
      from: 'build/icon.png',
      to: 'icon.png'
    }
  ],

  // ==========================================================
  // WINDOWS
  // ==========================================================

  win: {

    icon: 'build/icon.ico',

    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ],

    artifactName:
      'Analise-Variaveis-Experimentais-Setup-${version}-${arch}.${ext}'
  },

  // ==========================================================
  // INSTALADOR WINDOWS
  // ==========================================================

  nsis: {

    oneClick: false,

    allowToChangeInstallationDirectory: true,

    createDesktopShortcut: true,

    createStartMenuShortcut: true,

    shortcutName:
      'Análise de Variáveis Experimentais',

    // Ícone do instalador
    installerIcon:
      'build/icon.ico',

    // Ícone do desinstalador
    uninstallerIcon:
      'build/icon.ico',

    // Ícone mostrado no cabeçalho do instalador
    installerHeaderIcon:
      'build/icon.ico'
  },

  // ==========================================================
  // LINUX
  // ==========================================================

  linux: {

    icon: 'build/icon.png',

    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      }
    ],

    category: 'Education',

    artifactName:
      'Analise-Variaveis-Experimentais-${version}-${arch}.${ext}'
  },

  // ==========================================================
  // APPIMAGE
  // ==========================================================

  appImage: {

    artifactName:
      'Analise-Variaveis-Experimentais-${version}-${arch}.${ext}'
  }
};

// ============================================================
// PUBLICAÇÃO / ATUALIZAÇÃO ONLINE
// ============================================================

if (publishReady) {

  config.publish = [
    {
      provider: 'github',
      owner,
      repo,
      releaseType: 'release'
    }
  ];
}

module.exports = config;