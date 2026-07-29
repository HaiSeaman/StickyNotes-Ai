const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

const rootDir = path.resolve(__dirname, '..');
const distAppDir = path.join(rootDir, 'dist-app', '便签-win32-x64');
const electronDist = path.join(rootDir, 'node_modules', 'electron', 'dist');

console.log('[Packager] Clearing previous build...');
if (fs.existsSync(distAppDir)) {
  fs.rmSync(distAppDir, { recursive: true, force: true });
}

console.log('[Packager] Copying Electron runtime...');
copyFolderSync(electronDist, distAppDir);

// Rename electron.exe -> 便签.exe
const srcExe = path.join(distAppDir, 'electron.exe');
const targetExe = path.join(distAppDir, '便签.exe');
if (fs.existsSync(srcExe)) {
  fs.renameSync(srcExe, targetExe);
}

// Prepare resources/app
const appResourcesDir = path.join(distAppDir, 'resources', 'app');
if (fs.existsSync(appResourcesDir)) {
  fs.rmSync(appResourcesDir, { recursive: true, force: true });
}
fs.mkdirSync(appResourcesDir, { recursive: true });

console.log('[Packager] Packaging application files into resources/app...');

// Copy essential runtime files
const filesToCopy = [
  'package.json',
  'index.html',
  'styles.css',
  'howler.min.js',
  'marked.min.js',
  'purify.min.js',
  'renderer.js'
];

filesToCopy.forEach(file => {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(appResourcesDir, file));
  }
});

// Copy directories
const dirsToCopy = ['dist', 'styles', 'renderer', 'constants'];
dirsToCopy.forEach(dir => {
  const src = path.join(rootDir, dir);
  if (fs.existsSync(src)) {
    copyFolderSync(src, path.join(appResourcesDir, dir));
  }
});

console.log('[Packager] Windows executable build completed successfully at:', targetExe);
