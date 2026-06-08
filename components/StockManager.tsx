import React, { useState, useRef } from 'react';
import { toast } from './Toast';
import { StockItem, UserRole, MasterMaterial, Order } from '../types';
import { StorageService } from '../services/storageService';
import { Upload, Package, Loader2, AlertTriangle, FileSpreadsheet, Database, Check, Info, FilePlus, RefreshCw, X, AlertCircle, Search, Clock } from 'lucide-react';
import { getAuth } from 'firebase/auth';

declare const XLSX: any;

const normalizeText = (text: string): string => {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

const calculateRelevance = (target: string, query: string): number => {
    const t = normalizeText(target);
    const q = normalizeText(query);
    if (t === q) return 100;

    const tokenize = (str: string) => str.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    const qWords = tokenize(q);
    const tWords = tokenize(t);
    
    if (qWords.length === 0) return 0;
    let score = 0;
    qWords.forEach(qw => {
        if (tWords.includes(qw)) score += 20;
        else if (t.includes(qw)) score += 10;
    });

    const maxPoss = qWords.length * 20;
    if (maxPoss === 0) return 0;
    const extraWords = Math.max(0, tWords.length - qWords.length);
    const coveragePenalty = Math.max(0.7, 1 - (extraWords * 0.05));
    return (score / maxPoss) * 100 * coveragePenalty;
};

interface StockManagerProps {
  stock: StockItem[];
  masterList: MasterMaterial[];
  orders: Order[];
  userRole: UserRole;
  refreshData: () => void;
}

const StockManager: React.FC<StockManagerProps> = ({ stock, masterList, orders, userRole, refreshData }) => {
  const [activeTab, setActiveTab] = useState<'STOCK' | 'MASTER' | 'PENDING'>('STOCK');
  const [loadingState, setLoadingState] = useState<'' | 'READING' | 'UPLOADING' | 'PROCESSING'>('');
  
  
  // Reject Match State for PENDING
  const [rejectMatchModalOpen, setRejectMatchModalOpen] = useState(false);
  const [rejectMatchData, setRejectMatchData] = useState<{order: Order, itemIdx: number} | null>(null);

  // Similarity Search State for PENDING
  const [similarityModalOpen, setSimilarityModalOpen] = useState(false);
  const [similarityResults, setSimilarityResults] = useState<any[]>([]);
  const [similarityTarget, setSimilarityTarget] = useState<{order: Order, itemIdx: number} | null>(null);
  
  // Merge/Replace Modal State
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [pendingMasterData, setPendingMasterData] = useState<MasterMaterial[]>([]);

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
        
        toast.success(successMsg);

      } catch (err: any) {
        console.error("Upload Error:", err);
        toast.error(err.message || "Falha ao processar arquivo. Verifique o formato.");
      } finally {
        setLoadingState('');
      }
    };

    reader.onerror = () => {
        toast.error("Erro de leitura do arquivo.");
        setLoadingState('');
    };

    reader.readAsArrayBuffer(file);
  };

  const handleMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) fileInputRef.current.value = '';

    setLoadingState('READING');
    

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

        const parsedData: MasterMaterial[] = [];
        jsonData.forEach((row) => {
             const sku = row['Material']?.toString().trim();
             const description = row['Texto breve material']?.toString().trim();
             if (sku && description) {
                 parsedData.push({ sku, description, quantity: 0 });
             }
        });
        
        if(parsedData.length === 0) throw new Error("Nenhum material válido encontrado.");

        // Instead of saving immediately, we store state and open the choice modal
        setPendingMasterData(parsedData);
        setShowMergeModal(true);
        setLoadingState(''); // Stop loading spinner while waiting for user

      } catch (err: any) {
          console.error("Master Upload Error:", err);
          toast.error(err.message);
          setLoadingState('');
      }
    };

    reader.onerror = () => {
        toast.error("Erro de leitura do arquivo.");
        setLoadingState('');
    };

    reader.readAsArrayBuffer(file);
  };

  const unverifiedItems = React.useMemo(() => {
    if (!orders) return [];
    const items: { order: Order, itemIdx: number, item: any }[] = [];
    orders.forEach(order => {
        if (order.items) {
           order.items.forEach((item, idx) => {
               if (item.unverifiedMatch) {
                   items.push({ order, itemIdx: idx, item });
               }
           });
        }
    });
    return items;
  }, [orders]);

  const handleConfirmAutoMatch = async (order: Order, itemIdx: number) => {
      try {
          const auth = getAuth();
          const currentUserUsername = auth.currentUser?.displayName || auth.currentUser?.email || 'Utilizador';

          const updatedOrder = JSON.parse(JSON.stringify(order));
          updatedOrder.items[itemIdx].unverifiedMatch = false;
          
          if (!updatedOrder.changeLog) updatedOrder.changeLog = [];
          updatedOrder.changeLog.push({
              date: new Date().toISOString(),
              actor: currentUserUsername,
              details: `Correspondência automática validada via Stock: ${updatedOrder.items[itemIdx].sku}`
          });
          
          await StorageService.updateOrder(updatedOrder);
          toast.success('Correspondência confirmada com sucesso.');
          if (refreshData) refreshData();
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  const handleRevertToOriginal = async (targetData?: {order: Order, itemIdx: number}) => {
      const target = targetData || rejectMatchData;
      if (!target) return;
      try {
          const auth = getAuth();
          const currentUserUsername = auth.currentUser?.displayName || auth.currentUser?.email || 'Utilizador';

          const { order, itemIdx } = target;
          const updatedOrder = JSON.parse(JSON.stringify(order));
          const item = updatedOrder.items[itemIdx];
          
          item.unverifiedMatch = false;
          item.isCustom = true;
          item.autoMatchRejected = true;
          item.sku = ''; 
          item.description = item.originalDescription || item.description;
          
          if (!updatedOrder.changeLog) updatedOrder.changeLog = [];
          updatedOrder.changeLog.push({
              date: new Date().toISOString(),
              actor: currentUserUsername,
              details: `Correspondência automática rejeitada via Stock. Revertido para original: ${item.description}`
          });
          
          await StorageService.updateOrder(updatedOrder);
          setRejectMatchModalOpen(false);
          setRejectMatchData(null);
          toast.success('Material revertido para NOVO com sucesso.');
          if (refreshData) refreshData();
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  const handleManualMatch = async (candidate: MasterMaterial) => {
      if (!similarityTarget) return;
      try {
          const auth = getAuth();
          const currentUserUsername = auth.currentUser?.displayName || auth.currentUser?.email || 'Utilizador';

          const { order, itemIdx } = similarityTarget;
          const updatedOrder = JSON.parse(JSON.stringify(order));
          const item = updatedOrder.items[itemIdx];
          
          item.unverifiedMatch = false;
          item.isCustom = false;
          item.sku = candidate.sku;
          item.description = candidate.description;
          
          if (!updatedOrder.changeLog) updatedOrder.changeLog = [];
          updatedOrder.changeLog.push({
              date: new Date().toISOString(),
              actor: currentUserUsername,
              details: `Correspondência corrigida manualmente via Stock para: ${candidate.sku} - ${candidate.description}`
          });
          
          await StorageService.updateOrder(updatedOrder);
          setSimilarityModalOpen(false);
          setSimilarityTarget(null);
          toast.success('Material atualizado com o código selecionado.');
          if (refreshData) refreshData();
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  const executeMasterUpdate = async (mode: 'MERGE' | 'REPLACE') => {
      setLoadingState('UPLOADING');
      try {
          let finalData: MasterMaterial[] = [];

          if (mode === 'REPLACE') {
              // Simple replacement
              finalData = pendingMasterData;
          } else {
              // Merge: Add only new SKUs that don't exist in masterList
              const existingSkus = new Set(masterList.map(m => m.sku));
              const newItems = pendingMasterData.filter(item => !existingSkus.has(item.sku));
              
              if (newItems.length === 0) {
                  throw new Error("Nenhum material novo encontrado para acrescentar.");
              }
              
              finalData = [...masterList, ...newItems];
          }

          // Sort alphabetically by SKU
          finalData.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));

          await StorageService.mergeMasterMaterials(finalData);
          refreshData();
          
          const msg = mode === 'REPLACE' 
            ? `Lista substituída com sucesso. Total: ${finalData.length} itens.` 
            : `Lista atualizada. ${finalData.length - masterList.length} novos itens adicionados.`;

          toast.success(msg);

      } catch(err: any) {
          toast.error(err.message);
      } finally {
          setLoadingState('');
          setShowMergeModal(false);
          setPendingMasterData([]);
      }
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
    <div className="space-y-6 relative">
      {/* CHOICE MODAL */}
      {showMergeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-transparent rounded-none shadow-none w-full max-w-md p-6 border border-slate-200 dark:border-slate-700 animate-fade-in relative">
                  <button 
                    onClick={() => setShowMergeModal(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                      <X className="w-5 h-5"/>
                  </button>

                  <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4">Atualizar Catálogo</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                      Foram identificados <strong>{pendingMasterData.length}</strong> materiais no arquivo carregado. Como deseja processar esta atualização?
                  </p>

                  <div className="space-y-3">
                      <button
                          onClick={() => executeMasterUpdate('MERGE')}
                          className="w-full flex items-center p-4 rounded-none border border-green-200 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:hover:bg-green-900/30 transition-all group"
                      >
                          <div className="bg-green-200 dark:bg-green-800 p-2 rounded-full mr-4 group-hover:scale-110 transition-transform">
                              <FilePlus className="w-6 h-6 text-green-700 dark:text-green-300" />
                          </div>
                          <div className="text-left">
                              <span className="block font-bold text-green-800 dark:text-green-300">Acrescentar</span>
                              <span className="text-xs text-green-700 dark:text-green-400">Mantém os atuais e adiciona apenas os novos códigos encontrados.</span>
                          </div>
                      </button>

                      <button
                          onClick={() => executeMasterUpdate('REPLACE')}
                          className="w-full flex items-center p-4 rounded-none border border-amber-200 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:hover:bg-amber-900/30 transition-all group"
                      >
                          <div className="bg-amber-200 dark:bg-amber-800 p-2 rounded-full mr-4 group-hover:scale-110 transition-transform">
                              <RefreshCw className="w-6 h-6 text-amber-700 dark:text-amber-300" />
                          </div>
                          <div className="text-left">
                              <span className="block font-bold text-amber-800 dark:text-amber-300">Substituir</span>
                              <span className="text-xs text-amber-700 dark:text-amber-400">Apaga a lista atual e substitui totalmente pelo novo arquivo.</span>
                          </div>
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Package className="text-amber-500" /> Gestão de Stock
        </h2>
        {isAdmin && (
            <div className="flex bg-slate-200 dark:bg-slate-700 rounded-none p-1">
                <button 
                    onClick={() => { setActiveTab('STOCK');  }}
                    className={`px-4 py-1 text-sm font-medium rounded-none transition-all ${activeTab === 'STOCK' ? 'bg-transparent shadow-none text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                    Stock Atual
                </button>
                <button 
                    onClick={() => { setActiveTab('PENDING');  }}
                    className={`px-4 py-1 text-sm font-medium rounded-none transition-all flex items-center gap-2 ${activeTab === 'PENDING' ? 'bg-transparent shadow-none text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}
                >
                    Pendentes
                </button>
                <button 
                    onClick={() => { setActiveTab('MASTER');  }}
                    className={`px-4 py-1 text-sm font-medium rounded-none transition-all ${activeTab === 'MASTER' ? 'bg-transparent shadow-none text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                    Todos os Materiais
                </button>
            </div>
        )}
      </div>

      {activeTab === 'STOCK' ? (
          <>
            <div className={`pt-2 mb-8`}>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-slate-800 dark:text-white">
                <Upload className="w-5 h-5 text-slate-500 dark:text-slate-400" /> Atualizar Stock Físico
                </h3>
                
                {!canEditStock ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-none text-slate-500 dark:text-slate-400 text-sm">
                    Apenas Logística ou Admins podem atualizar o stock.
                </div>
                ) : (
                <div className="space-y-4 animate-fade-in">
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-none border border-amber-100 dark:border-amber-800">
                    <div className="flex items-start gap-2 text-amber-800 dark:text-amber-400 text-sm mb-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p><strong>Atenção:</strong> O upload substitui o stock e <u>reabre pedidos automaticamente</u> se houver material disponível para itens pendentes.</p>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-500 ml-6">
                        Colunas necessárias: <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded-none border border-amber-200 dark:border-amber-800">Material</code>, <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded-none border border-amber-200 dark:border-amber-800">Texto breve material</code>, <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded-none border border-amber-200 dark:border-amber-800">Utilização livre</code>, <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded-none border border-amber-200 dark:border-amber-800">Lote</code>
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-500/80 mt-2 ml-6 italic">Outras colunas serão ignoradas automaticamente.</p>
                    </div>
                    
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 focus:border-brand-500 focus:ring-0 rounded-none p-8 text-center bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative overflow-hidden group">
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

            <div className="bg-transparent rounded-none shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
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
      ) : activeTab === 'PENDING' ? (
        <div className="space-y-4 animate-fade-in">
             <div className="bg-transparent rounded-none shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-amber-50 dark:bg-amber-900/20 p-4 border-b border-amber-100 dark:border-amber-900/50 flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        <h3 className="font-bold text-amber-800 dark:text-amber-300">Validação de Novos Materiais ({unverifiedItems.length})</h3>
                    </div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-600 dark:text-slate-400 border-b dark:border-slate-700">
                    Aqui estão listados os itens cujo código foi sugerido automaticamente com base na descrição fornecida noutros pedidos e não tiveram correspondência exata. Por favor verifique se o material atribuído está correto.
                </div>
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200">
                        <tr>
                            <th className="p-3 whitespace-nowrap">Pedido Original</th>
                            <th className="p-3 whitespace-nowrap">Descrição Inserida</th>
                            <th className="p-3 whitespace-nowrap">Correspondência Automática</th>
                            <th className="p-3 whitespace-nowrap">Ação</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {unverifiedItems.length === 0 ? (
                             <tr><td colSpan={4} className="p-8 text-center text-slate-400">Nenhum material pendente de validação.</td></tr>
                        ) : (
                            unverifiedItems.map((val, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="p-3">
                                        <div className="font-bold text-slate-800 dark:text-white">{val.order.title}</div>
                                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-1"><Clock className="w-3 h-3"/> {new Date(val.order.dateCreated).toLocaleDateString('pt-BR')}</div>
                                    </td>
                                    <td className="p-3 font-medium text-slate-800 dark:text-white max-w-xs">{val.item.originalDescription}</td>
                                    <td className="p-3">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-2 rounded-none border border-blue-100 dark:border-blue-900/50 inline-block w-full max-w-sm">
                                            <div className="font-mono text-xs font-bold">{val.item.sku}</div>
                                            <div className="truncate" title={val.item.description}>{val.item.description}</div>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                           <button onClick={() => handleConfirmAutoMatch(val.order, val.itemIdx)} className="bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-400 font-bold px-3 py-1 text-xs rounded-none transition-colors">Confirmar</button>
                                           <button onClick={() => { setRejectMatchData({order: val.order, itemIdx: val.itemIdx}); setRejectMatchModalOpen(true); }} className="bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 font-bold px-3 py-1 text-xs rounded-none transition-colors">Rejeitar/Mudar</button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
             <div className="bg-transparent p-6 rounded-none shadow-none border border-purple-200 dark:border-purple-900/50">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-purple-900 dark:text-purple-300">
                    <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" /> Importar Catálogo Geral (Admin)
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Este arquivo define os materiais que "existem" no sistema.
                    Usado para autocompletar nomes ao criar pedidos manuais.
                </p>
                 <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-none border border-purple-100 dark:border-purple-800 mb-4">
                     <p className="text-xs text-purple-700 dark:text-purple-300">
                        Colunas necessárias: <code className="bg-purple-100 dark:bg-purple-900/40 px-1 rounded-none border border-purple-200 dark:border-purple-800">Material</code>, <code className="bg-purple-100 dark:bg-purple-900/40 px-1 rounded-none border border-purple-200 dark:border-purple-800">Texto breve material</code>.
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 italic flex items-center gap-1">
                        <Info className="w-3 h-3"/> Outras colunas no Excel serão ignoradas.
                    </p>
                 </div>

                <div className="border-2 border-dashed border-purple-200 dark:border-purple-800 rounded-none p-8 text-center bg-slate-50 dark:bg-slate-900 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors cursor-pointer relative overflow-hidden group">
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

            <div className="bg-transparent rounded-none shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
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

       

      {/* Reject Modal */}
      {rejectMatchModalOpen && rejectMatchData && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
              <div className="bg-transparent rounded-none shadow-none w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-6">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Rejeitar Correspondência</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                          A correspondência automática para "<span className="font-bold">{rejectMatchData.order.items[rejectMatchData.itemIdx].originalDescription}</span>" não está correta. O que deseja fazer?
                      </p>
                      
                      <div className="space-y-3">
                          <button 
                              onClick={() => {
                                  const item = rejectMatchData.order.items[rejectMatchData.itemIdx];
                                  const query = item.originalDescription || item.description;
                                  
                                  const candidates = masterList
                                      .map(m => ({ ...m, score: calculateRelevance(m.description, query) }))
                                      .filter(m => m.score > 0)
                                      .sort((a, b) => b.score - a.score)
                                      .slice(0, 10); 
                                      
                                  setSimilarityResults(candidates);
                                  setSimilarityTarget(rejectMatchData);
                                  setRejectMatchModalOpen(false);
                                  setRejectMatchData(null);
                                  setSimilarityModalOpen(true);
                              }}
                              className="w-full text-left p-4 border border-slate-200 dark:border-slate-700 rounded-none hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 flex items-start gap-3"
                          >
                              <Search className="w-5 h-5 text-brand-600 dark:text-brand-400 mt-0.5" />
                              <div>
                                  <div className="font-bold text-slate-900 dark:text-white">Procurar Alternativas</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">Ver lista de opções similares.</div>
                              </div>
                          </button>
                          
                          <button 
                              onClick={() => {
                                  handleRevertToOriginal();
                                  setSimilarityModalOpen(false);
                              }}
                              className="w-full text-left p-4 border border-slate-200 dark:border-slate-700 rounded-none hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-start gap-3"
                          >
                              <RefreshCw className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                              <div>
                                  <div className="font-bold text-slate-900 dark:text-white">Reverter para Original</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">Irá manter como "Novo" com a mesma descrição.</div>
                              </div>
                          </button>
                      </div>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
                      <button 
                          onClick={() => {
                              setRejectMatchModalOpen(false);
                              setRejectMatchData(null);
                          }}
                          className="px-4 py-2 font-bold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                          Cancelar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Similarity Modal */}
      {similarityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-transparent rounded-none shadow-none w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-fade-in border border-slate-200 dark:border-slate-700">
                  <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                      <h3 className="font-bold text-lg dark:text-white">Opções Sugeridas</h3>
                      <button onClick={() => { setSimilarityModalOpen(false); setSimilarityTarget(null); }}><X className="w-6 h-6 text-slate-400" /></button>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 dark:text-slate-300">
                      {similarityResults.map((res: any, idx) => (
                          <button key={idx} onClick={() => handleManualMatch(res)} className="w-full text-left p-3 border dark:border-slate-700 rounded-none hover:bg-brand-50 dark:hover:bg-brand-900/20 mb-2 flex justify-between items-center group">
                              <div>
                                  <div className="font-bold text-brand-600 dark:text-brand-400 group-hover:underline">{res.sku}</div>
                                  <div className="text-sm text-slate-700 dark:text-slate-300">{res.description}</div>
                              </div>
                              {res.score !== undefined && (
                                  <div className="flex-shrink-0 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded-none border border-slate-200 dark:border-slate-700">
                                      Score: {res.score > 100 ? 100 : Math.round(res.score)}%
                                  </div>
                              )}
                          </button>
                      ))}
                      <button onClick={() => {
                          const target = similarityTarget || undefined;
                          setSimilarityTarget(null);
                          setSimilarityModalOpen(false);
                          handleRevertToOriginal(target);
                      }} className="w-full py-3 bg-transparent border text-slate-600 dark:text-slate-300 rounded-none mt-4">Nenhum destes, confirmar como NOVO</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default StockManager;