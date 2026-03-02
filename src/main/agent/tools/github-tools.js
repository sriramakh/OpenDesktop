/**
 * GitHubTools — GitHub REST API integration via @octokit/rest.
 * Token stored in KeyStore as 'github'.
 */

let _keyStore = null;
function setKeyStore(ks) { _keyStore = ks; }

function getOctokit() {
  const { Octokit } = require('@octokit/rest');
  const token = _keyStore?.getKey ? _keyStore.getKey('github') : null;
  if (!token) throw new Error('GitHub token not configured. Add it in Settings → Integrations with key "github".');
  return new Octokit({ auth: token });
}

/** Wrap GitHub API calls with proper error handling */
async function withGitHub(fn) {
  try {
    return await fn(getOctokit());
  } catch (err) {
    const status = err.status || err.response?.status || '';
    const msg = err.response?.data?.message || err.message || 'Unknown error';
    if (status === 401) throw new Error('GitHub authentication failed. Check your token in Settings → Integrations.');
    if (status === 403) throw new Error(`GitHub rate limit or permission error: ${msg}`);
    if (status === 404) throw new Error(`GitHub resource not found: ${msg}`);
    throw new Error(`GitHub API error${status ? ` (${status})` : ''}: ${msg}`);
  }
}

const GITHUB_TOOLS = [
  {
    name: 'github_list_repos', description: 'List GitHub repositories for a user or organization.',
    category: 'github', permissionLevel: 'safe', params: ['owner'],
    execute: async ({ owner, type = 'all', sort = 'updated', limit = 30 }) => {
      if (!owner) throw new Error('owner is required');
      return withGitHub(async (octokit) => {
        const { data } = await octokit.repos.listForUser({ username: owner, type, sort, per_page: Math.min(limit, 100) });
        return JSON.stringify({
          owner, count: data.length,
          repos: data.map((r) => ({ name: r.name, fullName: r.full_name, description: r.description, private: r.private, language: r.language, stars: r.stargazers_count, forks: r.forks_count, updatedAt: r.updated_at, url: r.html_url })),
        });
      });
    },
  },
  {
    name: 'github_list_issues', description: 'List issues for a GitHub repository.',
    category: 'github', permissionLevel: 'safe', params: ['owner', 'repo'],
    execute: async ({ owner, repo, state = 'open', label, limit = 20 }) => {
      if (!owner || !repo) throw new Error('owner and repo are required');
      return withGitHub(async (octokit) => {
        const params = { owner, repo, state, per_page: Math.min(limit, 100) };
        if (label) params.labels = label;
        const { data } = await octokit.issues.listForRepo(params);
        return JSON.stringify({
          owner, repo, state, count: data.length,
          issues: data.map((i) => ({ number: i.number, title: i.title, state: i.state, labels: i.labels.map((l) => l.name), assignee: i.assignee?.login, author: i.user?.login, createdAt: i.created_at, updatedAt: i.updated_at, url: i.html_url, body: i.body?.slice(0, 500) })),
        });
      });
    },
  },
  {
    name: 'github_create_issue', description: 'Create a new GitHub issue.',
    category: 'github', permissionLevel: 'sensitive', params: ['owner', 'repo', 'title'],
    execute: async ({ owner, repo, title, body, labels, assignees }) => {
      if (!owner || !repo || !title) throw new Error('owner, repo, and title are required');
      return withGitHub(async (octokit) => {
        const { data } = await octokit.issues.create({
          owner, repo, title, body: body || '',
          labels:    Array.isArray(labels)    ? labels    : (labels    ? [labels]    : []),
          assignees: Array.isArray(assignees) ? assignees : (assignees ? [assignees] : []),
        });
        return JSON.stringify({ ok: true, number: data.number, url: data.html_url, title: data.title });
      });
    },
  },
  {
    name: 'github_list_prs', description: 'List pull requests for a GitHub repository.',
    category: 'github', permissionLevel: 'safe', params: ['owner', 'repo'],
    execute: async ({ owner, repo, state = 'open', limit = 20 }) => {
      if (!owner || !repo) throw new Error('owner and repo are required');
      return withGitHub(async (octokit) => {
        const { data } = await octokit.pulls.list({ owner, repo, state, per_page: Math.min(limit, 100), sort: 'updated', direction: 'desc' });
        return JSON.stringify({
          owner, repo, state, count: data.length,
          prs: data.map((p) => ({ number: p.number, title: p.title, state: p.state, author: p.user?.login, head: p.head?.ref, base: p.base?.ref, createdAt: p.created_at, updatedAt: p.updated_at, url: p.html_url, draft: p.draft })),
        });
      });
    },
  },
  {
    name: 'github_create_pr', description: 'Create a pull request.',
    category: 'github', permissionLevel: 'sensitive', params: ['owner', 'repo', 'title', 'head', 'base'],
    execute: async ({ owner, repo, title, head, base, body, draft = false }) => {
      if (!owner || !repo || !title || !head || !base) throw new Error('owner, repo, title, head, and base are required');
      return withGitHub(async (octokit) => {
        const { data } = await octokit.pulls.create({ owner, repo, title, head, base, body: body || '', draft: !!draft });
        return JSON.stringify({ ok: true, number: data.number, url: data.html_url, state: data.state });
      });
    },
  },
  {
    name: 'github_get_file', description: 'Get file contents from a GitHub repository.',
    category: 'github', permissionLevel: 'safe', params: ['owner', 'repo', 'filePath'],
    execute: async ({ owner, repo, filePath, ref }) => {
      if (!owner || !repo || !filePath) throw new Error('owner, repo, and filePath are required');
      return withGitHub(async (octokit) => {
        const params = { owner, repo, path: filePath };
        if (ref) params.ref = ref;
        const { data } = await octokit.repos.getContent(params);
        if (data.encoding === 'base64') {
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          return JSON.stringify({ path: data.path, sha: data.sha, size: data.size, content: content.slice(0, 50000) });
        }
        return JSON.stringify({ path: data.path, sha: data.sha, content: data.content });
      });
    },
  },
  {
    name: 'github_search_code', description: 'Search for code across GitHub repositories.',
    category: 'github', permissionLevel: 'safe', params: ['query'],
    execute: async ({ query, limit = 10 }) => {
      if (!query) throw new Error('query is required');
      return withGitHub(async (octokit) => {
        const { data } = await octokit.search.code({ q: query, per_page: Math.min(limit, 30) });
        return JSON.stringify({
          query, total: data.total_count,
          results: data.items.map((i) => ({ name: i.name, path: i.path, repository: i.repository.full_name, url: i.html_url, sha: i.sha })),
        });
      });
    },
  },
  {
    name: 'github_comment', description: 'Add a comment to a GitHub issue or PR.',
    category: 'github', permissionLevel: 'sensitive', params: ['owner', 'repo', 'issueNumber', 'body'],
    execute: async ({ owner, repo, issueNumber, body }) => {
      if (!owner || !repo || !issueNumber || !body) throw new Error('owner, repo, issueNumber, and body are required');
      return withGitHub(async (octokit) => {
        const { data } = await octokit.issues.createComment({ owner, repo, issue_number: Number(issueNumber), body });
        return JSON.stringify({ ok: true, id: data.id, url: data.html_url });
      });
    },
  },
];

module.exports = { GITHUB_TOOLS, setKeyStore };
