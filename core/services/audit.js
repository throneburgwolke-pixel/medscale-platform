'use strict';
async function logAudit(db, action, detail) {
  await db.run('INSERT INTO audit_log(at,action,detail) VALUES(?,?,?)', [new Date().toISOString(), action, detail || '']);
}
async function listAudit(db, limit) {
  return db.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit || 200]);
}
module.exports = { logAudit, listAudit };
