import React, { useState, useRef } from 'react';
import { StockItem, UserRole, MasterMaterial } from '../types';
import { StorageService } from '../services/storageService';
import { Upload, Package, Loader2, AlertTriangle, FileSpreadsheet, Database, Check, Info } from 'lucide-react';

declare const XLSX: any;

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

        let newStock: StockItem[] = [];
        
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

        // Sort ascending by SKU
        newStock.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));

        setLoadingState('UPLOADING');
        
        // 1. Replace Stock
        await StorageService.replaceStock(newStock);
        
        // 2. Process Backorders (Now via Service)
        const createdCount = await StorageService.processBackorders(newStock);

        refreshData();
        
        let successMsg = `Stock atualizado com sucesso (${newStock.length} itens).`;
        if (createdCount > 0) {
            successMsg += ` ${createdCount} novos pedidos de reabertura foram gerados.`;
        }
        
        setMessage({ type: 'success', text: successMsg });

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
                 newMaster.push({ sku, description, quantity: 0 });
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
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Package className="text-amber-500" /> Gestão de Stock
        </h2>
        {isAdmin && (
            <div className="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-1">
                <button 
                    onClick={() => { setActiveTab('STOCK'); setMessage(null); }}
                    className={`px-4 py-1 text-sm font-medium rounded-md transition-all ${activeTab === 'STOCK' ? 'bg-white dark:bg-slate-800 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                    Stock Atual
                </button>
                <button 
                    onClick={() => { setActiveTab('MASTER'); setMessage(null); }}
                    className={`px-4 py-1 text-sm font-medium rounded-md transition-all ${activeTab === 'MASTER' ? 'bg-white dark:bg-slate-800 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                    Todos os Materiais
                </button>
            </div>
        )}
      </div>

      {activeTab === 'STOCK' ? (
          <>
            <div className={`bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border ${canEditStock ? 'border-amber-200 dark:border-amber-900/50' : 'border-slate-200 dark:border-slate-700'}`}>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-slate-800 dark:text-white">
                <Upload className="w-5 h-5 text-slate-500 dark:text-slate-400" /> Atualizar Stock Físico
                </h3>
                
                {!canEditStock ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-500 dark:text-slate-400 text-sm">
                    Apenas Logística ou Admins podem atualizar o stock.
                </div>
                ) : (
                <div className="space-y-4 animate-fade-in">
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-md border border-amber-100 dark:border-amber-800">
                    <div className="flex items-start gap-2 text-amber-800 dark:text-amber-400 text-sm mb-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p><strong>Atenção:</strong> O upload substitui o stock e <u>reabre pedidos automaticamente</u> se houver material disponível para itens pendentes.</p>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-500 ml-6">
                        Colunas necessárias: <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded border border-amber-200 dark:border-amber-800">Material</code>, <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded border border-amber-200 dark:border-amber-800">Texto breve material</code>, <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded border border-amber-200 dark:border-amber-800">Utilização livre</code>, <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded border border-amber-200 dark:border-amber-800">Lote</code>
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-500/80 mt-2 ml-6 italic">Outras colunas serão ignoradas automaticamente.</p>
                    </div>
                    
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative overflow-hidden group">
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
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Clique para selecionar Excel</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200">
                        <tr>
                            <th className="p-4 whitespace-nowrap">Material</th>
                            <th className="p-4 whitespace-nowrap">Descrição</th>
                            <th className="p-4 whitespace-nowrap">Lote</th>
                            <th className="p-4 text-right whitespace-nowrap">Qtd</th>
                            <th className="p-4 whitespace-nowrap">Atualizado em</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {stock.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-400">Armazém vazio.</td></tr>
                        ) : (
                            stock.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="p-4 font-medium text-slate-800 dark:text-white whitespace-nowrap font-mono">{item.sku}</td>
                                <td className="p-4 min-w-[200px]">{item.description}</td>
                                <td className="p-4 font-mono text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">{item.batch}</td>
                                <td className="p-4 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">{item.quantity}</td>
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
             <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-purple-200 dark:border-purple-900/50">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-purple-900 dark:text-purple-300">
                    <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" /> Importar Catálogo Geral (Admin)
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Este arquivo define os materiais que "existem" no sistema.
                    Usado para autocompletar nomes ao criar pedidos manuais.
                    <strong> Novos itens serão adicionados, os existentes não serão alterados.</strong>
                </p>
                 <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-md border border-purple-100 dark:border-purple-800 mb-4">
                     <p className="text-xs text-purple-700 dark:text-purple-300">
                        Colunas necessárias: <code className="bg-purple-100 dark:bg-purple-900/40 px-1 rounded border border-purple-200 dark:border-purple-800">Material</code>, <code className="bg-purple-100 dark:bg-purple-900/40 px-1 rounded border border-purple-200 dark:border-purple-800">Texto breve material</code>.
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 italic flex items-center gap-1">
                        <Info className="w-3 h-3"/> Outras colunas no Excel serão ignoradas.
                    </p>
                 </div>

                <div className="border-2 border-dashed border-purple-200 dark:border-purple-800 rounded-lg p-8 text-center bg-slate-50 dark:bg-slate-900 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors cursor-pointer relative overflow-hidden group">
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
                                    <FileSpreadsheet className="w-10 h-10 text-purple-300 dark:text-purple-500 mb-2 group-hover:text-purple-500 dark:group-hover:text-purple-300 transition-colors" />
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Selecionar Catálogo Excel</p>
                                </div>
                            )}
                        </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 border-b border-purple-100 dark:border-purple-900/50 flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <h3 className="font-bold text-purple-800 dark:text-purple-300">Materiais Cadastrados ({masterList.length})</h3>
                    </div>
                </div>
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200">
                        <tr>
                            <th className="p-3 whitespace-nowrap">Código Material</th>
                            <th className="p-3 whitespace-nowrap">Descrição</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {masterList.length === 0 ? (
                             <tr><td colSpan={2} className="p-8 text-center text-slate-400">Nenhum material no catálogo. Importe um arquivo.</td></tr>
                        ) : (
                            masterList.slice(0, 100).map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="p-3 font-medium text-slate-800 dark:text-white whitespace-nowrap font-mono">{item.sku}</td>
                                    <td className="p-3 min-w-[200px]">{item.description}</td>
                                </tr>
                            ))
                        )}
                        {masterList.length > 100 && (
                            <tr><td colSpan={2} className="p-3 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-900">... e mais {masterList.length - 100} itens (Use a busca para encontrar específicos)</td></tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

       {message && (
            <div className={`p-4 rounded-lg text-sm flex items-center gap-2 shadow-sm ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
                {message.type === 'success' ? <Check className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4"/>}
                {message.text}
            </div>
        )}
    </div>
  );
};

export default StockManager;