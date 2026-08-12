/* ==================== coverThumbs.ts ====================
 * 音乐封面缩略图路径工具（纯函数，无 electron 依赖，可单测）。
 * 约定：原图存 covers/<sha256>.<ext>，缩略图存 covers/thumb/<sha256>.jpg（固定 jpg）。
 * ==================================================== */
import path from 'path';

/** covers/<name>.<ext> → covers/thumb/<name>.jpg */
export function thumbPathFor(coverPath: string): string {
    const dir = path.dirname(coverPath);
    const base = path.basename(coverPath).replace(/\.[^.]+$/, '');
    return path.join(dir, 'thumb', base + '.jpg');
}
