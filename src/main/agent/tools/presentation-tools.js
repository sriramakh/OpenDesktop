/**
 * Presentation Tools — PPT Master integration via Python subprocess.
 *
 * 15 tools:
 *   pptx_list_themes         — list all 14 themes (sync, no subprocess)
 *   pptx_list_slide_types    — list all 32 slide types with content keys (sync)
 *   pptx_generate_content    — LLM-powered content generation (Python subprocess)
 *   pptx_build               — build PPTX from content JSON (Python subprocess)
 *   pptx_ai_build            — full AI pipeline (one-shot generation)
 *   pptx_edit_get_state      — show current presentation structure
 *   pptx_edit_add_slide      — add a slide + LLM content generation
 *   pptx_edit_remove_slide   — remove a slide
 *   pptx_edit_move_slide     — reorder slides
 *   pptx_edit_update_content — update specific content fields
 *   pptx_edit_regenerate     — regenerate slide content via LLM
 *   pptx_edit_set_theme      — change visual theme
 *   pptx_edit_rebuild        — force rebuild PPTX
 *   pptx_edit_rename_section — rename a section
 *   pptx_edit_add_section    — add a new section
 */

'use strict';

const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { exec } = require('child_process');
const { getPythonPath } = require('../../python-runtime');

// ── Paths ──────────────────────────────────────────────────────────────

const PPT_MASTER_ROOT = path.join(__dirname, '..', '..', '..', '..', 'assets', 'ppt-master');
const PPT_MASTER_SRC = path.join(PPT_MASTER_ROOT, 'src');
const ICON_DIR = path.join(PPT_MASTER_ROOT, 'data', 'icons');

// ── Helpers ────────────────────────────────────────────────────────────

function resolvePath(p) {
  if (!p) return p;
  if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

/**
 * Run a Python script via child_process.exec and return parsed JSON result.
 * Follows the same pattern as office_python_dashboard in office.js:
 * - Always resolves exec (never rejects) — reads result file for status
 * - Uses shared getPythonPath() for Electron-safe python resolution
 * - Writes boilerplate with PYTHONPATH, dependency auto-install, result writer
 */
async function runPptMasterScript(scriptBody, timeout = 180000) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const scriptPath = path.join(os.tmpdir(), `_pptm_${process.pid}_${ts}_${rand}.py`);
  const resultPath = path.join(os.tmpdir(), `_pptm_result_${process.pid}_${ts}_${rand}.json`);

  // Inject boilerplate: PYTHONPATH, dependency check, result writer
  const fullScript = `#!/usr/bin/env python3
import sys, os, json, traceback, atexit

# Add vendored pptmaster to path
sys.path.insert(0, ${JSON.stringify(PPT_MASTER_SRC)})

# Override icon dir before any pptmaster imports
os.environ['PPTMASTER_ICON_DIR'] = ${JSON.stringify(ICON_DIR)}

RESULT_PATH = ${JSON.stringify(resultPath)}
_result_written = False

def write_result(data):
    global _result_written
    with open(RESULT_PATH, 'w') as f:
        json.dump(data, f)
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
for pkg_name, import_name in [('python-pptx', 'pptx'), ('Pillow', 'PIL'), ('lxml', 'lxml'), ('pydantic', 'pydantic'), ('pydantic-settings', 'pydantic_settings')]:
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
    // Run Python — always resolve (same pattern as office_python_dashboard)
    await new Promise((resolve) => {
      exec(
        `"${getPythonPath()}" "${scriptPath}"`,
        { timeout, maxBuffer: 10 * 1024 * 1024 },
        (err, out, serr) => {
          stdout = out || '';
          stderr = serr || '';
          resolve(); // always resolve — result file tells us what happened
        },
      );
    });

    // Read structured result written by write_result() / _exception_hook
    let res;
    try {
      const raw = await fsp.readFile(resultPath, 'utf-8');
      res = JSON.parse(raw);
    } catch (_readErr) {
      // No result file — likely a syntax error before any code ran
      const errDetail = stderr.trim() || stdout.trim() || 'No output from script.';
      throw new Error(`PPT Master script failed before writing a result.\n\nPython output:\n${errDetail.slice(0, 3000)}`);
    }

    return res;
  } finally {
    await Promise.all([scriptPath, resultPath]
      .map(p => fsp.unlink(p).catch(() => {})));
  }
}

// ── Theme catalog (static data, no subprocess needed) ──────────────────

const THEME_CATALOG = [
  { key: 'corporate',      industry: 'General Corporate',    ux_style: 'classic',    font: 'Inter',     primary: '#1B2A4A', accent: '#C8A951', description: 'Navy & gold, rounded cards with top accent bars. The professional default.' },
  { key: 'healthcare',     industry: 'Healthcare',           ux_style: 'minimal',    font: 'Inter',     primary: '#0F4C5C', accent: '#E36414', description: 'Teal & orange, Swiss-clean design with thin borders and sharp corners.' },
  { key: 'technology',     industry: 'Technology',           ux_style: 'dark',       font: 'Inter',     primary: '#0F172A', accent: '#06B6D4', description: 'Dark mode throughout — slate background with cyan accents.' },
  { key: 'finance',        industry: 'Finance',              ux_style: 'elevated',   font: 'Inter',     primary: '#14532D', accent: '#D4AF37', description: 'Deep green & gold, pill-shaped cards with heavy shadows (Material-like).' },
  { key: 'education',      industry: 'Education',            ux_style: 'bold',       font: 'Inter',     primary: '#881337', accent: '#D4A574', description: 'Crimson & warm tan, big bold type with thick left accent bars.' },
  { key: 'sustainability', industry: 'Sustainability',       ux_style: 'editorial',  font: 'Inter',     primary: '#064E3B', accent: '#92400E', description: 'Forest green, magazine-editorial layout with airy spacing.' },
  { key: 'luxury',         industry: 'Luxury & Fashion',     ux_style: 'gradient',   font: 'Inter',     primary: '#1A1A2E', accent: '#B76E79', description: 'Deep navy & rose, flowing gradient backgrounds with rounded cards.' },
  { key: 'startup',        industry: 'Startup / VC',         ux_style: 'split',      font: 'Inter',     primary: '#3B0764', accent: '#EA580C', description: 'Purple & orange, alternating left/right split layouts.' },
  { key: 'government',     industry: 'Government',           ux_style: 'geo',        font: 'Inter',     primary: '#1E3A5F', accent: '#B91C1C', description: 'Navy & red, angular geometric shapes with hexagon/diamond motifs.' },
  { key: 'realestate',     industry: 'Real Estate',          ux_style: 'retro',      font: 'Inter',     primary: '#374151', accent: '#D97706', description: 'Gray & amber, vintage warm style with decorative borders.' },
  { key: 'creative',       industry: 'Creative & Media',     ux_style: 'magazine',   font: 'Inter',     primary: '#18181B', accent: '#BE185D', description: 'Black & pink, cinematic oversized titles, minimal UI decoration.' },
  { key: 'academic',       industry: 'Academic',             ux_style: 'scholarly',  font: 'Georgia',   primary: '#1E3A5F', accent: '#9B2335', description: 'Navy & crimson, serif typography, thin rules, generous whitespace.' },
  { key: 'research',       industry: 'Research / Scientific', ux_style: 'laboratory', font: 'Calibri',   primary: '#0D4F4F', accent: '#D97706', description: 'Dark teal, lab-style with color-coded left borders and data-first layout.' },
  { key: 'report',         industry: 'Reports / Analysis',   ux_style: 'dashboard',  font: 'Segoe UI',  primary: '#1F2937', accent: '#0891B2', description: 'Gray & teal, analytics-dense tiles with header bands and sidebar feel.' },
];

// ── Slide type catalog (static data) ───────────────────────────────────

const SLIDE_CATALOG = {
  company_overview: {
    description: 'Company mission statement and 4 quick facts',
    content_keys: {
      overview_title: 'string — slide title',
      overview_mission: 'string, 2-3 sentences about company mission',
      overview_facts: '4 items: [["Label","Value"], ...] e.g. [["Founded","2005"],["Employees","2500+"]]',
    },
  },
  our_values: {
    description: '4 core company values with descriptions',
    content_keys: {
      values_title: 'string — slide title',
      values: '4 items: [["Value Name","Description max 100 chars"], ...]',
    },
  },
  team_leadership: {
    description: 'Leadership team — 4 executives with names, titles, bios',
    content_keys: {
      team_title: 'string — slide title',
      team: '4 items: [["Full Name","Job Title","One-line bio max 120 chars"], ...]',
    },
  },
  key_facts: {
    description: '6 big headline statistics/metrics in large font',
    content_keys: {
      key_facts_title: 'string — slide title',
      key_facts: '6 items: [["$850M","Annual Revenue"], ...]',
    },
  },
  sources: {
    description: 'Bibliography/references slide — 4-8 cited sources',
    content_keys: {
      sources_title: 'string — slide title',
      sources_list: '4-8 strings: ["Author (Year). Title. Publication.", ...]',
    },
  },
  executive_summary: {
    description: '5 bullet points summarizing key takeaways + 3 headline metrics',
    content_keys: {
      exec_title: 'string — slide title',
      exec_bullets: '5 strings, each a complete sentence max 130 chars',
      exec_metrics: '3 items: [["$850M","Revenue"], ...]',
    },
  },
  kpi_dashboard: {
    description: '4-KPI dashboard with values, trends, and progress bars',
    content_keys: {
      kpi_title: 'string — slide title',
      kpis: '4 items: [["KPI Name","Value","+23%",0.85,"↑"], ...] — progress is 0.0-1.0',
    },
  },
  process_linear: {
    description: '5-step linear process flow (left to right)',
    content_keys: {
      process_title: 'string — slide title',
      process_steps: '5 items: [["Step Title max 25 chars","Description max 70 chars"], ...]',
    },
  },
  process_circular: {
    description: '4-phase circular/cycle diagram',
    content_keys: {
      cycle_title: 'string — slide title',
      cycle_phases: '4 strings: ["Plan","Execute","Review","Improve"]',
    },
  },
  roadmap_timeline: {
    description: '5-milestone timeline/roadmap',
    content_keys: {
      roadmap_title: 'string — slide title',
      milestones: '5 items: [["Q1 2026","Title max 30 chars","Description max 80 chars"], ...]',
    },
  },
  swot_matrix: {
    description: 'SWOT analysis — 4 quadrants, 3 items each',
    content_keys: {
      swot_title: 'string — slide title',
      swot: '{"strengths":["phrase","...","..."],"weaknesses":[...],"opportunities":[...],"threats":[...]} — 3 items each',
    },
  },
  bar_chart: {
    description: 'Grouped bar chart with 3-8 categories and 1-4 series',
    content_keys: {
      bar_title: 'string — chart title',
      bar_categories: '3-8 strings',
      bar_series: '[{"name":"FY 2025","values":[n per category]}, ...] — 1-4 series',
    },
  },
  line_chart: {
    description: 'Line chart with 3-8 time periods and 1-4 series',
    content_keys: {
      line_title: 'string — chart title',
      line_categories: '3-8 strings (time periods)',
      line_series: '[{"name":"Revenue","values":[n per category]}, ...] — 1-4 series',
    },
  },
  pie_chart: {
    description: 'Pie/donut chart — 3-8 segments that MUST sum to 100',
    content_keys: {
      pie_title: 'string — chart title',
      pie_categories: '3-8 segment names',
      pie_values: '3-8 integers that SUM TO 100',
      pie_legend: '3-8 strings: ["Enterprise (42%)", ...]',
    },
  },
  comparison: {
    description: 'Side-by-side comparison table — 2 options across 6 metrics',
    content_keys: {
      comparison_title: 'string — slide title',
      comparison_headers: '["Option A","Option B"]',
      comparison_rows: '6 items: [["Metric","A value","B value"], ...]',
    },
  },
  data_table: {
    description: '5-column data table with 6 rows',
    content_keys: {
      table_title: 'string',
      table_headers: '5 strings',
      table_rows: '6 rows, each 5 columns',
      table_col_widths: '[2.0, 1.2, 1.2, 1.2, 1.0] — 5 floats in inches',
    },
  },
  two_column: {
    description: 'Two-column layout — intro + bullets on left, 2 sections on right',
    content_keys: {
      two_col_title: 'string — slide title',
      approach_intro: 'string, 1-2 sentences max 160 chars',
      approach_bullets: '5 strings max 80 chars each',
      col2: '[{"heading":"Short-Term","bullets":["b1","b2","b3","b4"]},{"heading":"Long-Term","bullets":["b1","b2","b3","b4"]}]',
    },
  },
  three_column: {
    description: 'Three pillars/columns — 3 key offerings or focus areas',
    content_keys: {
      pillars_title: 'string — slide title',
      pillars: '3 items: [["Pillar Title max 30 chars","Description max 150 chars"], ...]',
    },
  },
  highlight_quote: {
    description: 'Full-slide inspirational quote with attribution',
    content_keys: {
      quote_text: 'string, 2-3 sentences',
      quote_attribution: '"Name, Title"',
      quote_source: 'string — source reference',
    },
  },
  infographic_dashboard: {
    description: 'Mixed infographic: 3 KPIs + mini bar chart + 4 progress bars',
    content_keys: {
      infographic_title: 'string — slide title',
      infographic_kpis: '3 items: [["$850M","Revenue"], ...]',
      infographic_chart_title: 'string',
      infographic_chart_cats: '4 strings',
      infographic_chart_series: '[{"name":"2025","values":[n,n,n,n]},{"name":"2026","values":[n,n,n,n]}]',
      infographic_progress: '4 items: [["Phase label",0.75], ...] — progress 0.0-1.0',
    },
  },
  next_steps: {
    description: '4 action items with owner and due date',
    content_keys: {
      next_steps_title: 'string — slide title',
      next_steps: '4 items: [["Action Title","Description","Owner","Due Date"], ...]',
    },
  },
  call_to_action: {
    description: 'Bold CTA headline with contact details',
    content_keys: {
      cta_headline: 'string — bold CTA, can contain newlines',
      cta_subtitle: 'string — supporting sentence',
      cta_contacts: '3 items: [["Email","contact@company.com"],["Phone","+1 555-123-4567"],["Web","www.company.com"]]',
    },
  },
  funnel_diagram: {
    description: '4-5 stage conversion funnel showing progressive narrowing',
    content_keys: {
      funnel_title: 'string — slide title',
      funnel_stages: '4-5 items: [["Stage Name","Value/Metric","Description max 70 chars"], ...]',
    },
  },
  pyramid_hierarchy: {
    description: '4-5 layer pyramid showing hierarchy (top=narrow, bottom=wide)',
    content_keys: {
      pyramid_title: 'string — slide title',
      pyramid_layers: '4-5 items: [["Layer Name","Description max 80 chars"], ...] — first item is top',
    },
  },
  venn_diagram: {
    description: '2-3 overlapping circles showing relationships',
    content_keys: {
      venn_title: 'string — slide title',
      venn_sets: '2-3 items: [["Set Label","Description max 100 chars"], ...]',
      venn_overlap: 'string — what the overlap represents, max 60 chars',
    },
  },
  hub_spoke: {
    description: 'Central hub with 4-6 radiating spoke elements',
    content_keys: {
      hub_title: 'string — slide title',
      hub_center: 'string — central hub label, max 25 chars',
      hub_spokes: '4-6 items: [["Spoke Label","Description max 80 chars"], ...]',
    },
  },
  milestone_roadmap: {
    description: '5-7 dated milestones on a horizontal timeline',
    content_keys: {
      milestone_title: 'string — slide title',
      milestone_items: '5-7 items: [["Date","Title max 30 chars","Description max 80 chars"], ...]',
    },
  },
  kanban_board: {
    description: '3-column kanban board with task cards',
    content_keys: {
      kanban_title: 'string — slide title',
      kanban_columns: '3 dicts: [{"title":"To Do","cards":["task","task2"]},{"title":"In Progress","cards":[...]},{"title":"Done","cards":[...]}]',
    },
  },
  matrix_quadrant: {
    description: '2x2 matrix with labeled axes and four quadrants',
    content_keys: {
      matrix_title: 'string — slide title',
      matrix_x_axis: 'string — horizontal axis label, max 20 chars',
      matrix_y_axis: 'string — vertical axis label, max 20 chars',
      matrix_quadrants: '4 items: [["Label","Description"], ...] — order: top-left, top-right, bottom-left, bottom-right',
    },
  },
  gauge_dashboard: {
    description: '3-4 donut gauge meters showing progress toward targets',
    content_keys: {
      gauge_title: 'string — slide title',
      gauges: '3-4 items: [["Metric Name","Display Value",0.82], ...] — third element is 0.0-1.0',
    },
  },
  icon_grid: {
    description: '4-6 icon+text cards in a grid',
    content_keys: {
      icon_grid_title: 'string — slide title',
      icon_grid_items: '4-6 items: [["icon_keyword","Title","Description max 90 chars"], ...] — icon keywords: chart, shield, globe, briefcase, brain, etc.',
    },
  },
  risk_matrix: {
    description: 'Color-coded risk assessment grid',
    content_keys: {
      risk_title: 'string — slide title',
      risk_x_label: 'string — horizontal axis, max 20 chars',
      risk_y_label: 'string — vertical axis, max 20 chars',
      risk_items: '4-6 items: [["Risk Name","low|medium|high|critical","Description max 80 chars"], ...]',
    },
  },
};

// Always-included slides (not in selected_slides)
const ALWAYS_INCLUDED = [
  { type: 'cover', description: 'Title slide — provide cover_title, cover_subtitle, cover_date in content' },
  { type: 'toc', description: 'Auto-generated from sections array' },
  { type: 'section_divider', description: 'Auto-inserted before each section' },
  { type: 'thank_you', description: 'Closing slide — provide thankyou_contacts in content: [["Label","Value","Icon keyword"], ...]' },
];

// ── Tool implementations ───────────────────────────────────────────────

const PresentationTools = [
  // ──────────────────────────────────────────────────────────────────────
  // 1. pptx_list_themes
  // ──────────────────────────────────────────────────────────────────────
  {
    name: 'pptx_list_themes',
    category: 'presentation',
    description: 'List all 14 available presentation themes with industry, style, colors, and fonts.',
    params: [],
    permissionLevel: 'safe',
    async execute() {
      let out = '## Available Presentation Themes (14)\n\n';
      for (const t of THEME_CATALOG) {
        out += `### ${t.key}\n`;
        out += `- **Industry**: ${t.industry}\n`;
        out += `- **UX Style**: ${t.ux_style}\n`;
        out += `- **Font**: ${t.font}\n`;
        out += `- **Colors**: primary ${t.primary}, accent ${t.accent}\n`;
        out += `- **Description**: ${t.description}\n\n`;
      }
      out += '**Usage**: Pass the theme key (e.g. "technology", "finance") to pptx_build as theme_key.\n';
      return out;
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // 2. pptx_list_slide_types
  // ──────────────────────────────────────────────────────────────────────
  {
    name: 'pptx_list_slide_types',
    category: 'presentation',
    description: 'List all 32 selectable slide types with descriptions and required content keys for building presentations.',
    params: [],
    permissionLevel: 'safe',
    async execute() {
      let out = '## Selectable Slide Types (32)\n\n';
      out += 'Use these in selected_slides and provide the listed content keys.\n\n';
      for (const [name, info] of Object.entries(SLIDE_CATALOG)) {
        out += `### ${name}\n`;
        out += `${info.description}\n`;
        out += '**Content keys**:\n';
        for (const [k, v] of Object.entries(info.content_keys)) {
          out += `- \`${k}\`: ${v}\n`;
        }
        out += '\n';
      }
      out += '## Always-Included Slides (auto-added, do NOT list in selected_slides)\n\n';
      for (const s of ALWAYS_INCLUDED) {
        out += `- **${s.type}**: ${s.description}\n`;
      }
      return out;
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // 3. pptx_generate_content
  // ──────────────────────────────────────────────────────────────────────
  {
    name: 'pptx_generate_content',
    category: 'presentation',
    description: 'Use Python-side LLM to generate presentation content JSON. Alternative to the agent generating content directly. Requires an API key.',
    params: ['topic', 'company_name', 'industry', 'audience', 'additional_context', 'provider', 'api_key'],
    permissionLevel: 'sensitive',
    async execute({ topic, company_name, industry, audience, additional_context, provider, api_key }) {
      if (!topic) throw new Error('topic is required');

      const script = `
from pptmaster.content.builder_content_gen import generate_builder_content
import json

result = generate_builder_content(
    topic=${JSON.stringify(topic || '')},
    company_name=${JSON.stringify(company_name || 'Acme Corp')},
    industry=${JSON.stringify(industry || '')},
    audience=${JSON.stringify(audience || '')},
    additional_context=${JSON.stringify(additional_context || '')},
    provider=${JSON.stringify(provider || 'minimax')},
    api_key=${JSON.stringify(api_key || '')},
)

write_result({'ok': True, 'content': result})
`;
      const res = await runPptMasterScript(script, 120000);
      if (!res.ok) throw new Error(res.error || 'Content generation failed');
      return JSON.stringify(res.content, null, 2);
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // 4. pptx_build
  // ──────────────────────────────────────────────────────────────────────
  {
    name: 'pptx_build',
    category: 'presentation',
    description: 'Build a professional PPTX file from content JSON using PPT Master (32 slide types, 14 themes, 144 icons). The content_json must follow the schema from pptx_list_slide_types.',
    params: ['content_json', 'theme_key', 'company_name', 'output_path'],
    permissionLevel: 'write',
    async execute({ content_json, theme_key, company_name, output_path }) {
      if (!content_json) throw new Error('content_json is required');

      // Parse content if string
      let content;
      if (typeof content_json === 'string') {
        try { content = JSON.parse(content_json); } catch (e) {
          throw new Error(`Invalid content_json — could not parse JSON: ${e.message}.\nMake sure content_json is a valid JSON object with selected_slides array and content keys.`);
        }
      } else {
        content = content_json;
      }

      // Validate structure — only require selected_slides; Python handles the rest
      if (!content.selected_slides || !Array.isArray(content.selected_slides)) {
        throw new Error(
          'content_json must have a "selected_slides" array listing which slide types to include.\n'
          + 'Valid types: ' + Object.keys(SLIDE_CATALOG).slice(0, 10).join(', ') + ', ...\n'
          + 'Call pptx_list_slide_types to see all 32 available types.'
        );
      }

      // Filter out invalid slide type names (LLM might hallucinate names)
      const validTypes = new Set(Object.keys(SLIDE_CATALOG));
      const originalCount = content.selected_slides.length;
      content.selected_slides = content.selected_slides.filter(s => validTypes.has(s));
      if (content.selected_slides.length === 0) {
        throw new Error(
          `None of the ${originalCount} selected slide types are valid.\n`
          + 'Valid types: ' + Object.keys(SLIDE_CATALOG).join(', ')
        );
      }

      // Auto-fix: if sections have slides that aren't in selected_slides, sync them
      if (content.sections && Array.isArray(content.sections)) {
        const selectedSet = new Set(content.selected_slides);
        for (const sec of content.sections) {
          if (sec.slides && Array.isArray(sec.slides)) {
            sec.slides = sec.slides.filter(s => selectedSet.has(s));
          }
        }
        // Remove empty sections
        content.sections = content.sections.filter(s => s.slides && s.slides.length > 0);
      }

      // Resolve output path
      const resolved = resolvePath(output_path) || path.join(os.homedir(), 'Desktop', 'presentation.pptx');
      const themeKey = theme_key || 'corporate';
      const companyName = company_name || 'Acme Corp';
      const sessionPath = resolved + '.session.json';

      const script = `
import json, os
from pathlib import Path

# Monkey-patch icon dir before imports touch it
import pptmaster.assets.raster_icon_manager as _rim
_rim.DEFAULT_ICON_DIR = Path(${JSON.stringify(ICON_DIR)})
# Reset singleton so it re-initializes with new path
_rim._manager = None

from pptmaster.builder.ai_builder import build_from_content

content_dict = json.loads(${JSON.stringify(JSON.stringify(content))})
output = build_from_content(
    content_dict=content_dict,
    company_name=${JSON.stringify(companyName)},
    theme_key=${JSON.stringify(themeKey)},
    output_path=${JSON.stringify(resolved)},
)

# Save session state for iterative editing
session_state = {
    'gen_result': {
        'selected_slides': content_dict.get('selected_slides', []),
        'sections': content_dict.get('sections', []),
        'content': {k: v for k, v in content_dict.items() if k not in ('selected_slides', 'sections')},
    },
    'theme_key': ${JSON.stringify(themeKey)},
    'company_name': ${JSON.stringify(companyName)},
    'topic': content_dict.get('cover_title', 'Presentation'),
    'output_path': ${JSON.stringify(resolved)},
    'provider': 'minimax',
}
with open(${JSON.stringify(sessionPath)}, 'w') as f:
    json.dump(session_state, f, indent=2)

write_result({
    'ok': True,
    'path': str(output),
    'slides': len(content_dict.get('selected_slides', [])),
    'theme': ${JSON.stringify(themeKey)},
    'session_path': ${JSON.stringify(sessionPath)},
})
`;

      const res = await runPptMasterScript(script, 180000);
      if (!res.ok) {
        const trace = res.traceback ? `\n\nTraceback:\n${res.traceback}` : '';
        throw new Error(`PPTX build failed: ${res.error}${trace}`);
      }

      // Open the file
      exec(`open "${res.path}"`, () => {});

      const totalSlides = (res.slides || 0) + 3; // +cover, +toc, +thankyou (dividers are extra)
      return `Presentation built successfully!\n- **File**: ${res.path}\n- **Content slides**: ${res.slides}\n- **Theme**: ${res.theme}\n- **Total slides**: ~${totalSlides} (+ section dividers)\n- **Session**: ${res.session_path}\n\nThe file has been opened.\n\n**Tip**: You can iteratively edit this presentation using pptx_edit_* tools with the session path above.`;
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // 5. pptx_ai_build — full AI pipeline (matches CLI: ai-build)
  // ──────────────────────────────────────────────────────────────────────
  {
    name: 'pptx_ai_build',
    category: 'presentation',
    description:
      'Build a professional presentation end-to-end using AI content generation. '
      + 'The AI selects optimal slide types (10-15 slides), generates all content, '
      + 'and renders the PPTX — identical to the pptmaster CLI. '
      + 'Use this for comprehensive presentations. Requires an LLM API key in .env.',
    params: ['topic', 'company_name', 'theme_key', 'industry', 'audience', 'additional_context', 'output_path'],
    permissionLevel: 'write',
    async execute({ topic, company_name, theme_key, industry, audience, additional_context, output_path }) {
      if (!topic) throw new Error('topic is required — describe what the presentation is about.');

      const resolved = resolvePath(output_path) || path.join(os.homedir(), 'Desktop', 'presentation.pptx');
      const themeKey = theme_key || 'corporate';
      const companyName = company_name || 'Acme Corp';

      // Detect API key from environment (loaded from .env by dotenv)
      const minimaxKey = process.env.MINIMAX_API_TOKEN || process.env.MINIMAX_API_KEY || '';
      const openaiKey = process.env.OPENAI_API_KEY || '';
      let provider = 'minimax';
      let apiKey = minimaxKey;
      if (!apiKey && openaiKey) {
        provider = 'openai';
        apiKey = openaiKey;
      }
      if (!apiKey) {
        throw new Error(
          'No LLM API key found. pptx_ai_build needs an API key for content generation.\n'
          + 'Set MINIMAX_API_TOKEN or OPENAI_API_KEY in the .env file.'
        );
      }

      const sessionPath = resolved + '.session.json';

      const script = `
# Extra dependency for AI content generation
try:
    import openai as _openai_check
except ImportError:
    import subprocess as _sp2
    _sp2.check_call([sys.executable, '-m', 'pip', 'install', 'openai', '--break-system-packages', '-q'])

import json, os
from pathlib import Path

# Monkey-patch icon dir before imports touch it
import pptmaster.assets.raster_icon_manager as _rim
_rim.DEFAULT_ICON_DIR = Path(${JSON.stringify(ICON_DIR)})
_rim._manager = None

from pptmaster.content.builder_content_gen import generate_builder_content
from pptmaster.builder.ai_builder import _build_selective_pptx
from pptmaster.builder.themes import get_theme

# Step 1: Generate content (LLM picks slides + writes all content)
gen_result = generate_builder_content(
    topic=${JSON.stringify(topic)},
    company_name=${JSON.stringify(companyName)},
    industry=${JSON.stringify(industry || '')},
    audience=${JSON.stringify(audience || '')},
    additional_context=${JSON.stringify(additional_context || '')},
    provider=${JSON.stringify(provider)},
    api_key=${JSON.stringify(apiKey)},
)

# Step 2: Build PPTX
theme = get_theme(${JSON.stringify(themeKey)})
output = _build_selective_pptx(gen_result, theme, ${JSON.stringify(companyName)}, Path(${JSON.stringify(resolved)}))

# Step 3: Save session state for iterative editing
session_state = {
    'gen_result': gen_result,
    'theme_key': ${JSON.stringify(themeKey)},
    'company_name': ${JSON.stringify(companyName)},
    'topic': ${JSON.stringify(topic)},
    'output_path': ${JSON.stringify(resolved)},
    'provider': ${JSON.stringify(provider)},
}
with open(${JSON.stringify(sessionPath)}, 'w') as f:
    json.dump(session_state, f, indent=2)

# Count slides in the generated file
from pptx import Presentation as _Prs
_prs = _Prs(str(output))
slide_count = len(_prs.slides)

write_result({
    'ok': True,
    'path': str(output),
    'slide_count': slide_count,
    'theme': ${JSON.stringify(themeKey)},
    'session_path': ${JSON.stringify(sessionPath)},
})
`;

      const res = await runPptMasterScript(script, 300000); // 5 min — LLM call + build
      if (!res.ok) {
        const trace = res.traceback ? `\n\nTraceback:\n${res.traceback}` : '';
        throw new Error(`PPTX AI build failed: ${res.error}${trace}`);
      }

      // Open the file
      exec(`open "${res.path}"`, () => {});

      return `Presentation built successfully!\n- **File**: ${res.path}\n- **Total slides**: ${res.slide_count}\n- **Theme**: ${res.theme}\n- **Session**: ${res.session_path}\n\nThe AI selected optimal slide types, generated all content, and rendered the presentation. The file has been opened.\n\n**Tip**: You can now iteratively edit this presentation — add/remove/move slides, change themes, update content, or regenerate slides. Use the session path above with pptx_edit_* tools.`;
    },
  },
];

// ── Edit Script Helper ──────────────────────────────────────────────

/**
 * Run a Python edit script against a session file.
 * Reads session JSON → creates PresentationSession → runs mutation → rebuilds if dirty → saves state.
 * @param {string} sessionPath  Absolute path to the .session.json file
 * @param {string} mutationCode Python code that uses `session` variable to apply mutations
 * @param {number} timeout      Timeout in ms
 * @param {boolean} needsRebuild Whether to rebuild PPTX after mutation (default true)
 * @returns {object} Result from Python script
 */
async function runEditScript(sessionPath, mutationCode, timeout = 180000, needsRebuild = true) {
  const resolvedSession = resolvePath(sessionPath);
  if (!resolvedSession) throw new Error('session_path is required');

  // Verify session file exists
  try {
    await fsp.access(resolvedSession);
  } catch {
    throw new Error(`Session file not found: ${resolvedSession}\nBuild a presentation first with pptx_ai_build or pptx_build.`);
  }

  // Detect API key for LLM content generation
  const minimaxKey = process.env.MINIMAX_API_TOKEN || process.env.MINIMAX_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';
  let editProvider = 'minimax';
  let editApiKey = minimaxKey;
  if (!editApiKey && openaiKey) {
    editProvider = 'openai';
    editApiKey = openaiKey;
  }

  const script = `
# Extra dependency for AI content generation (needed for add_slide/regenerate)
try:
    import openai as _openai_check
except ImportError:
    import subprocess as _sp2
    _sp2.check_call([sys.executable, '-m', 'pip', 'install', 'openai', '--break-system-packages', '-q'])

import json
from pathlib import Path

# Monkey-patch icon dir
import pptmaster.assets.raster_icon_manager as _rim
_rim.DEFAULT_ICON_DIR = Path(${JSON.stringify(ICON_DIR)})
_rim._manager = None

from pptmaster.chat.session import PresentationSession

SESSION_PATH = ${JSON.stringify(resolvedSession)}

# Load session state
with open(SESSION_PATH) as f:
    state = json.load(f)

# Use session provider or fall back to env-detected provider
_provider = state.get('provider', ${JSON.stringify(editProvider)}) or ${JSON.stringify(editProvider)}

session = PresentationSession(
    gen_result=state['gen_result'],
    theme_key=state['theme_key'],
    company_name=state['company_name'],
    topic=state['topic'],
    output_path=state['output_path'],
    provider=_provider,
)

# ── Apply mutation ──
${mutationCode}

# ── Rebuild if dirty ──
${needsRebuild ? `
if session._dirty:
    session.rebuild()
` : ''}

# ── Save state back ──
state['gen_result'] = session.gen_result
state['theme_key'] = session.theme_key
with open(SESSION_PATH, 'w') as f:
    json.dump(state, f, indent=2)

write_result({
    'ok': True,
    'message': _edit_msg,
    'slide_count': len(session.selected_slides),
    'output_path': str(session.output_path),
    'theme': session.theme_key,
})
`;

  const res = await runPptMasterScript(script, timeout);
  if (!res.ok) {
    const trace = res.traceback ? `\n\nTraceback:\n${res.traceback}` : '';
    throw new Error(`Edit failed: ${res.error}${trace}`);
  }

  // Open the rebuilt file
  if (needsRebuild && res.output_path) {
    exec(`open "${res.output_path}"`, () => {});
  }

  return res;
}

// ── Edit Tools ──────────────────────────────────────────────────────

const EditTools = [
  // 6. pptx_edit_get_state
  {
    name: 'pptx_edit_get_state',
    category: 'presentation',
    description: 'Show the current structure of an iteratively-edited presentation: sections, slide types, theme, and metadata.',
    params: ['session_path'],
    permissionLevel: 'safe',
    async execute({ session_path }) {
      const res = await runEditScript(
        session_path,
        `_edit_msg = session.get_state()`,
        30000,
        false, // no rebuild needed
      );
      return res.message;
    },
  },

  // 7. pptx_edit_add_slide
  {
    name: 'pptx_edit_add_slide',
    category: 'presentation',
    description: 'Add a new slide to the presentation. LLM generates content for it. Use pptx_list_slide_types to see available types.',
    params: ['session_path', 'slide_type', 'after', 'section_title', 'instruction'],
    permissionLevel: 'write',
    async execute({ session_path, slide_type, after, section_title, instruction }) {
      if (!slide_type) throw new Error('slide_type is required — e.g. "swot_matrix", "bar_chart"');
      const mutation = `_edit_msg = session.add_slide(
    slide_type=${JSON.stringify(slide_type)},
    after=${after ? JSON.stringify(after) : 'None'},
    section_title=${section_title ? JSON.stringify(section_title) : 'None'},
    instruction=${JSON.stringify(instruction || '')},
)`;
      const res = await runEditScript(session_path, mutation, 240000);
      return `${res.message}\n- **Slides**: ${res.slide_count}\n- **File**: ${res.output_path}\n\nThe presentation has been rebuilt and opened.`;
    },
  },

  // 8. pptx_edit_remove_slide
  {
    name: 'pptx_edit_remove_slide',
    category: 'presentation',
    description: 'Remove a slide type from the presentation.',
    params: ['session_path', 'slide_type'],
    permissionLevel: 'write',
    async execute({ session_path, slide_type }) {
      if (!slide_type) throw new Error('slide_type is required');
      const mutation = `_edit_msg = session.remove_slide(${JSON.stringify(slide_type)})`;
      const res = await runEditScript(session_path, mutation, 180000);
      return `${res.message}\n- **Slides**: ${res.slide_count}\n- **File**: ${res.output_path}\n\nThe presentation has been rebuilt and opened.`;
    },
  },

  // 9. pptx_edit_move_slide
  {
    name: 'pptx_edit_move_slide',
    category: 'presentation',
    description: 'Move a slide to a different position. Specify after=null to move to front.',
    params: ['session_path', 'slide_type', 'after'],
    permissionLevel: 'write',
    async execute({ session_path, slide_type, after }) {
      if (!slide_type) throw new Error('slide_type is required');
      const mutation = `_edit_msg = session.move_slide(${JSON.stringify(slide_type)}, after=${after ? JSON.stringify(after) : 'None'})`;
      const res = await runEditScript(session_path, mutation, 180000);
      return `${res.message}\n- **Slides**: ${res.slide_count}\n- **File**: ${res.output_path}\n\nThe presentation has been rebuilt and opened.`;
    },
  },

  // 10. pptx_edit_update_content
  {
    name: 'pptx_edit_update_content',
    category: 'presentation',
    description: 'Update specific content fields for a slide. Pass a JSON object of key-value pairs to update.',
    params: ['session_path', 'slide_type', 'updates'],
    permissionLevel: 'write',
    async execute({ session_path, slide_type, updates }) {
      if (!slide_type) throw new Error('slide_type is required');
      if (!updates) throw new Error('updates is required — JSON object with content keys to update');
      let updatesObj = updates;
      if (typeof updates === 'string') {
        try { updatesObj = JSON.parse(updates); } catch (e) {
          throw new Error(`Invalid updates JSON: ${e.message}`);
        }
      }
      const mutation = `
import json
_updates = json.loads(${JSON.stringify(JSON.stringify(updatesObj))})
_edit_msg = session.update_content(${JSON.stringify(slide_type)}, _updates)`;
      const res = await runEditScript(session_path, mutation, 180000);
      return `${res.message}\n- **File**: ${res.output_path}\n\nThe presentation has been rebuilt and opened.`;
    },
  },

  // 11. pptx_edit_regenerate
  {
    name: 'pptx_edit_regenerate',
    category: 'presentation',
    description: 'Regenerate content for a specific slide using LLM. Optionally pass an instruction to guide the regeneration.',
    params: ['session_path', 'slide_type', 'instruction'],
    permissionLevel: 'write',
    async execute({ session_path, slide_type, instruction }) {
      if (!slide_type) throw new Error('slide_type is required');
      const mutation = `_edit_msg = session.regenerate_slide(${JSON.stringify(slide_type)}, instruction=${JSON.stringify(instruction || '')})`;
      const res = await runEditScript(session_path, mutation, 240000);
      return `${res.message}\n- **File**: ${res.output_path}\n\nThe presentation has been rebuilt and opened.`;
    },
  },

  // 12. pptx_edit_set_theme
  {
    name: 'pptx_edit_set_theme',
    category: 'presentation',
    description: 'Change the visual theme of the presentation. Use pptx_list_themes to see available themes.',
    params: ['session_path', 'theme_key'],
    permissionLevel: 'write',
    async execute({ session_path, theme_key }) {
      if (!theme_key) throw new Error('theme_key is required — e.g. "technology", "finance"');
      const mutation = `_edit_msg = session.set_theme(${JSON.stringify(theme_key)})`;
      const res = await runEditScript(session_path, mutation, 180000);
      return `${res.message}\n- **Theme**: ${res.theme}\n- **File**: ${res.output_path}\n\nThe presentation has been rebuilt and opened.`;
    },
  },

  // 13. pptx_edit_rebuild
  {
    name: 'pptx_edit_rebuild',
    category: 'presentation',
    description: 'Force rebuild the presentation PPTX from current session state without any mutations.',
    params: ['session_path'],
    permissionLevel: 'write',
    async execute({ session_path }) {
      const mutation = `
session._dirty = True
_edit_msg = 'Presentation rebuilt from current state.'`;
      const res = await runEditScript(session_path, mutation, 180000);
      return `${res.message}\n- **Slides**: ${res.slide_count}\n- **File**: ${res.output_path}\n\nThe presentation has been rebuilt and opened.`;
    },
  },

  // 14. pptx_edit_rename_section
  {
    name: 'pptx_edit_rename_section',
    category: 'presentation',
    description: 'Rename a section in the presentation.',
    params: ['session_path', 'old_title', 'new_title'],
    permissionLevel: 'write',
    async execute({ session_path, old_title, new_title }) {
      if (!old_title || !new_title) throw new Error('old_title and new_title are required');
      const mutation = `_edit_msg = session.rename_section(${JSON.stringify(old_title)}, ${JSON.stringify(new_title)})`;
      const res = await runEditScript(session_path, mutation, 180000);
      return `${res.message}\n- **File**: ${res.output_path}\n\nThe presentation has been rebuilt and opened.`;
    },
  },

  // 15. pptx_edit_add_section
  {
    name: 'pptx_edit_add_section',
    category: 'presentation',
    description: 'Add a new empty section to the presentation.',
    params: ['session_path', 'title', 'subtitle'],
    permissionLevel: 'write',
    async execute({ session_path, title, subtitle }) {
      if (!title) throw new Error('title is required');
      const mutation = `_edit_msg = session.add_section(${JSON.stringify(title)}, subtitle=${JSON.stringify(subtitle || '')})`;
      const res = await runEditScript(session_path, mutation, 180000);
      return `${res.message}\n- **File**: ${res.output_path}\n\nThe presentation has been rebuilt and opened.`;
    },
  },
];

// Combine all tools
PresentationTools.push(...EditTools);

module.exports = { PresentationTools };
