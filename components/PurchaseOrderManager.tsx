import React, { useState, useEffect, useMemo } from 'react';
import { MasterMaterial, Supplier, UnitOption, PurchaseOrder } from '../types';
import { StorageService } from '../services/storageService';
import { ShoppingBag, Search, Plus, Trash2, Edit, Save, ArrowLeft, X, FileSpreadsheet, User, MapPin, CreditCard, ChevronDown, ChevronUp, AlertCircle, HelpCircle, Check, Euro, CheckCircle } from 'lucide-react';

// Explicitly declare global types to avoid TS errors without imports
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

const normalizeText = (text: string): string => {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

const calculateRelevance = (target: string, query: string): number => {
    const t = normalizeText(target);
    const q = normalizeText(query);
    if (t === q) return 100;
    const qWords = q.split(/\s+/).filter(w => w.length > 2);
    if (qWords.length === 0) return 0;
    let score = 0;
    let matches = 0;
    qWords.forEach(qw => {
        if (t.includes(qw)) {
            matches++;
            score += 10;
        }
    });
    return matches > 0 ? score : 0;
};

const PurchaseOrderManager: React.FC<PurchaseOrderManagerProps> = ({ masterList, currentUsername }) => {
  // State
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE'>('LIST');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [savedOrders, setSavedOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [orderId, setOrderId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<number | undefined>(undefined);
  const [orderDate, setOrderDate] = useState<string>('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [pep, setPep] = useState('');
  
  const [rows, setRows] = useState<PORow[]>([]);
  const [expandedRow, setExpandedRow] = useState<number>(0);

  // Similarity Modal State
  const [similarityModalOpen, setSimilarityModalOpen] = useState(false);
  const [similarityTargetIdx, setSimilarityTargetIdx] = useState<number | null>(null);
  const [similarityResults, setSimilarityResults] = useState<MasterMaterial[]>([]);
  const [similarityStep, setSimilarityStep] = useState<'LIST' | 'CONFIRM_MATCH' | 'CONFIRM_NEW'>('LIST');
  const [selectedCandidate, setSelectedCandidate] = useState<MasterMaterial | null>(null);

  // Initial Load
  useEffect(() => {
      const init = async () => {
          setLoading(true);
          try {
              const [settings, orders] = await Promise.all([
                  StorageService.getSettings(),
                  StorageService.getPurchaseOrders()
              ]);
              setSuppliers(settings.suppliers || []);
              setUnitOptions(settings.unitOptions || [{ value: 'UN', description: 'Unidade' }]);
              setSavedOrders(orders.sort((a,b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()));
              
              // Initialize empty row if needed
              if (rows.length === 0) {
                  setRows([{ sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false, similarityChecked: false }]);
              }
          } catch (e) {
              console.error(e);
          } finally {
              setLoading(false);
          }
      };
      init();
  }, [viewMode]);

  // Computeds
  const filteredSuppliers = useMemo(() => {
      if (!supplierSearch) return [];
      const lower = supplierSearch.toLowerCase();
      return suppliers.filter(s => s.name.toLowerCase().includes(lower) || s.code.toLowerCase().includes(lower));
  }, [suppliers, supplierSearch]);

  const subTotal = rows.reduce((acc, row) => acc + (row.quantity * row.unitPrice), 0);
  const vatTotal = subTotal * VAT_RATE;
  const grandTotal = subTotal + vatTotal;

  // Handlers
  const handleSupplierSelect = (s: Supplier) => {
      setSelectedSupplier(s);
      setSupplierSearch('');
  };

  const updateRow = (index: number, field: keyof PORow, value: any) => {
      const newRows = [...rows];
      newRows[index] = { ...newRows[index], [field]: value };
      
      if (field === 'description') {
          newRows[index].showSuggestions = true;
          newRows[index].similarityChecked = false;
          if (!newRows[index].isCustom) newRows[index].sku = '';
      }
      
      if (field === 'isCustom') {
          newRows[index].sku = value ? 'MATERIAIS' : '';
          newRows[index].similarityChecked = false;
      }
      setRows(newRows);
  };

  const addRow = () => {
      setRows([...rows, { sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false, similarityChecked: false }]);
      setExpandedRow(rows.length);
  };

  const removeRow = (index: number) => {
      if (rows.length <= 1) return;
      const newRows = [...rows];
      newRows.splice(index, 1);
      setRows(newRows);
  };

  const getMaterialMatches = (query: string) => {
      if (!query || query.length < 3) return [];
      const q = normalizeText(query);
      return masterList.filter(m => normalizeText(m.description).includes(q) || normalizeText(m.sku).includes(q)).slice(0, 5);
  };

  const handleMaterialSelect = (index: number, material: MasterMaterial) => {
      const newRows = [...rows];
      newRows[index] = {
          ...newRows[index],
          sku: material.sku,
          description: material.description,
          isCustom: false,
          showSuggestions: false,
          similarityChecked: true
      };
      setRows(newRows);
  };

  // Similarity Handlers
  const handleCheckSimilarity = (idx: number) => {
      const row = rows[idx];
      const query = row.description;
      if (!query || query.length < 3) {
          alert("Descrição muito curta.");
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

  // Action Handlers
  const generateExcel = () => {
      if (!selectedSupplier) return alert("Selecione um fornecedor.");
      
      const data = rows.map(r => ({
          "ID": displayId ? `#${displayId}` : "RASCUNHO",
          "Data": orderDate || new Date().toLocaleDateString(),
          "Responsavel": currentUsername,
          "PEP": pep,
          "Fornecedor": selectedSupplier.name,
          "Ref": r.sku,
          "Desc": r.description,
          "Qtd": r.quantity,
          "Unid": r.unit,
          "Preco": r.unitPrice,
          "Total": r.quantity * r.unitPrice
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pedido");
      const fname = `PO_${selectedSupplier.name.substring(0,10).trim()}_${Date.now()}.xlsx`;
      XLSX.writeFile(wb, fname);
  };

  const handleSave = async () => {
      if (!selectedSupplier) return alert("Selecione fornecedor.");
      if (rows.some(r => !r.description || !r.similarityChecked)) return alert("Verifique todos os itens.");
      if (rows.some(r => r.unitPrice <= 0)) return alert("Preços devem ser maior que 0.");

      if (!window.confirm("Salvar pedido?")) return;

      const newPO: PurchaseOrder = {
          id: orderId || Math.random().toString(36).substr(2, 9),
          displayId: displayId,
          dateCreated: orderId ? orderDate : new Date().toISOString(),
          supplier: selectedSupplier,
          pep,
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
          alert("Sucesso!");
          setViewMode('LIST');
          setOrderId(null);
      } catch (e: any) {
          alert("Erro: " + e.message);
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
          similarityChecked: true
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

  return (
    <div className="pb-48 md:pb-24">
      {/* Modal */}
      {similarityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
                  <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-white">Verificar Material</h3>
                  
                  {similarityStep === 'LIST' && (
                      <div className="space-y-2">
                          <p className="text-sm text-slate-500 mb-2">Sugestões encontradas:</p>
                          {similarityResults.map((res, idx) => (
                              <button key={idx} onClick={() => { setSelectedCandidate(res); setSimilarityStep('CONFIRM_MATCH'); }} className="w-full text-left p-3 border rounded hover:bg-slate-50 dark:hover:bg-slate-700 dark:border-slate-600">
                                  <div className="font-bold text-sm text-brand-600">{res.sku}</div>
                                  <div className="text-sm text-slate-700 dark:text-slate-300">{res.description}</div>
                              </button>
                          ))}
                          {similarityResults.length === 0 && <div className="text-center p-4 text-slate-400">Sem sugestões.</div>}
                          <button onClick={() => setSimilarityStep('CONFIRM_NEW')} className="w-full mt-4 p-3 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold">Material Novo / Não Listado</button>
                          <button onClick={() => setSimilarityModalOpen(false)} className="w-full mt-2 p-2 text-slate-500">Cancelar</button>
                      </div>
                  )}

                  {similarityStep === 'CONFIRM_MATCH' && selectedCandidate && (
                      <div className="text-center space-y-4">
                          <p>Confirmar este material?</p>
                          <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded">
                              <div className="font-bold">{selectedCandidate.sku}</div>
                              <div>{selectedCandidate.description}</div>
                          </div>
                          <div className="flex gap-2">
                              <button onClick={() => setSimilarityStep('LIST')} className="flex-1 p-2 border rounded">Voltar</button>
                              <button onClick={handleConfirmMatch} className="flex-1 p-2 bg-green-600 text-white rounded">Confirmar</button>
                          </div>
                      </div>
                  )}

                  {similarityStep === 'CONFIRM_NEW' && (
                      <div className="text-center space-y-4">
                          <p>Confirmar criação de novo material?</p>
                          <div className="flex gap-2">
                              <button onClick={() => setSimilarityStep('LIST')} className="flex-1 p-2 border rounded">Voltar</button>
                              <button onClick={handleConfirmNew} className="flex-1 p-2 bg-amber-600 text-white rounded">Criar Novo</button>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Main Content */}
      {viewMode === 'LIST' ? (
          <div className="space-y-6">
              <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Pedidos de Compra</h2>
                  <button onClick={handleNew} className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4"/> Novo</button>
              </div>
              
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                      <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-semibold">
                          <tr>
                              <th className="p-4">ID</th>
                              <th className="p-4">Data</th>
                              <th className="p-4">Fornecedor</th>
                              <th className="p-4 text-right">Total</th>
                              <th className="p-4 text-right">Ação</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {savedOrders.map(po => (
                              <tr key={po.id}>
                                  <td className="p-4 font-mono">#{po.displayId}</td>
                                  <td className="p-4">{new Date(po.dateCreated).toLocaleDateString()}</td>
                                  <td className="p-4 font-bold">{po.supplier.name}</td>
                                  <td className="p-4 text-right">{po.grandTotal.toFixed(2)} €</td>
                                  <td className="p-4 text-right">
                                      <button onClick={() => handleEdit(po)} className="text-purple-600 hover:text-purple-800"><Edit className="w-4 h-4"/></button>
                                  </td>
                              </tr>
                          ))}
                          {savedOrders.length === 0 && <tr><td colSpan={5} className="p-8 text-center">Sem pedidos.</td></tr>}
                      </tbody>
                  </table>
              </div>
          </div>
      ) : (
          <div className="space-y-6">
              <div className="flex items-center gap-4">
                  <button onClick={() => setViewMode('LIST')} className="p-2 hover:bg-slate-100 rounded-full"><ArrowLeft/></button>
                  <h2 className="text-xl font-bold">{orderId ? `Editar #${displayId}` : 'Novo Pedido'}</h2>
              </div>

              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Supplier */}
                  <div className="relative">
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Fornecedor</label>
                      {!selectedSupplier ? (
                          <>
                            <input 
                                type="text" 
                                value={supplierSearch} 
                                onChange={e => setSupplierSearch(e.target.value)} 
                                placeholder="Buscar fornecedor..."
                                className="w-full p-2 border rounded dark:bg-slate-900 dark:text-white dark:border-slate-600"
                            />
                            {supplierSearch && (
                                <div className="absolute z-10 w-full bg-white dark:bg-slate-800 border mt-1 max-h-40 overflow-y-auto shadow-lg">
                                    {filteredSuppliers.map(s => (
                                        <div key={s.code} onClick={() => handleSupplierSelect(s)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                                            <div className="font-bold">{s.name}</div>
                                            <div className="text-xs text-slate-500">{s.code}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                          </>
                      ) : (
                          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded flex justify-between items-center">
                              <div>
                                  <div className="font-bold text-purple-900 dark:text-purple-300">{selectedSupplier.name}</div>
                                  <div className="text-xs text-purple-600 dark:text-purple-400">{selectedSupplier.address}</div>
                              </div>
                              <button onClick={() => setSelectedSupplier(null)}><X className="w-4 h-4"/></button>
                          </div>
                      )}
                  </div>

                  {/* PEP */}
                  <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-1">PEP / Projeto</label>
                      <input 
                        type="text" 
                        value={pep} 
                        onChange={e => setPep(e.target.value)}
                        className="w-full p-2 border rounded dark:bg-slate-900 dark:text-white dark:border-slate-600"
                      />
                  </div>
              </div>

              {/* Rows */}
              <div className="space-y-3">
                  {rows.map((row, idx) => {
                      const matches = getMaterialMatches(row.description);
                      return (
                          <div key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                              <div className="flex justify-between items-start mb-2">
                                  <span className="font-bold text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">Item {idx + 1}</span>
                                  <button onClick={() => removeRow(idx)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                  <div className="md:col-span-6 relative">
                                      <label className="block text-[10px] font-bold uppercase text-slate-400">Descrição</label>
                                      <input 
                                        type="text" 
                                        value={row.description} 
                                        onChange={e => updateRow(idx, 'description', e.target.value)}
                                        className={`w-full p-2 border rounded dark:bg-slate-900 dark:text-white ${!row.similarityChecked ? 'border-amber-400' : 'border-slate-300 dark:border-slate-600'}`}
                                      />
                                      {row.showSuggestions && matches.length > 0 && (
                                          <div className="absolute z-10 w-full bg-white dark:bg-slate-800 border shadow-lg mt-1 rounded">
                                              {matches.map(m => (
                                                  <div key={m.sku} onClick={() => handleMaterialSelect(idx, m)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                                                      <div className="font-bold text-xs">{m.sku}</div>
                                                      <div className="text-sm">{m.description}</div>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                      <div className="flex justify-between items-center mt-1">
                                          <div className="text-xs text-slate-400 font-mono">{row.sku || '-'}</div>
                                          {!row.similarityChecked ? (
                                              <button onClick={() => handleCheckSimilarity(idx)} className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-bold flex items-center gap-1">
                                                  <Search className="w-3 h-3"/> Verificar
                                              </button>
                                          ) : (
                                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold flex items-center gap-1"><Check className="w-3 h-3"/> OK</span>
                                          )}
                                      </div>
                                  </div>
                                  
                                  <div className="md:col-span-2">
                                      <label className="block text-[10px] font-bold uppercase text-slate-400">Qtd</label>
                                      <input type="number" value={row.quantity} onChange={e => updateRow(idx, 'quantity', e.target.value)} className="w-full p-2 border rounded dark:bg-slate-900 dark:text-white dark:border-slate-600" />
                                  </div>

                                  <div className="md:col-span-2">
                                      <label className="block text-[10px] font-bold uppercase text-slate-400">Unid</label>
                                      <select value={row.unit} onChange={e => updateRow(idx, 'unit', e.target.value)} className="w-full p-2 border rounded dark:bg-slate-900 dark:text-white dark:border-slate-600">
                                          {unitOptions.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}
                                      </select>
                                  </div>

                                  <div className="md:col-span-2">
                                      <label className="block text-[10px] font-bold uppercase text-slate-400">Preço</label>
                                      <input type="number" value={row.unitPrice} onChange={e => updateRow(idx, 'unitPrice', e.target.value)} className="w-full p-2 border rounded dark:bg-slate-900 dark:text-white dark:border-slate-600" />
                                  </div>
                              </div>
                          </div>
                      );
                  })}
                  <button onClick={addRow} className="w-full p-3 border-2 border-dashed rounded-lg text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">Adicionar Linha</button>
              </div>

              {/* Footer */}
              <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-4 shadow-lg lg:pl-64 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex gap-6">
                      <div>
                          <div className="text-xs uppercase text-slate-500">Subtotal</div>
                          <div className="font-bold">{subTotal.toFixed(2)} €</div>
                      </div>
                      <div>
                          <div className="text-xs uppercase text-slate-500">IVA (23%)</div>
                          <div className="font-bold">{vatTotal.toFixed(2)} €</div>
                      </div>
                      <div className="pl-6 border-l">
                          <div className="text-xs uppercase text-brand-600 font-bold">Total</div>
                          <div className="text-xl font-bold">{grandTotal.toFixed(2)} €</div>
                      </div>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                      <button onClick={generateExcel} className="flex-1 px-4 py-2 border border-green-600 text-green-600 rounded hover:bg-green-50 flex items-center justify-center gap-2"><FileSpreadsheet className="w-4 h-4"/> Excel</button>
                      <button onClick={handleSave} className="flex-1 px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center justify-center gap-2"><Save className="w-4 h-4"/> Salvar</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default PurchaseOrderManager;