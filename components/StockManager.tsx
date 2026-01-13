import React, { useState } from 'react';
import { StockItem, UserRole } from '../types';
import { ParserService } from '../services/parser';
import { StorageService } from '../services/storageService';
import { Upload, Package, Loader2, AlertTriangle } from 'lucide-react';

interface StockManagerProps {
  stock: StockItem[];
  userRole: UserRole;
  refreshData: () => void;
}

const StockManager: React.FC<StockManagerProps> = ({ stock, userRole, refreshData }) => {
  const [importText, setImportText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleImport = async () => {
    if (!importText.trim()) return;
    
    // Safety check for replace action
    if (!window.confirm("AVISO: O upload irá SUBSTITUIR todo o estoque atual. Continuar?")) {
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      const newStock = ParserService.parseStockImport(importText);
      
      if (newStock.length === 0) {
        throw new Error("Nenhum item válido encontrado.");
      }

      // REPLACE Logic
      StorageService.replaceStock(newStock);
      
      refreshData();
      setImportText('');
      setMessage({ type: 'success', text: `Estoque substituído. ${newStock.length} itens no sistema.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || "Falha ao atualizar estoque." });
    } finally {
      setIsProcessing(false);
    }
  };

  const isWarehouse = userRole === UserRole.WAREHOUSE;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package className="text-amber-500" /> Estoque Atual
        </h2>
      </div>

      <div className={`bg-white p-6 rounded-xl shadow-sm border ${isWarehouse ? 'border-amber-200' : 'border-slate-200'}`}>
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Upload className="w-5 h-5" /> Atualizar Estoque
        </h3>
        
        {!isWarehouse ? (
          <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm">
            Apenas pessoal do Armazém pode atualizar o estoque.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-amber-50 p-3 rounded-md flex items-start gap-2 text-amber-800 text-sm border border-amber-100">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p><strong>Aviso:</strong> O upload aqui substitui completamente a lista atual. Não soma.</p>
            </div>
            
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`Formato CSV: SKU, Descrição, Quantidade\nExemplo:\nITEM-A, Caixa Pequena, 100`}
              className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm font-mono"
            />
            
            <div className="flex items-center justify-between">
              <button
                onClick={handleImport}
                disabled={isProcessing || !importText}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isProcessing ? 'Substituindo...' : 'Substituir Estoque'}
              </button>
              {message && (
                <span className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {message.text}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Table View */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
              <tr>
                <th className="p-4">SKU</th>
                <th className="p-4">Descrição</th>
                <th className="p-4 text-right">Quantidade</th>
                <th className="p-4">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stock.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400">
                    Armazém vazio.
                  </td>
                </tr>
              ) : (
                stock.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-medium text-slate-800">{item.sku}</td>
                    <td className="p-4">{item.description}</td>
                    <td className="p-4 text-right font-bold text-slate-900">{item.quantity}</td>
                    <td className="p-4 text-xs text-slate-400">
                      {item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('pt-BR') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StockManager;