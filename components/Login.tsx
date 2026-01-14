import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Lock, User as UserIcon, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Login State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.WAREHOUSE);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const generatedUsername = `${firstName.trim().toLowerCase()}-${lastName.trim().toLowerCase()}`;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
        const user = await StorageService.authenticateUser(loginUsername, loginPassword);
        onLogin(user);
    } catch (err: any) {
        setError(err.message || 'Erro ao entrar.');
    } finally {
        setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!firstName || !lastName || !regPassword) {
        setError("Preencha todos os campos.");
        return;
    }

    setIsLoading(true);

    try {
        const user = await StorageService.registerUser(firstName, lastName, regPassword, role);
        // Auto login after register
        onLogin(user);
    } catch (err: any) {
        setError(err.message || 'Erro ao criar conta.');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md border border-slate-200">
        <div className="flex justify-center mb-6">
          <div className="bg-brand-100 p-3 rounded-full">
            <Lock className="w-8 h-8 text-brand-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">
            {isRegistering ? 'Criar Conta' : 'Login Setling'}
        </h2>
        <p className="text-center text-slate-500 mb-6">Plataforma de Gestão</p>

        {/* Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
            <button 
                type="button"
                onClick={() => { setIsRegistering(false); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${!isRegistering ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Entrar
            </button>
            <button 
                type="button"
                onClick={() => { setIsRegistering(true); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${isRegistering ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Criar Conta
            </button>
        </div>

        {isRegistering ? (
            <form onSubmit={handleRegister} className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Nome</label>
                        <input
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                            placeholder="Ex: João"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Sobrenome</label>
                        <input
                            type="text"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                            placeholder="Ex: Silva"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Usuário Gerado</label>
                    <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-slate-500 text-sm font-mono flex items-center gap-2">
                        <UserIcon className="w-4 h-4"/>
                        {firstName && lastName ? generatedUsername : '...'}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Função</label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className={`cursor-pointer border rounded-md p-3 flex flex-col items-center justify-center gap-1 transition-all ${role === UserRole.MANAGEMENT ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <input type="radio" name="role" className="hidden" checked={role === UserRole.MANAGEMENT} onChange={() => setRole(UserRole.MANAGEMENT)} />
                            <span className="font-semibold text-sm">Coordenação</span>
                            <span className="text-[10px] text-slate-400">Admin/Gerência</span>
                        </label>
                        <label className={`cursor-pointer border rounded-md p-3 flex flex-col items-center justify-center gap-1 transition-all ${role === UserRole.WAREHOUSE ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <input type="radio" name="role" className="hidden" checked={role === UserRole.WAREHOUSE} onChange={() => setRole(UserRole.WAREHOUSE)} />
                            <span className="font-semibold text-sm">Logística</span>
                            <span className="text-[10px] text-slate-400">Estoque/Operação</span>
                        </label>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Senha</label>
                    <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
                        placeholder="Crie uma senha"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-brand-600 text-white py-2 rounded-md hover:bg-brand-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2"
                >
                    {isLoading ? 'Criando...' : <><UserPlus className="w-4 h-4" /> Criar Usuário</>}
                </button>
            </form>
        ) : (
            <form onSubmit={handleLogin} className="space-y-4 animate-fade-in">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Usuário</label>
                    <div className="relative">
                        <UserIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={loginUsername}
                            onChange={(e) => setLoginUsername(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
                            placeholder="nome-sobrenome"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                    <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
                        placeholder="Sua senha"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-brand-600 text-white py-2 rounded-md hover:bg-brand-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2"
                >
                    {isLoading ? 'Entrando...' : <><LogIn className="w-4 h-4" /> Entrar</>}
                </button>
            </form>
        )}

        {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
            </div>
        )}
      </div>
    </div>
  );
};

export default Login;