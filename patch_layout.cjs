const fs = require('fs');
let c = fs.readFileSync('components/Layout.tsx', 'utf8');

c = c.replace(/px-4 py-2.5 rounded-lg/g, "px-4 py-2 rounded-sm");
c = c.replace(/rounded-lg/g, "rounded-sm");
c = c.replace(/bg-brand-50 dark:bg-brand-900\/20 text-brand-700 dark:text-brand-400 font-semibold shadow-sm/g, "bg-brand-50/50 dark:bg-brand-900/10 text-brand-700 dark:text-brand-400 font-semibold border-l-2 border-brand-500");
c = c.replace(/hover:bg-slate-50 dark:hover:bg-slate-800/g, "hover:bg-slate-50 dark:hover:bg-slate-800 border-l-2 border-transparent");

fs.writeFileSync('components/Layout.tsx', c);
