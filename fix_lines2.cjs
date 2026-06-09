const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
    /\{hasChildren && \(\s*<div className="absolute left-0 top-1\/2 -bottom-4 border-l-2 border-slate-300 dark:border-slate-700 -z-10" \/>\s*\)\}/,
    `{hasChildren && (
        <div className="absolute left-[-1px] md:left-[-1px] top-[2rem] -bottom-12 border-l-2 border-slate-300 dark:border-slate-600 -z-10" />
     )}`
);

const reopenTarget = `{isReopen && (
                                            <>
                                                <div className="absolute -left-4 md:-left-8 -top-4 bottom-1/2 border-l-2 border-slate-300 dark:border-slate-700 -z-10" />
                                                <div className="absolute -left-4 md:-left-8 top-1/2 w-4 md:w-8 border-t-2 border-slate-300 dark:border-slate-700 -z-10" />
                                                {!isLastChild && (
                                                    <div className="absolute -left-4 md:-left-8 top-1/2 -bottom-4 border-l-2 border-slate-300 dark:border-slate-700 -z-10" />
                                                )}
                                            </>
                                       )}`;

c = c.replace(
    reopenTarget,
    `{isReopen && (
        <>
            <div className="absolute -left-[17px] md:-left-[33px] top-[2rem] w-[17px] md:w-[33px] border-t-2 border-slate-300 dark:border-slate-600 -z-10" />
            {!isLastChild && (
                <div className="absolute -left-[17px] md:-left-[33px] top-[2rem] -bottom-12 border-l-2 border-slate-300 dark:border-slate-600 -z-10" />
            )}
        </>
     )}`
);

fs.writeFileSync('components/OrderManager.tsx', c);
