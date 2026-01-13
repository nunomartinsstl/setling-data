import React, { useState, useRef } from 'react';
import { OrderItem, StockItem, UserRole } from '../types';
import { StorageService } from '../services/storageService';
import { Upload, FileText, Loader2, CheckCircle, Clock, Plus, Trash2, FileSpreadsheet, ArrowRightCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

interface OrderManagerProps {
  orders: OrderItem[];
  stock: StockItem[];
  type: 'OPEN' | 'FINISHED';
  userRole: UserRole;
  refreshData: () => void;
}

const OrderManager: React.FC<OrderManagerProps> = ({ orders, stock, type, userRole, refreshData }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [importMode, setImportMode] = useState<'FILE' | 'MANUAL'>('MANUAL');
  
  // Manual Entry State
  const [manualRows, setManualRows] = useState<{sku: string, qty: number}[]>([{sku: '', qty: 0}]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredOrders = orders.filter(o => type === 'OPEN' ? o.status === 'OPEN' : o.status === 'FINISHED');
  const isManagement = userRole === UserRole.MANAGEMENT;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const newOrders: OrderItem[] = [];

        data.forEach((row: any) => {
            const material = row['MATERIAL'] || row['Material'] || row['SKU'] || row['sku'];
            const qtd = row['QTD'] || row['Qtd'] || row['Quantidade'] || row['Quantity'];

            if (material && qtd) {
                const stockMatch = stock.find(s => s.sku === material.toString());
                
                newOrders.push({
                    id: Math.random().toString(36).substr(2, 9),
                    sku: material.toString(),
                    description: stockMatch ? stockMatch.description : 'Importado via Excel',
                    quantity: Number(qtd),
                    status: 'OPEN',
                    dateAdded: new Date().toISOString()
                });
            }
        });

        if (newOrders.length === 0) throw new Error("Nenhum dado válido encontrado. Colunas esperadas: MATERIAL, QTD");

        await StorageService.addOrders(newOrders);
        refreshData();
        setMessage({ type: 'success', text: `${newOrders.length} pedidos importados do Excel.` });
        if(fileInputRef.current) fileInputRef.current.value = '';

      } catch (err: any) {
        setMessage({ type: 'error', text: "Erro ao ler Excel: " + err.message });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const addManualRow = () => {
    setManualRows([...manualRows, { sku: '', qty: 0 }]);
  };

  const removeManualRow = (index: number) => {
    const newRows = [...manualRows];
    newRows.splice(index, 1);
    setManualRows(newRows);
  };

  const updateManualRow = (index: number, field: 'sku' | 'qty', value: string | number) => {
    const newRows = [...manualRows];
    if (field === 'sku') newRows[index].sku = value as string;
    if (field === 'qty') newRows[index].qty = Number(value);
    setManualRows(newRows);
  };

  const submitManual = async () => {
    setIsProcessing(true);
    try {
        const newOrders: OrderItem[] = [];
        manualRows.forEach(row => {
            if (row.sku && row.qty > 0) {
                 const stockMatch = stock.find(s => s.sku === row.sku);
                 newOrders.push({
                    id: Math.random().toString(36).substr(2, 9),
                    sku: row.sku,
                    description: stockMatch ? stockMatch.description : 'Entrada Manual',
                    quantity: row.qty,
                    status: 'OPEN',
                    dateAdded: new Date().toISOString()
                });
            }
        });

        if (newOrders.length === 0) throw new Error("Preencha ao menos um item válido.");

        await StorageService.addOrders(newOrders);
        refreshData();
        setManualRows([{sku: '', qty: 0}]);
        setMessage({ type: 'success', text: `${newOrders.length} pedidos adicionados.` });
    } catch (err: any) {
        setMessage({ type: 'error', text: err.message });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleFinishOrder = async (orderId: string) => {
    if (window.confirm('Marcar este pedido como finalizado?')) {
        setIsProcessing(true);
        try {
            await StorageService.updateOrderStatus(orderId, 'FINISHED');
            refreshData();
        } catch (err) {
            alert('Erro ao finalizar pedido');
        } finally {
            setIsProcessing(false);
        }
    }
  };

  return (
    <div className="space-y-6">
      
      <datalist id="stock-options">
        {stock.map((item, idx) => (
            <option key={idx} value={item.sku}>{item.description}</option>
        ))}
      </datalist>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          {type === 'OPEN' ? <Clock className="text-blue-500"/> : <CheckCircle className="text-green-500"/>}
          {type === 'OPEN' ? 'Pedidos Abertos' : 'Pedidos Finalizados'}
          <span className="text-sm font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-1 rounded-full">
            {filteredOrders.length} registros
          </span>
        </h2>
      </div>

      {type === 'OPEN' && (
        <div className={`bg-white p-6 rounded-xl shadow-sm border ${isManagement ? 'border-brand-200' : 'border-slate-200'}`}>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" /> Importar Pedidos
          </h3>
          
          {!isManagement ? (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm">
              Apenas usuários da Gerência podem importar novos pedidos.
            </div>
          ) : (
            <div>
                <div className="flex space-x-4 mb-4 border-b border-slate-100 pb-2">
                    <button 
                        onClick={() => setImportMode('MANUAL')}
                        className={`text-sm font-medium pb-2 border-b-2 transition-colors ${importMode === 'MANUAL' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        Entrada Manual
                    </button>
                    <button 
                        onClick={() => setImportMode('FILE')}
                        className={`text-sm font-medium pb-2 border-b-2 transition-colors ${importMode === 'FILE' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        Upload Excel
                    </button>
                </div>

                {importMode === 'FILE' && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50">
                            <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                            <p className="text-sm text-slate-600 mb-4">
                                Arraste um arquivo <strong>.xlsx</strong> aqui ou clique para selecionar.
                                <br/>
                                <span className="text-xs text-slate-400">Colunas necessárias: MATERIAL, QTD</span>
                            </p>
                            <input 
                                type="file" 
                                accept=".xlsx, .xls"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                            />
                        </div>
                    </div>
                )}

                {importMode === 'MANUAL' && (
                    <div className="space-y-3 animate-fade-in">
                        <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 mb-1">
                            <div className="col-span-8">Material / SKU (Busca Auto)</div>
                            <div className="col-span-3">Quantidade</div>
                            <div className="col-span-1"></div>
                        </div>
                        {manualRows.map((row, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-8">
                                    <input 
                                        list="stock-options"
                                        type="text" 
                                        value={row.sku}
                                        onChange={(e) => updateManualRow(idx, 'sku', e.target.value)}
                                        placeholder="Digite o código ou nome..."
                                        className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <input 
                                        type="number" 
                                        value={row.qty}
                                        onChange={(e) => updateManualRow(idx, 'qty', e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                                        min="1"
                                    />
                                </div>
                                <div className="col-span-1 flex justify-center">
                                    {manualRows.length > 1 && (
                                        <button onClick={() => removeManualRow(idx)} className="text-red-400 hover:text-red-600">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        
                        <button onClick={addManualRow} className="text-xs flex items-center gap-1 text-brand-600 font-medium hover:text-brand-800 mt-2">
                            <Plus className="w-3 h-3" /> Adicionar Linha
                        </button>

                        <div className="pt-4 flex justify-end">
                            <button
                                onClick={submitManual}
                                disabled={isProcessing}
                                className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                Salvar Pedidos
                            </button>
                        </div>
                    </div>
                )}

                {message && (
                  <div className={`mt-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.text}
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
              <tr>
                <th className="p-4">ID</th>
                <th className="p-4">SKU</th>
                <th className="p-4">Descrição</th>
                <th className="p-4 text-right">Qtd</th>
                <th className="p-4">Status</th>
                {type === 'OPEN' && <th className="p-4 text-center">Ação</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Pasta vazia.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-mono text-xs">{order.id}</td>
                    <td className="p-4 font-medium text-slate-800">{order.sku}</td>
                    <td className="p-4">{order.description}</td>
                    <td className="p-4 text-right font-bold">{order.quantity}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        order.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {order.status === 'OPEN' ? 'Aberto' : 'Finalizado'}
                      </span>
                    </td>
                    {type === 'OPEN' && (
                        <td className="p-4 text-center">
                            <button 
                                onClick={() => handleFinishOrder(order.id)}
                                disabled={isProcessing}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-full transition-colors"
                                title="Finalizar Pedido"
                            >
                                <ArrowRightCircle className="w-5 h-5" />
                            </button>
                        </td>
                    )}
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

export default OrderManager;