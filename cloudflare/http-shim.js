// Minimal node:http req/res stand-ins so app.cjs runs unchanged inside the Durable Object.
import { Buffer } from 'node:buffer';

export async function nodeRequest(request) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : null;
  return {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    socket: { remoteAddress: request.headers.get('cf-connecting-ip') || 'unknown' },
    async *[Symbol.asyncIterator]() { if (body?.length) yield body; },
  };
}

export function nodeResponse() {
  const headers = new Map();
  let status = 200, body = null, ended = false;
  const res = {
    get headersSent() { return ended; },
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    writeHead(code, extra = {}) { status = code; for (const [k, v] of Object.entries(extra)) headers.set(k.toLowerCase(), v); },
    end(chunk) { if (chunk !== undefined) body = chunk; ended = true; },
  };
  const toResponse = () => {
    const out = new Headers();
    for (const [k, v] of headers) for (const item of [v].flat()) out.append(k, String(item));
    return new Response(body, { status, headers: out });
  };
  return { res, toResponse };
}
