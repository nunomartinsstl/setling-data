const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(/setViewImage\(item\.image\)/g, 'setViewImage(item.image!)');

fs.writeFileSync('components/OrderManager.tsx', c);
