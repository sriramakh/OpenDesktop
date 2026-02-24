#!/usr/bin/env node
/**
 * setup-python.js
 *
 * Downloads python-build-standalone for the current platform, extracts it to
 * resources/python/, and pre-installs all required pip packages.
 *
 * Idempotent: skips download + install if resources/python/ already contains
 * a working Python binary.
 *
 * Usage:
 *   npm run setup-python
 *   node scripts/setup-python.js
 */

'use strict';

const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const fsp      = require('fs/promises');
const path     = require('path');
const os       = require('os');
const { execSync, spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PYTHON_VERSION = '3.12.7';
const RELEASE_DATE   = '20241002';

/** Map (platform, arch) → python-build-standalone artifact name */
const PLATFORM_MAP = {
  'darwin-arm64':  `cpython-${PYTHON_VERSION}+${RELEASE_DATE}-aarch64-apple-darwin-install_only.tar.gz`,
  'darwin-x64':    `cpython-${PYTHON_VERSION}+${RELEASE_DATE}-x86_64-apple-darwin-install_only.tar.gz`,
  'win32-x64':     `cpython-${PYTHON_VERSION}+${RELEASE_DATE}-x86_64-pc-windows-msvc-install_only.tar.gz`,
  'linux-x64':     `cpython-${PYTHON_VERSION}+${RELEASE_DATE}-x86_64-unknown-linux-gnu-install_only.tar.gz`,
  'linux-arm64':   `cpython-${PYTHON_VERSION}+${RELEASE_DATE}-aarch64-unknown-linux-gnu-install_only.tar.gz`,
};

const RELEASE_BASE = `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_DATE}`;

const PIP_PACKAGES = [
  'pdfplumber',
  'PyMuPDF',
  'pypdf',
  'python-docx',
  'pandas',
  'openpyxl',
  'numpy',
  'matplotlib',
  'xlrd',
  'xlwings',
  'Pillow',
];

// Root of repo (one level up from scripts/)
const REPO_ROOT    = path.resolve(__dirname, '..');
const PYTHON_DIR   = path.join(REPO_ROOT, 'resources', 'python');
const DOWNLOAD_DIR = path.join(os.tmpdir(), 'od-python-setup');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg)  { process.stdout.write(`[setup-python] ${msg}\n`); }
function warn(msg) { process.stdout.write(`[setup-python] ⚠  ${msg}\n`); }

/** Resolve the Python executable path inside PYTHON_DIR */
function getPythonExe() {
  return process.platform === 'win32'
    ? path.join(PYTHON_DIR, 'python.exe')
    : path.join(PYTHON_DIR, 'bin', 'python3');
}

/** Return true if the bundled Python already exists and is runnable */
function isAlreadyInstalled() {
  const exe = getPythonExe();
  if (!fs.existsSync(exe)) return false;
  try {
    const r = spawnSync(exe, ['-c', 'import sys; print(sys.version)'], { encoding: 'utf8', timeout: 10000 });
    if (r.status === 0 && r.stdout.trim()) {
      log(`Bundled Python already present: ${r.stdout.trim()}`);
      return true;
    }
  } catch (_) {}
  return false;
}

/** Detect platform key */
function getPlatformKey() {
  const plat = process.platform;      // darwin / win32 / linux
  const arch = process.arch;          // x64 / arm64
  return `${plat}-${arch}`;
}

/** Simple HTTPS/HTTP GET with redirects, returns Buffer */
function download(url, destFile) {
  return new Promise((resolve, reject) => {
    log(`Downloading ${path.basename(url)} ...`);

    const file   = fs.createWriteStream(destFile);
    let received = 0;
    let total    = 0;
    let lastPct  = -1;

    function doRequest(u) {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'setup-python/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        total = parseInt(res.headers['content-length'] || '0', 10);

        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.floor((received / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              process.stdout.write(`  ${pct}%  (${(received / 1e6).toFixed(1)} MB)\n`);
              lastPct = pct;
            }
          }
        });

        res.pipe(file);
        res.on('end',   () => { file.close(); resolve(destFile); });
        res.on('error', reject);
      }).on('error', reject);
    }

    doRequest(url);
  });
}

/** Extract .tar.gz using the `tar` npm package */
async function extractTarGz(archivePath, destDir) {
  let tar;
  try {
    tar = require('tar');
  } catch (_) {
    // tar not installed yet — fall back to system tar (should be available on macOS/Linux)
    log('tar npm package not found, falling back to system tar binary...');
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
    return;
  }

  log(`Extracting archive...`);
  await tar.extract({ file: archivePath, cwd: destDir, strip: 1 });
}

/** Run pip install with the bundled pip */
function pipInstall(packages) {
  const exe = getPythonExe();
  log(`Installing ${packages.length} packages via bundled pip...`);
  const result = spawnSync(
    exe,
    ['-m', 'pip', 'install', '--no-warn-script-location', '--quiet', ...packages],
    { stdio: 'inherit', timeout: 600000 }
  );
  if (result.status !== 0) {
    throw new Error(`pip install failed with exit code ${result.status}`);
  }
}

/** Clear macOS Gatekeeper quarantine on the bundled Python directory */
function clearQuarantine(dir) {
  if (process.platform !== 'darwin') return;
  try {
    execSync(`xattr -dr com.apple.quarantine "${dir}"`, { stdio: 'pipe' });
    log('Cleared macOS Gatekeeper quarantine flag.');
  } catch (_) {
    // xattr may not be installed or the flag may not be set — safe to ignore
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log(`Platform: ${getPlatformKey()}`);

  // 1. Idempotency check
  if (isAlreadyInstalled()) {
    log('Skipping download — bundled Python is already installed.');
    return;
  }

  // 2. Resolve download URL
  const key      = getPlatformKey();
  const filename = PLATFORM_MAP[key];
  if (!filename) {
    warn(`Unsupported platform: ${key}`);
    warn('Supported: darwin-arm64, darwin-x64, win32-x64, linux-x64, linux-arm64');
    process.exit(1);
  }
  const url = `${RELEASE_BASE}/${filename}`;

  // 3. Ensure directories exist
  await fsp.mkdir(DOWNLOAD_DIR, { recursive: true });
  await fsp.mkdir(PYTHON_DIR,   { recursive: true });

  // 4. Download
  const archivePath = path.join(DOWNLOAD_DIR, filename);
  if (fs.existsSync(archivePath)) {
    log(`Archive already cached at ${archivePath} — skipping download.`);
  } else {
    await download(url, archivePath);
  }
  log('Download complete.');

  // 5. Extract
  await extractTarGz(archivePath, PYTHON_DIR);
  log('Extraction complete.');

  // 6. Clear quarantine (macOS)
  clearQuarantine(PYTHON_DIR);

  // 7. Verify extraction
  const exe = getPythonExe();
  if (!fs.existsSync(exe)) {
    throw new Error(`Python binary not found after extraction: ${exe}`);
  }
  const verResult = spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 10000 });
  log(`Bundled Python: ${verResult.stdout.trim() || verResult.stderr.trim()}`);

  // 8. Install pip packages
  pipInstall(PIP_PACKAGES);
  log('All packages installed.');

  // 9. Verify key packages
  log('Verifying key packages...');
  const verifyScript = 'import pandas, openpyxl, pdfplumber, fitz, docx; print("OK")';
  const vr = spawnSync(exe, ['-c', verifyScript], { encoding: 'utf8', timeout: 30000 });
  if (vr.status === 0) {
    log(`Package verification: ${vr.stdout.trim()}`);
  } else {
    warn(`Package verification warning: ${vr.stderr.trim()}`);
  }

  log('');
  log('✓ Bundled Python setup complete.');
  log(`  Location : ${PYTHON_DIR}`);
  log(`  Packages : ${PIP_PACKAGES.join(', ')}`);
  log('');
  log('Run `npm run build` to bundle the app with Python included.');
}

main().catch((err) => {
  console.error(`\n[setup-python] FATAL: ${err.message}`);
  process.exit(1);
});
