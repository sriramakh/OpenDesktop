# OpenDesktop Skill Map

Master index of all procedural skills. **Read this FIRST when starting any non-trivial task.**

Each skill file contains exact, verified step-by-step procedures. Following them avoids trial-and-error.

## How to use skills
1. **Before any task**: Find the matching skill below
2. **Read it**: `skill_read(name="<skill-name>")` — follow its exact procedure
3. **After discovering something new**: `skill_update(name, section, content, reason)` — backs up automatically
4. **If an update broke something**: `skill_rollback(name)` — restores the last backup

## Skill Index

### Filesystem (13 tools)
| Skill | File | Covers |
|-------|------|--------|
| Filesystem | `filesystem.md` | fs_read, fs_write, fs_edit, fs_list, fs_search, fs_delete, fs_move, fs_mkdir, fs_tree, fs_info, fs_organize, fs_undo, fs_diff |

### System & Applications (12 tools)
| Skill | File | Covers |
|-------|------|--------|
| System & Apps | `system-apps.md` | system_exec, system_info, system_processes, system_clipboard_read/write, system_notify, app_open, app_find, app_list, app_focus, app_quit, app_screenshot |

### Browser & Tabs (14 tools)
| Skill | File | Covers |
|-------|------|--------|
| Browser Automation | `browser-automation.md` | browser_navigate/click/type/key/submit_form, tabs_list/navigate/close/read/focus/find_duplicates/find_forms/fill_form/run_js |

### Web & Search (5 tools)
| Skill | File | Covers |
|-------|------|--------|
| Web Search | `web-search.md` | web_search, web_fetch, web_fetch_json, web_download, content_summarize routing |

### AI / LLM (4 tools)
| Skill | File | Covers |
|-------|------|--------|
| LLM Tools | `llm-tools.md` | llm_query, llm_summarize, llm_extract, llm_code |

### Office — PDF (4 tools)
| Skill | File | Covers |
|-------|------|--------|
| PDF Tools | `office-pdf.md` | office_read_pdf, office_pdf_search, office_pdf_ask, office_search_pdfs — decision tree, chunked reading |

### Office — DOCX (4 tools)
| Skill | File | Covers |
|-------|------|--------|
| DOCX Tools | `office-docx.md` | office_read_docx, office_write_docx, office_search_docx, office_search_docxs — formatting reference |

### Office — Excel & CSV (9 tools)
| Skill | File | Covers |
|-------|------|--------|
| Excel/CSV Tools | `office-excel.md` | office_read_xlsx, office_analyze_xlsx, office_write_xlsx, office_chart_xlsx, office_read_csv, office_write_csv, office_csv_to_xlsx, office_python_dashboard, office_validate_dashboard |
| Excel Dashboards | `excel-dashboard.md` | Python dashboard workflow, template, KPI formulas, framework rules |
| Dashboard Review | `dashboard-review.md` | Validation loop: build -> validate -> fix -> rebuild until 24/25 |

### Excel Master (22 tools)
| Skill | File | Covers |
|-------|------|--------|
| Excel Builder | `excel-builder.md` | Session-based editing: excel_profile_data through excel_save — templates, themes, charts |

### Presentations (15 tools)
| Skill | File | Covers |
|-------|------|--------|
| Presentation Builder | `presentation-builder.md` | pptx_ai_build workflow, pptx_edit_* tools, 14 themes, 32 slide types |

### Social Media (15 tools)
| Skill | File | Covers |
|-------|------|--------|
| Social Media Overview | `social-media.md` | Tool reference, workflows, context setup, content generation |
| Instagram Procedures | `social-media-instagram.md` | Verified DOM selectors, read feed/post/comments, like, follow, comment |
| TikTok Procedures | `social-media-tiktok.md` | Fullscreen feed, DraftJS comment input, strong[data-e2e] stats |
| Twitter/X Procedures | `social-media-twitter.md` | data-testid selectors for tweets, replies, profiles |

### Content Summarization (1 tool)
| Skill | File | Covers |
|-------|------|--------|
| Content Summarization | `summarize-content.md` | content_summarize — YouTube, podcasts, audio/video, web articles |

### Google Connectors (5 tools)
| Skill | File | Covers |
|-------|------|--------|
| Google Connectors | `google-connectors.md` | connector_drive_search/read, connector_gmail_search/read, connector_calendar_events |

### Reminders (3 tools)
| Skill | File | Covers |
|-------|------|--------|
| Reminders | `reminders.md` | reminder_set, reminder_list, reminder_cancel — time formats, native notifications |

### Parallel Execution (4 tools)
| Skill | File | Covers |
|-------|------|--------|
| Orchestration | `orchestration.md` | agent_spawn, agent_fanout, agent_map, agent_reduce — parallel research patterns |

### GitHub (8 tools)
| Skill | File | Covers |
|-------|------|--------|
| GitHub | `github.md` | github_list_repos/issues/prs, github_create_issue/pr, github_get_file, github_search_code, github_comment |

### Database (6 tools)
| Skill | File | Covers |
|-------|------|--------|
| Database | `database.md` | db_list_connections, db_add_connection, db_test_connection, db_schema, db_describe, db_query |

### Productivity (12 tools)
| Skill | File | Covers |
|-------|------|--------|
| Productivity | `productivity.md` | Jira (5), Linear (3), Notion (4) — search, create, update across platforms |

### Messaging (5 tools)
| Skill | File | Covers |
|-------|------|--------|
| Messaging | `messaging.md` | slack_send, slack_send_blocks, slack_search, teams_send, teams_send_card |

### Workflows & Scheduler (12 tools)
| Skill | File | Covers |
|-------|------|--------|
| Workflows & Scheduler | `workflows-scheduler.md` | workflow_save/list/run/delete/export/import, schedule_create/list/delete/enable/disable/run_now |

### Skill Management (4 tools)
| Skill | File | Covers |
|-------|------|--------|
| Skill Management | `skill-management.md` | skill_read, skill_update, skill_rollback, skill_history — versioned learning |

### Reference
| Skill | File | Covers |
|-------|------|--------|
| Tool Directory | `tool-directory.md` | All 179 tools with one-line descriptions, routing rules |
