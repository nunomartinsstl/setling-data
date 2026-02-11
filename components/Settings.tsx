
import React, { useState, useEffect, useRef } from 'react';
import { StorageService } from '../services/storageService';
import { EmailRecipient, Company, UnitOption, Supplier, CategoryOption } from '../types';
import { Save, Mail, Loader2, AlertCircle, Plus, Trash2, Building, ShieldCheck, Scale, Truck, FileSpreadsheet, Tag, RefreshCw, Wrench } from 'lucide-react';

declare const XLSX: any;

const Settings: React.FC = () => {
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompany, setNewCompany] = useState('');
  const [adminAccessCode, setAdminAccessCode] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Unit Options
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [newUnitAbbr, setNewUnitAbbr] = useState('');
  const [newUnitDesc, setNewUnitDesc] = useState('');

  // Categories
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatName, setNewCatName] = useState('');

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  
  const supplierFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await StorageService.getSettings();
    // Migration helper: if old email exists but new list is empty
    if ((!settings.emailRecipients || settings.emailRecipients.length === 0) && settings.notificationEmail) {
        setRecipients([{ email: settings.notificationEmail, type: 'TO' }]);
    } else {
        setRecipients(settings.emailRecipients || []);
    }
    setCompanies(settings.companies || []);
    setAdminAccessCode(settings.adminAccessCode || '');
    if (settings.unitOptions) {
        setUnitOptions(settings.unitOptions);
    }
    setSuppliers(settings.suppliers || []);
    
    // Load categories or fallback to default if not present yet
    if (settings.categories && settings.categories.length > 0) {
        setCategories(settings.categories);
    } else {
        import('../services/storageService').then(mod => {
             if(settings.categories) setCategories(settings.categories);
             else setCategories(mod.DEFAULT_CATEGORIES);
        });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await StorageService.saveSettings({ 
          emailRecipients: recipients,
          notificationEmail: recipients.length > 0 ? recipients[0].email : '', // Legacy fallback
          companies: companies,
          adminAccessCode: adminAccessCode, 
          unitOptions: unitOptions,
          suppliers: suppliers,
          categories: categories,
          autoDecrementStock: true // PERMANENT: Force Auto Decrement Stock
      });
      setMessage('Configurações salvas com sucesso.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Erro ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncUsernames = async () => {
      setSyncing(true);
      try {
          const count = await StorageService.syncUsernames();
          alert(`Sincronização concluída! ${count} logins reparados.`);
      } catch(e: any) {
          alert("Erro: " + e.message);
      } finally {
          setSyncing(false);
      }
  };

  const addRecipient = () => {
      setRecipients([...recipients, { email: '', type: 'TO' }]);
  };

  const removeRecipient = (index: number) => {
      const updated = [...recipients];
      updated.splice(index, 1);
      setRecipients(updated);
  };

  const updateRecipient = (index: number, field: keyof EmailRecipient, value: string) => {
      const updated = [...recipients];
      updated[index] = { ...updated[index], [field]: value };
      setRecipients(updated);
  };

  const addCompany = () => {
      if (!newCompany.trim()) return;
      const id = Date.now().toString(); // Simple ID generation
      setCompanies([...companies, { id, name: newCompany.trim() }]);
      setNewCompany('');
  };

  const removeCompany = (id: string) => {
      setCompanies(companies.filter(c => c.id !== id));
  };

  const addUnit = () => {
      if (!newUnitAbbr.trim() || !newUnitDesc.trim()) {
          alert("Preencha a abreviatura e a descrição.");
          return;
      }
      const abbr = newUnitAbbr.trim().toUpperCase();
      if (unitOptions.some(u => u.value === abbr)) {
          alert("Esta unidade já existe.");
          return;
      }
      setUnitOptions([...unitOptions, { value: abbr, description: newUnitDesc.trim() }]);
      setNewUnitAbbr('');
      setNewUnitDesc('');
  };

  const removeUnit = (unitToRemove: string) => {
      setUnitOptions(unitOptions.filter(u => u.value !== unitToRemove));
  };

  const addCategory = () => {
      if (!newCatCode.trim() || !newCatName.trim()) {
          alert("Preencha o código (3 letras) e o nome.");
          return;
      }
      const code = newCatCode.trim().toUpperCase();
      if (categories.some(c => c.code === code)) {
          alert("Este código de categoria já existe.");
          return;
      }
      setCategories([...categories, { code: code, name: newCatName.trim().toUpperCase() }]);
      setNewCatCode('');
      setNewCatName('');
  };

  const removeCategory = (codeToRemove: string) => {
      if(window.confirm("Remover esta categoria? Isso não afeta pedidos antigos, mas remove a opção para novos.")) {
          setCategories(categories.filter(c => c.code !== codeToRemove));
      }
  };

  const handleSupplierUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (supplierFileRef.current) supplierFileRef.current.value = '';

      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              const data = evt.target?.result;
              const wb = XLSX.read(data, { type: 'array' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const jsonData: any[] = XLSX.utils.sheet_to_json(ws);

              if (jsonData.length === 0) throw new Error("Ficheiro vazio.");
              
              const required = ['Fornecedor', 'Nome', 'Dias pagamento', 'Morada'];
              const missing = required.filter(col => !(col in jsonData[0]));
              
              if (missing.length > 0) throw new Error(`Colunas em falta: ${missing.join(', ')}`);

              const newSuppliers: Supplier[] = jsonData.map(row => ({
                  code: row['Fornecedor']?.toString() || '',
                  name: row['Nome']?.toString() || '',
                  paymentTerms: row['Dias pagamento']?.toString() || '',
                  address: row['Morada']?.toString() || ''
              })).filter(s => s.code && s.name);

              if (newSuppliers.length === 0) throw new Error("Nenhum fornecedor válido encontrado.");

              setSuppliers(newSuppliers);
              alert(`${newSuppliers.length} fornecedores importados. Clique em "Salvar" para confirmar.`);
          } catch(err: any) {
              alert("Erro na importação: " + err.message);
          }
      };
      reader.readAsArrayBuffer(file);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-12">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
        Configurações do Sistema
      </h2>

      {/* REPAIR TOOLS CARD - Prominent at Top */}
      <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-xl shadow-sm border border-amber-200 dark:border-amber-800">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-amber-800 dark:text-amber-400">
            <Wrench className="w-5 h-5"/> Manutenção de Acessos
        </h3>
        <p className="text-sm text-amber-700 dark:text-amber-500 mb-4">
            Se os utilizadores não conseguirem entrar usando o <strong>Nome de Utilizador</strong> (Erro: Permission Denied), clique abaixo para regenerar o índice de busca pública.
        </p>
        <button 
            onClick={handleSyncUsernames}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 p-3 rounded-lg transition-colors shadow-sm"
        >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
            Reparar/Sincronizar Logins por Nome
        </button>
      </div>

      {/* ADMIN CODE */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-purple-800 dark:text-purple-400">
            <ShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-500"/> Segurança Admin
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Defina o código necessário para criar novas contas de Administrador.
        </p>
        
        <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Código de Acesso Mestre</label>
            <input 
                type="text" 
                value={adminAccessCode}
                onChange={(e) => setAdminAccessCode(e.target.value)}
                placeholder="Ex: SenhaForte123 (Deixe em branco para usar o padrão)"
                className="w-full p-2 border border-purple-200 dark:border-purple-800 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-200 focus:ring-2 focus:ring-purple-500 outline-none font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">
                Se deixar em branco, o sistema usará o código de recuperação padrão.
            </p>
        </div>
      </div>

      {/* CATEGORY SETTINGS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Tag className="w-5 h-5 text-slate-500"/> Categorias de Material
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Defina as categorias disponíveis para a criação de novos materiais.
        </p>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
            <input 
                type="text"
                value={newCatCode}
                onChange={(e) => setNewCatCode(e.target.value)}
                placeholder="Cód (Ex: TUB)"
                maxLength={3}
                className="w-full md:w-32 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm uppercase dark:bg-slate-900 dark:text-white"
            />
            <input 
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nome da Categoria (Ex: TUBAGEM)"
                maxLength={30}
                className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
            />
            <button 
                type="button"
                onClick={addCategory}
                className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium"
            >
                Adicionar
            </button>
        </div>

        <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900 font-semibold sticky top-0">
                    <tr>
                        <th className="p-3 w-24 border-b dark:border-slate-700">Cód.</th>
                        <th className="p-3 border-b dark:border-slate-700">Nome</th>
                        <th className="p-3 w-16 text-center border-b dark:border-slate-700">Ação</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {categories.length === 0 ? (
                        <tr><td colSpan={3} className="p-4 text-center text-slate-400 italic">Nenhuma categoria.</td></tr>
                    ) : (
                        categories.sort((a,b) => a.code.localeCompare(b.code)).map((cat, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                                <td className="p-3 font-bold">{cat.code}</td>
                                <td className="p-3">{cat.name}</td>
                                <td className="p-3 text-center">
                                    <button 
                                        onClick={() => removeCategory(cat.code)}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                        title="Remover"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* UNIT OF MEASURE SETTINGS */}
       <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Scale className="w-5 h-5 text-slate-500"/> Unidades de Medida
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Gerencie as opções de unidade de medida disponíveis para novos materiais.
        </p>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
            <input 
                type="text"
                value={newUnitAbbr}
                onChange={(e) => setNewUnitAbbr(e.target.value)}
                placeholder="Abrev (Ex: MT)"
                maxLength={5}
                className="w-full md:w-32 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm uppercase dark:bg-slate-900 dark:text-white"
            />
            <input 
                type="text"
                value={newUnitDesc}
                onChange={(e) => setNewUnitDesc(e.target.value)}
                placeholder="Descrição Curta (Ex: Metro)"
                maxLength={30}
                className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUnit())}
            />
            <button 
                type="button"
                onClick={addUnit}
                className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium"
            >
                Adicionar
            </button>
        </div>

        <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900 font-semibold sticky top-0">
                    <tr>
                        <th className="p-3 w-24 border-b dark:border-slate-700">Abrev.</th>
                        <th className="p-3 border-b dark:border-slate-700">Descrição</th>
                        <th className="p-3 w-16 text-center border-b dark:border-slate-700">Ação</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {unitOptions.length === 0 ? (
                        <tr><td colSpan={3} className="p-4 text-center text-slate-400 italic">Nenhuma unidade cadastrada.</td></tr>
                    ) : (
                        unitOptions.map((unit, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                                <td className="p-3 font-bold">{unit.value}</td>
                                <td className="p-3">{unit.description}</td>
                                <td className="p-3 text-center">
                                    <button 
                                        onClick={() => removeUnit(unit.value)}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                        title="Remover"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* SUPPLIER SETTINGS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Truck className="w-5 h-5 text-slate-500"/> Fornecedores (Pedidos Autónomos)
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Importe a lista de fornecedores para usar na criação de Pedidos Autónomos.
            <br/><span className="text-xs italic">Colunas: Fornecedor, Nome, Dias pagamento, Morada</span>
        </p>

        <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer relative mb-4">
            <input 
                type="file" 
                accept=".xlsx, .xls"
                ref={supplierFileRef}
                onChange={handleSupplierUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center">
                <FileSpreadsheet className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Importar Excel de Fornecedores</span>
            </div>
        </div>

        {suppliers.length > 0 && (
            <div className="text-sm text-slate-600 dark:text-slate-400 bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                {suppliers.length} fornecedores carregados.
            </div>
        )}
      </div>

      {/* EMAIL SETTINGS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Mail className="w-5 h-5 text-slate-500"/> Notificações de Stock
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Defina os e-mails que receberão alertas quando houver itens novos ou sem stock.
        </p>
        
        <div className="space-y-3 mb-6">
            {recipients.map((recipient, idx) => (
                <div key={idx} className="flex items-center gap-2">
                        <select
                        value={recipient.type}
                        onChange={(e) => updateRecipient(idx, 'type', e.target.value)}
                        className="p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                        >
                            <option value="TO">Para</option>
                            <option value="CC">CC</option>
                        </select>
                        <input 
                        type="email"
                        value={recipient.email}
                        onChange={(e) => updateRecipient(idx, 'email', e.target.value)}
                        placeholder="exemplo@empresa.com"
                        className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                        required
                        />
                        <button 
                        type="button" 
                        onClick={() => removeRecipient(idx)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                </div>
            ))}
        </div>

        <button 
            type="button" 
            onClick={addRecipient}
            className="text-sm text-brand-600 dark:text-brand-400 font-medium flex items-center gap-1 hover:text-brand-800 dark:hover:text-brand-300"
        >
            <Plus className="w-3 h-3" /> Adicionar Destinatário
        </button>
      </div>

      {/* COMPANY SETTINGS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Building className="w-5 h-5 text-slate-500"/> Gestão de Empresas
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Crie a lista de empresas disponíveis para seleção no registo de novos utilizadores.
        </p>

        <div className="flex gap-2 mb-4">
            <input 
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Nome da nova empresa..."
                className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCompany())}
            />
            <button 
                type="button"
                onClick={addCompany}
                className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium"
            >
                Adicionar
            </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
            {companies.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nenhuma empresa registada.</p>
            ) : (
                companies.map((company) => (
                    <div key={company.id} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-700">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{company.name}</span>
                        <button 
                            onClick={() => removeCompany(company.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* SAVE BUTTON */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
            <div>
                {message && (
                <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-4 h-4"/> {message}
                </span>
                )}
            </div>
            <button 
                onClick={handleSave} 
                disabled={loading}
                className="bg-brand-600 text-white px-8 py-3 rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                Salvar Todas as Configurações
            </button>
        </div>
    </div>
  );
};

export default Settings;
