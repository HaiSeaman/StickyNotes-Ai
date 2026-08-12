// tests/rendererUtils.test.ts
import { describe, it, expect } from 'vitest';
import { inferThumbPath, nextIndexInPool, prevIndexInPool } from '../src/renderer/lib/rendererUtils.js';

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

describe('nextIndexInPool', () => {
    it('顺序模式：池内线性前进', () => {
        expect(nextIndexInPool([2, 5, 7], 5, 'sequential')).toBe(7);
    });
    it('顺序模式：池尾回池首', () => {
        expect(nextIndexInPool([2, 5, 7], 7, 'sequential')).toBe(2);
    });
    it('顺序模式：current 不在池内（待切状态）→ 池内第一首', () => {
        expect(nextIndexInPool([2, 5, 7], 3, 'sequential')).toBe(2);
    });
    it('池为空返回 -1', () => {
        expect(nextIndexInPool([], 0, 'sequential')).toBe(-1);
    });
    it('池长 1：返回池内唯一项', () => {
        expect(nextIndexInPool([4], 4, 'sequential')).toBe(4);
    });
    it('随机模式：返回池内且不等于 current', () => {
        const rng = () => 0.9; // 固定 rng，保证确定性
        const result = nextIndexInPool([2, 5, 7, 9], 5, 'shuffle', rng);
        expect([2, 5, 7, 9]).toContain(result);
        expect(result).not.toBe(5);
    });
    it('随机模式：current 不在池内 → 任意池内项', () => {
        const rng = () => 0.0;
        const result = nextIndexInPool([2, 5, 7], 3, 'shuffle', rng);
        expect([2, 5, 7]).toContain(result);
    });
    it('随机模式：固定 rng 命中当前项时不死循环（排除法偏移）', () => {
        // 旧实现 while(idx===pos) 在固定 rng 下会死循环；新实现排除法正常返回
        const result = nextIndexInPool([2, 5, 7, 9], 7, 'shuffle', () => 0.5);
        expect([2, 5, 7, 9]).toContain(result);
        expect(result).not.toBe(7);
    });
});

describe('prevIndexInPool', () => {
    it('顺序模式：池内回退', () => {
        expect(prevIndexInPool([2, 5, 7], 5)).toBe(2);
    });
    it('顺序模式：池首回池尾', () => {
        expect(prevIndexInPool([2, 5, 7], 2)).toBe(7);
    });
    it('顺序模式：current 不在池内 → 池内第一首', () => {
        expect(prevIndexInPool([2, 5, 7], 3)).toBe(2);
    });
    it('池为空返回 -1', () => {
        expect(prevIndexInPool([], 0)).toBe(-1);
    });
});
