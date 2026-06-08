const fs = require('fs');

let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

// 1. Remove the box around the form
c = c.replace(
    /\`bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border \${editingOrderId \? 'border-amber-400 ring-2 ring-amber-100 dark:ring-amber-900' : 'border-brand-200 dark:border-slate-700'}\`/,
    "\`\${editingOrderId ? 'border-l-4 border-amber-500 pl-4 mb-8' : 'pt-2 mb-8'}\`"
);

// 2. Simplify main form inputs (remove rounded shapes, use clean border-b)
const replaceInput = (type) => {
    c = c.replace(
        new RegExp(`w-full p-3 border rounded-md shadow-sm outline-none transition-all dark:bg-slate-900 dark:text-white.*?(?:border-slate-300 focus:ring-2 focus:ring-brand-500|border-slate-300 dark:border-slate-600).*?(?=\")`, 'g'),
        `w-full py-2 bg-transparent border-0 border-b border-slate-300 dark:border-slate-700 outline-none transition-colors dark:text-white focus:border-brand-500 focus:ring-0 rounded-none`
    );
};

// Replace input styles
c = c.replace(/border rounded-md shadow-sm outline-none/g, "py-2 px-0 bg-transparent border-0 border-b outline-none focus:ring-0 rounded-none");
c = c.replace(/p-3 border rounded-md shadow-sm/g, "py-2 bg-transparent border-0 border-b outline-none focus:ring-0 rounded-none");
c = c.replace(/p-2 border rounded-md text-sm outline-none/g, "py-2 bg-transparent border-0 border-b text-sm outline-none rounded-none focus:ring-0");

c = c.replace(/bg-red-50 dark:bg-red-900\/20/g, "bg-red-50/50 dark:bg-red-900/10");
c = c.replace(/bg-red-50 dark:bg-red-900\/10/g, "bg-red-50/50 dark:bg-red-900/10");
c = c.replace(/bg-purple-50 dark:bg-purple-900\/20 p-3 rounded-lg border border-purple-100 dark:border-purple-800/g, "mb-4 pb-2 border-b border-purple-200 dark:border-purple-800/50 text-purple-800");

// 3. Simplify Buttons across the application
c = c.replace(/px-4 py-2 rounded-lg/g, "px-3 py-1.5 rounded-sm text-sm uppercase tracking-wider font-semibold");
c = c.replace(/px-3 py-2 rounded-lg/g, "px-3 py-1.5 rounded-sm text-sm uppercase tracking-wider font-semibold");
c = c.replace(/px-4 py-3 rounded-lg/g, "px-4 py-2 rounded-sm text-sm uppercase tracking-wider font-semibold");
c = c.replace(/p-3 rounded-lg/g, "p-2 rounded-sm");
c = c.replace(/w-full py-3 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700 shadow-md transition-colors/g, "w-full py-3 bg-brand-600 text-white text-sm uppercase tracking-widest font-bold rounded-sm hover:bg-brand-700 transition-colors");

fs.writeFileSync('components/OrderManager.tsx', c);
