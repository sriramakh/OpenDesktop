/**
 * python-runtime.js
 *
 * Single source of truth for the Python executable path.
 *
 * Packaged app  → uses bundled python-build-standalone under Resources/python/
 * Dev mode      → falls back to system python3 (must be on PATH)
 */

const path = require('path');
const fs   = require('fs');

let _cached = null;

function getPythonPath() {
  if (_cached) return _cached;

  try {
    const { app } = require('electron');
    if (app.isPackaged) {
      const exe     = process.platform === 'win32' ? 'python.exe' : path.join('bin', 'python3');
      const bundled = path.join(process.resourcesPath, 'python', exe);
      if (fs.existsSync(bundled)) {
        _cached = bundled;
        return _cached;
      }
    }
  } catch (_) {
    // Not in Electron context (e.g. unit tests) — fall through
  }

  // Dev mode or bundled Python not found: fall back to system python3
  _cached = process.platform === 'win32' ? 'python' : 'python3';
  return _cached;
}

module.exports = { getPythonPath };
