// Build dist/public for Cloudflare Workers Static Assets and dist/csp.json (hashes of inline scripts).
// Only the files the local server allowlists are published; private documents in 成果物/ never are.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const src = path.join(root, '成果物');
const out = path.join(root, 'dist', 'public');
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor', 'leaflet'), { recursive: true });

const html = fs.readFileSync(path.join(src, 'gunma-community-map.html'), 'utf8').replace(/\r\n?/g, '\n'); // browsers hash LF-normalized text
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const f of ['tobiyori-logo-source.png', 'tobiyori-lounge-cute-v2.png', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css'])
  fs.copyFileSync(path.join(src, f), path.join(out, f));
const images = path.join(src, 'vendor', 'leaflet', 'images');
if (fs.existsSync(images)) fs.cpSync(images, path.join(out, 'vendor', 'leaflet', 'images'), { recursive: true });

// CSP allows exactly the inline scripts shipped in this build, so injected scripts cannot run.
const scriptHashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(m => 'sha256-' + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64'));
fs.writeFileSync(path.join(root, 'dist', 'csp.json'), JSON.stringify({ scriptHashes }));

fs.writeFileSync(path.join(out, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/vendor/*
  Cache-Control: public, max-age=86400
/*.png
  Cache-Control: public, max-age=86400
`);
console.log(`dist/public ready (${scriptHashes.length} inline script hash)`);
