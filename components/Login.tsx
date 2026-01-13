import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Lock, User as UserIcon } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Mock Authentication Logic
    if (username === 'admin' && password === 'admin') {
      onLogin({ username: 'Gerente', role: UserRole.MANAGEMENT });
    } else if (username === 'estoque' && password === 'estoque') {
      onLogin({ username: 'Operador', role: UserRole.WAREHOUSE });
    } else {
      setError('Credenciais inválidas. Tente admin/admin ou estoque/estoque');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md border border-slate-200">
        <div className="flex justify-center mb-6">
          <div className="bg-brand-100 p-3 rounded-full">
            <Lock className="w-8 h-8 text-brand-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Login Setling</h2>
        <p className="text-center text-slate-500 mb-8">Plataforma de Controle de Estoque</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuário</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                placeholder="Digite seu usuário"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              placeholder="Digite sua senha"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-brand-600 text-white py-2 rounded-md hover:bg-brand-700 transition-colors font-medium shadow-sm"
          >
            Entrar
          </button>
        </form>
        
        <div className="mt-6 text-xs text-center text-slate-400">
          <p>Credenciais de Demo:</p>
          <p>Gerência: admin / admin</p>
          <p>Armazém: estoque / estoque</p>
        </div>
      </div>
    </div>
  );
};

export default Login;