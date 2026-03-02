/**
 * Excel Tools — Excel Master integration via Python subprocess.
 *
 * 20 tools:
 *   excel_list_templates    — list available dashboard templates (sync)
 *   excel_list_themes       — list available color themes (sync)
 *   excel_profile_data      — profile a CSV/XLSX dataset
 *   excel_auto_build        — auto-build full dashboard from data
 *   excel_add_chart         — add chart to workbook
 *   excel_modify_object     — modify existing object by ID
 *   excel_remove_object     — remove object by ID
 *   excel_add_kpi_row       — add KPI metric tiles row
 *   excel_add_table         — add data or pivot table
 *   excel_add_content       — add title/section header/text
 *   excel_write_cells       — write values/formulas to cells
 *   excel_format_range      — format a cell range
 *   excel_sheet_op          — create/rename/delete/reorder sheets
 *   excel_row_col_op        — resize/hide/show rows or columns
 *   excel_add_feature       — conditional formatting, validation, freeze, merge, etc.
 *   excel_change_theme      — change color theme
 *   excel_query             — read-only workbook inspection
 *   excel_undo              — undo last action
 *   excel_redo              — redo undone action
 *   excel_save              — render and save workbook to XLSX
 */

'use strict';

const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { exec } = require('child_process');
const { getPythonPath } = require('../../python-runtime');

// ── Paths ──────────────────────────────────────────────────────────────

const EXCEL_MASTER_ROOT = path.join(__dirname, '..', '..', '..', '..', 'assets', 'excel-master');
const EXCEL_MASTER_SRC = path.join(EXCEL_MASTER_ROOT, 'src');

// ── Session tracking ───────────────────────────────────────────────────

/**
 * In-memory map of session_id → session file path.
 * Each session is a JSON file containing the serialized AgentSession state
 * so the Python subprocess can resume stateful operations.
 */
const _sessions = new Map();

// ── Helpers ────────────────────────────────────────────────────────────

function resolvePath(p) {
  if (!p) return p;
  if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

/**
 * Run a Python script via child_process.exec and return parsed JSON result.
 * Same pattern as runPptMasterScript in presentation-tools.js.
 */
async function runExcelMasterScript(scriptBody, timeout = 180000) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const scriptPath = path.join(os.tmpdir(), `_xlm_${process.pid}_${ts}_${rand}.py`);
  const resultPath = path.join(os.tmpdir(), `_xlm_result_${process.pid}_${ts}_${rand}.json`);

  const fullScript = `#!/usr/bin/env python3
import sys, os, json, traceback, atexit

# Add vendored excelmaster to path
sys.path.insert(0, ${JSON.stringify(EXCEL_MASTER_SRC)})

RESULT_PATH = ${JSON.stringify(resultPath)}
_result_written = False

def write_result(data):
    global _result_written
    with open(RESULT_PATH, 'w') as f:
        json.dump(data, f, default=str)
    _result_written = True

def _exit_handler():
    if not _result_written:
        write_result({'ok': False, 'error': 'Script exited without calling write_result()'})
atexit.register(_exit_handler)

def _exception_hook(exc_type, exc_value, exc_tb):
    if not _result_written:
        tb_str = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
        write_result({'ok': False, 'error': str(exc_value), 'traceback': tb_str[-3000:]})
    sys.__excepthook__(exc_type, exc_value, exc_tb)
sys.excepthook = _exception_hook

# Auto-install dependencies
for pkg_name, import_name in [
    ('openpyxl', 'openpyxl'),
    ('pandas', 'pandas'),
    ('numpy', 'numpy'),
    ('pydantic', 'pydantic'),
    ('pydantic-settings', 'pydantic_settings'),
    ('xlsxwriter', 'xlsxwriter'),
    ('Pillow', 'PIL'),
    ('python-dotenv', 'dotenv'),
]:
    try:
        __import__(import_name)
    except ImportError:
        import subprocess as _sp
        _sp.check_call([sys.executable, '-m', 'pip', 'install', pkg_name, '--break-system-packages', '-q'])

${scriptBody}
`;

  await fsp.writeFile(scriptPath, fullScript, 'utf-8');

  let stdout = '', stderr = '';
  try {
    await new Promise((resolve) => {
      exec(
        `"${getPythonPath()}" "${scriptPath}"`,
        { timeout, maxBuffer: 10 * 1024 * 1024 },
        (err, out, serr) => {
          stdout = out || '';
          stderr = serr || '';
          resolve();
        },
      );
    });

    let res;
    try {
      const raw = await fsp.readFile(resultPath, 'utf-8');
      res = JSON.parse(raw);
    } catch (_readErr) {
      const errDetail = stderr.trim() || stdout.trim() || 'No output from script.';
      throw new Error(`Excel Master script failed before writing a result.\n\nPython output:\n${errDetail.slice(0, 3000)}`);
    }

    return res;
  } finally {
    await Promise.all([scriptPath, resultPath]
      .map(p => fsp.unlink(p).catch(() => {})));
  }
}

/**
 * Python function definition for saving session state to JSON.
 * Place at script top level. Call _save_session(session, path) where needed.
 */
const SAVE_SESSION_FUNC = `
def _save_session(session, path):
    import json as _json
    state_data = {
        'data_path': str(session.data_path),
        'output_path': str(session.output_path),
        'state': session.state.model_dump(mode='json'),
        'registry': session.registry.snapshot_dict(),
        'turn': session._turn,
        'undo_stack': [
            {'state': s.model_dump(mode='json'), 'registry': r}
            for s, r in session._undo_stack
        ],
        'redo_stack': [
            {'state': s.model_dump(mode='json'), 'registry': r}
            for s, r in session._redo_stack
        ],
    }
    with open(path, 'w') as _f:
        _json.dump(state_data, _f, default=str)
`;

/**
 * Returns the call to save session. Put SAVE_SESSION_FUNC at script top level first.
 */
function _saveSessionCall(sessionPath) {
  return `_save_session(session, ${JSON.stringify(sessionPath)})`;
}

/**
 * Helper: Python code to load session state from JSON.
 * Recreates AgentSession from saved state + re-reads data from disk.
 */
function _loadSessionCode(sessionPath) {
  return `
import json
from pathlib import Path
from excelmaster.agent.session import AgentSession

${SAVE_SESSION_FUNC}
from excelmaster.chat.models import WorkbookState
from excelmaster.agent.registry import ObjectRegistry

def _load_session(path):
    with open(path, 'r') as f:
        data = json.load(f)

    session = AgentSession(data['data_path'], data['output_path'])

    # Re-read data from disk
    dp = Path(data['data_path'])
    import pandas as pd
    from excelmaster.data.data_engine import profile_dataset, discover_and_join
    if dp.suffix.lower() == '.csv':
        session.df = pd.read_csv(dp)
    else:
        xf = pd.ExcelFile(dp)
        if len(xf.sheet_names) > 1:
            session.df, _, _ = discover_and_join(dp, verbose=False)
        else:
            session.df = pd.read_excel(dp)

    session.profile = profile_dataset(str(dp))

    # Restore state
    session.state = WorkbookState(**data['state'])
    session.registry = ObjectRegistry()
    session.registry.restore(data['registry'])
    session._turn = data.get('turn', 0)

    # Restore undo/redo stacks
    session._undo_stack = [
        (WorkbookState(**item['state']), item['registry'])
        for item in data.get('undo_stack', [])
    ]
    session._redo_stack = [
        (WorkbookState(**item['state']), item['registry'])
        for item in data.get('redo_stack', [])
    ]

    return session

session = _load_session(${JSON.stringify(sessionPath)})
`;
}

// ── Template & Theme catalogs (static, no subprocess) ─────────────────

const TEMPLATE_CATALOG = [
  { key: 'executive_summary', industry: 'General', description: 'Board KPIs, 2x2 charts, strategic focus', default_theme: 'corporate_blue' },
  { key: 'hr_analytics',      industry: 'HR/People', description: 'Headcount, turnover, recruitment analytics', default_theme: 'hr_purple' },
  { key: 'dark_operational',   industry: 'Operations', description: 'Dense metrics, dark background, operational KPIs', default_theme: 'dark_mode' },
  { key: 'financial',          industry: 'Finance', description: 'P&L, budget variance, cash flow analysis', default_theme: 'finance_green' },
  { key: 'supply_chain',       industry: 'Logistics', description: 'Shipments, carriers, inventory tracking', default_theme: 'supply_green' },
  { key: 'marketing',          industry: 'Marketing', description: 'Campaigns, ROI, channel analysis', default_theme: 'marketing_orange' },
  { key: 'minimal_clean',      industry: 'General', description: 'Clean minimal styling, general-purpose', default_theme: 'slate_minimal' },
];

const THEME_CATALOG = [
  { key: 'corporate_blue',    name: 'Corporate Blue',     color: '#1B263B', best_for: 'Executive, general' },
  { key: 'hr_purple',         name: 'HR Purple',          color: '#6B21A8', best_for: 'People/HR data' },
  { key: 'dark_mode',         name: 'Dark Mode',          color: '#0F172A', best_for: 'Dense operational' },
  { key: 'supply_green',      name: 'Supply Green',       color: '#14532D', best_for: 'Supply chain' },
  { key: 'finance_green',     name: 'Finance Green',      color: '#166534', best_for: 'Financial reports' },
  { key: 'marketing_orange',  name: 'Marketing Orange',   color: '#EA580C', best_for: 'Marketing/campaigns' },
  { key: 'slate_minimal',     name: 'Slate Minimal',      color: '#64748B', best_for: 'Clean, minimal' },
  { key: 'executive_navy',    name: 'Executive Navy',     color: '#1E3A5F', best_for: 'C-Suite' },
];

// ── Tool Implementations ──────────────────────────────────────────────

const ExcelTools = [

  // ── 1. excel_list_templates ──────────────────────────────────────────
  {
    name: 'excel_list_templates',
    category: 'excel',
    description: 'List available Excel dashboard templates with their industries and default themes.',
    params: [],
    permissionLevel: 'safe',
    async execute() {
      const lines = ['# Excel Dashboard Templates\n'];
      lines.push('| Template | Industry | Description | Default Theme |');
      lines.push('|----------|----------|-------------|---------------|');
      for (const t of TEMPLATE_CATALOG) {
        lines.push(`| ${t.key} | ${t.industry} | ${t.description} | ${t.default_theme} |`);
      }
      return lines.join('\n');
    },
  },

  // ── 2. excel_list_themes ─────────────────────────────────────────────
  {
    name: 'excel_list_themes',
    category: 'excel',
    description: 'List available Excel dashboard color themes.',
    params: [],
    permissionLevel: 'safe',
    async execute() {
      const lines = ['# Excel Dashboard Themes\n'];
      lines.push('| Theme Key | Name | Color | Best For |');
      lines.push('|-----------|------|-------|----------|');
      for (const t of THEME_CATALOG) {
        lines.push(`| ${t.key} | ${t.name} | ${t.color} | ${t.best_for} |`);
      }
      return lines.join('\n');
    },
  },

  // ── 3. excel_profile_data ────────────────────────────────────────────
  {
    name: 'excel_profile_data',
    category: 'excel',
    description: 'Profile a CSV/XLSX dataset: column types, row count, sample values, distributions. Use this before building dashboards to understand the data.',
    params: ['path'],
    permissionLevel: 'safe',
    async execute({ path: filePath }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);

      const script = `
from excelmaster.data.data_engine import profile_dataset, profile_to_prompt_text

profile = profile_dataset(${JSON.stringify(resolved)})
text = profile_to_prompt_text(profile)
write_result({
    'ok': True,
    'profile_text': text,
    'rows': profile.rows,
    'columns': len(profile.columns),
    'column_names': profile.column_names,
    'industry': profile.industry or 'general',
})
`;
      const res = await runExcelMasterScript(script, 60000);
      if (!res.ok) throw new Error(res.error || 'Profiling failed');

      return `# Dataset Profile: ${path.basename(resolved)}\n\n` +
        `Rows: ${res.rows} | Columns: ${res.columns} | Industry: ${res.industry}\n\n` +
        `Columns: ${res.column_names.join(', ')}\n\n` +
        res.profile_text;
    },
  },

  // ── 4. excel_auto_build ──────────────────────────────────────────────
  {
    name: 'excel_auto_build',
    category: 'excel',
    description: 'Auto-build a full Excel dashboard from CSV/XLSX data. Uses LLM to select template, theme, KPIs, and charts. Returns a session ID for further editing.',
    params: ['path', 'output_path', 'template', 'theme'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, output_path, template, theme }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const stem = path.basename(resolved, path.extname(resolved));
      const outputResolved = output_path
        ? resolvePath(output_path)
        : path.join(path.dirname(resolved), `${stem}_dashboard.xlsx`);

      const sessionId = `xlm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const sessionFilePath = path.join(os.tmpdir(), `${sessionId}.json`);

      const script = `
${SAVE_SESSION_FUNC}
from pathlib import Path
from excelmaster.agent.session import AgentSession

session = AgentSession(
    ${JSON.stringify(resolved)},
    ${JSON.stringify(outputResolved)},
)
info = session.load()

# Auto-build dashboard
result = session.auto_dashboard()

# Save to XLSX
out_path = session.save()

# Persist session state as JSON (no pickle — avoids thread lock issues)
${_saveSessionCall(sessionFilePath)}

state = session.get_state()
write_result({
    'ok': True,
    'session_id': ${JSON.stringify(sessionId)},
    'session_path': ${JSON.stringify(sessionFilePath)},
    'output_path': str(out_path),
    'data_rows': info['rows'],
    'data_columns': info['columns'],
    'column_names': info['column_names'],
    'title': state['title'],
    'theme': state['theme'],
    'sheets': state['sheets'],
    'object_ids': result.get('object_ids', []),
})
`;
      const res = await runExcelMasterScript(script, 300000);
      if (!res.ok) throw new Error(res.error || 'Auto-build failed');

      // Track session
      _sessions.set(res.session_id, res.session_path);

      // Open the file
      try {
        exec(`open "${res.output_path}"`);
      } catch (_) {}

      const sheetSummary = res.sheets.map(s => `  - ${s.name}: ${s.objects} objects`).join('\n');
      return `Dashboard built successfully!\n\n` +
        `File: ${res.output_path}\n` +
        `Data: ${res.data_rows} rows x ${res.data_columns} columns\n` +
        `Title: ${res.title}\n` +
        `Theme: ${res.theme}\n` +
        `Objects: ${res.object_ids.length}\n\n` +
        `Sheets:\n${sheetSummary}\n\n` +
        `Session ID: ${res.session_id}\n` +
        `Use this session_id with other excel_* tools to modify the dashboard.`;
    },
  },

  // ── 5. excel_add_chart ───────────────────────────────────────────────
  {
    name: 'excel_add_chart',
    category: 'excel',
    description: 'Add a chart to the Excel dashboard. Supports bar, line, pie, doughnut, area, scatter, bar_horizontal, and combo types.',
    params: ['session_id', 'type', 'x_column', 'y_columns', 'title', 'aggregation', 'width', 'side', 'top_n', 'show_data_labels', 'sheet', 'position'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('add_chart', args);
    },
  },

  // ── 6. excel_modify_object ───────────────────────────────────────────
  {
    name: 'excel_modify_object',
    category: 'excel',
    description: 'Modify any existing dashboard object by its ID. Pass only the fields you want to change.',
    params: ['session_id', 'object_id', 'changes', 'sheet'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('modify_object', args);
    },
  },

  // ── 7. excel_remove_object ───────────────────────────────────────────
  {
    name: 'excel_remove_object',
    category: 'excel',
    description: 'Remove an object from the dashboard by its ID.',
    params: ['session_id', 'object_id', 'sheet'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('remove_object', args);
    },
  },

  // ── 8. excel_add_kpi_row ─────────────────────────────────────────────
  {
    name: 'excel_add_kpi_row',
    category: 'excel',
    description: 'Add a row of KPI metric tiles to the dashboard.',
    params: ['session_id', 'kpis', 'sheet', 'position'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('add_kpi_row', args);
    },
  },

  // ── 9. excel_add_table ───────────────────────────────────────────────
  {
    name: 'excel_add_table',
    category: 'excel',
    description: 'Add a data table or pivot table to the dashboard.',
    params: ['session_id', 'table_type', 'columns', 'max_rows', 'show_conditional', 'index_col', 'value_col', 'columns_col', 'agg', 'sheet', 'position'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('add_table', args);
    },
  },

  // ── 10. excel_add_content ────────────────────────────────────────────
  {
    name: 'excel_add_content',
    category: 'excel',
    description: 'Add a title bar, section header, or text block to the dashboard.',
    params: ['session_id', 'content_type', 'text', 'subtitle', 'style', 'color', 'sheet', 'position'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('add_content', args);
    },
  },

  // ── 11. excel_write_cells ────────────────────────────────────────────
  {
    name: 'excel_write_cells',
    category: 'excel',
    description: 'Write values, formulas, and formatting to individual cells.',
    params: ['session_id', 'writes', 'sheet'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('write_cells', args);
    },
  },

  // ── 12. excel_format_range ───────────────────────────────────────────
  {
    name: 'excel_format_range',
    category: 'excel',
    description: 'Apply formatting to a range of cells (bold, colors, borders, number format).',
    params: ['session_id', 'range', 'bold', 'italic', 'font_size', 'font_color', 'bg_color', 'num_format', 'align', 'valign', 'border', 'text_wrap', 'sheet'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('format_range', args);
    },
  },

  // ── 13. excel_sheet_op ───────────────────────────────────────────────
  {
    name: 'excel_sheet_op',
    category: 'excel',
    description: 'Create, rename, delete, reorder sheets. Set tab color, hide/show.',
    params: ['session_id', 'operation', 'sheet', 'new_name', 'position', 'tab_color'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('sheet_operation', args);
    },
  },

  // ── 14. excel_row_col_op ─────────────────────────────────────────────
  {
    name: 'excel_row_col_op',
    category: 'excel',
    description: 'Resize or hide/show rows and columns.',
    params: ['session_id', 'target', 'operation', 'index', 'end_index', 'size', 'sheet'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('row_col_operation', args);
    },
  },

  // ── 15. excel_add_feature ────────────────────────────────────────────
  {
    name: 'excel_add_feature',
    category: 'excel',
    description: 'Add Excel features: conditional formatting, data validation, freeze panes, zoom, merge cells, hyperlinks, comments, images.',
    params: ['session_id', 'feature', 'range', 'cell', 'rule_type', 'criteria', 'value', 'min_color', 'mid_color', 'max_color', 'bar_color', 'validate', 'source', 'freeze_row', 'freeze_col', 'zoom_level', 'merge_value', 'format', 'url', 'display_text', 'comment_text', 'author', 'image_path', 'x_scale', 'y_scale', 'sheet'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('add_excel_feature', args);
    },
  },

  // ── 16. excel_change_theme ───────────────────────────────────────────
  {
    name: 'excel_change_theme',
    category: 'excel',
    description: 'Change the workbook color theme.',
    params: ['session_id', 'theme'],
    permissionLevel: 'sensitive',
    async execute(args) {
      return _runSessionToolAndSave('change_theme', args);
    },
  },

  // ── 17. excel_query ──────────────────────────────────────────────────
  {
    name: 'excel_query',
    category: 'excel',
    description: 'Read-only: list objects, get object details, data summary, list sheets, inspect registry. Use this to discover IDs before modifying objects.',
    params: ['session_id', 'query', 'object_id', 'sheet'],
    permissionLevel: 'safe',
    async execute(args) {
      const { session_id, ...toolArgs } = args;
      const sessionPath = _getSessionPath(session_id);

      const argsJson = JSON.stringify(toolArgs);
      const script = `
import json

${_loadSessionCode(sessionPath)}

result = session.execute_tool('query_workbook', json.loads(${JSON.stringify(argsJson)}))
write_result({'ok': True, 'result': result})
`;
      const res = await runExcelMasterScript(script, 30000);
      if (!res.ok) throw new Error(res.error || 'Query failed');

      const r = res.result;
      if (r.success) return r.message;
      throw new Error(r.message || 'Query failed');
    },
  },

  // ── 18. excel_undo ───────────────────────────────────────────────────
  {
    name: 'excel_undo',
    category: 'excel',
    description: 'Undo the last action in the Excel dashboard session.',
    params: ['session_id'],
    permissionLevel: 'sensitive',
    async execute({ session_id }) {
      const sessionPath = _getSessionPath(session_id);

      const script = `
${_loadSessionCode(sessionPath)}

ok = session.undo()
if ok:
    out = session.save()
    # Save session state at top-level below
    _undo_result = {'ok': True, 'message': f'Undo successful. Saved: {out}', 'path': str(out), '_save': True}
else:
    _undo_result = {'ok': True, 'message': 'Nothing to undo.'}

if _undo_result.get('_save'):
    ${_saveSessionCall(sessionPath)}
    del _undo_result['_save']

write_result(_undo_result)
`;
      const res = await runExcelMasterScript(script, 120000);
      if (!res.ok) throw new Error(res.error || 'Undo failed');

      if (res.path) {
        try { exec(`open "${res.path}"`); } catch (_) {}
      }
      return res.message;
    },
  },

  // ── 19. excel_redo ───────────────────────────────────────────────────
  {
    name: 'excel_redo',
    category: 'excel',
    description: 'Redo the last undone action in the Excel dashboard session.',
    params: ['session_id'],
    permissionLevel: 'sensitive',
    async execute({ session_id }) {
      const sessionPath = _getSessionPath(session_id);

      const script = `
${_loadSessionCode(sessionPath)}

ok = session.redo()
if ok:
    out = session.save()
    _redo_result = {'ok': True, 'message': f'Redo successful. Saved: {out}', 'path': str(out), '_save': True}
else:
    _redo_result = {'ok': True, 'message': 'Nothing to redo.'}

if _redo_result.get('_save'):
    ${_saveSessionCall(sessionPath)}
    del _redo_result['_save']

write_result(_redo_result)
`;
      const res = await runExcelMasterScript(script, 120000);
      if (!res.ok) throw new Error(res.error || 'Redo failed');

      if (res.path) {
        try { exec(`open "${res.path}"`); } catch (_) {}
      }
      return res.message;
    },
  },

  // ── 20. excel_save ───────────────────────────────────────────────────
  {
    name: 'excel_save',
    category: 'excel',
    description: 'Render and save the current Excel dashboard session to XLSX.',
    params: ['session_id', 'output_path'],
    permissionLevel: 'sensitive',
    async execute({ session_id, output_path }) {
      const sessionPath = _getSessionPath(session_id);
      const outResolved = output_path ? resolvePath(output_path) : null;

      const script = `
${_loadSessionCode(sessionPath)}

${outResolved ? `out = session.save(${JSON.stringify(outResolved)})` : 'out = session.save()'}

${_saveSessionCall(sessionPath)}

write_result({'ok': True, 'path': str(out)})
`;
      const res = await runExcelMasterScript(script, 120000);
      if (!res.ok) throw new Error(res.error || 'Save failed');

      try { exec(`open "${res.path}"`); } catch (_) {}
      return `Dashboard saved: ${res.path}`;
    },
  },
];

// ── Internal helpers ──────────────────────────────────────────────────

function _getSessionPath(sessionId) {
  if (!sessionId) throw new Error('session_id is required. First call excel_auto_build or excel_profile_data to create a session.');
  const p = _sessions.get(sessionId);
  if (p) return p;

  // Try to find by ID pattern in /tmp
  const candidate = path.join(os.tmpdir(), `${sessionId}.json`);
  _sessions.set(sessionId, candidate);
  return candidate;
}

/**
 * Shared helper for all session-mutating tools.
 * Extracts session_id, runs the tool, saves state, and returns formatted result.
 */
async function _runSessionToolAndSave(toolName, args) {
  const { session_id, ...toolArgs } = args;
  const sessionPath = _getSessionPath(session_id);
  const argsJson = JSON.stringify(toolArgs);

  const script = `
import json

${_loadSessionCode(sessionPath)}

result = session.execute_tool(${JSON.stringify(toolName)}, json.loads(${JSON.stringify(argsJson)}))

# Save XLSX after mutation
out = session.save()

# Persist session state
${_saveSessionCall(sessionPath)}

state = session.get_state()
write_result({
    'ok': True,
    'result': result,
    'output_path': str(out),
    'state': state,
})
`;

  const res = await runExcelMasterScript(script, 180000);
  if (!res.ok) throw new Error(res.error || `${toolName} failed`);

  const r = res.result;

  // Open updated file
  if (res.output_path) {
    try { exec(`open "${res.output_path}"`); } catch (_) {}
  }

  const status = r.success ? 'OK' : 'FAILED';
  let msg = `[${status}] ${r.message || ''}`;
  if (r.object_id) msg += `\nObject ID: ${r.object_id}`;
  if (res.output_path) msg += `\nFile: ${res.output_path}`;

  return msg;
}

module.exports = { ExcelTools };
