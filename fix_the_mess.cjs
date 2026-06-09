const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(/\{manualRows\.length \> 1 && \(\s*<button onClick=\{\(e\) => \{[\s\S]*?className=\{\`relative w-12 h-12 flex items-center justify-center text-xl font-bold rounded-none flex-shrink-0 mr-3 cursor-help hover:scale-110 active:scale-95 transition-all outline-none border-2 \$\{pickingColor\}\`\}>\s*\{pickingCode\}/,
`{manualRows.length > 1 && (
                                                <button onClick={(e) => { e.stopPropagation(); removeManualRow(idx); }} className="text-red-500 hover:text-red-700 transition-colors p-2">
                                                    <Trash2 className="w-5 h-5"/>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                <div className="flex justify-center mt-6">
                                    <button onClick={addManualRow} className="flex items-center gap-2 px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-300 dark:border-slate-600 rounded-none font-bold">
                                        <Plus className="w-5 h-5"/> Adicionar Linha
                                    </button>
                                </div>
                            </div>

                            <div className="mt-8 flex flex-col md:flex-row justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
                                <button onClick={() => { setMode('LIST'); resetForm(); }} className="px-6 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-none font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={handleSaveManualOrder} disabled={isSaving} className="px-8 py-3 bg-brand-600 text-white font-bold rounded-none hover:bg-brand-700 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
                                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5"/>} Finalizar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* View Image Modal */}
            {viewImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setViewImage(null)}>
                    <div className="relative max-w-4xl max-h-[90vh] w-full flex justify-center">
                        <img src={viewImage} alt="Preview" className="max-w-full max-h-[90vh] object-contain border-4 border-white shadow-2xl" onClick={e => e.stopPropagation()} />
                        <button onClick={() => setViewImage(null)} className="absolute -top-4 -right-4 bg-white text-slate-900 rounded-full p-2 shadow-lg hover:scale-110 transition-transform">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}

            {showList && (
                <div className="flex flex-col gap-6 animate-fade-in pb-12">
                    <div className="flex flex-col gap-4">
                        {displayedOrders.map((order, orderIdx) => {
                            const isExpanded = expandedOrderId === order.id;
                            const isOtherExpanded = expandedOrderId !== null && expandedOrderId !== order.id;
                            const hasPendingPhotos = order.status === 'PENDING_PHOTOS';
                            const isPendingApproval = order.status === 'PENDING_APPROVAL';
                            const isPending = order.status === 'PENDING';
                            const isInProcess = order.status === 'IN_PROCESS';
                            const isCompleted = order.status === 'COMPLETED';

                            const isFullAlloc = order.items.every(i => getTotalPickedQuantity(order, orders, i.sku) >= i.quantity);

                            const hasBackorder = order.reopenCount > 0;
                            const isReopen = order.parentId !== undefined;

                            const orderTotalRequested = order.items.reduce((acc, item) => acc + item.quantity, 0);
                            const orderTotalPicked = order.items.reduce((acc, item) => acc + getTotalPickedQuantity(order, orders, item.sku), 0);
                            const pickingCode = orderTotalPicked === 0 ? 'A' : (orderTotalPicked >= orderTotalRequested ? 'C' : 'B');
                            const pickingColor = pickingCode === 'A' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800' 
                                               : pickingCode === 'B' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                               : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800';
                            const isOrderFullyFulfilled = orderTotalPicked >= orderTotalRequested;
                            // Reabertura hierarchy flags
                            let isParent = false;
                            let hasChildren = false;
                            let isLastChild = false;
                            if (order.reopenCount > 0) {
                                isParent = true;
                                hasChildren = true;
                            } else if (order.parentId) {
                                // check if next order has same parentId
                                const nextOrder = displayedOrders[orderIdx + 1];
                                isLastChild = !nextOrder || nextOrder.parentId !== order.parentId;
                            }
                            
                            const isGhost = isOtherExpanded && !isExpanded;

                            return (
                                <div 
                                    key={order.id} 
                                    className={\`relative z-10 bg-transparent rounded-none shadow-none border transition-all \${
                                        isExpanded ? 'border-brand-200 dark:border-brand-900 ring-1 ring-brand-100 dark:ring-brand-900' : 'border-slate-200 dark:border-slate-700'
                                    } \${isGhost ? 'opacity-70 grayscale' : ''} \${isReopen ? 'ml-4 md:ml-8' : ''}\`}
                                >
                                    {hasChildren && (
                                        <div className="absolute left-[-1px] md:left-[-1px] top-[2rem] -bottom-12 border-l-2 border-slate-300 dark:border-slate-600 -z-10" />
                                     )}
                                     {isReopen && (
                                        <>
                                            <div className="absolute -left-[17px] md:-left-[33px] top-[2rem] w-[17px] md:w-[33px] border-t-2 border-slate-300 dark:border-slate-600 -z-10" />
                                            {!isLastChild && (
                                                <div className="absolute -left-[17px] md:-left-[33px] top-[2rem] -bottom-12 border-l-2 border-slate-300 dark:border-slate-600 -z-10" />
                                            )}
                                        </>
                                     )}

                                    <div 
                                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                                        className="p-3 md:p-4 bg-white dark:bg-slate-800 flex flex-col md:flex-row md:items-center justify-between cursor-pointer select-none relative"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setStatusPopoverId(statusPopoverId === order.id ? null : order.id);
                                                }}
                                                className={\`relative w-12 h-12 flex items-center justify-center text-xl font-bold rounded-none flex-shrink-0 mr-3 cursor-help hover:scale-110 active:scale-95 transition-all outline-none border-2 \${pickingColor}\`}
                                            >
                                                {pickingCode}`);

fs.writeFileSync('components/OrderManager.tsx', c);
