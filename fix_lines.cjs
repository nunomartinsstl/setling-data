const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
    /\{hasChildren && \(\s*<div className="absolute \-left\-4 md:\-left\-8 top\-1\/2 \-bottom\-4 border\-l\-2 border\-slate\-300 dark:border\-slate\-700 \-z\-10" \/>\s*\)\}/,
    `{hasChildren && (
                                            <div className="absolute left-0 top-1/2 -bottom-4 border-l-2 border-slate-300 dark:border-slate-700 -z-10" />
                                       )}`
);

fs.writeFileSync('components/OrderManager.tsx', c);
