const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
  "const picked = (type === 'FINISHED' || isGhost) ? getTotalPickedQuantity(order, orders, item.sku) : 0;",
  `const picked = (type === 'FINISHED' || isGhost) ? getTotalPickedQuantity(order, orders, item.sku) : 0;
   const directPicked = (type === 'FINISHED' || isGhost) ? getDirectPickedQuantity(order, item.sku) : 0;
   const pickedInChildren = picked - directPicked;`
);

c = c.replace(
  '<span className="md:hidden font-bold mr-2 text-slate-500 uppercase text-[10px]">Processado:</span>\\n                                                                                    {picked}',
  `<span className="md:hidden font-bold mr-2 text-slate-500 uppercase text-[10px]">Processado:</span>
                                                                                    {directPicked}
                                                                                    {pickedInChildren > 0 && (
                                                                                        <div className="group relative inline-flex items-center ml-1">
                                                                                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 cursor-pointer" />
                                                                                            <div className="absolute left-1/2 -top-2 transform -translate-y-full -translate-x-1/2 w-max max-w-[200px] bg-slate-800 text-white text-[10px] rounded shadow-lg p-2 opacity-0 group-hover:opacity-100 pointer-events-none z-50 text-center font-normal">
                                                                                                Restantes {pickedInChildren} un. processadas numa reabertura.
                                                                                                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}`
);

fs.writeFileSync('components/OrderManager.tsx', c);
