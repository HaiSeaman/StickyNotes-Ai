// tests/coverThumbs.test.ts
import { describe, it, expect } from 'vitest';
import { thumbPathFor } from '../src/main/lib/coverThumbs.js';

describe('thumbPathFor', () => {
    it('将 covers/<name>.ext 映射为 covers/thumb/<name>.jpg', () => {
        expect(thumbPathFor('C:\\Users\\xi\\AppData\\Roaming\\便签\\music\\covers\\34b41d6217f743473e0db822f0ed9779.jpg'))
            .toBe('C:\\Users\\xi\\AppData\\Roaming\\便签\\music\\covers\\thumb\\34b41d6217f743473e0db822f0ed9779.jpg');
    });
    it('支持 .png/.webp 扩展名且统一输出 .jpg', () => {
        expect(thumbPathFor('C:\\x\\covers\\a.png')).toBe('C:\\x\\covers\\thumb\\a.jpg');
        expect(thumbPathFor('C:\\x\\covers\\a.webp')).toBe('C:\\x\\covers\\thumb\\a.jpg');
    });
    it('无扩展名时按原样加 .jpg', () => {
        expect(thumbPathFor('C:\\x\\covers\\abc')).toBe('C:\\x\\covers\\thumb\\abc.jpg');
    });
});
