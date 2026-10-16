// Moves base64 images out of JSON request bodies into R2 and serves them back from /media/.
// The browser keeps using `src` strings, so `data:` URLs and `/media/...` URLs work the same in <img>.
import { Buffer } from 'node:buffer';

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MEDIA_PATH = /^\/media\/([0-9a-f]{64})\.(jpg|png|webp)$/;
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const TYPE = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_IMAGE_CHARS = 900_000; // Same limit as community-service.cjs; larger strings are left for the app to reject.
const MAX_IMAGES_PER_REQUEST = 12;

function matchesFormat(kind, bytes) {
  if (kind === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (kind === 'png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP';
}

// Keys are sha256(owner + image): re-sending the same photo (the page keeps data URLs after saving)
// reuses one object, and owners cannot collide with each other. Returns keys created by this call.
export async function extractMedia(value, bucket, ownerId) {
  const found = [];
  const walk = node => {
    if (typeof node === 'string') {
      const m = node.length <= MAX_IMAGE_CHARS && DATA_URL.exec(node);
      if (!m) return node;
      const bytes = Buffer.from(m[2], 'base64');
      if (!matchesFormat(m[1], bytes)) throw Object.assign(new Error('画像の形式を確認してください。'), { status: 400 });
      if (found.length >= MAX_IMAGES_PER_REQUEST) throw Object.assign(new Error('一度に送れる写真が多すぎます。'), { status: 413 });
      const ext = EXT[m[1]], item = { ext, bytes, type: TYPE[ext], data: m[2] };
      found.push(item);
      return item;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    return node;
  };
  const tree = walk(value), created = [];
  await Promise.all(found.map(async item => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ownerId + ':' + item.data));
    item.key = `${Buffer.from(digest).toString('hex')}.${item.ext}`;
    if (await bucket.head(`media/${item.key}`)) return;
    await bucket.put(`media/${item.key}`, item.bytes, { httpMetadata: { contentType: item.type }, customMetadata: { owner: ownerId } });
    created.push(item.key);
  }));
  const finish = node => found.includes(node) ? `/media/${node.key}` : Array.isArray(node) ? node.map(finish)
    : node && typeof node === 'object' ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, finish(v)])) : node;
  return { value: finish(tree), created };
}

export const deleteMedia = (bucket, keys) => Promise.all(keys.map(k => bucket.delete(`media/${k}`)));

export async function serveMedia(request, bucket, ctx) {
  const url = new URL(request.url);
  const m = MEDIA_PATH.exec(url.pathname);
  if (!m || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
  const cache = caches.default, cacheKey = new Request(url.origin + url.pathname);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const object = await bucket.get(`media/${m[1]}.${m[2]}`);
  if (!object) return new Response('Not found', { status: 404 });
  const response = new Response(object.body, { headers: {
    'Content-Type': TYPE[m[2]],
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'ETag': object.httpEtag,
  } });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return request.method === 'HEAD' ? new Response(null, response) : response;
}
