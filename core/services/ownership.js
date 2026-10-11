'use strict';
/**
 * 数据归属：语义搬迁自 server.js viewerOf/canView/canEdit/visibleFor。
 * viewerOf 改为纯同步：接收已解析的会话对象 { userId, admin }（Task 8 的路由负责
 * 先按用户表刷新 admin 标记再传入，等价于旧 isAdmin 的“以库里角色为准”）。
 * visibleFor 按 brief 改为 async 并接收 db（当前过滤不查库，签名与 Workers 侧对齐）。
 */

/** 当前访问者的身份：{ id, admin }。管理员口令登录时只有 admin，没有用户 id。 */
function viewerOf(session) {
  if (!session) return null;
  return {
    id: session.userId === undefined || session.userId === null ? null : session.userId,
    admin: !!session.admin,
  };
}

/**
 * 可见性（三层，与 server.js 的同名函数保持一致）：
 *   1. 管理员可见全部；
 *   2. 量表库里的内置/共享模板人人可读——它们只是题库，不含任何答卷数据；
 *   3. 其余内容一律归属到创建者账号，没有归属的（历史遗留、管理员口令会话所建）
 *      只对管理员可见，不再对全部注册账号开放。
 */
function canView(item, v) {
  if (!item) return false;
  if (v && v.admin) return true;
  if (item.isTemplate || item.isBuiltin) return true;
  if (!item.ownerId) return false;
  return !!(v && item.ownerId === v.id);
}

/**
 * 可写性：无归属的历史数据只允许管理员接管修改，避免任意用户改写共享资源。
 * 内置模板普通用户（含创建者）不可改——合并了旧 PUT /api/scales/:id 对 isBuiltin
 * 的拒绝分支，只能先“创建副本”再编辑；管理员保留处置权（旧 DELETE 路由允许
 * 管理员删内置量表），Task 8 的编辑路由需保留“内置模板不可直接修改”的显式提示。
 */
function canEdit(item, v) {
  if (!item || !v) return false;
  if (v.admin) return true;
  if (item.isBuiltin) return false;
  return !!item.ownerId && item.ownerId === v.id;
}

async function visibleFor(db, list, viewer) {
  return (list || []).filter(function (item) { return canView(item, viewer); });
}

module.exports = { viewerOf, canView, canEdit, visibleFor };
