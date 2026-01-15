import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { Save, Mail, Loader2, AlertCircle } from 'lucide-react';

const Settings: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await StorageService.getSettings();
    setEmail(settings.notificationEmail || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await StorageService.saveSettings({ notificationEmail: email });
      setMessage('Configurações salvas com sucesso.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Erro ao salvar.');
    } finally {
      setLoading(false);
    }
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
            Defina o e-mail que receberá alertas imediatos quando um usuário solicitar um material sem stock ou inexistente.
        </p>
        
        <form onSubmit={handleSave} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail para Alertas</label>
                <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin.logistica@empresa.com"
                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
                />
            </div>

            <div className="flex items-center justify-between">
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