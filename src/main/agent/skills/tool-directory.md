# OpenDesktop Tool Directory

Quick-reference for all 160+ tools. Read this when you need to find the right tool for a task.

## Filesystem (13 tools)
| Tool | Purpose |
|------|---------|
| fs_read | Read file contents (text, binary preview) |
| fs_write | Create or overwrite a file |
| fs_edit | Edit part of a file (find & replace) |
| fs_list | List directory contents |
| fs_search | Glob search for files (`**/*.pdf`, `*.jpg`) |
| fs_delete | Delete a file or directory |
| fs_move | Move or rename file/directory |
| fs_mkdir | Create directory (recursive) |
| fs_tree | Directory tree view |
| fs_info | File metadata (size, dates, permissions) |
| fs_organize | Auto-organize files by type — ALWAYS use this, never move manually |
| fs_undo | Undo last fs_organize |
| fs_diff | Compare two files |

## Office — PDF (4 tools)
| Tool | Purpose |
|------|---------|
| office_read_pdf | Read PDF text (mode=overview or full, startPage/endPage for chunks) |
| office_pdf_search | Search ONE PDF by keywords (returns page + context) |
| office_pdf_ask | Ask AI a question about a PDF (native binary for Anthropic/Google) |
| office_search_pdfs | Search ALL PDFs in a directory — ONE call, never loop pdf_search |

**PDF workflow**: Q&A → `office_pdf_ask`. Find term in one PDF → `office_pdf_search`. Search many PDFs → `office_search_pdfs`. Large PDF → read with startPage/endPage in 10-15 page chunks.

## Office — DOCX (4 tools)
| Tool | Purpose |
|------|---------|
| office_read_docx | Read DOCX (format=text/html/structured) |
| office_write_docx | Write DOCX (**bold**, *italic*, tables, headings, page breaks) |
| office_search_docx | Search ONE DOCX (paragraph context + section heading) |
| office_search_docxs | Search ALL DOCX files in a directory |

## Office — Excel/CSV (8 tools)
| Tool | Purpose |
|------|---------|
| office_read_xlsx | Read Excel (summaryOnly=true for quick look) |
| office_analyze_xlsx | Analyze Excel structure + stats (NOT for CSV) |
| office_write_xlsx | Write/modify Excel (sheetData, operations, formulas) |
| office_chart_xlsx | Create Excel charts (column, bar, line, pie, area, scatter) |
| office_read_csv | Read CSV (first 200 rows by default) |
| office_write_csv | Write CSV |
| office_csv_to_xlsx | Convert CSV to XLSX — use for large CSVs (>300 rows) |
| office_python_dashboard | Build professional Excel dashboards with Python script |

**Excel workflow**: Analyze first (`office_analyze_xlsx` for XLSX, `office_read_csv` for CSV) → write/modify → chart. Always use formulas, not hardcoded values.

**Dashboard/report/visualization** → ONLY use `office_python_dashboard`. Read skill guide first: `fs_read("skills/excel-dashboard.md")`. After building, ALWAYS validate: `office_validate_dashboard`.

## Office — Other (3 tools)
| Tool | Purpose |
|------|---------|
| office_read_pptx | Read PowerPoint slides |
| office_write_pptx | Write PowerPoint (low-level, prefer pptx_ai_build) |
| office_validate_dashboard | Validate dashboard quality (25 checks, score out of 25) |

## Excel Master (22 tools)
Session-based Excel editing engine. Profile → auto-build → modify iteratively → save.

| Tool | Purpose |
|------|---------|
| excel_profile_data | Profile dataset before building |
| excel_auto_build | Auto-build dashboard (returns session_id) |
| excel_add_chart | Add chart to session |
| excel_add_kpi_row | Add KPI metric tiles |
| excel_add_table | Add data/pivot table |
| excel_add_content | Add title/header/text |
| excel_modify_object | Modify object by ID |
| excel_remove_object | Remove object by ID |
| excel_write_cells | Write values/formulas/formatting to cells |
| excel_format_range | Format cell ranges |
| excel_add_feature | Conditional formatting, validation, freeze, merge, etc. |
| excel_sheet_op | Create/rename/delete/reorder sheets |
| excel_row_col_op | Resize/hide rows/columns |
| excel_change_theme | Change color theme |
| excel_query | Read-only inspection (list_objects, data_summary) |
| excel_undo | Undo last action |
| excel_redo | Redo |
| excel_save | Save to XLSX |
| excel_list_templates | Show available templates |
| excel_list_themes | Show available themes |
| excel_vba_run | Run VBA macro in .xlsm |
| excel_vba_list | List VBA modules |

**Skill guide**: `fs_read("skills/excel-builder.md")`

## Presentations (15 tools)
| Tool | Purpose |
|------|---------|
| **pptx_ai_build** | **CREATE new presentations — ALWAYS use this** |
| pptx_edit_get_state | View current presentation structure |
| pptx_edit_add_slide | Add a slide |
| pptx_edit_remove_slide | Remove a slide |
| pptx_edit_move_slide | Reorder slides |
| pptx_edit_update_content | Update slide content |
| pptx_edit_regenerate | Regenerate a slide with AI |
| pptx_edit_set_theme | Change theme |
| pptx_edit_rebuild | Full rebuild from session |
| pptx_edit_rename_section | Rename a section |
| pptx_edit_add_section | Add a new section |
| pptx_build | Low-level build (prefer pptx_ai_build) |
| pptx_list_themes | List available themes |
| pptx_list_slide_types | List slide types |
| pptx_generate_content | Generate slide content |

**New presentation** → `pptx_ai_build` (do research first if needed, pass as additional_context). **Edit existing** → `pptx_edit_*` tools with session_path from original build.

**Skill guide**: `fs_read("skills/presentation-builder.md")`

## System (6 tools)
| Tool | Purpose |
|------|---------|
| system_exec | Run shell commands |
| system_info | System information |
| system_processes | List running processes |
| system_clipboard_read | Read clipboard |
| system_clipboard_write | Write to clipboard |
| system_notify | Show native notification |

## Applications (6 tools)
| Tool | Purpose |
|------|---------|
| app_open | Open an app by name |
| app_find | Find app path |
| app_list | List installed apps |
| app_focus | Focus/bring app to front |
| app_quit | Quit an app |
| app_screenshot | Take screenshot |

## Browser Automation (5 tools)
| Tool | Purpose |
|------|---------|
| browser_navigate | Navigate to URL (opens default browser) |
| browser_click | Click element on page |
| browser_type | Type text into element |
| browser_key | Send keyboard shortcut |
| browser_submit_form | Submit a form |

## Browser Tabs (9 tools)
| Tool | Purpose |
|------|---------|
| tabs_list | List open tabs (browser="all") — returns indices for other tools |
| tabs_navigate | Open URL in existing browser tab or new tab |
| tabs_close | Close tabs (by index, URL pattern, or duplicates) |
| tabs_read | Read page text from a tab |
| tabs_focus | Focus a specific tab |
| tabs_find_duplicates | Find duplicate tabs |
| tabs_find_forms | Discover form fields on page |
| tabs_fill_form | Fill form fields |
| tabs_run_js | Execute JavaScript in tab |

**Always use `tabs_navigate` to open URLs** (not browser_navigate or app_open).

## Web (4 tools)
| Tool | Purpose |
|------|---------|
| web_search | Search the web |
| web_fetch | Fetch webpage content |
| web_fetch_json | Fetch JSON API |
| web_download | Download file from URL |

## AI / LLM (4 tools)
| Tool | Purpose |
|------|---------|
| llm_query | Ask AI a question |
| llm_summarize | Summarize text |
| llm_extract | Extract structured data |
| llm_code | Generate code |

## Content (1 tool)
| Tool | Purpose |
|------|---------|
| content_summarize | Summarize YouTube, podcasts, audio, video, web articles |

**Skill guide**: `fs_read("skills/summarize-content.md")`

## Google Connectors (5 tools)
Require user to connect via connector button first.

| Tool | Purpose |
|------|---------|
| connector_drive_search | Search Google Drive |
| connector_drive_read | Read Drive file |
| connector_gmail_search | Search Gmail |
| connector_gmail_read | Read email |
| connector_calendar_events | List calendar events |

## Reminders (3 tools)
| Tool | Purpose |
|------|---------|
| reminder_set | Schedule a reminder (natural language time) |
| reminder_list | List reminders |
| reminder_cancel | Cancel a reminder |

## Parallel Execution (4 tools)
| Tool | Purpose |
|------|---------|
| agent_spawn | Spawn a sub-agent |
| agent_fanout | Run multiple prompts in parallel |
| agent_map | Map operation across items |
| agent_reduce | Synthesize parallel results |

## GitHub (8 tools)
| Tool | Purpose |
|------|---------|
| github_list_repos | List repositories |
| github_list_issues | List issues |
| github_create_issue | Create issue |
| github_list_prs | List pull requests |
| github_create_pr | Create PR |
| github_get_file | Get file from repo |
| github_search_code | Search code across repos |
| github_comment | Comment on issue/PR |

## Database (6 tools)
| Tool | Purpose |
|------|---------|
| db_list_connections | List saved DB connections |
| db_add_connection | Add connection (SQLite, Postgres, MySQL) |
| db_test_connection | Test connection |
| db_schema | Get database schema |
| db_describe | Describe a table |
| db_query | Run SQL query |

## Productivity — Jira (5 tools)
| Tool | Purpose |
|------|---------|
| jira_search | Search Jira issues (JQL) |
| jira_get_issue | Get issue details |
| jira_create_issue | Create issue |
| jira_update_status | Update issue status |
| jira_add_comment | Add comment |

## Productivity — Linear (3 tools)
| Tool | Purpose |
|------|---------|
| linear_list_issues | List issues |
| linear_create_issue | Create issue |
| linear_update_issue | Update issue |

## Productivity — Notion (4 tools)
| Tool | Purpose |
|------|---------|
| notion_search | Search Notion |
| notion_read_page | Read page |
| notion_create_page | Create page |
| notion_append_block | Append content to page |

## Messaging — Slack (3 tools)
| Tool | Purpose |
|------|---------|
| slack_send | Send message to channel |
| slack_send_blocks | Send rich block message |
| slack_search | Search messages |

## Messaging — Teams (2 tools)
| Tool | Purpose |
|------|---------|
| teams_send | Send message via webhook |
| teams_send_card | Send adaptive card |

## Workflows (6 tools)
| Tool | Purpose |
|------|---------|
| workflow_save | Save a workflow |
| workflow_list | List workflows |
| workflow_run | Run a workflow |
| workflow_delete | Delete workflow |
| workflow_export | Export workflow |
| workflow_import | Import workflow |

## Scheduler (6 tools)
| Tool | Purpose |
|------|---------|
| schedule_create | Create scheduled task |
| schedule_list | List schedules |
| schedule_delete | Delete schedule |
| schedule_enable | Enable schedule |
| schedule_disable | Disable schedule |
| schedule_run_now | Run scheduled task immediately |

## Social Media Controller (15 tools)
Browser-based social media automation via active sessions. User must be logged in.

| Tool | Purpose |
|------|---------|
| social_set_context | Set business context (brand, tone, topics, audience) for AI content |
| social_get_context | Read current business context |
| social_open | Open feed, profile, notifications, or upload page |
| social_read_feed | Read visible feed — posts with author, description, stats |
| social_read_post | Read current post details + all comments |
| social_read_profile | Read user profile (bio, followers, following) |
| social_read_notifications | Read notifications |
| social_scroll | Scroll to load more content |
| social_like | Like/heart the current post |
| social_follow | Follow the current user |
| social_comment | Post a comment (auto-generates from context if text omitted) |
| social_reply | Reply to a specific comment by index |
| social_create_post | Open upload page, pre-fill caption |
| social_generate_content | AI-generate captions, comments, hashtags, post ideas, bios |
| social_activity_log | View activity history (filter by platform/action) |

**Platforms**: tiktok, instagram, twitter. **Skill guide**: `fs_read("skills/social-media.md")`

**Workflow**: `social_set_context` first (once) -> `social_open` -> read/scroll -> engage (like/follow/comment) -> `social_activity_log` to review.

## Skill Management (4 tools)
Safe, versioned skill learning. Always read skills before tasks, update after verified discoveries.

| Tool | Purpose |
|------|---------|
| skill_read | Read a skill file (or list all skills if no name given) |
| skill_update | Update a skill with new procedure — backs up old version first |
| skill_rollback | Restore a skill to a previous backup version |
| skill_history | View backup history for a skill file |

**Safety**: `skill_update` is sensitive (needs approval). Always backs up. Only update AFTER verifying the procedure works.

## Routing Rules
- **New presentation** → `pptx_ai_build` (NEVER pptx_build or office_write_pptx)
- **Edit presentation** → `pptx_edit_*` with session_path
- **Dashboard/report/chart from data** → `office_python_dashboard` (NEVER office_dashboard_xlsx)
- **CSV to Excel** → `office_csv_to_xlsx` (NEVER read_csv + write_xlsx for large files)
- **Organize files** → `fs_organize` (NEVER manual move loops)
- **Open URL in browser** → `tabs_navigate` (NEVER browser_navigate or app_open)
- **Multi-PDF search** → `office_search_pdfs` (NEVER loop pdf_search)
- **Multi-DOCX search** → `office_search_docxs` (NEVER loop search_docx)
- **Parallel research** → `agent_fanout` + `agent_reduce`
