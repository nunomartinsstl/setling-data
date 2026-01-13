import React, { useState, useRef } from 'react';
import { StockItem, UserRole } from '../types';
import { StorageService } from '../services/storageService';
import { Upload, Package, Loader2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface StockManagerProps {
  stock: StockItem[];
  userRole: UserRole;
  refreshData: () => void;
}

const StockManager: React.FC<StockManagerProps> = ({ stock, userRole, refreshData }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Safety check for replace action
    if (!window.confirm("AVISO: O upload irá SUBSTITUIR todo o estoque atual. Continuar?")) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
            throw new Error("O arquivo está vazio.");
        }

        // Validate Columns
        // Expected: Material, Texto breve material, Utilização livre, Lote
        const firstRow = data[0];
        const requiredColumns = ['Material', 'Texto breve material', 'Utilização livre', 'Lote'];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));

        if (missingColumns.length > 0) {
            throw new Error(`Formato inválido. Colunas faltando: ${missingColumns.join(', ')}`);
        }

        // Process Data WITHOUT AGGREGATION
        const newStock: StockItem[] = [];

        data.forEach((row) => {
            const sku = row['Material']?.toString().trim();
            const description = row['Texto breve material']?.toString().trim() || 'Sem descrição';
            const batch = row['Lote']?.toString().trim() || '-';
            
            // Handle number parsing
            let qty = row['Utilização livre'];
            if (typeof qty === 'string') {
                qty = parseFloat(qty);
            }
            
            if (sku) {
                const currentQty = isNaN(Number(qty)) ? 0 : Number(qty);
                
                newStock.push({
                    sku,
                    description,
                    quantity: currentQty,
                    batch: batch,
                    lastUpdated: new Date().toISOString()
                });
            }
        });

        if (newStock.length === 0) {
          throw new Error("Nenhum item válido encontrado nas linhas.");
        }

        // REPLACE Logic
        await StorageService.replaceStock(newStock);
        
        refreshData();
        setMessage({ type: 'success', text: `Estoque substituído com sucesso. ${newStock.length} linhas carregadas.` });
        if (fileInputRef.current) fileInputRef.current.value = '';

      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || "Falha ao processar arquivo." });
        if (fileInputRef.current) fileInputRef.current.value = '';
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const isWarehouse = userRole === UserRole.WAREHOUSE;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package className="text-amber-500" /> Estoque Atual
        </h2>
        <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
            {stock.length} lotes registrados
        </span>
      </div>

      <div className={`bg-white p-6 rounded-xl shadow-sm border ${isWarehouse ? 'border-amber-200' : 'border-slate-200'}`}>
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Upload className="w-5 h-5" /> Atualizar Estoque (Excel)
        </h3>
        
        {!isWarehouse ? (
          <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm">
            Apenas pessoal do Armazém pode atualizar o estoque.
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-amber-50 p-4 rounded-md border border-amber-100">
              <div className="flex items-start gap-2 text-amber-800 text-sm mb-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p><strong>Atenção:</strong> O arquivo enviado irá <u>SUBSTITUIR</u> todo o estoque atual.</p>
              </div>
              <p className="text-xs text-amber-700 ml-6">
                 Certifique-se de que o Excel contém as colunas exatas: 
                 <br/>
                 <code className="bg-amber-100 px-1 rounded">Material</code>, 
                 <code className="bg-amber-100 px-1 rounded">Texto breve material</code>, 
                 <code className="bg-amber-100 px-1 rounded">Utilização livre</code>, 
                 <code className="bg-amber-100 px-1 rounded">Lote</code>
              </p>
            </div>
            
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative">
                <input 
                    type="file" 
                    accept=".xlsx, .xls"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    disabled={isProcessing}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="pointer-events-none">
                    {isProcessing ? (
                        <div className="flex flex-col items-center">
                            <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-2" />
                            <p className="text-sm text-slate-600">Processando planilha...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-2" />
                            <p className="text-sm font-medium text-slate-700">Clique para selecionar o arquivo Excel</p>
                            <p className="text-xs text-slate-500 mt-1">.xlsx ou .xls</p>
                        </div>
                    )}
                </div>
            </div>

            {message && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                  {message.type === 'success' && <div className="w-2 h-2 rounded-full bg-green-500" />}
                  {message.text}
                </div>
            )}
          </div>
        )}
      </div>

      {/* Table View */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
              <tr>
                <th className="p-4">SKU (Material)</th>
                <th className="p-4">Descrição</th>
                <th className="p-4">Lote</th>
                <th className="p-4 text-right">Qtd</th>
                <th className="p-4">Atualizado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stock.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    Armazém vazio.
                  </td>
                </tr>
              ) : (
                stock.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-medium text-slate-800">{item.sku}</td>
                    <td className="p-4">{item.description}</td>
                    <td className="p-4 font-mono text-xs text-amber-700">{item.batch}</td>
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