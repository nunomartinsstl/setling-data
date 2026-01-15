import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { EmailRecipient } from '../types';
import { Save, Mail, Loader2, AlertCircle, Plus, Trash2 } from 'lucide-react';

const Settings: React.FC = () => {
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

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
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await StorageService.saveSettings({ 
          emailRecipients: recipients,
          notificationEmail: recipients.length > 0 ? recipients[0].email : '' // Legacy fallback
      });
      setMessage('Configurações salvas com sucesso.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Erro ao salvar.');
    } finally {
      setLoading(false);
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

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        Configurações do Sistema
      </h2>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-slate-500"/> Notificações de Stock
        </h3>
        <p className="text-sm text-slate-500 mb-4">
            Defina os e-mails que receberão alertas quando houver itens novos ou sem stock.
        </p>
        
        <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-3">
                {recipients.map((recipient, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                         <select
                            value={recipient.type}
                            onChange={(e) => updateRecipient(idx, 'type', e.target.value)}
                            className="p-2 border border-slate-300 rounded-md bg-slate-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                         >
                             <option value="TO">Para</option>
                             <option value="CC">CC</option>
                         </select>
                         <input 
                            type="email"
                            value={recipient.email}
                            onChange={(e) => updateRecipient(idx, 'email', e.target.value)}
                            placeholder="exemplo@empresa.com"
                            className="flex-1 p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                            required
                         />
                         <button 
                            type="button" 
                            onClick={() => removeRecipient(idx)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                         >
                             <Trash2 className="w-4 h-4" />
                         </button>
                    </div>
                ))}
            </div>

            <button 
                type="button" 
                onClick={addRecipient}
                className="text-sm text-brand-600 font-medium flex items-center gap-1 hover:text-brand-800"
            >
                <Plus className="w-3 h-3" /> Adicionar Destinatário
            </button>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4">
                <div>
                   {message && (
                    <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                        <AlertCircle className="w-4 h-4"/> {message}
                    </span>
                   )}
                </div>
                <button 
                    type="submit" 
                    disabled={loading}
                    className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-2"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                    Salvar
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;