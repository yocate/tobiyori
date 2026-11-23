// Loads a daily logical backup (db/YYYY-MM-DD.json written by TobiyoriDatabase.backupIfDue) into a database.
// Used to move the service to another Cloudflare account: the new database gets the same accounts
// (password hashes included), communities, activities, applications and messages. Sessions are not in the
// backup, so everyone signs in again once.
const { transaction } = require('./tx.cjs');

const SKIP = new Set(['sessions', 'google_flows']);
const q = name => '"' + String(name).replaceAll('"', '""') + '"';
const tableNames = db => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all().map(r => r.name);

const invalid = message => Object.assign(new Error(message), { status: 400 });

// The tables the backup's own schema declares, as { name, text }.
function schemaTables(dump) {
  const out = [];
  for (const text of Array.isArray(dump.schema) ? dump.schema : []) {
    const m = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("(?:[^"]|"")+"|[\w]+)/i.exec(String(text || ''));
    if (m) out.push({ name: m[1].startsWith('"') ? m[1].slice(1, -1).replaceAll('""', '"') : m[1], text: String(text) });
  }
  return out;
}

// Everything is checked before anything is deleted: a truncated or hand-edited file must not empty the database.
function validateDump(dump) {
  if (!dump || typeof dump !== 'object' || !dump.tables || typeof dump.tables !== 'object' || !Array.isArray(dump.tables.accounts))
    throw invalid('バックアップの形式が正しくありません（accounts がありません）。');
  for (const [name, rows] of Object.entries(dump.tables)) {
    if (!Array.isArray(rows) || !rows.every(r => r && typeof r === 'object' && !Array.isArray(r)))
      throw invalid(`バックアップの形式が正しくありません（${name} の行を読めません）。`);
  }
  // A backup lists every table in its schema and carries rows for each of them (sessions and google_flows are left out on purpose).
  for (const { name } of schemaTables(dump))
    if (!SKIP.has(name) && !Array.isArray(dump.tables[name]))
      throw invalid(`バックアップが不完全です（${name} の行がありません）。復元は行っていません。`);
}

function restoreBackup(db, dump, { replace = false } = {}) {
  validateDump(dump);
  const existing = new Set(tableNames(db));
  if (!replace && existing.has('accounts') && db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n > 0)
    throw Object.assign(new Error('移す先にすでにアカウントがあります。上書きする場合は replace を指定してください。'), { status: 409 });

  const counts = {}, skippedColumns = {};
  transaction(db, () => {
    // Tables that the backup has but this version has not created yet (older or newer code).
    // Created inside the transaction, so a failed restore leaves no half-made tables behind.
    for (const { name, text } of schemaTables(dump)) {
      if (!existing.has(name) && !SKIP.has(name)) { db.exec(text.replace(/^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')); existing.add(name); }
    }
    // Rows reference each other (accounts → communities → activities ...); check foreign keys at commit.
    db.exec('PRAGMA defer_foreign_keys=ON;');
    for (const name of existing) db.prepare(`DELETE FROM ${q(name)}`).run();
    for (const [name, rows] of Object.entries(dump.tables)) {
      if (SKIP.has(name) || !existing.has(name) || !Array.isArray(rows)) continue;
      const columns = new Set(db.prepare(`PRAGMA table_info(${q(name)})`).all().map(c => c.name));
      let n = 0;
      for (const row of rows) {
        const keys = Object.keys(row).filter(k => columns.has(k));
        for (const k of Object.keys(row)) if (!columns.has(k)) (skippedColumns[name] ||= new Set()).add(k);
        if (!keys.length) continue;
        db.prepare(`INSERT INTO ${q(name)} (${keys.map(q).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => row[k] ?? null));
        n++;
      }
      counts[name] = n;
    }
    // Deferred foreign-key violations only surface at the outer commit on a Durable Object, past this function's
    // error handling. Check here so a bad reference rolls the whole restore back with a clear message.
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw invalid('バックアップの参照関係が壊れているため、復元を取り消しました（存在しないアカウントや団体を指す行があります）。');
  });
  return { counts, skippedColumns: Object.fromEntries(Object.entries(skippedColumns).map(([k, v]) => [k, [...v]])), backupCreatedAt: dump.createdAt || null };
}

// Same shape as TobiyoriDatabase.backupIfDue, for saving the current state before it is replaced.
function dumpDatabase(db) {
  const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
  const dump = { createdAt: new Date().toISOString(), schema: tables.map(t => t.sql), tables: {} };
  for (const { name } of tables) if (!SKIP.has(name)) dump.tables[name] = db.prepare(`SELECT * FROM ${q(name)}`).all();
  return dump;
}

module.exports = { restoreBackup, dumpDatabase };
