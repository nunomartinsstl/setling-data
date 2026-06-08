const fs = require('fs');

const simplifyFile = (filePath) => {
    if (!fs.existsSync(filePath)) return;
    let c = fs.readFileSync(filePath, 'utf8');

    // 1. Remove the box around the form wrapper
    c = c.replace(
        /className={\`bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border.*?\`}/g,
        "className={`pt-2 mb-8`}"
    );
    c = c.replace(
        /className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-brand-200 dark:border-slate-700"/g,
        'className="pt-2 mb-8"'
    );
    c = c.replace(
        /className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700"/g,
        'className="pt-2 mb-8"'
    );

    // 2. Simplify main form inputs
    c = c.replace(/border rounded-md shadow-sm outline-none/g, "py-2 px-0 bg-transparent border-0 border-b outline-none focus:ring-0 rounded-none");
    c = c.replace(/p-3 border rounded-md shadow-sm/g, "py-2 bg-transparent border-0 border-b outline-none focus:ring-0 rounded-none");
    c = c.replace(/w-full p-2 border rounded-md text-sm outline-none/g, "w-full py-2 bg-transparent border-0 border-b text-sm outline-none rounded-none focus:ring-0");
    c = c.replace(/border-slate-300 focus:ring-2 focus:ring-brand-500/g, "border-slate-300 focus:border-brand-500 focus:ring-0");
    c = c.replace(/border-slate-300 dark:border-slate-600/g, "border-slate-300 dark:border-slate-600 focus:border-brand-500 focus:ring-0");

    // 3. Simplify Buttons across the application
    c = c.replace(/px-4 py-2 rounded-lg/g, "px-3 py-1.5 rounded-sm text-sm uppercase tracking-wider font-semibold");
    c = c.replace(/px-3 py-2 rounded-lg/g, "px-3 py-1.5 rounded-sm text-sm uppercase tracking-wider font-semibold");
    c = c.replace(/px-4 py-3 rounded-lg/g, "px-4 py-2 rounded-sm text-sm uppercase tracking-wider font-semibold");
    c = c.replace(/p-3 rounded-lg/g, "p-2 rounded-sm");
    c = c.replace(/p-2 rounded-lg/g, "p-2 rounded-sm");
    c = c.replace(/w-full py-3 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700 shadow-md transition-colors/g, "w-full py-3 bg-brand-600 text-white text-sm uppercase tracking-widest font-bold rounded-sm hover:bg-brand-700 transition-colors");
    
    fs.writeFileSync(filePath, c);
};

simplifyFile('components/PurchaseOrderManager.tsx');
simplifyFile('components/ReceiptsManager.tsx');
simplifyFile('components/StockManager.tsx');
simplifyFile('components/TransfersManager.tsx');
simplifyFile('components/QueryManager.tsx');

