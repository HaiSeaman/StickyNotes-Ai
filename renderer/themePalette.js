/**
 * 便签主题颜色与毛玻璃透明度面板控制
 */
const PALETTE_COLORS = [
    { bg: '#FFF9C4', name: '经典黄' },
    { bg: '#E1F5FE', name: '冰霜蓝' },
    { bg: '#E8F5E9', name: '薄荷绿' },
    { bg: '#F3E5F5', name: '薰衣草紫' },
    { bg: '#FFE0B2', name: '暖阳橙' },
    { bg: '#2D3748', name: '深邃夜' }
];

function applyOpacity(winEl, opacity) {
    if (!winEl) return;
    const val = parseFloat(opacity) || 1.0;
    winEl.style.opacity = val;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PALETTE_COLORS, applyOpacity };
}
