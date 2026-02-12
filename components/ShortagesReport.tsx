
import React, { useMemo, useState } from 'react';
import { Order, StockItem, OrderLineItem } from '../types';
import { AlertTriangle, Package, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

interface ShortagesReportProps {
  orders: Order[];
  stock: StockItem[];
  onNavigateToOrder: (orderId: string) => void;
}

interface ShortageItem {
    sku: string;
    description: string;
    totalRequired: number;
    physicalStock: number;
    missing: number;
    orders: {
        id: string;
        title: string;
        dateCreated: string;
        reqQty: number;
        creator: string;
    }[];
}

const ShortagesReport: React.FC<ShortagesReportProps> = ({ orders, stock, onNavigateToOrder }) => {
    const [expandedSku, setExpandedSku] = useState<string | null>(null);

    const shortages = useMemo(() => {
        const result: ShortageItem[] = [];
        const demandMap = new Map<string, { desc: string, total: number, orders: any[] }>();

        // 1. Filter Active Orders
        const activeOrders = orders.filter(o => o.status === 'OPEN' || o.status === 'IN_PROCESS' || o.status === 'IN PROCESS');

        // 2. Aggregate Demand
        activeOrders.forEach(order => {
            order.items.forEach(item => {
                // Ignore custom items without SKU for now, as we can't check stock reliably
                if (item.isCustom && !item.sku) return;
                
                const sku = item.sku;
                if (!demandMap.has(sku)) {
                    demandMap.set(sku, { desc: item.description, total: 0, orders: [] });
                }
                const entry = demandMap.get(sku)!;
                entry.total += item.quantity;
                entry.orders.push({
                    id: order.id,
                    title: order.title,
                    dateCreated: order.dateCreated,
                    reqQty: item.quantity,
                    creator: order.creator
                });
            });
        });

        // 3. Compare with Stock (Summing duplicate SKUs if multiple locations exist)
        const stockMap = new Map<string, { totalQty: number, desc: string }>();
        
        stock.forEach(s => {
            if (!stockMap.has(s.sku)) {
                stockMap.set(s.sku, { totalQty: 0, desc: s.description });
            }
            const current = stockMap.get(s.sku)!;
            current.totalQty += s.quantity;
        });

        demandMap.forEach((data, sku) => {
            const stockEntry = stockMap.get(sku);
            const physicalStock = stockEntry ? stockEntry.totalQty : 0;
            const description = stockEntry ? stockEntry.desc : data.desc;

            if (data.total > physicalStock) {
                result.push({
                    sku,
                    description,
                    totalRequired: data.total,
                    physicalStock,
                    missing: data.total - physicalStock,
                    orders: data.orders
                });
            }
        });

        return result.sort((a, b) => b.missing - a.missing);
    }, [orders, stock]);

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div className="flex items-center gap-3">
                <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Relatório de Faltas</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Materiais com pedidos acima do stock físico disponível.</p>
                </div>
            </div>

            {shortages.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-12 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 text-center">
                    <Package className="w-16 h-16 text-green-200 dark:text-green-900 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">Tudo OK!</h3>
                    <p className="text-slate-500 dark:text-slate-400">Não há ruturas de stock para os pedidos atuais.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {shortages.map((item) => {
                        const isExpanded = expandedSku === item.sku;
                        return (
                            <div key={item.sku} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-red-100 dark:border-red-900/50 overflow-hidden">
                                <div 
                                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                    onClick={() => setExpandedSku(isExpanded ? null : item.sku)}
                                >
                                    <div className="flex-1 pr-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                                            <span className="font-mono font-bold text-lg text-slate-800 dark:text-white">{item.sku}</span>
                                            
                                            <div className="flex flex-wrap gap-2">
                                                <span className="text-xs font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600" title="Stock Físico Atual">
                                                    Stock: {item.physicalStock}
                                                </span>
                                                <span className="text-xs font-bold px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800" title="Total Necessário nos Pedidos">
                                                    Qtd. Pedida: {item.totalRequired}
                                                </span>
                                                <span className="text-xs font-bold px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800" title="Quantidade em Falta">
                                                    Falta: {item.missing}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">{item.description}</p>
                                    </div>

                                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0"/> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0"/>}
                                </div>

                                {isExpanded && (
                                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-t border-slate-100 dark:border-slate-700 animate-slide-down">
                                        <h4 className="text-xs font-bold uppercase text-slate-500 mb-3">Pedidos a aguardar este material:</h4>
                                        <div className="space-y-2">
                                            {item.orders.map((order) => (
                                                <div key={order.id} className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 text-sm">
                                                    <div>
                                                        <div className="font-bold text-slate-700 dark:text-slate-200">{order.title}</div>
                                                        <div className="text-xs text-slate-500">{order.creator} • {new Date(order.dateCreated).toLocaleDateString()}</div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="font-bold text-slate-800 dark:text-white">Qtd: {order.reqQty}</span>
                                                        <span className="text-xs text-slate-400 italic">ID: {order.id.substring(0,6)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ShortagesReport;
