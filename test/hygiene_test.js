'use strict';
/**
 * 工程卫生测试：依赖声明方式、个人机器路径、仓库里不该存在的历史文件、
 * 以及浏览器级检查是否能自带临时实例。
 * 这些都是「新同事 clone 下来能不能直接跑」的前提，改代码时很容易被忽略。
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('./helpers/http.js');

const ROOT = path.join(__dirname, '..');
const t = http.makeCounter();

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const rel = path.posix.join(dir.split(path.sep).join('/'), e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walk(rel, out); return; }
    if (rel.endsWith('.js')) out.push(rel);
  });
  return out;
}

(async function run() {
  console.log('\n【1】运行期真的零第三方依赖');
  const runtimeFiles = ['server.js'].concat(walk('lib', []));
  const foreign = [];
  runtimeFiles.forEach(function (rel) {
    read(rel).replace(/require\(\s*'([^']+)'\s*\)/g, function (_, spec) {
      if (spec.indexOf('node:') === 0 || spec.indexOf('.') === 0) return spec;
      foreign.push(rel + ' → ' + spec);
      return spec;
    });
  });
  t.ok(foreign.length === 0, 'server.js 与 lib/ 只引用 node: 内建与相对路径', foreign.join(', '));

  console.log('\n【2】测试依赖写在 package.json 里');
  const pkg = JSON.parse(read('package.json'));
  t.ok(pkg.devDependencies && pkg.devDependencies.jsdom, 'jsdom 记在 devDependencies', JSON.stringify(pkg.devDependencies));
  t.ok(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'dependencies 保持为空：装依赖不是运行的前提');
  t.ok(/node_modules/.test(read('.gitignore')), 'node_modules 不会被提交');
  t.ok(/hygiene_test\.js/.test(pkg.scripts.test), 'npm test 里包含工程卫生检查', pkg.scripts.test.slice(0, 400));

  console.log('\n【3】不留个人机器路径');
  const personal = [];
  walk('test', []).concat(['public/app.js', 'public/common.js', 'public/fill.js', 'server.js']).forEach(function (rel) {
    if (/\/Users\/|\/home\/[a-z]/.test(read(rel))) personal.push(rel);
  });
  t.ok(personal.length === 0, '测试与前端不写死某个人电脑上的目录', personal.join(', '));
  const domSrc = read(path.join('test', 'helpers', 'dom.js'));
  t.ok(/process\.env\.JSDOM_PATH/.test(domSrc), '找不到 jsdom 时仍可用 JSDOM_PATH 指定位置');
  t.ok(/未找到 jsdom|npm i -D jsdom/.test(domSrc), '缺失时给出可照做的安装指引');

  console.log('\n【4】仓库里没有历史快照目录，且有可照做的工程说明');
  t.ok(!fs.existsSync(path.join(ROOT, 'ui_backup')), 'ui_backup/ 已移出仓库（归档在仓库外）');
  t.ok(fs.existsSync(path.join(ROOT, 'docs', '使用说明.md')), '使用说明随仓库分发');
  // docs/使用说明.md 会通过 /api/guide.md 公开发给任何访客（含受试者）。
  // 初始口令统一只在服务端的启动横幅里出现，仓库里的任何文档都不写。
  const mdFiles = [];
  (function walkMd(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'data' || e.name === '.superpowers') return;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walkMd(rel);
      else if (e.name.endsWith('.md')) mdFiles.push(rel);
    });
  })(ROOT);
  const leaking = mdFiles.filter(function (abs) {
    return /admin123/.test(fs.readFileSync(abs, 'utf8'));
  }).map(function (abs) { return path.relative(ROOT, abs); });
  t.ok(leaking.length === 0, '文档里不写默认管理员口令', leaking.join(', '));
  // 固定默认口令已从代码里移除（全新部署走随机生成）。后端与前端源码里都不允许再出现
  // 这个历史字面量，防止它以任何形式回流；test/ 里的个别正则断言不受此约束。
  const codeLeak = ['lib', 'core', 'public'].flatMap(function (d) {
    return fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
      .filter(function (e) { return e.isFile() && /\.(js|css)$/.test(e.name); })
      .map(function (e) { return path.join(ROOT, d, e.name); });
  }).concat([path.join(ROOT, 'server.js')]).filter(function (abs) {
    return /admin123/.test(fs.readFileSync(abs, 'utf8'));
  }).map(function (abs) { return path.relative(ROOT, abs); });
  t.ok(codeLeak.length === 0, '源码里不出现历史默认口令字面量', codeLeak.join(', '));
  // README 是"新同事 clone 下来能不能直接跑"的入口，缺失就等于把人挡在门外
  let readme = '';
  try { readme = read('README.md'); } catch (e) { readme = ''; }
  t.ok(readme.length > 0, '仓库根目录有 README.md');
  if (readme) {
    t.ok(!/\/Users\/|\/home\/[a-z]/.test(readme), 'README 不写死个人机器路径');
    t.ok(/node server\.js/.test(readme), 'README 给出启动命令');
    t.ok(/npm test/.test(readme), 'README 说明怎么跑测试');
    t.ok(/\bnpm i\b/.test(readme) && /jsdom/.test(readme), 'README 说明测试依赖怎么装');
    t.ok(/npm run audit/.test(readme), 'README 说明浏览器级检查怎么跑');
    // 之前 playwright 只写在跳过提示里，`npm i -D jsdom` 会把它当多余包剪掉，
    // audit 换台机器就跑不起来；现在记进 devDependencies，内核仍要单独下载。
    t.ok(pkg.devDependencies.playwright, 'playwright 记在 devDependencies', JSON.stringify(pkg.devDependencies));
    t.ok(/playwright install/.test(readme), 'README 说明浏览器内核要单独下一次');
    t.ok(/MEDSCALE_DB/.test(readme) && /MEDSCALE_LAN/.test(readme), 'README 列出关键环境变量');
    t.ok(/零第三方依赖|dependencies/.test(readme), 'README 说明运行期零依赖这条红线');
    // 测试表格与 npm test 的脚本清单必须一致：曾经出现过 README 写 14 个、实际跑 17 个，
    // 照着表格找用例的新同事会漏掉整个安全套件。
    const scripts = (String(pkg.scripts.test).match(/node\s+test\/[\w./-]+\.js/g) || [])
      .map(function (s) { return s.replace(/^node\s+/, ''); });
    const listed = (readme.match(/`test\/[\w./-]+\.js`/g) || [])
      .map(function (s) { return s.replace(/`/g, ''); });
    const missing = scripts.filter(function (s) { return listed.indexOf(s) < 0; });
    t.ok(scripts.length > 0, 'npm test 里能解析出脚本清单', scripts.length);
    t.ok(missing.length === 0, 'npm test 的每个脚本都在 README 表格里', missing.join(', '));
    const saidCount = readme.match(/按顺序跑 (\d+) 个脚本/);
    t.ok(!!saidCount, 'README 写明按顺序跑多少个脚本');
    if (saidCount) {
      t.ok(Number(saidCount[1]) === scripts.length,
        'README 的脚本数量与 npm test 实际一致', saidCount[1] + ' vs ' + scripts.length);
    }
    t.ok(/MEDSCALE_WORKERS/.test(readme) && /MEDSCALE_INDEXABLE/.test(readme),
      'README 说明进程数与搜索收录开关');
    t.ok(/发布到公网/.test(readme) && /(proxy_pass|reverse_proxy)/.test(readme),
      'README 有公网发布与反向代理示例');
    t.ok(/\/healthz/.test(readme), 'README 说明健康检查地址');
  }

  // 使用者手册会通过 /api/guide.md 公开发给任何访客，口径必须跟实现一致
  const guide = read(path.join('docs', '使用说明.md'));
  t.ok(/邀请码/.test(guide), '使用说明写明开账号走邀请码');
  t.ok(!/自助注册默认关闭/.test(guide), '使用说明不再说"自助注册默认关闭"');

  console.log('\n【5】浏览器级检查自带临时服务端');
  // 这类脚本原本连的是「某台机器上已经启动的实例」：换台机器就跑不起来，
  // 而且会往真实数据里写测试问卷。改成自己拉一个临时库上的实例。
  let browser = null;
  try { browser = require('./helpers/browser.js'); } catch (e) { browser = null; }
  t.ok(!!browser, '存在 test/helpers/browser.js');
  if (browser) {
    t.ok(typeof browser.resolveChromium === 'function', '提供 playwright 解析入口');
    t.ok(typeof browser.startTempServer === 'function', '提供临时服务端启动');
    const DB = path.join(__dirname, 'hygiene_tmp.db');
    const ADDR = path.join(ROOT, 'data', '运行地址.txt');
    const addrBefore = fs.existsSync(ADDR) ? fs.readFileSync(ADDR, 'utf8') : null;
    const tmp = await browser.startTempServer(DB);
    try {
      t.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(tmp.base), '拿到可访问的临时实例地址', tmp.base);
      const session = await browser.fetchJson(tmp.base + '/api/session');
      t.ok(session && session.authenticated === false, '临时实例已就绪且未登录', JSON.stringify(session));
      const scales = await browser.fetchJson(tmp.base + '/api/public/scales');
      t.ok(scales.items && scales.items.length > 50, '临时实例是全新数据库（只有内置量表）', scales.items && scales.items.length);
      // 「启动平台.command」靠 data/运行地址.txt 找回访问地址，临时实例不能去覆盖它
      const addrAfter = fs.existsSync(ADDR) ? fs.readFileSync(ADDR, 'utf8') : null;
      t.ok(addrAfter === addrBefore, '临时实例不改写正式实例的运行地址', addrAfter);
    } finally {
      await tmp.stop();
    }
    const gone = await browser.fetchJson(tmp.base + '/api/session').catch(function () { return null; });
    t.ok(gone === null, 'stop() 之后实例已退出');
    t.ok(!fs.existsSync(path.join(__dirname, '运行地址.txt')), 'stop() 顺手清掉临时实例留下的运行地址文件');
    [DB, DB + '-wal', DB + '-shm'].forEach(function (p) { if (fs.existsSync(p)) fs.unlinkSync(p); });
  }

  process.exit(t.done('工程卫生'));
})();
