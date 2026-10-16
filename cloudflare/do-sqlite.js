// node:sqlite (DatabaseSync) compatible subset over Durable Object SQLite storage.
// Differences handled here: no BEGIN/SAVEPOINT (use transactionSync), no PRAGMA journal_mode,
// rowsWritten is not a row count (use changes()), and values are limited to about 2MB.
const MAX_VALUE_BYTES = 1_900_000;
const encoder = new TextEncoder();
// UTF-8 is at most 3 bytes per UTF-16 unit, so only long strings need encoding to measure.
const tooLarge = v => typeof v === 'string' && v.length * 3 > MAX_VALUE_BYTES && (v.length > MAX_VALUE_BYTES || encoder.encode(v).length > MAX_VALUE_BYTES);

function mapError(e) {
  if (/SQLITE_CONSTRAINT/.test(e.message)) e.code = 'SQLITE_CONSTRAINT';
  return e;
}

export class DurableSqlite {
  constructor(storage) { this.storage = storage; this.sql = storage.sql; }
  exec(text) {
    const cleaned = text.replace(/PRAGMA\s+journal_mode\s*=\s*\w+\s*;?/gi, '');
    if (cleaned.trim()) try { this.sql.exec(cleaned); } catch (e) { throw mapError(e); }
  }
  prepare(text) {
    const sql = this.sql;
    const cursor = args => {
      for (const v of args) if (tooLarge(v))
        throw Object.assign(new Error('保存する情報が大きすぎます。写真や文章を減らしてください。'), { status: 413 });
      try { return sql.exec(text, ...args.map(v => v === undefined ? null : v)); } catch (e) { throw mapError(e); }
    };
    return {
      get: (...args) => cursor(args).toArray()[0],
      all: (...args) => cursor(args).toArray(),
      run: (...args) => { cursor(args).toArray(); return { changes: sql.exec('SELECT changes() AS n').one().n }; },
    };
  }
  transactionSync(fn) { return this.storage.transactionSync(fn); }
}
