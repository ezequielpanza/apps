import fs from 'node:fs';
import path from 'node:path';

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const projectName = String(process.env.CLOUDFLARE_PAGES_PROJECT || 'wander-travel').trim();
const namespaceTitle = String(process.env.WANDER_BACKUP_NAMESPACE || 'wander-travel-backups').trim();
const bindingName = 'WANDER_BACKUPS';
const diagnosticsPath = path.resolve('deploy-status/wander-cloud-provision.json');

function recordDiagnostics(data) {
  fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
  fs.writeFileSync(diagnosticsPath, JSON.stringify({
    ...data,
    recordedAt: new Date().toISOString(),
  }, null, 2) + '\n');
}

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;

async function cloudflare(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const details = [
      ...(Array.isArray(payload.errors) ? payload.errors : []),
      ...(Array.isArray(payload.messages) ? payload.messages : []),
    ].map((item) => ({
      code: item?.code ?? null,
      message: item?.message || JSON.stringify(item),
    }));
    const error = new Error(`Cloudflare API ${response.status}: ${details.map((item) => item.message).filter(Boolean).join(' · ') || response.statusText}`);
    error.httpStatus = response.status;
    error.path = pathname;
    error.details = details;
    throw error;
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

try {
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required.');
  if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is required.');
  const namespace = await ensureNamespace();
  const changed = await ensurePagesBinding(namespace.id);
  const result = {
    ok: true,
    projectName,
    namespaceTitle,
    namespaceId: namespace.id,
    bindingName,
    changed,
  };
  recordDiagnostics(result);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const failure = {
    ok: false,
    projectName,
    namespaceTitle,
    bindingName,
    error: error?.message || String(error),
    httpStatus: error?.httpStatus || null,
    apiPath: error?.path || null,
    details: error?.details || [],
  };
  recordDiagnostics(failure);
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
}
