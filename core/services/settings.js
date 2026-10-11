'use strict';
async function getSetting(db, key, fallback) {
  const row = await db.first('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : (fallback === undefined ? '' : fallback);
}
async function setSetting(db, key, value) {
  await db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]);
}
module.exports = { getSetting, setSetting };
