const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
    /<div className="flex-1 min-w-0">\s*<div className="flex items-center gap-2">\s*<h3 className="font-bold text-base md:text-lg text-slate-800 dark:text-white truncate">\{order\.title\}<\/h3>([\s\S]*?)<\/div>\s*\{!isOtherExpanded \? \([\s\S]*?\) : \(\s*<div className="text-xs text-slate-400 mt-0\.5 whitespace-nowrap overflow-hidden text-ellipsis">\{new Date\(order\.dateCreated\)\.toLocaleDateString\(\)\}<\/div>\s*\)\}/,
    `<div className="flex-1 min-w-0">
                                                       <div className={\`flex \${isOtherExpanded ? 'items-center justify-between gap-4' : 'items-center gap-2'}\`}>
                                                           <div className="flex items-center gap-2 min-w-0">
                                                               <h3 className={\`font-bold text-slate-800 dark:text-white truncate \${isOtherExpanded ? 'text-sm md:text-base' : 'text-base md:text-lg'}\`}>{order.title}</h3>$1</div>
                                                           {isOtherExpanded && <div className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">{new Date(order.dateCreated).toLocaleDateString()}</div>}
                                                       </div>
                                                       {!isOtherExpanded && (
                                                            <div className={\`flex \${expandedOrderId === null ? "flex-col items-start gap-1 mt-2" : "items-center gap-2 mt-0.5 md:mt-1 overflow-x-auto whitespace-nowrap"} text-xs md:text-sm text-slate-500 dark:text-slate-400\`}>
                                                                <span className="flex items-center gap-1 flex-shrink-0">
                                                                    {expandedOrderId === null ? <span className="font-bold text-[10px] uppercase tracking-widest text-slate-400 w-20">Criado Por:</span> : <UserIcon className="w-3 h-3" />} 
                                                                    {order.creator}
                                                                </span>
                                                                {expandedOrderId !== null && <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full flex-shrink-0"></span>}
                                                                <span className="flex items-center gap-1 flex-shrink-0">
                                                                    {expandedOrderId === null ? <span className="font-bold text-[10px] uppercase tracking-widest text-slate-400 w-20">Criado a:</span> : <Calendar className="w-3 h-3" />} 
                                                                    {new Date(order.dateCreated).toLocaleDateString()}
                                                                </span>
                                                                {(order.dueDate) && (
                                                                    <>
                                                                      {expandedOrderId !== null && <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full flex-shrink-0"></span>}
                                                                      <span className={\`flex items-center gap-1 flex-shrink-0 \${new Date(order.dueDate) < new Date() && type === 'OPEN' ? 'text-red-500 font-semibold' : ''}\`}>
                                                                        {expandedOrderId === null && <span className="font-bold text-[10px] uppercase tracking-widest text-slate-400 w-20">{type === 'OPEN' ? 'Levantar:' : 'Data Prev.:'}</span>}
                                                                        {expandedOrderId !== null && type === 'OPEN' ? 'Levantar: ' : ''}{new Date(order.dueDate).toLocaleDateString()}
                                                                      </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                       )}`
);

fs.writeFileSync('components/OrderManager.tsx', c);
