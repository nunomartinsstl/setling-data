import React, { useState, useEffect, useMemo } from 'react';
import { MasterMaterial, Supplier, UnitOption, PurchaseOrder, UserRole } from '../types';
import { StorageService } from '../services/storageService';
import { ShoppingBag, Search, Plus, Trash2, Edit, Save, ArrowLeft, X, FileSpreadsheet, User, MapPin, CreditCard, ChevronDown, ChevronUp, AlertCircle, HelpCircle, Check, Euro, CheckCircle } from 'lucide-react';

// Access global libraries
declare const window: any;
declare const XLSX: any;

interface PurchaseOrderManagerProps {
  masterList: MasterMaterial[];
  currentUsername: string;
}

interface PORow {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  isCustom: boolean; 
  showSuggestions: boolean;
  similarityChecked: boolean;
}

const VAT_RATE = 0.23;

// Helper to normalize string (remove accents/diacritics)
const normalizeText = (text: string): string => {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

// Helper for similarity scoring
const calculateRelevance = (target: string, query: string): number => {
    const t = normalizeText(target);
    const q = normalizeText(query);
    
    // Exact match
    if (t === q) return 100;
    
    const qWords = q.split(/\s+/).filter(w => w.length > 2);
    const tWords = t.split(/\s+/).filter(w => w.length > 2);
    
    if (qWords.length === 0) return 0;

    let score = 0;
    let matches = 0;

    qWords.forEach(qw => {
        if (t.includes(qw)) {
            matches++;
            score += 10; // Base score for inclusion
            if (tWords.includes(qw)) score += 5; // Bonus for exact word match
        }
    });

    return matches > 0 ? score : 0;
};

const PurchaseOrderManager: React.FC<PurchaseOrderManagerProps> = ({ masterList, currentUsername }) => {
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE'>('LIST');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [savedOrders, setSavedOrders] = useState<PurchaseOrder[]>([]);
  
  // Header State
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [pep, setPep] = useState('');
  const [displayId, setDisplayId] = useState<number | undefined>(undefined);
  const [orderDate, setOrderDate] = useState<string>('');
  
  // Grid State
  const [rows, setRows] = useState<PORow[]>([{ sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false, similarityChecked: false }]);
  const [expandedRow, setExpandedRow] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Similarity Search State
  const [similarityModalOpen, setSimilarityModalOpen] = useState(false);
  const [similarityTargetIdx, setSimilarityTargetIdx] = useState<number | null>(null);
  const [similarityResults, setSimilarityResults] = useState<MasterMaterial[]>([]);
  const [similarityStep, setSimilarityStep] = useState<'LIST' | 'CONFIRM_MATCH' | 'CONFIRM_NEW'>('LIST');
  const [selectedCandidate, setSelectedCandidate] = useState<MasterMaterial | null>(null);

  // Load Data
  useEffect(() => {
      const load = async () => {
          setLoading(true);
          const [settings, orders] = await Promise.all([
              StorageService.getSettings(),
              StorageService.getPurchaseOrders()
          ]);
          
          if (settings.suppliers) setSuppliers(settings.suppliers);
          if (settings.unitOptions) setUnitOptions(settings.unitOptions);
          else setUnitOptions([{ value: 'UN', description: 'Unidade' }]);
          
          setSavedOrders(orders.sort((a,b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()));
          setLoading(false);
      };
      load();
  }, [viewMode]); 

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
      if (!supplierSearch) return [];
      const lowerSearch = supplierSearch.toLowerCase();
      return suppliers.filter(s => 
          s.name.toLowerCase().includes(lowerSearch) || 
          s.code.toLowerCase().includes(lowerSearch)
      );
  }, [suppliers, supplierSearch]);

  // Master List Autocomplete Helper
  const getMaterialMatches = (query: string) => {
      if (!query || query.length < 3) return [];
      const q = normalizeText(query);
      return masterList
        .filter(m => normalizeText(m.description).includes(q) || normalizeText(m.sku).includes(q))
        .slice(0, 5);
  };

  const handleSupplierSelect = (s: Supplier) => {
      setSelectedSupplier(s);
      setSupplierSearch('');
  };

  const updateRow = (index: number, field: keyof PORow, value: any) => {
      const newRows = [...rows];
      newRows[index] = { ...newRows[index], [field]: value };
      
      // If typing description
      if (field === 'description') {
          newRows[index].showSuggestions = true;
          // Reset verification when description changes
          newRows[index].similarityChecked = false;
          
          // Only clear SKU if not custom. Custom items keep 'MATERIAIS' but need re-check.
          if (!newRows[index].isCustom) {
               newRows[index].sku = ''; 
          }
      }

      // If toggling custom checkbox
      if (field === 'isCustom') {
          if (value === true) {
              newRows[index].sku = 'MATERIAIS';
              newRows[index].similarityChecked = false; // Require check
          } else {
              newRows[index].sku = '';
              newRows[index].similarityChecked = false; 
          }
      }
      
      setRows(newRows);
  };

  const handleMaterialSelect = (index: number, material: MasterMaterial) => {
      const newRows = [...rows];
      newRows[index] = {
          ...newRows[index],
          sku: material.sku,
          description: material.description,
          isCustom: false,
          showSuggestions: false,
          similarityChecked: true // Auto-checked via suggestion
      };
      setRows(newRows);
  };

  const addRow = () => {
      setRows([...rows, { sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false, similarityChecked: false }]);
      setExpandedRow(rows.length);
  };

  const removeRow = (index: number) => {
      if (rows.length === 1) return;
      const newRows = [...rows];
      newRows.splice(index, 1);
      setRows(newRows);
  };

  // --- SIMILARITY LOGIC ---
  const handleCheckSimilarity = (idx: number) => {
    const row = rows[idx];
    const query = row.description; 
    
    if (!query || query.trim().length < 3) {
        alert("Digite ao menos 3 caracteres na descrição para verificar.");
        return;
    }

    const candidates = masterList
        .map(m => ({ ...m, score: calculateRelevance(m.description, query) }))
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    setSimilarityResults(candidates);
    setSimilarityTargetIdx(idx);
    setSimilarityStep('LIST');
    setSimilarityModalOpen(true);
  };

  const handleSelectCandidate = (candidate: MasterMaterial) => {
      setSelectedCandidate(candidate);
      setSimilarityStep('CONFIRM_MATCH');
  };

  const handleConfirmMatch = () => {
      if (similarityTargetIdx === null || !selectedCandidate) return;
      
      const newRows = [...rows];
      newRows[similarityTargetIdx] = {
          ...newRows[similarityTargetIdx],
          sku: selectedCandidate.sku,
          description: selectedCandidate.description,
          isCustom: false,
          similarityChecked: true,
          showSuggestions: false
      };
      setRows(newRows);
      setSimilarityModalOpen(false);
  };

  const handleNotFound = () => {
      setSimilarityStep('CONFIRM_NEW');
  };

  const handleConfirmNew = () => {
      if (similarityTargetIdx === null) return;
      
      const newRows = [...rows];
      newRows[similarityTargetIdx] = {
          ...newRows[similarityTargetIdx],
          sku: 'MATERIAIS',
          isCustom: true,
          similarityChecked: true,
          showSuggestions: false
      };
      setRows(newRows);
      setSimilarityModalOpen(false);
  };
  // ------------------------

  const subTotal = rows.reduce((acc, row) => acc + (row.quantity * row.unitPrice), 0);
  const vatTotal = subTotal * VAT_RATE;
  const grandTotal = subTotal + vatTotal;

  const generateExcel = () => {
      if (!selectedSupplier) {
          alert("Selecione um fornecedor para exportar.");
          return;
      }
      const data = rows.map(r => ({
          "ID Pedido": displayId ? `#${displayId}` : "RASCUNHO",
          "Data": orderDate ? new Date(orderDate).toLocaleDateString() : new Date().toLocaleDateString(),
          "Responsável": currentUsername,
          "PEP": pep || '',
          "Fornecedor": selectedSupplier.name,
          "Referência": r.sku,
          "Descrição": r.description,
          "Quantidade": r.quantity,
          "Unidade": r.unit,
          "Preço Unit.": r.unitPrice,
          "Total": r.quantity * r.unitPrice
      }));

      // Use global XLSX
      const XLSX = (window as any).XLSX;
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dados");
      
      const fileName = `PO_Dados_${selectedSupplier.name.substring(0,10).trim()}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
  };

  const handleSave = async () => {
      if (!selectedSupplier) {
          alert("Fornecedor obrigatório.");
          return;
      }
      if (rows.length === 0 || rows.some(r => !r.description)) {
          alert("Adicione itens válidos.");
          return;
      }
      
      // New Validation: All items must be verified (similarityChecked)
      const unverified = rows.some(r => !r.similarityChecked);
      if (unverified) {
          alert("Existem itens não verificados. Por favor, clique em 'Confirmar Material' para todos os itens.");
          return;
      }

      if (rows.some(r => !r.unitPrice || r.unitPrice <= 0)) {
          alert("Erro: Todos os itens devem ter um Preço Unitário maior que 0.");
          return;
      }

      if(!window.confirm("Confirmar gravação do pedido?")) return;

      const newPO: PurchaseOrder = {
          id: orderId || Math.random().toString(36).substr(2, 9),
          displayId: displayId,
          dateCreated: orderId ? orderDate : new Date().toISOString(),
          supplier: selectedSupplier,
          pep: pep,
          items: rows.map(r => ({
              sku: r.sku,
              description: r.description,
              quantity: Number(r.quantity),
              unit: r.unit,
              unitPrice: Number(r.unitPrice),
              total: r.quantity * r.unitPrice,
              isCustom: r.isCustom
          })),
          subTotal,
          vatTotal,
          grandTotal,
          creator: currentUsername,
          status: 'SENT'
      };

      try {
          await StorageService.savePurchaseOrder(newPO);
          alert("Pedido salvo com sucesso!");
          setViewMode('LIST');
          setOrderId(null);
      } catch (e: any) {
          alert("Erro ao salvar: " + e.message);
      }
  };

  const handleEdit = (po: PurchaseOrder) => {
      setOrderId(po.id);
      setDisplayId(po.displayId);
      setOrderDate(po.dateCreated);
      setSelectedSupplier(po.supplier);
      setPep(po.pep);
      setRows(po.items.map(i => ({
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unitPrice,
          isCustom: !!i.isCustom,
          showSuggestions: false,
          similarityChecked: true // Saved items are implicitly checked
      })));
      setViewMode('CREATE');
  };

  const handleNew = () => {
      setOrderId(null);
      setDisplayId(undefined);
      setOrderDate('');
      setSelectedSupplier(null);
      setPep('');
      setRows([{ sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false, similarityChecked: false }]);
      setViewMode('CREATE');
  };

  // --------------------------------------------------------------------------------
  // JSX RENDER
  // --------------------------------------------------------------------------------

  // Render modal
  const renderSimilarityModal = () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-fade-in border border-slate-200 dark:border-slate-700">
                {similarityStep === 'LIST' && (
                    <>
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Search className="w-5 h-5 text-purple-600" /> Verificar Material
                            </h3>
                            <button onClick={() => setSimilarityModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 dark:text-slate-300">
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                Materiais semelhantes encontrados no catálogo. Selecione se for o que procura:
                            </p>
                            <div className="space-y-2">
                                {similarityResults.length > 0 ? (
                                    similarityResults.map((res, idx) => (
                                        <button 
                                            key={idx}
                                            onClick={() => handleSelectCandidate(res)}
                                            className="w-full text-left p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-200 dark:hover:border-purple-800 transition-colors group"
                                        >
                                            <div className="flex justify-between items-start">
                                                <span className="font-bold text-purple-700 dark:text-purple-400 text-sm block group-hover:underline">{res.sku}</span>
                                                <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] px-2 py-0.5 rounded-full font-bold">Encontrado</span>
                                            </div>
                                            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{res.description}</p>
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                                        Nenhuma similaridade encontrada.
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                            <button 
                                onClick={handleNotFound}
                                className="w-full py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <AlertCircle className="w-4 h-4" /> Material não consta na lista
                            </button>
                        </div>
                    </>
                )}

                {similarityStep === 'CONFIRM_MATCH' && selectedCandidate && (
                    <>
                         <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-green-50 dark:bg-green-900/20">
                            <h3 className="font-bold text-green-800 dark:text-green-300 flex items-center gap-2">
                                <CheckCircle className="w-5 h-5" /> Confirmar Seleção
                            </h3>
                        </div>
                        <div className="p-6 flex-1 text-center">
                            <p className="text-slate-600 dark:text-slate-300 mb-4">Confirma que o material pretendido é:</p>
                            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mb-6 text-left">
                                <p className="text-xs text-slate-400 font-bold uppercase">Material</p>
                                <p className="font-mono font-bold text-lg text-slate-800 dark:text-white">{selectedCandidate.sku}</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{selectedCandidate.description}</p>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setSimilarityStep('LIST')}
                                    className="flex-1 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                >
                                    Voltar
                                </button>
                                <button 
                                    onClick={handleConfirmMatch}
                                    className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                                >
                                    Sim, é este
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {similarityStep === 'CONFIRM_NEW' && (
                    <>
                         <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20">
                            <h3 className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                                <HelpCircle className="w-5 h-5" /> Criar Novo Material?
                            </h3>
                        </div>
                        <div className="p-6 flex-1 text-center">
                            <p className="text-slate-600 dark:text-slate-300 mb-6">
                                Indicou que o material não está na lista. Deseja confirmar que é um <strong>Novo Material</strong>?
                            </p>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setSimilarityStep('LIST')}
                                    className="flex-1 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                >
                                    Voltar
                                </button>
                                <button 
                                    onClick={handleConfirmNew}
                                    className="flex-1 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
                                >
                                    Confirmar Novo
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
      </div>
  );

  if (viewMode === 'LIST') {
      return (
          <div className="space-y-6 animate-fade-in pb-20">
              <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-2">
                      <ShoppingBag className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Pedidos de Compra (Autónomos)</h2>
                  </div>
                  <button 
                    onClick={handleNew}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2 font-medium"
                  >
                      <Plus className="w-5 h-5"/> Novo Pedido
                  </button>
              </div>

              {loading ? (
                  <div className="text-center p-8 text-slate-500">Carregando...</div>
              ) : (
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                          <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200">
                              <tr>
                                  <th className="p-4">ID</th>
                                  <th className="p-4">Data</th>
                                  <th className="p-4">Fornecedor</th>
                                  <th className="p-4">PEP</th>
                                  <th className="p-4 text-right">Total</th>
                                  <th className="p-4 text-right">Ações</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                              {savedOrders.length === 0 ? (
                                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">Nenhum pedido registado.</td></tr>
                              ) : (
                                  savedOrders.map(po => (
                                      <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                          <td className="p-4 font-mono font-bold text-purple-600 dark:text-purple-400">#{po.displayId}</td>
                                          <td className="p-4 text-xs">{new Date(po.dateCreated).toLocaleDateString()}</td>
                                          <td className="p-4 font-medium">{po.supplier.name}</td>
                                          <td className="p-4 text-xs font-mono">{po.pep || '-'}</td>
                                          <td className="p-4 text-right font-bold text-slate-800 dark:text-white">{po.grandTotal.toFixed(2)} €</td>
                                          <td className="p-4 text-right">
                                              <button 
                                                onClick={() => handleEdit(po)}
                                                className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 p-2"
                                                title="Ver/Editar"
                                              >
                                                  <Edit className="w-4 h-4"/>
                                              </button>
                                          </td>
                                      </tr>
                                  ))
                              )}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      );
  }

  // CREATE / EDIT MODE
  return (
    <div className="space-y-6 animate-fade-in pb-20">
      
      {similarityModalOpen && renderSimilarityModal()}

      <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setViewMode('LIST')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500">
              <ArrowLeft className="w-6 h-6"/>
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                {orderId ? `Editar Pedido #${displayId}` : 'Novo Pedido de Compra'}
            </h2>
            <p className="text-xs text-slate-500">Pedidos a Fornecedores (Autónomos)</p>
          </div>
      </div>

      {/* HEADER SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          {/* Supplier Select */}
          <div className="relative z-20">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fornecedor</label>
              {!selectedSupplier ? (
                  <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        placeholder="Pesquisar fornecedor..."
                        className="w-full pl-9 p-2.5 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-900 dark:text-white"
                      />
                      {supplierSearch && (
                          <div className="absolute top-full left-0 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md mt-1 shadow-lg max-h-48 overflow-y-auto">
                              {filteredSuppliers.map(s => (
                                  <div 
                                    key={s.code} 
                                    onClick={() => handleSupplierSelect(s)}
                                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0"
                                  >
                                      <p className="font-bold text-slate-800 dark:text-white text-sm">{s.name}</p>
                                      <p className="text-xs text-slate-500">{s.code} - {s.address}</p>
                                  </div>
                              ))}
                              {filteredSuppliers.length === 0 && (
                                  <div className="p-3 text-xs text-slate-500 text-center">Nenhum fornecedor encontrado.</div>
                              )}
                          </div>
                      )}
                  </div>
              ) : (
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md relative group">
                      <div className="flex items-start gap-3">
                          <User className="w-5 h-5 text-purple-600 mt-1" />
                          <div>
                              <p className="font-bold text-purple-900 dark:text-purple-300">{selectedSupplier.name}</p>
                              <div className="flex items-center gap-1 text-xs text-purple-700 dark:text-purple-400 mt-1">
                                  <MapPin className="w-3 h-3" /> {selectedSupplier.address}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                                  <CreditCard className="w-3 h-3" /> {selectedSupplier.paymentTerms}
                              </div>
                          </div>
                      </div>
                      <button 
                        onClick={() => setSelectedSupplier(null)}
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-500"
                        title="Alterar Fornecedor"
                      >
                          <X className="w-4 h-4" />
                      </button>
                  </div>
              )}
          </div>

          {/* PEP Input */}
          <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">PEP / Projeto</label>
              <input 
                type="text" 
                value={pep}
                onChange={(e) => setPep(e.target.value)}
                placeholder="Ex: P-2024-001"
                className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-900 dark:text-white"
              />
          </div>
      </div>

      {/* ITEMS GRID */}
      <div className="space-y-3">
          {rows.map((row, idx) => {
             const isExpanded = expandedRow === idx;
             const matches = getMaterialMatches(row.description);
             
             return (
                 <div key={idx} className={`bg-white dark:bg-slate-800 rounded-lg border transition-all ${isExpanded ? 'border-purple-400 ring-1 ring-purple-100 dark:ring-purple-900' : 'border-slate-200 dark:border-slate-700'}`}>
                     <div 
                        className="p-3 flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? -1 : idx)}
                     >
                         <div className="flex items-center gap-3 overflow-hidden">
                             <div className="bg-slate-100 dark:bg-slate-700 text-xs font-bold px-2 py-1 rounded text-slate-600 dark:text-slate-300">
                                 #{idx + 1}
                             </div>
                             <div className="truncate">
                                 <span className="font-medium text-slate-800 dark:text-white">
                                     {row.description || 'Novo Item'}
                                 </span>
                                 <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                                     ({row.quantity} {row.unit}) - {row.unitPrice.toFixed(2)} €
                                 </span>
                             </div>
                         </div>
                         <div className="flex items-center gap-2">
                             <div className="font-bold text-slate-900 dark:text-white text-sm mr-2">
                                 {(row.quantity * row.unitPrice).toFixed(2)} €
                             </div>
                             <button onClick={(e) => { e.stopPropagation(); removeRow(idx); }} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded">
                                 <Trash2 className="w-4 h-4" />
                             </button>
                             {isExpanded ? <ChevronUp className="w-4 h-4 text-purple-500"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                         </div>
                     </div>

                     {isExpanded && (
                         <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 grid grid-cols-1 md:grid-cols-12 gap-4">
                             {/* Description / Search */}
                             <div className="md:col-span-6 relative">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase">Descrição / Material</label>
                                 <div className="relative">
                                     <input 
                                        type="text" 
                                        value={row.description}
                                        onChange={(e) => updateRow(idx, 'description', e.target.value)}
                                        placeholder="Buscar material ou digitar..."
                                        className={`w-full p-2 border rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-800 dark:text-white text-sm ${!row.similarityChecked ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-slate-300 dark:border-slate-600'}`}
                                        autoComplete="off"
                                     />
                                     {/* Similarity Check Logic */}
                                     {row.showSuggestions && matches.length > 0 && (
                                         <div className="absolute z-10 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg mt-1">
                                             {matches.map(m => (
                                                 <div 
                                                    key={m.sku} 
                                                    onClick={() => handleMaterialSelect(idx, m)}
                                                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer text-sm"
                                                 >
                                                     <span className="font-bold text-purple-700 dark:text-purple-400 block">{m.sku}</span>
                                                     <span className="text-slate-600 dark:text-slate-300">{m.description}</span>
                                                 </div>
                                             ))}
                                         </div>
                                     )}
                                 </div>
                                 <div className="mt-2 flex items-center justify-between">
                                     <span className="text-[10px] text-slate-400 font-mono">
                                        Código de Material: {row.isCustom ? <span className="text-purple-500 font-bold">MATERIAIS</span> : (row.sku || '-')}
                                     </span>
                                     
                                     {/* Checkbox for New Material (Re-added as requested) */}
                                     <label className="flex items-center gap-2 cursor-pointer ml-4">
                                         <input 
                                            type="checkbox" 
                                            checked={row.isCustom}
                                            onChange={(e) => updateRow(idx, 'isCustom', e.target.checked)}
                                            className="w-3.5 h-3.5 text-purple-600 border-slate-300 rounded focus:ring-purple-500"
                                         />
                                         <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Novo Material</span>
                                     </label>
                                 </div>

                                 {/* Confirmation Button only if Custom AND Not Checked */}
                                 {row.isCustom && !row.similarityChecked && (
                                    <div className="mt-2">
                                         <button 
                                            onClick={() => handleCheckSimilarity(idx)}
                                            className="w-full py-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded text-xs font-bold hover:bg-amber-200 transition-colors flex items-center justify-center gap-1"
                                        >
                                            <Search className="w-3 h-3" /> Confirmar Material
                                        </button>
                                    </div>
                                 )}

                                 {/* Status Badge if Checked */}
                                 {row.similarityChecked && (
                                    <div className="mt-2 text-right">
                                        <div className={`inline-flex px-2 py-1 rounded text-[10px] font-bold items-center gap-1 ${row.isCustom ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                                            <Check className="w-3 h-3" /> 
                                            {row.isCustom ? 'Novo (Verificado)' : 'Existente'}
                                        </div>
                                    </div>
                                 )}
                             </div>

                             {/* Quantity */}
                             <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Qtd</label>
                                <input 
                                    type="number" 
                                    value={row.quantity}
                                    onChange={(e) => updateRow(idx, 'quantity', Number(e.target.value))}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-800 dark:text-white text-sm"
                                />
                             </div>

                             {/* Unit */}
                             <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Unid.</label>
                                <select 
                                    value={row.unit}
                                    onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-800 dark:text-white text-sm appearance-none"
                                >
                                    {unitOptions.map(u => (
                                        <option key={u.value} value={u.value}>{u.value}</option>
                                    ))}
                                </select>
                             </div>

                             {/* Unit Price */}
                             <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Preço Unit.</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        value={row.unitPrice === 0 ? '' : row.unitPrice}
                                        onChange={(e) => updateRow(idx, 'unitPrice', Number(e.target.value))}
                                        placeholder="0.00"
                                        className="w-full p-2 pr-8 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-800 dark:text-white text-sm"
                                    />
                                    <Euro className="absolute right-8 top-2.5 w-4 h-4 text-slate-400 pointer-events-none"/>
                                </div>
                             </div>
                         </div>
                     )}
                 </div>
             );
          })}
      </div>

      <button 
        onClick={addRow}
        className="w-full py-3 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-700/50 flex items-center justify-center gap-2 transition-colors"
      >
          <Plus className="w-5 h-5"/> Adicionar Linha
      </button>

      {/* FOOTER ACTIONS */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-4 shadow-lg z-30 lg:pl-64">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex gap-6 text-sm md:text-base">
                  <div className="flex flex-col">
                      <span className="text-xs text-slate-500 font-medium uppercase">Subtotal</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{subTotal.toFixed(2)} €</span>
                  </div>
                  <div className="flex flex-col">
                      <span className="text-xs text-slate-500 font-medium uppercase">IVA ({(VAT_RATE * 100).toFixed(0)}%)</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{vatTotal.toFixed(2)} €</span>
                  </div>
                  <div className="flex flex-col border-l pl-6 border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-brand-600 dark:text-brand-400 font-bold uppercase">Total Final</span>
                      <span className="text-xl font-bold text-slate-900 dark:text-white">{grandTotal.toFixed(2)} €</span>
                  </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                  <button 
                    onClick={generateExcel}
                    className="flex-1 md:flex-none px-4 py-2 border border-green-600 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 font-medium flex items-center justify-center gap-2"
                  >
                      <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                  <button 
                    onClick={handleSave}
                    className="flex-1 md:flex-none px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center justify-center gap-2 shadow-sm"
                  >
                      <Save className="w-4 h-4" /> Guardar Pedido
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};

export default PurchaseOrderManager;