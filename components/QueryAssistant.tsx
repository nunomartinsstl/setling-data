import React, { useState } from 'react';
import { OrderItem, StockItem } from '../types';
import { Search, Package, ShoppingCart } from 'lucide-react';

interface QueryAssistantProps {
  orders: OrderItem[];
  stock: StockItem[];
}

const QueryAssistant: React.FC<QueryAssistantProps> = ({ orders, stock }) => {
  const [query, setQuery] = useState('');
  
  const filteredOrders = orders.filter(o => 
    o.sku.toLowerCase().includes(query.toLowerCase()) || 
    o.description.toLowerCase().includes(query.toLowerCase()) ||
    o.id.toLowerCase().includes(query.toLowerCase())
  );

  // Updated filter to include BATCH search
  const filteredStock = stock.filter(s => 
    s.sku.toLowerCase().includes(query.toLowerCase()) || 
    s.description.toLowerCase().includes(query.toLowerCase()) ||
    s.batch.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Search className="text-brand-600" />
            Busca Geral
        </h2>
        <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite SKU, Lote, descrição ou ID do pedido..."
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-semibold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-500" /> Pedidos Encontrados ({filteredOrders.length})
            </div>
            <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <tbody className="divide-y divide-slate-100">
                        {filteredOrders.length === 0 ? (
                            <tr><td className="p-4 text-center text-slate-400">Nada encontrado.</td></tr>
                        ) : (
                            filteredOrders.map(o => (
                                <tr key={o.id} className="hover:bg-slate-50">
                                    <td className="p-3">
                                        <div className="font-medium text-slate-800">{o.sku}</div>
                                        <div className="text-xs text-slate-400">{o.id}</div>
                                    </td>
                                    <td className="p-3">{o.description}</td>
                                    <td className="p-3 text-right">
                                        <span className="font-bold">{o.quantity}</span>
                                        <span className={`block text-[10px] ${o.status === 'OPEN' ? 'text-blue-500' : 'text-green-500'}`}>
                                            {o.status === 'OPEN' ? 'ABERTO' : 'FIM'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-semibold flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-500" /> Estoque Encontrado ({filteredStock.length})
            </div>
            <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="p-2">SKU</th>
                            <th className="p-2">Descrição</th>
                            <th className="p-2">Lote</th>
                            <th className="p-2 text-right">Qtd</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredStock.length === 0 ? (
                            <tr><td colSpan={4} className="p-4 text-center text-slate-400">Nada encontrado.</td></tr>
                        ) : (
                            filteredStock.map((s, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                    <td className="p-3 font-medium text-slate-800">{s.sku}</td>
                                    <td className="p-3">{s.description}</td>
                                    <td className="p-3 font-mono text-xs text-amber-700">{s.batch}</td>
                                    <td className="p-3 text-right font-bold">{s.quantity}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};

export default QueryAssistant;