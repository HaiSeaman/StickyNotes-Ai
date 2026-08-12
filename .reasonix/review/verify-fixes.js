const path = require('path');
const MUSIC_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.weba', '.webm'];
const APPROVED_AUDIO_MAX_SIZE = 50 * 1024 * 1024;
function approveCheck(filePath, size) {
  const ext = path.extname(filePath).toLowerCase();
  if (!MUSIC_AUDIO_EXTENSIONS.includes(ext)) return 'REJECT(非音频扩展名)';
  if (!(size > 0) || size > APPROVED_AUDIO_MAX_SIZE) return 'REJECT(大小超限)';
  return 'APPROVE';
}
console.log('secret.mp3 60MB :', approveCheck('C:/Users/x/Documents/secret.mp3', 60*1024*1024));
console.log('secret.mp3 5MB  :', approveCheck('C:/Users/x/Documents/secret.mp3', 5*1024*1024));
console.log('notes.json 5MB  :', approveCheck('C:/Users/x/notes.json', 5*1024*1024));
console.log('secret.txt 5MB  :', approveCheck('C:/Users/x/secret.txt', 5*1024*1024));

function clampInterval(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 30;
  return Math.min(1440, Math.max(5, Math.round(n))) || 30;
}
console.log('autoSync -5     :', clampInterval(-5), '(应 5)');
console.log('autoSync 100000 :', clampInterval(100000), '(应 1440)');
console.log('autoSync abc    :', clampInterval('abc'), '(应 30)');
console.log('autoSync 30     :', clampInterval(30), '(应 30)');

function sseCheck(lineLen) {
  return lineLen > 1024*1024 ? 'ABORT' : 'OK';
}
console.log('SSE 行 2MB      :', sseCheck(2*1024*1024), '(应 ABORT)');
console.log('SSE 行 100KB    :', sseCheck(100*1024), '(应 OK)');

// WebDAV 协议白名单
function webdavProtoCheck(u) {
  try { const p = new URL(u).protocol; return (p === 'http:' || p === 'https:') ? 'OK' : 'REJECT(' + p + ')'; }
  catch { return 'REJECT(格式错误)'; }
}
console.log('webdav https://  :', webdavProtoCheck('https://dav.example.com'));
console.log('webdav file:///  :', webdavProtoCheck('file:///C:/x'), '(应 REJECT)');
console.log('webdav ftp://    :', webdavProtoCheck('ftp://host/x'), '(应 REJECT)');

// radio favicon 协议校验
function faviconCheck(u) { return /^https?:\/\//i.test(String(u)) ? u : ''; }
console.log('favicon https   :', faviconCheck('https://x.com/i.png') !== '');
console.log('favicon file:// :', faviconCheck('file:///C:/x.png') === '', '(应置空)');
