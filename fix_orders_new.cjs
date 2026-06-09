const fs = require('fs');

let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
    /const isOrderFullyFulfilled = order.items.every\([\s\S]*?\}\);/,
    `const orderTotalRequested = order.items.reduce((acc, item) => acc + item.quantity, 0);
                               const orderTotalPicked = order.items.reduce((acc, item) => acc + getTotalPickedQuantity(order, orders, item.sku), 0);
                               const pickingCode = orderTotalPicked === 0 ? 'A' : (orderTotalPicked >= orderTotalRequested ? 'C' : 'B');
                               const pickingColor = pickingCode === 'A' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800' 
                                                  : pickingCode === 'B' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                                  : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800';
                               const isOrderFullyFulfilled = pickingCode === 'C';
                               const isParent = orderIdx === 0;
                               const isLastChild = orderIdx === displayedOrders.length - 1;
                               const hasChildren = displayedOrders.length > 1 && isParent;`
);

// We replace the connector line rendering logic
c = c.replace(
    /\{isReopen && \(\s*<div className="absolute -left-4 md:-left-8 top-0 bottom-0 w-4 md:w-8 border-l-2 border-b-2 border-slate-200 dark:border-slate-700 rounded-none-bl-xl h-1\/2 -z-10" \/>\s*\)\}/,
    `{hasChildren && (
                                            <div className="absolute -left-4 md:-left-8 top-1/2 -bottom-4 border-l-2 border-slate-300 dark:border-slate-700 -z-10" />
                                       )}
                                       {isReopen && (
                                            <>
                                                <div className="absolute -left-4 md:-left-8 -top-4 bottom-1/2 border-l-2 border-slate-300 dark:border-slate-700 -z-10" />
                                                <div className="absolute -left-4 md:-left-8 top-1/2 w-4 md:w-8 border-t-2 border-slate-300 dark:border-slate-700 -z-10" />
                                                {!isLastChild && (
                                                    <div className="absolute -left-4 md:-left-8 top-1/2 -bottom-4 border-l-2 border-slate-300 dark:border-slate-700 -z-10" />
                                                )}
                                            </>
                                       )}`
);

// Replace the status icon with the code A, B, C for both cases, or only finished?
// "Rather, the status would be coded as A..., B..., C... for the entire order"
// It replaces the icon. Wait, the user said they want it for openness too.
c = c.replace(
    /onClick=\{\(e\) => \{[\s\S]*?\}\}\s*className=\{\`p-3 text-center rounded-full flex-shrink-0 mr-3 cursor-help hover:scale-110 active:scale-95 transition-all outline-none \$\{[\s\S]*?\}\`\}>\s*\{type === 'OPEN' \? \([\s\S]*?\)\}\s*<\/div>/,
    `onClick={(e) => {
                                                           e.stopPropagation();
                                                           if (pickingCode === 'C') {
                                                               toast.info("Pedido totalmente abastecido");
                                                           } else {
                                                               const missing = order.items.filter(item => getTotalPickedQuantity(order, orders, item.sku) < item.quantity).map(i => i.sku);
                                                               toast.info(missing.length > 0 ? \`Itens por abastecer: \${missing.join(", ")}\` : "Nenhum item abastecido");
                                                           }
                                                       }}
                                                       className={\`w-12 h-12 flex items-center justify-center text-xl font-bold rounded-none flex-shrink-0 mr-3 cursor-help hover:scale-110 active:scale-95 transition-all outline-none border-2 \${pickingColor}\`}>
                                                       {pickingCode}
                                                   </div>`
);

fs.writeFileSync('components/OrderManager.tsx', c);
