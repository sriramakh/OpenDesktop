/**
 * Content summarization tools — wraps the `summarize` CLI (@steipete/summarize).
 *
 * Handles: web pages, YouTube videos, podcasts, audio files, video files, PDFs, local text.
 * Install CLI: npm install -g @steipete/summarize
 * Configure:   ~/.summarize/config.json  (model + API keys)
 */

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Cached path to the summarize binary
let _summarizeBin = null;

/**
 * Locate the `summarize` CLI binary.
 * Searches PATH via `which`, then falls back to known npm global bin locations.
 */
async function findSummarizeBin() {
  if (_summarizeBin) return _summarizeBin;

  // 1. Try `which` — works when PATH is inherited properly
  try {
    const enrichedPath = buildEnrichedPath();
    const { stdout } = await execAsync('which summarize', {
      timeout: 5000,
      env: { ...process.env, PATH: enrichedPath },
    });
    const p = stdout.trim();
    if (p) { _summarizeBin = p; return p; }
  } catch (_) {}

  // 2. Try common npm/homebrew global bin paths
  const candidates = [
    '/usr/local/bin/summarize',
    '/opt/homebrew/bin/summarize',
    path.join(process.env.HOME || '', '.npm', 'bin', 'summarize'),
    path.join(process.env.HOME || '', '.nvm', 'versions', 'node', 'current', 'bin', 'summarize'),
    '/usr/bin/summarize',
  ];
  // Also try nvm node versions
  try {
    const nvmDir = path.join(process.env.HOME || '', '.nvm', 'versions', 'node');
    const versions = fs.readdirSync(nvmDir).sort().reverse();
    for (const v of versions.slice(0, 3)) {
      candidates.push(path.join(nvmDir, v, 'bin', 'summarize'));
    }
  } catch (_) {}

  for (const p of candidates) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      _summarizeBin = p;
      return p;
    } catch (_) {}
  }

  return null;
}

/**
 * Build an enriched PATH string that includes common npm/nvm global bin dirs.
 * Electron apps may have a stripped PATH that misses global npm installs.
 */
function buildEnrichedPath() {
  const base = process.env.PATH || '';
  const extras = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    path.join(process.env.HOME || '', '.npm', 'bin'),
    path.join(process.env.HOME || '', '.local', 'bin'),
  ];
  // Include nvm current bin if VOLTA/NVM-style installs are present
  try {
    const nvmDir = path.join(process.env.HOME || '', '.nvm', 'versions', 'node');
    const versions = fs.readdirSync(nvmDir).sort().reverse();
    if (versions[0]) extras.push(path.join(nvmDir, versions[0], 'bin'));
  } catch (_) {}

  const all = [...new Set([...extras, ...base.split(':').filter(Boolean)])];
  return all.join(':');
}

/**
 * Run the summarize CLI and capture its output.
 * Uses spawn so large outputs (full transcripts) are streamed without buffer limits.
 *
 * @param {string} bin   - Absolute path to the summarize binary
 * @param {string[]} args - CLI argument array
 * @param {number} timeout - Milliseconds before killing the process
 * @returns {Promise<string>} stdout text
 */
function runSummarize(bin, args, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const enrichedPath = buildEnrichedPath();
    const proc = spawn(bin, args, {
      env: {
        ...process.env,
        PATH: enrichedPath,
        // Disable ANSI colors / interactive UI elements
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        CI: '1',
      },
      // No shell — safe, no injection
    });

    let out = '';
    let err = '';

    proc.stdout.on('data', (chunk) => { out += chunk; });
    proc.stderr.on('data', (chunk) => { err += chunk; });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`summarize timed out after ${Math.round(timeout / 60000)} minutes`));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const trimmed = out.trim();
      if (trimmed) {
        resolve(trimmed);
      } else if (code !== 0) {
        const errMsg = err.trim() || `summarize exited with code ${code}`;
        reject(new Error(errMsg));
      } else {
        // Empty stdout with exit 0 — return whatever stderr said (progress messages)
        resolve(err.trim() || '(no output)');
      }
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────

const ContentTools = [
  {
    name: 'content_summarize',
    category: 'search',
    description:
      'Summarize any content using the summarize CLI: web pages, YouTube videos, podcast RSS feeds, audio files (MP3/WAV/M4A), video files (MP4/WebM), PDFs, or local text files. Handles transcription of audio/video via Whisper automatically. Use for URL summarization, video transcript summaries, and audio file summarization.',
    params: ['input', 'length', 'language', 'extract', 'slides'],
    permissionLevel: 'safe',

    async execute({ input, length, language, extract, slides }) {
      if (!input) throw new Error('input is required');

      const bin = await findSummarizeBin();
      if (!bin) {
        return (
          'The `summarize` CLI is not installed or not found in PATH.\n\n' +
          'Install it with:\n  npm install -g @steipete/summarize\n\n' +
          'Then configure your preferred LLM + API key in ~/.summarize/config.json:\n' +
          '  { "model": "anthropic/claude-sonnet-4-5", "env": { "ANTHROPIC_API_KEY": "sk-ant-..." } }'
        );
      }

      // Build args — always use --plain for clean text output (no ANSI/markdown decorations)
      // --stream off ensures complete output is flushed before process exits
      const args = [input, '--plain', '--stream', 'off'];

      if (length)   args.push('--length', String(length));
      if (language) args.push('--lang', String(language));
      if (extract)  args.push('--extract');
      if (slides)   args.push('--slides');

      // Determine timeout based on input type
      // Audio/video transcription can take many minutes
      const isMedia =
        /\.(mp3|mp4|wav|m4a|aac|ogg|flac|webm|mov|avi|mkv)$/i.test(input) ||
        /youtube\.com|youtu\.be/i.test(input) ||
        /podcasts\.apple\.com|spotify\.com.*episode|feeds\./i.test(input);
      const timeout = isMedia ? 600000 : 120000; // 10 min for media, 2 min for web/text

      try {
        const result = await runSummarize(bin, args, timeout);
        return result;
      } catch (err) {
        // Surface actionable errors
        const msg = err.message || String(err);

        if (msg.includes('No API key') || msg.includes('API key') || msg.includes('api_key')) {
          return (
            `summarize needs an API key for the configured model.\n\n` +
            `Configure it in ~/.summarize/config.json:\n` +
            `  { "model": "anthropic/claude-sonnet-4-5", "env": { "ANTHROPIC_API_KEY": "sk-ant-..." } }\n\n` +
            `Or set the env var: export ANTHROPIC_API_KEY=sk-ant-...\n\n` +
            `Supported keys: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY\n\n` +
            `Error: ${msg.slice(0, 500)}`
          );
        }

        if (msg.includes('whisper') || msg.includes('transcri')) {
          return (
            `Audio transcription failed. The summarize CLI needs a transcription backend:\n\n` +
            `Option 1 (free, local): Install whisper.cpp — brew install whisper-cpp\n` +
            `Option 2 (cloud): Set OPENAI_API_KEY — Whisper API is used automatically\n` +
            `Option 3 (cloud): Set FAL_KEY — uses fal.ai Whisper service\n\n` +
            `Error: ${msg.slice(0, 500)}`
          );
        }

        throw new Error(msg);
      }
    },
  },
];

module.exports = { ContentTools };
