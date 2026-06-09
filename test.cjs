const fs = require('fs');
let c1 = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c1 = c1.replace(
    /onClick=\{\(e\) => \{[\s\S]*?className=\{\`w-12 h-12 flex items-center/,
    `onClick={(e) => { e.stopPropagation(); setStatusPopoverId(statusPopoverId === order.id ? null : order.id); }} className={\`relative w-12 h-12 flex items-center`
);

console.log(c1.length);
