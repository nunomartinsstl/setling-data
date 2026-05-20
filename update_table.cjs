const fs = require('fs');

let fileContent = fs.readFileSync('components/OrderManager.tsx', 'utf8');

const targetStr = `<div className="overflow-x-auto">
                                                        <table className="w-full text-sm text-left">
                                                            <thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-600 dark:text-slate-300">
                                                                <tr>
                                                                    <th className="p-3 whitespace-nowrap">Material</th>
                                                                    <th className="p-3 whitespace-nowrap">Descrição</th>
                                                                    <th className="p-3 text-right whitespace-nowrap">Qtd</th>
                                                                    {type === 'OPEN' && !isCompleted && <th className="p-3 text-right whitespace-nowrap">Stock</th>}
                                                                    {(type === 'FINISHED' || isGhost) && <th className="p-3 text-right whitespace-nowrap">Processado</th>}
                                                                    {(type === 'FINISHED' || isGhost) && <th className="p-3 whitespace-nowrap">Status</th>}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                                                                {order.items.map((item, idx) => {
                                                                    const picked = (type === 'FINISHED' || isGhost) ? getTotalPickedQuantity(order, orders, item.sku) : 0;
                                                                    const isFullyPicked = picked >= item.quantity;
                                                                    const allocated = getAllocatedQty(order.id, item.sku);
                                                                    const isAllocOK = allocated >= item.quantity;

                                                                    return (
                                                                        <tr key={idx}>
                                                                            <td className="p-3 font-mono text-xs whitespace-nowrap">{item.sku}</td>
                                                                            <td className="p-3 min-w-[200px] flex items-center gap-2">
                                                                                {item.description}
                                                                                {item.originalDescription && item.originalDescription !== item.description && (
                                                                                    <div className="group relative flex items-center">
                                                                                        <Info className="w-3.5 h-3.5 text-blue-500 hover:text-blue-700 cursor-pointer" />
                                                                                        <div className="absolute left-1/2 -top-2 transform -translate-y-full -translate-x-1/2 w-max max-w-xs bg-slate-800 text-white text-xs rounded shadow-lg p-2 opacity-0 group-hover:opacity-100 pointer-events-none z-50">
                                                                                            <span className="block font-bold mb-1 text-slate-300">Sugerido Originalmente:</span>
                                                                                            {item.originalDescription}
                                                                                            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                                {item.isCustom && <span className="ml-2 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1 rounded">Novo</span>}
                                                                                {item.unverifiedMatch && (
                                                                                    <div className="flex items-center gap-1 ml-2">
                                                                                        <span className="text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-1 py-0.5 rounded whitespace-nowrap">Por validar</span>
                                                                                        <button onClick={(e) => { e.stopPropagation(); handleConfirmAutoMatch(order, idx); }} className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold px-2 py-0.5 rounded hover:bg-green-200 dark:hover:bg-green-900/50">Confirmar</button>
                                                                                        <button onClick={(e) => { e.stopPropagation(); setRejectMatchData({order, itemIdx: idx}); setRejectMatchModalOpen(true); }} className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold px-2 py-0.5 rounded hover:bg-red-200 dark:hover:bg-red-900/50">Rejeitar/Mudar</button>
                                                                                    </div>
                                                                                )}
                                                                                {item.image && (
                                                                                    <button 
                                                                                        onClick={() => setViewImage(item.image!)}
                                                                                        className="text-slate-400 hover:text-brand-600"
                                                                                    >
                                                                                        <ImageIcon className="w-4 h-4" />
                                                                                    </button>
                                                                                )}
                                                                            </td>
                                                                            <td className="p-3 text-right font-bold whitespace-nowrap">{item.quantity}</td>
                                                                            
                                                                            {/* FIFO Allocation Column for Open Orders */}
                                                                            {type === 'OPEN' && !isCompleted && (
                                                                                <td className="p-3 text-right font-mono text-xs whitespace-nowrap">
                                                                                    {item.isCustom ? (
                                                                                        <span className="text-slate-400">N/A</span>
                                                                                    ) : (
                                                                                        <span className={\`\${isAllocOK ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}\`}>
                                                                                            {allocated} / {item.quantity}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                            )}

                                                                            {(type === 'FINISHED' || isGhost) && (
                                                                                <>
                                                                                <td className="p-3 text-right font-bold whitespace-nowrap">{picked}</td>
                                                                                <td className="p-3 whitespace-nowrap">
                                                                                    {isFullyPicked ? <span className="text-green-600 dark:text-green-400 flex items-center gap-1 text-xs font-bold"><Check className="w-3 h-3"/> OK</span> : (picked === 0 ? <span className="text-red-500 dark:text-red-400 flex items-center gap-1 text-xs font-bold"><X className="w-3 h-3"/> Sem picking</span> : <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 text-xs font-bold"><AlertTriangle className="w-3 h-3"/> Parcial</span>)}
                                                                                </td>
                                                                                </>
                                                                            )}
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                   </div>`;

const newStr = `<div className="">
                                                        <table className="w-full text-sm text-left block md:table">
                                                            <thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-600 dark:text-slate-300 hidden md:table-header-group">
                                                                <tr>
                                                                    <th className="p-3 whitespace-nowrap">Material</th>
                                                                    <th className="p-3">Descrição</th>
                                                                    <th className="p-3 text-right whitespace-nowrap">Qtd</th>
                                                                    {type === 'OPEN' && !isCompleted && <th className="p-3 text-right whitespace-nowrap">Stock</th>}
                                                                    {(type === 'FINISHED' || isGhost) && <th className="p-3 text-right whitespace-nowrap">Processado</th>}
                                                                    {(type === 'FINISHED' || isGhost) && <th className="p-3 whitespace-nowrap">Status</th>}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 block md:table-row-group">
                                                                {order.items.map((item, idx) => {
                                                                    const picked = (type === 'FINISHED' || isGhost) ? getTotalPickedQuantity(order, orders, item.sku) : 0;
                                                                    const isFullyPicked = picked >= item.quantity;
                                                                    const allocated = getAllocatedQty(order.id, item.sku);
                                                                    const isAllocOK = allocated >= item.quantity;

                                                                    return (
                                                                        <tr key={idx} className="block md:table-row p-4 md:p-0">
                                                                            <td className="p-2 md:p-3 font-mono text-xs md:whitespace-nowrap block md:table-cell">
                                                                                <span className="md:hidden font-bold mr-2 text-slate-500 uppercase text-[10px]">Material:</span>
                                                                                {item.sku}
                                                                            </td>
                                                                            <td className="p-2 md:p-3 flex md:table-cell flex-wrap items-center gap-2">
                                                                                <span className="md:hidden font-bold mr-2 text-slate-500 uppercase text-[10px] w-full mt-2">Descrição:</span>
                                                                                {item.description}
                                                                                {item.originalDescription && item.originalDescription !== item.description && (
                                                                                    <div className="group relative flex items-center inline-block">
                                                                                        <Info className="w-3.5 h-3.5 text-blue-500 hover:text-blue-700 cursor-pointer" />
                                                                                        <div className="absolute left-1/2 -top-2 transform -translate-y-full -translate-x-1/2 w-max max-w-xs bg-slate-800 text-white text-xs rounded shadow-lg p-2 opacity-0 group-hover:opacity-100 pointer-events-none z-50">
                                                                                            <span className="block font-bold mb-1 text-slate-300">Sugerido Originalmente:</span>
                                                                                            {item.originalDescription}
                                                                                            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                                {item.isCustom && <span className="ml-2 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1 rounded">Novo</span>}
                                                                                {item.unverifiedMatch && (
                                                                                    <div className="flex items-center gap-1 ml-2">
                                                                                        <span className="text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-1 py-0.5 rounded whitespace-nowrap">Por validar</span>
                                                                                        <button onClick={(e) => { e.stopPropagation(); handleConfirmAutoMatch(order, idx); }} className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold px-2 py-0.5 rounded hover:bg-green-200 dark:hover:bg-green-900/50">Confirmar</button>
                                                                                        <button onClick={(e) => { e.stopPropagation(); setRejectMatchData({order, itemIdx: idx}); setRejectMatchModalOpen(true); }} className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold px-2 py-0.5 rounded hover:bg-red-200 dark:hover:bg-red-900/50">Rejeitar/Mudar</button>
                                                                                    </div>
                                                                                )}
                                                                                {item.image && (
                                                                                    <button 
                                                                                        onClick={() => setViewImage(item.image!)}
                                                                                        className="text-slate-400 hover:text-brand-600 md:ml-2"
                                                                                    >
                                                                                        <ImageIcon className="w-4 h-4" />
                                                                                    </button>
                                                                                )}
                                                                            </td>
                                                                            <td className="p-2 md:p-3 text-left md:text-right font-bold whitespace-nowrap block md:table-cell">
                                                                                <span className="md:hidden font-bold mr-2 text-slate-500 uppercase text-[10px]">Qtd:</span>
                                                                                {item.quantity}
                                                                            </td>
                                                                            
                                                                            {/* FIFO Allocation Column for Open Orders */}
                                                                            {type === 'OPEN' && !isCompleted && (
                                                                                <td className="p-2 md:p-3 text-left md:text-right font-mono text-xs whitespace-nowrap block md:table-cell">
                                                                                    <span className="md:hidden font-bold mr-2 text-slate-500 uppercase text-[10px]">Stock:</span>
                                                                                    {item.isCustom ? (
                                                                                        <span className="text-slate-400">N/A</span>
                                                                                    ) : (
                                                                                        <span className={\`\${isAllocOK ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}\`}>
                                                                                            {allocated} / {item.quantity}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                            )}

                                                                            {(type === 'FINISHED' || isGhost) && (
                                                                                <>
                                                                                <td className="p-2 md:p-3 text-left md:text-right font-bold whitespace-nowrap block md:table-cell">
                                                                                    <span className="md:hidden font-bold mr-2 text-slate-500 uppercase text-[10px]">Processado:</span>
                                                                                    {picked}
                                                                                </td>
                                                                                <td className="p-2 md:p-3 whitespace-nowrap block md:table-cell">
                                                                                    <span className="md:hidden font-bold mr-2 text-slate-500 uppercase text-[10px]">Status:</span>
                                                                                    {isFullyPicked ? <span className="text-green-600 dark:text-green-400 inline-flex items-center gap-1 text-xs font-bold"><Check className="w-3 h-3"/> OK</span> : (picked === 0 ? <span className="text-red-500 dark:text-red-400 inline-flex items-center gap-1 text-xs font-bold"><X className="w-3 h-3"/> Sem picking</span> : <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 text-xs font-bold"><AlertTriangle className="w-3 h-3"/> Parcial</span>)}
                                                                                </td>
                                                                                </>
                                                                            )}
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                   </div>`;

// Use simple char matching in case of slight space differences
function normalize(str) {
    return str.replace(/\\s+/g, ' ').replace(/\\$\\{/g, '${');
}

const nTarget = normalize(targetStr);
const nContent = normalize(fileContent);

if (nContent.includes(nTarget)) {
    // we need to replace it. We'll do it by finding the start and end in the original string using a rough find
    let startIdx = fileContent.indexOf('<div className="overflow-x-auto">');
    if(startIdx > -1) {
        let endIdx = fileContent.indexOf('</table>', startIdx) + 8;
        let endIdx2 = fileContent.indexOf('</div>', endIdx) + 6;
        fileContent = fileContent.slice(0, startIdx) + newStr + fileContent.slice(endIdx2);
        fs.writeFileSync('components/OrderManager.tsx', fileContent);
        console.log("Replaced using fast block replace.");
    }
} else {
    // try looser replace
    let startIdx = fileContent.indexOf('<div className="overflow-x-auto">');
    if(startIdx > -1) {
        let afterTr = fileContent.indexOf('</table>', startIdx);
        let endIdx2 = fileContent.indexOf('</div>', afterTr) + 6;
        let blockToReplace = fileContent.slice(startIdx, endIdx2);
        fileContent = fileContent.replace(blockToReplace, newStr);
        fs.writeFileSync('components/OrderManager.tsx', fileContent);
        console.log("Replaced using block boundary replace.");
    } else {
        console.log("Target not found!");
    }
}
