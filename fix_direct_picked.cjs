const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

const helpers = `
  const getDirectPickedQuantity = (order: Order, sku: string): number => {
     const list = toArray(order.pickedItems);
     return list.filter((p: any) => (p.material || '').trim().toLowerCase() === sku.trim().toLowerCase())
                .reduce((s: number, p: any) => s + (Number(p.pickedQty)||0), 0);
  };
`;

c = c.replace(
  "  const getTotalPickedQuantity = (order: Order, allOrders: Order[], sku: string): number => {",
  helpers + "\n  const getTotalPickedQuantity = (order: Order, allOrders: Order[], sku: string): number => {"
);

fs.writeFileSync('components/OrderManager.tsx', c);
