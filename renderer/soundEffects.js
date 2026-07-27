/**
 * 便签应用交互音效模块
 */
class SoundManager {
    constructor() {
        this.enabled = true;
        this.volume = 0.5;
    }

    playKeySound() {
        if (!this.enabled || typeof window.Howl === 'undefined') return;
        // 打字音效处理逻辑 (保留 Howl 封装)
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SoundManager;
}
