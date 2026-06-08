const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function fixRounded(filePath) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
    let c = fs.readFileSync(filePath, 'utf8');

    c = c.replace(/rounded-none-none-none-none/g, 'rounded-none');
    c = c.replace(/rounded-none-none-none/g, 'rounded-none');
    c = c.replace(/rounded-none-none/g, 'rounded-none');

    fs.writeFileSync(filePath, c);
}

walkDir('components', fixRounded);
walkDir('src', fixRounded);
