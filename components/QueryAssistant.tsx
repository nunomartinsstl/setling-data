import React, { useState } from 'react';
import { Order, StockItem, OrderLineItem } from '../types';
import { Search, Package, ShoppingCart, User, Calendar, ChevronDown, ChevronUp } from 'lucide-react';

interface QueryAssistantProps {
  orders: Order[];
  stock: StockItem[];
}

const QueryAssistant: React.FC<QueryAssistantProps> = ({ orders, stock }) => {
  const [query, setQuery] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Search logic: Checks Title, Creator, ID, or any nested Item SKU/Description
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

    return inHeader || inItems;
  });

  const filteredStock = stock.filter(s => {
    if (!query) return false;
    const q = query.toLowerCase();
    return s.sku.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });

  const hasResults = filteredOrders.length > 0 || filteredStock.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Search className="w-6 h-6 text-brand-600" />
          Busca Geral
        </h2>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite Material, descrição, título do pedido ou nome do usuário..."
            className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-lg"
          />
          <Search className="absolute left-4 top-3.5 w-6 h-6 text-slate-400" />
        </div>
      </div>

      {query && !hasResults && (
        <div className="text-center p-8 text-slate-500 bg-white rounded-xl border border-slate-200">
          Nenhum resultado encontrado para "{query}".
        </div>
      )}

      {/* STOCK RESULTS */}
      {filteredStock.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-amber-50 p-4 border-b border-amber-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-amber-800">Stock ({filteredStock.length})</h3>
          </div>
          <table className="w-full text-left text-sm text-slate-600">
             <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                    <th className="p-3">Material</th>
                    <th className="p-3">Descrição</th>
                    <th className="p-3 text-right">Qtd</th>
                    <th className="p-3">Lote</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
                {filteredStock.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-medium text-slate-800">{item.sku}</td>
                        <td className="p-3">{item.description}</td>
                        <td className="p-3 text-right font-bold">{item.quantity}</td>
                        <td className="p-3 font-mono text-xs">{item.batch}</td>
                    </tr>
                ))}
             </tbody>
          </table>
        </div>
      )}

      {/* ORDER RESULTS */}
      {filteredOrders.length > 0 && (
        <div className="space-y-4">
           <div className="flex items-center gap-2 text-slate-500 font-semibold px-2">
             <ShoppingCart className="w-5 h-5" />
             <h3>Pedidos Encontrados ({filteredOrders.length})</h3>
           </div>
           
           {filteredOrders.map(order => {
             const isExpanded = expandedOrderId === order.id;
             const items = order.items || [];

             return (
               <div key={order.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                 <div 
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                 >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                        <div>
                            <h4 className="font-bold text-slate-800">{order.title || 'Sem Título'}</h4>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                <User className="w-3 h-3" /> {order.creator}
                                <span className="text-slate-300">|</span>
                                <span>Criado: {new Date(order.dateCreated).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                             <div className="flex items-center gap-2 text-xs text-slate-600">
                                <Calendar className="w-3 h-3 text-brand-600" />
                                Para: {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'N/A'}
                             </div>
                             <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                order.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                             }`}>
                                {order.status === 'OPEN' ? 'Aberto' : 'Finalizado'}
                             </span>
                        </div>
                    </div>
                    <div className="ml-4">
                        {isExpanded ? <ChevronUp className="text-slate-400"/> : <ChevronDown className="text-slate-400"/>}
                    </div>
                 </div>

                 {isExpanded && (
                    <div className="bg-slate-50 p-4 border-t border-slate-200">
                        <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden shadow-sm">
                            <thead className="bg-slate-100 font-semibold text-slate-700">
                                <tr>
                                    <th className="p-3">Material</th>
                                    <th className="p-3">Descrição</th>
                                    <th className="p-3 text-right">Qtd</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map((item, idx) => (
                                    <tr key={idx} className={item.sku.toLowerCase().includes(query.toLowerCase()) ? 'bg-yellow-50' : ''}>
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