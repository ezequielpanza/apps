import { launch } from '@cloudflare/playwright';

const HARD_BLOCKED_SOURCES = new Set(['google-maps', 'tripadvisor']);
const MAX_TEXT_CHARS = 50000;
const MAX_LINKS = 300;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function parseAllowedSources(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function safeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function requireAuth(request, env) {
  const configured = String(env.ACQUISITION_TOKEN || '');
  if (!configured) return false;
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return safeEqual(token, configured);
}

function isPrivateIpv4(hostname) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((value) => value < 0 || value > 255)) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function validateTarget(rawUrl, policy) {
  const target = new URL(String(rawUrl || ''));
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('Only HTTP(S) targets are allowed');
  }

  const hostname = target.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error('Private-network targets are blocked');
  }

  const allowedHosts = Array.isArray(policy.allowedHosts) ? policy.allowedHosts : [];
  const hostAllowed = allowedHosts.some((allowed) => {
    const normalized = String(allowed).toLowerCase();
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });

  if (!hostAllowed) throw new Error(`Host is not allowed for source ${policy.id}`);
  return target;
}

function resolvePolicy(sourceId, env) {
  if (HARD_BLOCKED_SOURCES.has(sourceId)) return null;
  const policies = parseAllowedSources(env.ALLOWED_SOURCES_JSON);
  const input = policies[sourceId];
  if (!input || input.automatedAcquisition !== true) return null;
  return {
    id: sourceId,
    allowedHosts: Array.isArray(input.allowedHosts) ? input.allowedHosts : [],
    maxWaitMs: Math.min(Math.max(Number(input.maxWaitMs) || 8000, 1000), 20000),
  };
}

async function capture(request, env) {
  if (!requireAuth(request, env)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const sourceId = String(input?.sourceId || '').trim();
  const policy = resolvePolicy(sourceId, env);
  if (!policy) {
    return json({ error: 'source_policy_blocked', sourceId }, 403);
  }

  let target;
  try {
    target = validateTarget(input?.url, policy);
  } catch (error) {
    return json({ error: 'invalid_target', message: error.message }, 400);
  }

  const browser = await launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.goto(target.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: policy.maxWaitMs,
    });

    const finalUrl = page.url();
    validateTarget(finalUrl, policy);

    await page.waitForTimeout(Math.min(policy.maxWaitMs, 5000));

    const snapshot = await page.evaluate(({ maxTextChars, maxLinks }) => {
      const text = String(document.body?.innerText || '').slice(0, maxTextChars);
      const links = Array.from(document.querySelectorAll('a[href]'))
        .slice(0, maxLinks)
        .map((anchor) => ({
          text: String(anchor.textContent || '').trim().slice(0, 500),
          href: anchor.href,
        }))
        .filter((item) => item.href);

      return {
        title: document.title,
        text,
        links,
      };
    }, { maxTextChars: MAX_TEXT_CHARS, maxLinks: MAX_LINKS });

    return json({
      sourceId,
      requestedUrl: target.toString(),
      finalUrl,
      capturedAt: new Date().toISOString(),
      ...snapshot,
    });
  } finally {
    await browser.close();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'wander-web-acquisition',
        captureEnabled: Boolean(env.ACQUISITION_TOKEN),
        defaultPolicy: 'deny',
        hardBlockedSources: Array.from(HARD_BLOCKED_SOURCES),
      });
    }

    if (request.method === 'POST' && url.pathname === '/capture') {
      return capture(request, env);
    }

    return json({ error: 'not_found' }, 404);
  },
};
