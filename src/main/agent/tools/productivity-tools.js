/**
 * ProductivityTools — Jira, Linear, and Notion integrations.
 *
 * Tokens in KeyStore: jira_token, jira_email, jira_url, linear_token, notion_token.
 */

const https = require('https');

let _keyStore = null;
function setKeyStore(ks) { _keyStore = ks; }
function getKey(k) { return _keyStore?.getKey ? _keyStore.getKey(k) : null; }

function apiRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { 'Content-Type': 'application/json', 'User-Agent': 'OpenDesktop/1.0', ...headers };
    if (payload) reqHeaders['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(
      { host: parsed.host, path: parsed.pathname + parsed.search, method, headers: reqHeaders },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
          else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function jiraHeaders() {
  const email = getKey('jira_email');
  const token = getKey('jira_token');
  if (!email || !token) throw new Error('Jira not configured. Add jira_email and jira_token in Settings → Integrations.');
  return { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
}
function jiraUrl(p) {
  const base = getKey('jira_url');
  if (!base) throw new Error('jira_url not configured. Add it in Settings → Integrations.');
  return `${base.replace(/\/$/, '')}/rest/api/3${p}`;
}
function linearHeaders() {
  const token = getKey('linear_token');
  if (!token) throw new Error('Linear token not configured. Add linear_token in Settings → Integrations.');
  return { Authorization: token };
}
function notionHeaders() {
  const token = getKey('notion_token');
  if (!token) throw new Error('Notion token not configured. Add notion_token in Settings → Integrations.');
  return { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' };
}

const PRODUCTIVITY_TOOLS = [
  // ── Jira ──────────────────────────────────────────────────────────────────
  {
    name: 'jira_search', description: 'Search Jira issues using JQL.',
    category: 'productivity', permissionLevel: 'safe', params: ['jql'],
    execute: async ({ jql, maxResults = 20 }) => {
      if (!jql) throw new Error('jql is required');
      const data = await apiRequest('POST', jiraUrl('/search'), jiraHeaders(), {
        jql, maxResults: Math.min(maxResults, 50),
        fields: ['summary', 'status', 'assignee', 'priority', 'issuetype', 'created', 'updated', 'labels'],
      });
      return JSON.stringify({
        total: data.total, returned: (data.issues || []).length,
        issues: (data.issues || []).map((i) => ({ key: i.key, summary: i.fields?.summary, status: i.fields?.status?.name, assignee: i.fields?.assignee?.displayName, priority: i.fields?.priority?.name, type: i.fields?.issuetype?.name, updated: i.fields?.updated })),
      });
    },
  },
  {
    name: 'jira_get_issue', description: 'Get details of a specific Jira issue.',
    category: 'productivity', permissionLevel: 'safe', params: ['issueKey'],
    execute: async ({ issueKey }) => {
      if (!issueKey) throw new Error('issueKey is required');
      const data = await apiRequest('GET', jiraUrl(`/issue/${issueKey}`), jiraHeaders());
      return JSON.stringify({ key: data.key, summary: data.fields?.summary, status: data.fields?.status?.name, assignee: data.fields?.assignee?.displayName, priority: data.fields?.priority?.name, type: data.fields?.issuetype?.name, created: data.fields?.created, updated: data.fields?.updated, labels: data.fields?.labels });
    },
  },
  {
    name: 'jira_create_issue', description: 'Create a new Jira issue.',
    category: 'productivity', permissionLevel: 'sensitive', params: ['projectKey', 'summary'],
    execute: async ({ projectKey, summary, issueType = 'Task', description, priority, labels }) => {
      if (!projectKey || !summary) throw new Error('projectKey and summary are required');
      const fields = { project: { key: projectKey }, summary, issuetype: { name: issueType } };
      if (description) fields.description = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }] };
      if (priority)    fields.priority = { name: priority };
      if (labels)      fields.labels = Array.isArray(labels) ? labels : [labels];
      const data = await apiRequest('POST', jiraUrl('/issue'), jiraHeaders(), { fields });
      return JSON.stringify({ ok: true, key: data.key, id: data.id, url: `${getKey('jira_url')}/browse/${data.key}` });
    },
  },
  {
    name: 'jira_update_status', description: 'Transition a Jira issue to a new status.',
    category: 'productivity', permissionLevel: 'sensitive', params: ['issueKey', 'status'],
    execute: async ({ issueKey, status }) => {
      if (!issueKey || !status) throw new Error('issueKey and status are required');
      const trans = await apiRequest('GET', jiraUrl(`/issue/${issueKey}/transitions`), jiraHeaders());
      const match = trans.transitions?.find((t) => t.name.toLowerCase() === status.toLowerCase());
      if (!match) throw new Error(`Status "${status}" not found. Available: ${trans.transitions?.map((t) => t.name).join(', ')}`);
      await apiRequest('POST', jiraUrl(`/issue/${issueKey}/transitions`), jiraHeaders(), { transition: { id: match.id } });
      return JSON.stringify({ ok: true, issueKey, newStatus: match.name });
    },
  },
  {
    name: 'jira_add_comment', description: 'Add a comment to a Jira issue.',
    category: 'productivity', permissionLevel: 'sensitive', params: ['issueKey', 'body'],
    execute: async ({ issueKey, body }) => {
      if (!issueKey || !body) throw new Error('issueKey and body are required');
      const data = await apiRequest('POST', jiraUrl(`/issue/${issueKey}/comment`), jiraHeaders(), {
        body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] },
      });
      return JSON.stringify({ ok: true, id: data.id });
    },
  },

  // ── Linear ─────────────────────────────────────────────────────────────────
  {
    name: 'linear_list_issues', description: 'List Linear issues.',
    category: 'productivity', permissionLevel: 'safe', params: [],
    execute: async ({ teamId, state, limit = 20 } = {}) => {
      // Use GraphQL variables to prevent injection
      const variables = {};
      const varDefs = [];
      const filters = [];

      if (teamId) {
        varDefs.push('$teamId: ID');
        filters.push('team: { id: { eq: $teamId } }');
        variables.teamId = teamId;
      }
      if (state) {
        varDefs.push('$state: String');
        filters.push('state: { name: { eq: $state } }');
        variables.state = state;
      }

      const varDefStr  = varDefs.length ? `(${varDefs.join(', ')})` : '';
      const filterStr  = filters.length ? `(filter: { ${filters.join(', ')} })` : `(first: ${Math.min(limit, 50)})`;
      const query = `query ListIssues${varDefStr} { issues${filterStr} { nodes { id title state { name } assignee { name } priority createdAt updatedAt url } } }`;

      const data  = await apiRequest('POST', 'https://api.linear.app/graphql', linearHeaders(), { query, variables });
      const issues = data.data?.issues?.nodes || [];
      return JSON.stringify({ count: issues.length, issues });
    },
  },
  {
    name: 'linear_create_issue', description: 'Create a new Linear issue.',
    category: 'productivity', permissionLevel: 'sensitive', params: ['teamId', 'title'],
    execute: async ({ teamId, title, description, priority, stateId }) => {
      if (!teamId || !title) throw new Error('teamId and title are required');
      const mutation  = 'mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id title url } } }';
      const variables = { input: { teamId, title, description, priority, stateId } };
      const data      = await apiRequest('POST', 'https://api.linear.app/graphql', linearHeaders(), { query: mutation, variables });
      return JSON.stringify({ ok: data.data?.issueCreate?.success, issue: data.data?.issueCreate?.issue });
    },
  },
  {
    name: 'linear_update_issue', description: 'Update a Linear issue.',
    category: 'productivity', permissionLevel: 'sensitive', params: ['issueId'],
    execute: async ({ issueId, title, description, priority, stateId }) => {
      if (!issueId) throw new Error('issueId is required');
      const mutation  = 'mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id title state { name } } } }';
      const variables = { id: issueId, input: { title, description, priority, stateId } };
      const data      = await apiRequest('POST', 'https://api.linear.app/graphql', linearHeaders(), { query: mutation, variables });
      return JSON.stringify({ ok: data.data?.issueUpdate?.success, issue: data.data?.issueUpdate?.issue });
    },
  },

  // ── Notion ─────────────────────────────────────────────────────────────────
  {
    name: 'notion_search', description: 'Search Notion pages and databases.',
    category: 'productivity', permissionLevel: 'safe', params: ['query'],
    execute: async ({ query, limit = 10 }) => {
      if (!query) throw new Error('query is required');
      const data = await apiRequest('POST', 'https://api.notion.com/v1/search', notionHeaders(), { query, page_size: Math.min(limit, 20) });
      return JSON.stringify({
        total: (data.results || []).length,
        results: (data.results || []).map((r) => ({
          id: r.id, type: r.object, url: r.url, createdTime: r.created_time,
          title: r.properties?.title?.title?.[0]?.text?.content || r.properties?.Name?.title?.[0]?.text?.content || r.title?.[0]?.text?.content || '(untitled)',
        })),
      });
    },
  },
  {
    name: 'notion_read_page', description: 'Read the content blocks of a Notion page.',
    category: 'productivity', permissionLevel: 'safe', params: ['pageId'],
    execute: async ({ pageId }) => {
      if (!pageId) throw new Error('pageId is required');
      const [page, blocks] = await Promise.all([
        apiRequest('GET', `https://api.notion.com/v1/pages/${pageId}`, notionHeaders()),
        apiRequest('GET', `https://api.notion.com/v1/blocks/${pageId}/children`, notionHeaders()),
      ]);
      const title   = page.properties?.title?.title?.[0]?.text?.content || '(untitled)';
      const content = (blocks.results || [])
        .map((b) => { const text = b[b.type]?.rich_text?.map((t) => t.text?.content).join('') || ''; return text ? `[${b.type}] ${text}` : null; })
        .filter(Boolean).join('\n');
      return JSON.stringify({ id: pageId, title, content: content.slice(0, 10000) });
    },
  },
  {
    name: 'notion_create_page', description: 'Create a new Notion page.',
    category: 'productivity', permissionLevel: 'sensitive', params: ['parentId', 'title'],
    execute: async ({ parentId, title, content, parentType = 'page_id' }) => {
      if (!parentId || !title) throw new Error('parentId and title are required');
      const parent = parentType === 'database_id' ? { database_id: parentId } : { page_id: parentId };
      const body   = {
        parent,
        properties: { title: { title: [{ text: { content: title } }] } },
        children: content ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: content.slice(0, 2000) } }] } }] : [],
      };
      const data = await apiRequest('POST', 'https://api.notion.com/v1/pages', notionHeaders(), body);
      return JSON.stringify({ ok: true, id: data.id, url: data.url });
    },
  },
  {
    name: 'notion_append_block', description: 'Append content to a Notion page.',
    category: 'productivity', permissionLevel: 'sensitive', params: ['pageId', 'content'],
    execute: async ({ pageId, content, blockType = 'paragraph' }) => {
      if (!pageId || !content) throw new Error('pageId and content are required');
      const data = await apiRequest('PATCH', `https://api.notion.com/v1/blocks/${pageId}/children`, notionHeaders(), {
        children: [{ object: 'block', type: blockType, [blockType]: { rich_text: [{ type: 'text', text: { content: content.slice(0, 2000) } }] } }],
      });
      return JSON.stringify({ ok: true, blockCount: data.results?.length || 1 });
    },
  },
];

module.exports = { PRODUCTIVITY_TOOLS, setKeyStore };
