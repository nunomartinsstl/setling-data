import React, { useState, useRef } from 'react';
import { StockItem, UserRole, MasterMaterial } from '../types';
import { StorageService } from '../services/storageService';
import { Upload, Package, Loader2, AlertTriangle, FileSpreadsheet, Database } from 'lucide-react';
import * as XLSX from 'xlsx';

interface StockManagerProps {
  stock: StockItem[];
  userRole: UserRole;
  refreshData: () => void;
}

const StockManager: React.FC<StockManagerProps> = ({ stock, userRole, refreshData }) => {
  const [activeTab, setActiveTab] = useState<'STOCK' | 'MASTER'>('STOCK');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Permissions
  const canEditStock = userRole === UserRole.WAREHOUSE || userRole === UserRole.ADMIN;
  const isAdmin = userRole === UserRole.ADMIN;

  const handleStockUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

        if (data.length === 0) throw new Error("O arquivo está vazio.");

        const firstRow = data[0];
        const requiredColumns = ['Material', 'Texto breve material', 'Utilização livre', 'Lote'];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));
        if (missingColumns.length > 0) throw new Error(`Colunas faltando: ${missingColumns.join(', ')}`);

        const newStock: StockItem[] = [];
        data.forEach((row) => {
            const sku = row['Material']?.toString().trim();
            const description = row['Texto breve material']?.toString().trim() || 'Sem descrição';
            const batch = row['Lote']?.toString().trim() || '-';
            let qty = row['Utilização livre'];
            if (typeof qty === 'string') qty = parseFloat(qty);
            
            if (sku) {
                const currentQty = isNaN(Number(qty)) ? 0 : Number(qty);
                newStock.push({ sku, description, quantity: currentQty, batch: batch, lastUpdated: new Date().toISOString() });
            }
        });

        if (newStock.length === 0) throw new Error("Nenhum item válido encontrado.");

        await StorageService.replaceStock(newStock);
        refreshData();
        setMessage({ type: 'success', text: `Estoque substituído com sucesso. ${newStock.length} linhas.` });

      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || "Falha ao processar arquivo." });
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("AVISO: Isso irá atualizar o Catálogo Geral de Materiais. Continuar?")) {
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

        if (data.length === 0) throw new Error("O arquivo está vazio.");
        
        // Validation for Master File (simpler columns)
        const firstRow = data[0];
        const requiredColumns = ['Material', 'Texto breve material'];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));
        if (missingColumns.length > 0) throw new Error(`Colunas faltando: ${missingColumns.join(', ')}`);

        const newMaster: MasterMaterial[] = [];
        data.forEach((row) => {
             const sku = row['Material']?.toString().trim();
             const description = row['Texto breve material']?.toString().trim();
             if (sku && description) {
                 newMaster.push({ sku, description });
             }
        });
        
        if(newMaster.length === 0) throw new Error("Nenhum material válido encontrado.");

        await StorageService.replaceMasterMaterials(newMaster);
        setMessage({ type: 'success', text: `Catálogo atualizado. ${newMaster.length} materiais cadastrados.` });

      } catch (err: any) {
          setMessage({ type: 'error', text: err.message });
      } finally {
          setIsProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package className="text-amber-500" /> Gestão de Estoque
        </h2>
        {isAdmin && (
            <div className="flex bg-slate-200 rounded-lg p-1">
                <button 
                    onClick={() => { setActiveTab('STOCK'); setMessage(null); }}
                    className={`px-4 py-1 text-sm font-medium rounded-md transition-all ${activeTab === 'STOCK' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                    Físico
                </button>
                <button 
                    onClick={() => { setActiveTab('MASTER'); setMessage(null); }}
                    className={`px-4 py-1 text-sm font-medium rounded-md transition-all ${activeTab === 'MASTER' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                    Catálogo Geral
                </button>
            </div>
        )}
      </div>

      {activeTab === 'STOCK' ? (
          <>
            <div className={`bg-white p-6 rounded-xl shadow-sm border ${canEditStock ? 'border-amber-200' : 'border-slate-200'}`}>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Upload className="w-5 h-5" /> Atualizar Estoque Físico
                </h3>
                
                {!canEditStock ? (
                <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm">
                    Apenas Logística ou Admins podem atualizar o estoque.
                </div>
                ) : (
                <div className="space-y-4 animate-fade-in">
                    <div className="bg-amber-50 p-4 rounded-md border border-amber-100">
                    <div className="flex items-start gap-2 text-amber-800 text-sm mb-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p><strong>Atenção:</strong> O upload irá <u>SUBSTITUIR</u> todo o estoque atual.</p>
                    </div>
                    <p className="text-xs text-amber-700 ml-6">
                        Colunas: <code className="bg-amber-100 px-1 rounded">Material</code>, <code className="bg-amber-100 px-1 rounded">Texto breve material</code>, <code className="bg-amber-100 px-1 rounded">Utilização livre</code>, <code className="bg-amber-100 px-1 rounded">Lote</code>
                    </p>
                    </div>
                    
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative">
                        <input 
                            type="file" 
                            accept=".xlsx, .xls"
                            ref={fileInputRef}
                            onChange={handleStockUpload}
                            disabled={isProcessing}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div className="pointer-events-none">
                            {isProcessing ? (
                                <div className="flex flex-col items-center">
                                    <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-2" />
                                    <p className="text-sm text-slate-600">Processando...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-2" />
                                    <p className="text-sm font-medium text-slate-700">Clique para selecionar Excel</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                    <tr>
                        <th className="p-4">SKU</th>
                        <th className="p-4">Descrição</th>
                        <th className="p-4">Lote</th>
                        <th className="p-4 text-right">Qtd</th>
                        <th className="p-4">Atualizado em</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {stock.length === 0 ? (
                        <tr><td colSpan={5} className="p-8 text-center text-slate-400">Armazém vazio.</td></tr>
                    ) : (
                        stock.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-medium text-slate-800">{item.sku}</td>
                            <td className="p-4">{item.description}</td>
                            <td className="p-4 font-mono text-xs text-amber-700">{item.batch}</td>
                            <td className="p-4 text-right font-bold text-slate-900">{item.quantity}</td>
                            <td className="p-4 text-xs text-slate-400">{item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('pt-BR') : '-'}</td>
                        </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>
          </>
      ) : (
        <div className="space-y-4 animate-fade-in">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-200">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-purple-900">
                    <Database className="w-5 h-5 text-purple-600" /> Importar Catálogo Geral (Admin)
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                    Este arquivo define os materiais que "existem" no sistema, mesmo que o estoque seja zero. 
                    Usado para autocompletar nomes ao criar pedidos manuais.
                </p>
                 <div className="bg-purple-50 p-4 rounded-md border border-purple-100 mb-4">
                     <p className="text-xs text-purple-700">
                        Colunas necessárias: <code className="bg-purple-100 px-1 rounded">Material</code>, <code className="bg-purple-100 px-1 rounded">Texto breve material</code>
                    </p>
                 </div>

                <div className="border-2 border-dashed border-purple-200 rounded-lg p-8 text-center bg-slate-50 hover:bg-purple-50 transition-colors cursor-pointer relative">
                     <input 
                            type="file" 
                            accept=".xlsx, .xls"
                            ref={fileInputRef}
                            onChange={handleMasterUpload}
                            disabled={isProcessing}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                     <div className="pointer-events-none">
                            {isProcessing ? (
                                <div className="flex flex-col items-center">
                                    <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-2" />
                                    <p className="text-sm text-slate-600">Importando Catálogo...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <FileSpreadsheet className="w-10 h-10 text-purple-300 mb-2" />
                                    <p className="text-sm font-medium text-slate-700">Selecionar Catálogo Excel</p>
                                </div>
                            )}
                        </div>
                </div>
            </div>
        </div>
      )}

       {message && (
            <div className={`p-4 rounded-lg text-sm flex items-center gap-2 shadow-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {message.type === 'success' ? <div className="w-2 h-2 rounded-full bg-green-500" /> : <AlertTriangle className="w-4 h-4"/>}
                {message.text}
            </div>
        )}
    </div>
  );
};

export default StockManager;