const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

const t1 = '<div className="overflow-x-auto">\\n                                                        <table className="w-full text-sm text-left">';
const r1 = '<div className="">\\n                                                        <table className="w-full text-sm text-left block md:table">';

const t2 = '<thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-600 dark:text-slate-300">';
const r2 = '<thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-600 dark:text-slate-300 hidden md:table-header-group">';

c = c.replace(t1, r1);
c = c.replace(t2, r2);
fs.writeFileSync('components/OrderManager.tsx', c);
