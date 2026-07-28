/**
 * 软件 Pin 码解锁与状态管理
 */
function initPinInputs(containerId, onComplete) {
    const inputs = document.querySelectorAll(`#${containerId} input`);
    if (!inputs.length) return;
    
    inputs.forEach((input, idx) => {
        input.addEventListener('input', (e) => {
            if (e.target.value && idx < inputs.length - 1) {
                inputs[idx + 1].focus();
            }
            const pin = Array.from(inputs).map(i => i.value).join('');
            if (pin.length === inputs.length && onComplete) {
                onComplete(pin);
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && idx > 0) {
                inputs[idx - 1].focus();
            }
        });
    });
}

function clearPinInputs(containerId) {
    const inputs = document.querySelectorAll(`#${containerId} input`);
    inputs.forEach(i => i.value = '');
    if (inputs[0]) inputs[0].focus();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initPinInputs, clearPinInputs };
}
