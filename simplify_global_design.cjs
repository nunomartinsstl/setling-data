const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function simplifyDesign(filePath) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
    let c = fs.readFileSync(filePath, 'utf8');

    // 1. Remove all rounded corners
    c = c.replace(/rounded-xl/g, 'rounded-none');
    c = c.replace(/rounded-lg/g, 'rounded-none');
    c = c.replace(/rounded-md/g, 'rounded-none');
    c = c.replace(/rounded-sm/g, 'rounded-none');
    c = c.replace(/rounded/g, 'rounded-none');
    
    // We want to keep rounded-full for circles like avatars, icons
    c = c.replace(/rounded-none-full/g, 'rounded-full');

    // 2. Remove all shadows
    c = c.replace(/shadow-sm/g, 'shadow-none');
    c = c.replace(/shadow-md/g, 'shadow-none');
    c = c.replace(/shadow-lg/g, 'shadow-none');
    c = c.replace(/shadow-xl/g, 'shadow-none');
    c = c.replace(/shadow/g, 'shadow-none');
    c = c.replace(/shadow-none-none/g, 'shadow-none');
    
    // 3. Make buttons more brutalist/minimal
    c = c.replace(/bg-brand-600/g, 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-900 dark:border-white hover:bg-slate-800 dark:hover:bg-slate-100');
    c = c.replace(/bg-brand-500/g, 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-900 dark:border-white hover:bg-slate-800 dark:hover:bg-slate-100');

    c = c.replace(/bg-white dark:bg-slate-800/g, 'bg-transparent');

    fs.writeFileSync(filePath, c);
}

walkDir('components', simplifyDesign);
walkDir('src', simplifyDesign);

