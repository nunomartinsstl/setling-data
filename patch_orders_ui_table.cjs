const fs = require('fs');

let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
    /<div className="bg-transparent rounded-none border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">([\s\S]*?)<\/table>\s*<\/div>\s*<\/div>/,
    `<div className="border-t border-slate-200 dark:border-slate-700 mt-2 mb-4">
                                                    <div className="flex flex-col">
                                                                {order.items.map((item, idx) => {
                                                                    const picked = (type === 'FINISHED' || isGhost) ? getTotalPickedQuantity(order, orders, item.sku) : 0;
                                                                    const directPicked = (type === 'FINISHED' || isGhost) ? getDirectPickedQuantity(order, item.sku) : 0;
                                                                    const pickedInChildren = picked - directPicked;
                                                                    const isFullyPicked = picked >= item.quantity;
                                                                    const allocated = getAllocatedQty(order.id, item.sku);
                                                                    const isAllocOK = allocated >= item.quantity;

                                                                    return (
                                                                        <div key={idx} className="relative p-3 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row gap-2 md:gap-4 md:items-center justify-between group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                                                            
                                                                            {(type === 'FINISHED' || isGhost) && (
                                                                                <div 
                                                                                    className="absolute top-2 right-2 md:relative md:top-auto md:right-auto cursor-pointer md:order-last md:ml-4 flex-shrink-0"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        if (isFullyPicked) toast.info("Completamente separado", 1500);
                                                                                        else if (picked === 0) toast.info("Nenhuma unidade separada", 1500);
                                                                                        else toast.info("Separado parcialmente", 1500);
                                                                                    }}
                                                                                >
                                                                                    {isFullyPicked ? <span className="text-green-600 dark:text-green-400 inline-flex flex-col items-center gap-0.5 mt-2 md:mt-0 text-[10px] font-bold"><Check className="w-4 h-4"/> OK</span> : 
                                                                                    (picked === 0 ? <span className="text-red-500 dark:text-red-400 inline-flex flex-col items-center gap-0.5 mt-2 md:mt-0 text-[10px] font-bold"><X className="w-4 h-4"/> <span className="hidden md:inline">FALTA</span></span> : 
                                                                                    <span className="text-amber-600 dark:text-amber-400 inline-flex flex-col items-center gap-0.5 mt-2 md:mt-0 text-[10px] font-bold"><AlertTriangle className="w-4 h-4"/> PARCIAL</span>)}
                                                                                </div>
                                                                            )}

                                                                            <div className="flex-1 pr-12 md:pr-0 min-w-0">
                                                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                                                    <div className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded-sm inline-block">{item.sku}</div>
                                                                                    {item.isCustom && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1 py-0.5 font-bold uppercase tracking-widest">Novo</span>}
                                                                                    
                                                                                    {item.unverifiedMatch && (
                                                                                        <div className="flex items-center gap-1 z-10 w-full md:w-auto mt-1 md:mt-0">
                                                                                            <span className="text-[10px] text-orange-600 uppercase tracking-widest font-bold px-1 hidden md:inline">Por validar:</span>
                                                                                            <button onClick={(e) => { e.stopPropagation(); handleConfirmAutoMatch(order, idx); }} className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold px-3 py-1 hover:bg-green-200 dark:hover:bg-green-900/50 uppercase tracking-widest transition-colors rounded-sm flex-1 md:flex-none">Confirmar</button>
                                                                                            <button onClick={(e) => { e.stopPropagation(); setRejectMatchData({order, itemIdx: idx}); setRejectMatchModalOpen(true); }} className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold px-3 py-1 hover:bg-red-200 dark:hover:bg-red-900/50 uppercase tracking-widest transition-colors rounded-sm flex-1 md:flex-none">Rejeitar</button>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <div className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-tight flex items-start gap-2">
                                                                                     <span className="truncate flex-1" title={item.description}>{item.description}</span>
                                                                                     {item.originalDescription && item.originalDescription !== item.description && (
                                                                                         <div className="group/info relative flex items-center flex-shrink-0 cursor-help">
                                                                                             <Info className="w-4 h-4 text-brand-500 hover:text-brand-600" />
                                                                                             <div className="absolute left-1/2 -top-2 transform -translate-y-full -translate-x-1/2 w-max max-w-[200px] md:max-w-xs bg-slate-900 text-white text-xs p-3 opacity-0 group-hover/info:opacity-100 pointer-events-none z-50 shadow-xl whitespace-normal break-words text-center">
                                                                                                 <span className="block font-bold mb-1 border-b border-slate-700 pb-1 text-[10px] uppercase tracking-widest text-slate-400">Origem:</span>
                                                                                                 {item.originalDescription}
                                                                                                 <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
                                                                                             </div>
                                                                                         </div>
                                                                                     )}
                                                                                     {item.image && (
                                                                                         <button onClick={(e) => { e.stopPropagation(); setViewImage(item.image); }} className="text-slate-400 hover:text-brand-600 flex-shrink-0 transition-colors">
                                                                                             <ImageIcon className="w-4 h-4" />
                                                                                         </button>
                                                                                     )}
                                                                                </div>
                                                                            </div>

                                                                            <div className="flex items-center gap-6 md:gap-8 mt-2 md:mt-0 flex-shrink-0">
                                                                                <div className="flex flex-col items-center">
                                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Pedida</span>
                                                                                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm md:text-base bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-0.5 rounded-sm shadow-sm">{item.quantity}</span>
                                                                                </div>
                                                                                
                                                                                {(type === 'FINISHED' || isGhost) && (
                                                                                    <div className="flex flex-col items-center">
                                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Processada</span>
                                                                                        <span className="font-bold text-slate-800 dark:text-slate-100 text-sm md:text-base flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-0.5 rounded-sm shadow-sm">
                                                                                            {directPicked} 
                                                                                            {pickedInChildren > 0 && (
                                                                                                <div className="group/badge relative inline-flex items-center ml-1">
                                                                                                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 cursor-pointer" />
                                                                                                    <div className="absolute left-1/2 bottom-full mb-2 transform -translate-x-1/2 w-[160px] bg-slate-900 text-white text-[10px] shadow-xl p-3 opacity-0 group-hover/badge:opacity-100 pointer-events-none z-50 text-center font-normal whitespace-normal transition-opacity duration-200 uppercase tracking-wide leading-tight">
                                                                                                        + {pickedInChildren} processadas em reaberturas.
                                                                                                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                        </span>
                                                                                    </div>
                                                                                )}

                                                                                {type === 'OPEN' && !isCompleted && (
                                                                                    <div className="flex flex-col items-center">
                                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Stock</span>
                                                                                        <span className={\`font-bold text-sm md:text-base bg-white dark:bg-slate-900 border px-3 py-0.5 rounded-sm shadow-sm \${item.isCustom ? 'text-slate-400 border-slate-200 dark:border-slate-800' : (isAllocOK ? 'text-green-600 border-green-200 dark:border-green-900/50' : 'text-red-500 border-red-200 dark:border-red-900/50')}\`}>
                                                                                            {item.isCustom ? 'N/A' : \`\${allocated} / \${item.quantity}\`}
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                        </div>
                                                                    );
                                                                })}
                                                    </div>
                                                </div>`
);

fs.writeFileSync('components/OrderManager.tsx', c);
