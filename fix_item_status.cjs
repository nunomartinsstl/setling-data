const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
    /className="absolute top-2 right-2 md:relative md:top-auto md:right-auto cursor-pointer md:order-last md:ml-4 flex-shrink-0"/,
    'className="absolute top-3 right-3 cursor-pointer"'
);

fs.writeFileSync('components/OrderManager.tsx', c);
