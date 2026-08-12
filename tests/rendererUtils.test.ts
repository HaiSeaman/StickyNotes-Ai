// tests/rendererUtils.test.ts
import { describe, it, expect } from 'vitest';
import { inferThumbPath } from '../src/renderer/lib/rendererUtils.js';

describe('inferThumbPath', () => {
    it('将 Windows 路径 covers → covers/thumb 并统一 .jpg', () => {
        expect(inferThumbPath('C:\\Users\\xi\\AppData\\Roaming\\便签\\music\\covers\\a1b2.jpg'))
            .toBe('C:\\Users\\xi\\AppData\\Roaming\\便签\\music\\covers\\thumb\\a1b2.jpg');
    });
    it('支持正斜杠分隔', () => {
        expect(inferThumbPath('C:/Users/xi/music/covers/x.png'))
            .toBe('C:/Users/xi/music/covers/thumb/x.jpg');
    });
    it('路径不含 covers 标记时返回 null', () => {
        expect(inferThumbPath('C:\\Users\\xi\\music\\a.jpg')).toBeNull();
        expect(inferThumbPath('')).toBeNull();
        expect(inferThumbPath(null as any)).toBeNull();
    });
});
