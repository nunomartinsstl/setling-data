
import React, { useState } from 'react';
import { Order, StockItem, OrderLineItem } from '../types';
import { Search, Package, ShoppingCart, User, Calendar, ChevronDown, ChevronUp, Activity } from 'lucide-react';

interface QueryAssistantProps {
  orders: Order[];
  stock: StockItem[];
}

const QueryAssistant: React.FC<QueryAssistantProps> = ({ orders, stock }) => {
  const [query, setQuery] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Search logic: Checks Title, Creator, ID, Items (SKU/Desc), or Picked Bins
  const filteredOrders = orders.filter(o => {
    if (!query) return false;
    const q = query.toLowerCase();
    
    // Check Header
    const inHeader = (o.title || '').toLowerCase().includes(q) || 
                     (o.creator || '').toLowerCase().includes(q) ||
                     o.id.toLowerCase().includes(q);
    
    // Check Items
    const items = o.items || [];
    const inItems = items.some(item => 
        item.sku.toLowerCase().includes(q) || 
        item.description.toLowerCase().includes(q)
    );

    // Check Picked Items (Bin Locations)
    const pickedItems = o.pickedItems ? (Array.isArray(o.pickedItems) ? o.pickedItems : Object.values(o.pickedItems)) : [];
    const inPicked = pickedItems.some((p: any) => 
        p.bin && p.bin.toLowerCase().includes(q)
    );

    return inHeader || inItems || inPicked;
  });

  const filteredStock = stock.filter(s => {
    if (!query) return false;
    const q = query.toLowerCase();
    return s.sku.toLowerCase().includes(q) || 
           s.description.toLowerCase().includes(q) ||
           (s.batch && s.batch.toLowerCase().includes(q));
  });

  const hasResults = filteredOrders.length > 0 || filteredStock.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <Search className="w-6 h-6 text-brand-600" />
          Busca Geral
        </h2>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite Material, descrição, utilizador ou localização (ex: 14-0-1-1)..."
            className="w-full pl-12 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400"
          />
          <Search className="absolute left-4 top-3.5 w-6 h-6 text-slate-400" />
        </div>
      </div>

      {query && !hasResults && (
        <div className="text-center p-8 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          Nenhum resultado encontrado para "{query}".
        </div>
      )}

      {/* STOCK RESULTS */}
      {filteredStock.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-amber-50 dark:bg-amber-900/20 p-4 border-b border-amber-100 dark:border-amber-800 flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="font-bold text-amber-800 dark:text-amber-300">Stock ({filteredStock.length})</h3>
          </div>
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
             <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
                <tr>
                    <th className="p-3">Material</th>
                    <th className="p-3">Descrição</th>
                    <th className="p-3 text-right">Qtd</th>
                    <th className="p-3">Lote / Localização</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredStock.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="p-3 font-medium text-slate-800 dark:text-white">{item.sku}</td>
                        <td className="p-3">{item.description}</td>
                        <td className="p-3 text-right font-bold">{item.quantity}</td>
                        <td className="p-3 font-mono text-xs">
                            {/* Highlight the match if querying by bin */}
                            {query && item.batch && item.batch.toLowerCase().includes(query.toLowerCase()) ? (
                                <span className="bg-yellow-200 dark:bg-yellow-900 text-slate-900 dark:text-white px-1 rounded">{item.batch}</span>
                            ) : (
                                item.batch
                            )}
                        </td>
                    </tr>
                ))}
             </tbody>
          </table>
        </div>
      )}

      {/* ORDER RESULTS */}
      {filteredOrders.length > 0 && (
        <div className="space-y-4">
           <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-semibold px-2">
             <ShoppingCart className="w-5 h-5" />
             <h3>Pedidos Encontrados ({filteredOrders.length})</h3>
           </div>
           
           {filteredOrders.map(order => {
             const isExpanded = expandedOrderId === order.id;
             const items = order.items || [];
             const isInProcess = order.status === 'IN_PROCESS' || order.status === 'IN PROCESS';

             return (
               <div key={order.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                 <div 
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700"
                    onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                 >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                        <div>
                            <h4 className="font-bold text-slate-800 dark:text-white">{order.title || 'Sem Título'}</h4>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                                <User className="w-3 h-3" /> {order.creator}
                                <span className="text-slate-300 dark:text-slate-600">|</span>
                                <span>Criado: {new Date(order.dateCreated).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                             <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                <Calendar className="w-3 h-3 text-brand-600" />
                                Para: {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'N/A'}
                             </div>
                             {isInProcess ? (
                                <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                                    <Activity className="w-3 h-3" /> Pedido em curso
                                </span>
                             ) : (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    order.status === 'COMPLETED' 
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                }`}>
                                    {order.status === 'COMPLETED' ? 'Finalizado' : 'Aberto'}
                                </span>
                             )}
                        </div>
                    </div>
                    <div className="ml-4">
                        {isExpanded ? <ChevronUp className="text-slate-400"/> : <ChevronDown className="text-slate-400"/>}
                    </div>
                 </div>

                 {isExpanded && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-t border-slate-200 dark:border-slate-700">
                        <table className="w-full text-sm text-left bg-white dark:bg-slate-900 rounded-lg overflow-hidden shadow-sm">
                            <thead className="bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200">
                                <tr>
                                    <th className="p-3">Material</th>
                                    <th className="p-3">Descrição</th>
                                    <th className="p-3 text-right">Qtd</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {items.map((item, idx) => (
                                    <tr key={idx} className={item.sku.toLowerCase().includes(query.toLowerCase()) ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'dark:text-slate-300'}>
                                        <td className="p-3 font-medium">{item.sku}</td>
                                        <td className="p-3">{item.description}</td>
                                        <td className="p-3 text-right font-bold">{item.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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

export default QueryAssistant;
