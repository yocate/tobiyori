// Cloudflare entry point.
// Worker (stateless, scales out): host check, edge rate limits, password hashing, image upload to R2, security headers.
// TobiyoriDatabase (one SQLite Durable Object): runs app.cjs unchanged against Durable Object storage.
import { DurableObject } from 'cloudflare:workers';
import appModule from '../app.cjs';
import { DurableSqlite } from './do-sqlite.js';
import { nodeRequest, nodeResponse } from './http-shim.js';
import { extractMedia, deleteMedia, serveMedia } from './media.js';
import csp from '../dist/csp.json';

const { createApp, localHasher } = appModule;
const INTERNAL = 'x-tobiyori-internal-';
const MAX_BODY = 4 * 1024 * 1024;
const ALARM_MS = 60_000;
const BACKUP_MS = 24 * 3600_000;
const BACKUP_SKIP = new Set(['sessions', 'google_flows']);

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const secure = env => env.APP_ORIGIN.startsWith('https://');

function contentSecurityPolicy(env) {
  return [
    "default-src 'self'",
    // static.cloudflareinsights.com: Cloudflare Web Analytics beacon injected by the zone.
    `script-src 'self' ${csp.scriptHashes.map(h => `'${h}'`).join(' ')} https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${env.MAP_TILE_ORIGIN || 'https://tile.openstreetmap.org'}`,
    "connect-src 'self' https://cloudflareinsights.com",
    "frame-ancestors 'none'", "base-uri 'none'", "object-src 'none'", "form-action 'self'",
    ...(secure(env) ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

function withSecurityHeaders(response, env, html = false) {
  const r = new Response(response.body, response);
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
  r.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (secure(env)) r.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (html) {
    r.headers.set('Content-Security-Policy', contentSecurityPolicy(env));
    r.headers.set('X-Frame-Options', 'DENY');
    r.headers.set('Cache-Control', 'no-cache');
  }
  return r;
}

const database = env => env.DB.get(env.DB.idFromName('primary'), { locationHint: env.DB_LOCATION_HINT || 'apac' });

// Reads at most MAX_BODY bytes, cancelling the stream as soon as it is exceeded (Content-Length may be absent).
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(bytes);
}

// Image uploads are accepted only on these writes, from the app's origin, with a valid session.
const MEDIA_WRITES = (method, path) => (method === 'PUT' && path === '/api/state') || (method === 'POST' && path.startsWith('/api/live/'));

async function limited(limiter, key) {
  if (!limiter) return false;
  const { success } = await limiter.limit({ key });
  return !success;
}

async function api(request, env, ctx) {
  const url = new URL(request.url);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const headers = new Headers();
  for (const [k, v] of request.headers) if (!k.startsWith(INTERNAL)) headers.set(k, v);
  const auth = request.method === 'POST' && ['/api/register', '/api/login'].includes(url.pathname);
  if (await limited(auth ? env.AUTH_LIMITER : env.API_LIMITER, (auth ? 'auth:' : 'api:') + ip))
    return json(429, { error: '試行回数が多いため、時間をおいてお試しください。' });

  let body = null, created = [];
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json(413, { error: '保存する情報が大きすぎます。写真を減らしてください。' });
    body = await readBody(request);
    if (body === null) return json(413, { error: '保存する情報が大きすぎます。写真を減らしてください。' });
    let input = null;
    if ((headers.get('content-type') || '').startsWith('application/json')) try { input = JSON.parse(body); } catch {}
    // Password hashing is CPU heavy: do it here so the single database object stays responsive.
    if (input && typeof input.password === 'string' && input.password.length >= 8 && input.password.length <= 128) {
      if (url.pathname === '/api/register') headers.set(INTERNAL + 'password-hash', await localHasher.hash(input.password));
      if (url.pathname === '/api/login' && typeof input.email === 'string') {
        const stored = await database(env).credential(input.email.trim().toLowerCase());
        headers.set(INTERNAL + 'password-ok', (await localHasher.verify(input.password, stored || 'none')) && stored ? '1' : '0');
      }
    }
    if (input && body.includes('data:image/') && MEDIA_WRITES(request.method, url.pathname)) {
      if (headers.get('origin') !== new URL(env.APP_ORIGIN).origin) return json(403, { error: 'アプリを開き直してから操作してください。' });
      const owner = await database(env).sessionUserId(headers.get('cookie') || '');
      if (!owner) return json(401, { error: 'ログインしてください。' });
      try { ({ value: input, created } = await extractMedia(input, env.MEDIA, owner)); body = JSON.stringify(input); }
      catch (e) { if (e.status) return json(e.status, { error: e.message }); throw e; }
    }
  }
  // The database object may still run the previous deployment; it restarts itself when versions differ.
  if (env.CF_VERSION?.id) headers.set(INTERNAL + 'version', env.CF_VERSION.id);
  const forward = () => database(env).fetch(new Request(request.url, { method: request.method, headers, body, redirect: 'manual' }));
  let response;
  try { response = await forward(); } catch (e) { if (!e?.message?.includes('code updated')) throw e; response = await forward(); }
  // Do not keep images uploaded for a write the database rejected.
  if (created.length && response.status >= 400) ctx.waitUntil(deleteMedia(env.MEDIA, created));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = new URL(env.APP_ORIGIN);
    if (url.host !== origin.host) return new Response('Not found', { status: 404 });
    if (secure(env) && url.protocol === 'http:') return Response.redirect(origin.origin + url.pathname + url.search, 301);
    if (url.pathname.startsWith('/api/')) return withSecurityHeaders(await api(request, env, ctx), env);
    if (url.pathname.startsWith('/media/')) return withSecurityHeaders(await serveMedia(request, env.MEDIA, ctx), env);
    if (['/', '/index.html', '/operator.html'].includes(url.pathname)) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      return withSecurityHeaders(await env.ASSETS.fetch(new Request(url.origin + '/index.html', request)), env, true);
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request), env);
  },
};

export class TobiyoriDatabase extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.db = new DurableSqlite(ctx.storage);
      this.db.exec('PRAGMA foreign_keys=ON;');
      const origin = new URL(env.APP_ORIGIN);
      this.app = createApp({
        db: this.db,
        origins: [origin.origin],
        hosts: [origin.host],
        secureCookies: secure(env),
        // The Worker hashed or verified the password and passed only the result.
        hasher: {
          async hash(_password, req) { const h = req.headers[INTERNAL + 'password-hash']; if (!h) throw new Error('missing password hash'); return h; },
          async verify(_password, _stored, req) { return req.headers[INTERNAL + 'password-ok'] === '1'; },
        },
        community: { schedule: false, tidyEveryMs: 15_000 },
      });
      this.syncAdmins();
      if ((await ctx.storage.getAlarm()) === null) await ctx.storage.setAlarm(Date.now() + ALARM_MS);
    });
  }

  // Operators are configured by account ID (shown on My Page via /api/me), never by e-mail:
  // registration does not prove e-mail ownership, so an e-mail allowlist could be claimed by someone else.
  // ADMIN_ACCOUNT_IDS is the source of truth: IDs removed from it lose the role.
  syncAdmins() {
    const ids = String(this.env.ADMIN_ACCOUNT_IDS || '').split(',').map(s => s.trim()).filter(s => /^[0-9a-f-]{36}$/.test(s));
    this.db.transactionSync(() => {
      this.db.prepare(`DELETE FROM account_roles WHERE role='ADMIN' AND user_id NOT IN (${ids.map(() => '?').join(',')})`).run(...ids);
      for (const id of ids) if (this.db.prepare('SELECT 1 FROM accounts WHERE id=?').get(id))
        this.db.prepare("INSERT INTO account_roles VALUES(?,'ADMIN') ON CONFLICT(user_id) DO UPDATE SET role='ADMIN'").run(id);
    });
  }

  // RPC from the Worker before storing uploads: the session must be valid, not just present.
  sessionUserId(cookie) {
    return this.app.userFor({ headers: { cookie } })?.id ?? null;
  }

  async fetch(request) {
    const wanted = request.headers.get(INTERNAL + 'version');
    if (wanted && this.env.CF_VERSION?.id && wanted !== this.env.CF_VERSION.id) this.ctx.abort('code updated');
    const req = await nodeRequest(request);
    const { res, toResponse } = nodeResponse();
    if ((await this.app.handle(req, res)) === false) return json(404, { error: 'ページが見つかりません。' });
    return toResponse();
  }

  // RPC from the Worker for login: the stored hash never leaves Cloudflare's internal network.
  credential(email) {
    return this.db.prepare('SELECT password_hash FROM accounts WHERE email=?').get(email)?.password_hash ?? null;
  }

  async alarm() {
    try {
      this.syncAdmins();
      this.app.communityService.tidy();
      await this.app.communityService.refreshOfficialUpdates();
      await this.backupIfDue();
    } catch (e) {
      console.error(JSON.stringify({ event: 'alarm-failed', error: String(e?.message || e).slice(0, 300) }));
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    }
  }

  // Daily logical backup to a private R2 bucket, in addition to Durable Object point-in-time recovery.
  async backupIfDue() {
    if (!this.env.BACKUPS) return;
    const last = (await this.ctx.storage.get('backup:last')) || 0;
    if (Date.now() - last < BACKUP_MS) return;
    const sql = this.ctx.storage.sql;
    const tables = sql.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").toArray();
    const dump = { createdAt: new Date().toISOString(), schema: tables.map(t => t.sql), tables: {} };
    for (const { name } of tables) if (!BACKUP_SKIP.has(name)) dump.tables[name] = sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray();
    await this.env.BACKUPS.put(`db/${dump.createdAt.slice(0, 10)}.json`, JSON.stringify(dump), { httpMetadata: { contentType: 'application/json' } });
    await this.ctx.storage.put('backup:last', Date.now());
  }
}
