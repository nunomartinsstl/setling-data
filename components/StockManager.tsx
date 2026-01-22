import React, { useState, useRef } from 'react';
import { StockItem, UserRole, MasterMaterial } from '../types';
import { StorageService } from '../services/storageService';
import { Upload, Package, Loader2, AlertTriangle, FileSpreadsheet, Database, Check, Info } from 'lucide-react';
import * as XLSX from 'xlsx';

interface StockManagerProps {
  stock: StockItem[];
  masterList: MasterMaterial[];
  userRole: UserRole;
  refreshData: () => void;
}

const StockManager: React.FC<StockManagerProps> = ({ stock, masterList, userRole, refreshData }) => {
  const [activeTab, setActiveTab] = useState<'STOCK' | 'MASTER'>('STOCK');
  const [loadingState, setLoadingState] = useState<'' | 'READING' | 'UPLOADING' | 'PROCESSING'>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Permissions
  const canEditStock = userRole === UserRole.WAREHOUSE || userRole === UserRole.ADMIN;
  const isAdmin = userRole === UserRole.ADMIN;

  const handleStockUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input to allow re-selecting the same file if needed
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!window.confirm("AVISO: O upload irá SUBSTITUIR todo o stock atual e processar REABERTURAS automáticas para pedidos incompletos. Continuar?")) {
      return;
    }

    setLoadingState('READING');
    setMessage(null);

    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        setLoadingState('PROCESSING');
        const data = evt.target?.result;
        // Use ArrayBuffer for better compatibility
        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData: any[] = XLSX.utils.sheet_to_json(ws);

        if (jsonData.length === 0) throw new Error("O arquivo está vazio.");

        const firstRow = jsonData[0];
        // Ensure columns exist
        const requiredColumns = ['Material', 'Texto breve material', 'Utilização livre', 'Lote'];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));
        
        if (missingColumns.length > 0) {
            throw new Error(`Colunas em falta: ${missingColumns.join(', ')}`);
        }

        const newStock: StockItem[] = [];
        
        jsonData.forEach((row) => {
            const sku = row['Material']?.toString().trim();
            // Optional: You can filter specific SKUs here if needed
            if (sku) {
                const description = row['Texto breve material']?.toString().trim() || 'Sem descrição';
                const batch = row['Lote']?.toString().trim() || '-';
                let qty = row['Utilização livre'];
                
                // Sanitization
                if (typeof qty === 'string') qty = parseFloat(qty.replace(',', '.')); // Handle decimal comma
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

        if (newStock.length === 0) throw new Error("Nenhum item válido encontrado no Excel.");

        setLoadingState('UPLOADING');
        await StorageService.replaceStock(newStock);
        refreshData();
        setMessage({ type: 'success', text: `Stock atualizado com sucesso (${newStock.length} itens).` });

      } catch (err: any) {
        console.error("Upload Error:", err);
        setMessage({ type: 'error', text: err.message || "Falha ao processar arquivo. Verifique o formato." });
      } finally {
        setLoadingState('');
      }
    };

    reader.onerror = () => {
        setMessage({ type: 'error', text: "Erro de leitura do arquivo." });
        setLoadingState('');
    };

    reader.readAsArrayBuffer(file);
  };

  const handleMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!window.confirm("AVISO: Isso irá ADICIONAR novos materiais à lista 'Todos os Materiais'. Itens existentes não serão alterados. Continuar?")) {
        return;
    }

    setLoadingState('READING');
    setMessage(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setLoadingState('PROCESSING');
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData: any[] = XLSX.utils.sheet_to_json(ws);

        if (jsonData.length === 0) throw new Error("O arquivo está vazio.");
        
        const firstRow = jsonData[0];
        const requiredColumns = ['Material', 'Texto breve material'];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));
        
        if (missingColumns.length > 0) {
             throw new Error(`Colunas em falta: ${missingColumns.join(', ')}`);
        }

        const newMaster: MasterMaterial[] = [];
        jsonData.forEach((row) => {
             const sku = row['Material']?.toString().trim();
             const description = row['Texto breve material']?.toString().trim();
             if (sku && description) {
                 newMaster.push({ sku, description });
             }
        });
        
        if(newMaster.length === 0) throw new Error("Nenhum material válido encontrado.");

        setLoadingState('UPLOADING');
        await StorageService.mergeMasterMaterials(newMaster);
        refreshData();
        setMessage({ type: 'success', text: `Catálogo atualizado. Novos materiais foram adicionados.` });

      } catch (err: any) {
          console.error("Master Upload Error:", err);
          setMessage({ type: 'error', text: err.message });
      } finally {
          setLoadingState('');
      }
    };

    reader.onerror = () => {
        setMessage({ type: 'error', text: "Erro de leitura do arquivo." });
        setLoadingState('');
    };

    reader.readAsArrayBuffer(file);
  };

  const getLoadingText = () => {
      switch(loadingState) {
          case 'READING': return 'Lendo ficheiro...';
          case 'PROCESSING': return 'Processando dados...';
          case 'UPLOADING': return 'Enviando para base de dados...';
          default: return 'Carregando...';
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package className="text-amber-500" /> Gestão de Stock
        </h2>
        {isAdmin && (
            <div className="flex bg-slate-200 rounded-lg p-1">
                <button 
                    onClick={() => { setActiveTab('STOCK'); setMessage(null); }}
                    className={`px-4 py-1 text-sm font-medium rounded-md transition-all ${activeTab === 'STOCK' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                    Stock Atual
                </button>
                <button 
                    onClick={() => { setActiveTab('MASTER'); setMessage(null); }}
                    className={`px-4 py-1 text-sm font-medium rounded-md transition-all ${activeTab === 'MASTER' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                    Todos os Materiais
                </button>
            </div>
        )}
      </div>

      {activeTab === 'STOCK' ? (
          <>
            <div className={`bg-white p-6 rounded-xl shadow-sm border ${canEditStock ? 'border-amber-200' : 'border-slate-200'}`}>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Upload className="w-5 h-5" /> Atualizar Stock Físico
                </h3>
                
                {!canEditStock ? (
                <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm">
                    Apenas Logística ou Admins podem atualizar o stock.
                </div>
                ) : (
                <div className="space-y-4 animate-fade-in">
                    <div className="bg-amber-50 p-4 rounded-md border border-amber-100">
                    <div className="flex items-start gap-2 text-amber-800 text-sm mb-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p><strong>Atenção:</strong> O upload substitui o stock e <u>reabre pedidos automaticamente</u> se houver material disponível para itens pendentes.</p>
                    </div>
                    <p className="text-xs text-amber-700 ml-6">
                        Colunas necessárias: <code className="bg-amber-100 px-1 rounded border border-amber-200">Material</code>, <code className="bg-amber-100 px-1 rounded border border-amber-200">Texto breve material</code>, <code className="bg-amber-100 px-1 rounded border border-amber-200">Utilização livre</code>, <code className="bg-amber-100 px-1 rounded border border-amber-200">Lote</code>
                    </p>
                    <p className="text-xs text-amber-600 mt-2 ml-6 italic">Outras colunas serão ignoradas automaticamente.</p>
                    </div>
                    
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative overflow-hidden group">
                        <input 
                            type="file" 
                            accept=".xlsx, .xls"
                            ref={fileInputRef}
                            onChange={handleStockUpload}
                            disabled={!!loadingState}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                        />
                        <div className="pointer-events-none relative z-0">
                            {loadingState ? (
                                <div className="flex flex-col items-center animate-pulse">
                                    <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-2" />
                                    <p className="text-sm font-semibold text-brand-600">{getLoadingText()}</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center group-hover:scale-105 transition-transform">
                                    <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-2 group-hover:text-brand-500 transition-colors" />
                                    <p className="text-sm font-medium text-slate-700">Clique para selecionar Excel</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                        <tr>
                            <th className="p-4 whitespace-nowrap">Material</th>
                            <th className="p-4 whitespace-nowrap">Descrição</th>
                            <th className="p-4 whitespace-nowrap">Lote</th>
                            <th className="p-4 text-right whitespace-nowrap">Qtd</th>
                            <th className="p-4 whitespace-nowrap">Atualizado em</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                        {stock.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-400">Armazém vazio.</td></tr>
                        ) : (
                            stock.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 font-medium text-slate-800 whitespace-nowrap font-mono">{item.sku}</td>
                                <td className="p-4 min-w-[200px]">{item.description}</td>
                                <td className="p-4 font-mono text-xs text-amber-700 whitespace-nowrap">{item.batch}</td>
                                <td className="p-4 text-right font-bold text-slate-900 whitespace-nowrap">{item.quantity}</td>
                                <td className="p-4 text-xs text-slate-400 whitespace-nowrap">{item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('pt-BR') : '-'}</td>
                            </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
          </>
      ) : (
        <div className="space-y-4 animate-fade-in">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-200">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-purple-900">
                    <Database className="w-5 h-5 text-purple-600" /> Importar Catálogo Geral (Admin)
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                    Este arquivo define os materiais que "existem" no sistema.
                    Usado para autocompletar nomes ao criar pedidos manuais.
                    <strong> Novos itens serão adicionados, os existentes não serão alterados.</strong>
                </p>
                 <div className="bg-purple-50 p-4 rounded-md border border-purple-100 mb-4">
                     <p className="text-xs text-purple-700">
                        Colunas necessárias: <code className="bg-purple-100 px-1 rounded border border-purple-200">Material</code>, <code className="bg-purple-100 px-1 rounded border border-purple-200">Texto breve material</code>.
                    </p>
                    <p className="text-xs text-purple-600 mt-1 italic flex items-center gap-1">
                        <Info className="w-3 h-3"/> Outras colunas no Excel serão ignoradas.
                    </p>
                 </div>

                <div className="border-2 border-dashed border-purple-200 rounded-lg p-8 text-center bg-slate-50 hover:bg-purple-50 transition-colors cursor-pointer relative overflow-hidden group">
                     <input 
                            type="file" 
                            accept=".xlsx, .xls"
                            ref={fileInputRef}
                            onChange={handleMasterUpload}
                            disabled={!!loadingState}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                    />
                     <div className="pointer-events-none relative z-0">
                            {loadingState ? (
                                <div className="flex flex-col items-center animate-pulse">
                                    <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-2" />
                                    <p className="text-sm font-semibold text-purple-600">{getLoadingText()}</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center group-hover:scale-105 transition-transform">
                                    <FileSpreadsheet className="w-10 h-10 text-purple-300 mb-2 group-hover:text-purple-500 transition-colors" />
                                    <p className="text-sm font-medium text-slate-700">Selecionar Catálogo Excel</p>
                                </div>
                            )}
                        </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-purple-50 p-4 border-b border-purple-100 flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-purple-600" />
                        <h3 className="font-bold text-purple-800">Materiais Cadastrados ({masterList.length})</h3>
                    </div>
                </div>
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-700">
                        <tr>
                            <th className="p-3 whitespace-nowrap">Código Material</th>
                            <th className="p-3 whitespace-nowrap">Descrição</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                        {masterList.length === 0 ? (
                             <tr><td colSpan={2} className="p-8 text-center text-slate-400">Nenhum material no catálogo. Importe um arquivo.</td></tr>
                        ) : (
                            masterList.slice(0, 100).map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="p-3 font-medium text-slate-800 whitespace-nowrap font-mono">{item.sku}</td>
                                    <td className="p-3 min-w-[200px]">{item.description}</td>
                                </tr>
                            ))
                        )}
                        {masterList.length > 100 && (
                            <tr><td colSpan={2} className="p-3 text-center text-xs text-slate-400 bg-slate-50">... e mais {masterList.length - 100} itens (Use a busca para encontrar específicos)</td></tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

       {message && (
            <div className={`p-4 rounded-lg text-sm flex items-center gap-2 shadow-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {message.type === 'success' ? <Check className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4"/>}
                {message.text}
            </div>
        )}
    </div>
  );
};

export default StockManager;