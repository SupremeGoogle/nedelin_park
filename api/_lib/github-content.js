const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPO || 'SupremeGoogle/nedelin_park';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const CONTENT_PATH = process.env.GITHUB_CONTENT_PATH || 'content.json';

function githubConfigured() {
  return Boolean(TOKEN && REPO);
}

function apiUrl(path) {
  return `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
}

async function githubFetch(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'nedelin-park-admin',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`GitHub API ${r.status}: ${text.slice(0, 500)}`);
  }
  return r.json();
}

async function getFileMeta() {
  try {
    return await githubFetch(`${apiUrl(CONTENT_PATH)}?ref=${encodeURIComponent(BRANCH)}`);
  } catch (e) {
    if (/GitHub API 404/.test(e.message)) return null;
    throw e;
  }
}

async function githubGetContent() {
  if (!githubConfigured()) return null;
  const meta = await getFileMeta();
  if (!meta || !meta.content) return null;
  const raw = Buffer.from(meta.content, 'base64').toString('utf8');
  return JSON.parse(raw);
}

async function githubSetContent(content) {
  if (!githubConfigured()) {
    throw new Error('GitHub is not configured: set GITHUB_TOKEN in Vercel');
  }
  const meta = await getFileMeta();
  const serialized = JSON.stringify(content, null, 2) + '\n';
  const body = {
    branch: BRANCH,
    message: `Update site content ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    content: Buffer.from(serialized, 'utf8').toString('base64'),
  };
  if (meta?.sha) body.sha = meta.sha;
  const result = await githubFetch(apiUrl(CONTENT_PATH), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return {
    commit: result.commit?.sha || null,
    path: CONTENT_PATH,
    branch: BRANCH,
  };
}

export { githubConfigured, githubGetContent, githubSetContent };
