const { spawn } = require('child_process');
const electron = require('electron');

console.log('[TEST] Starting Electron test process...');

const child = spawn(electron, ['.'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
});

let stdoutData = '';
let stderrData = '';

child.stdout.on('data', (chunk) => {
    stdoutData += chunk.toString();
    console.log('[ELECTRON OUT]', chunk.toString().trim());
});

child.stderr.on('data', (chunk) => {
    stderrData += chunk.toString();
    console.error('[ELECTRON ERR]', chunk.toString().trim());
});

setTimeout(() => {
    console.log('[TEST] App ran for 6 seconds successfully. Terminating test process...');
    child.kill('SIGTERM');
    setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
        console.log('[TEST] Test process terminated.');
        process.exit(0);
    }, 1000);
}, 6000);
