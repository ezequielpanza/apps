const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const projectName = String(process.env.CLOUDFLARE_PAGES_PROJECT || 'wander-travel').trim();
const namespaceTitle = String(process.env.WANDER_BACKUP_NAMESPACE || 'wander-travel-backups').trim();
const bindingName = 'WANDER_BACKUPS';

if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required.');
if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is required.');

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;

async function cloudflare(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const messages = [
      ...(Array.isArray(payload.errors) ? payload.errors : []),
      ...(Array.isArray(payload.messages) ? payload.messages : []),
    ].map((item) => item?.message || JSON.stringify(item)).filter(Boolean);
    throw new Error(`Cloudflare API ${response.status}: ${messages.join(' · ') || response.statusText}`);
  }
  return payload.result;
}

async function listNamespaces() {
  const result = await cloudflare('/storage/kv/namespaces?per_page=100&order=title&direction=asc');
  return Array.isArray(result) ? result : [];
}

async function ensureNamespace() {
  const existing = (await listNamespaces()).find((item) => item?.title === namespaceTitle);
  if (existing?.id) return existing;
  console.log(`Creating Cloudflare KV namespace ${namespaceTitle}...`);
  const created = await cloudflare('/storage/kv/namespaces', {
    method: 'POST',
    body: JSON.stringify({ title: namespaceTitle }),
  });
  if (!created?.id) throw new Error('Cloudflare created the namespace without returning an id.');
  return { id: created.id, title: namespaceTitle };
}

function bindings(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

async function ensurePagesBinding(namespaceId) {
  const project = await cloudflare(`/pages/projects/${encodeURIComponent(projectName)}`);
  const production = bindings(project?.deployment_configs?.production?.kv_namespaces);
  const preview = bindings(project?.deployment_configs?.preview?.kv_namespaces);
  const expected = { namespace_id: namespaceId };
  const alreadyConfigured = production[bindingName]?.namespace_id === namespaceId
    && preview[bindingName]?.namespace_id === namespaceId;
  if (alreadyConfigured) return false;

  production[bindingName] = expected;
  preview[bindingName] = expected;
  await cloudflare(`/pages/projects/${encodeURIComponent(projectName)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deployment_configs: {
        production: { kv_namespaces: production },
        preview: { kv_namespaces: preview },
      },
    }),
  });
  return true;
}

const namespace = await ensureNamespace();
const changed = await ensurePagesBinding(namespace.id);
console.log(JSON.stringify({
  ok: true,
  projectName,
  namespaceTitle,
  namespaceId: namespace.id,
  bindingName,
  changed,
}, null, 2));
