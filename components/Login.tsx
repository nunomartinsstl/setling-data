import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { Lock, User as UserIcon, LogIn, UserPlus, AlertCircle, ShieldCheck, Mail, Key } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Login State
  const [loginIdentifier, setLoginIdentifier] = useState(''); // Email OR Username
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register State
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.WAREHOUSE);
  const [adminCode, setAdminCode] = useState('');

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [touched, setTouched] = useState(false); // Validation trigger
  
  // Persistence logic
  useEffect(() => {
    const savedId = localStorage.getItem('last_login_identifier');
    if (savedId) {
        setLoginIdentifier(savedId);
    }
  }, []);

  // Developer Helper: Log Hash when typing admin code
  useEffect(() => {
    if (adminCode.length > 3) {
        StorageService.debugGetHash(adminCode).then(h => {
            console.log(`[DEV] Hash para seu código: ${h}`);
        });
    }
  }, [adminCode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError('');
    
    if (!loginIdentifier || !loginPassword) {
        return; // UI will show red borders
    }

    setIsLoading(true);

    try {
        const user = await StorageService.authenticateUser(loginIdentifier, loginPassword);
        localStorage.setItem('last_login_identifier', loginIdentifier);
        onLogin(user);
    } catch (err: any) {
        let msg = err.message;
        if (msg.includes('auth/invalid-credential')) msg = "Credenciais incorretas.";
        else if (msg.includes('auth/too-many-requests')) msg = "Muitas tentativas falhadas. Tente mais tarde.";
        else if (msg.includes('index')) msg = "Erro de configuração do banco (Index). Avise o Admin.";
        setError(msg || 'Erro ao entrar.');
    } finally {
        setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError('');
    
    if (!email || !firstName || !lastName || !regPassword) {
        setError("Preencha os campos obrigatórios.");
        return;
    }

    if (regPassword.length < 6) {
        setError("A senha deve ter pelo menos 6 caracteres.");
        return;
    }

    if (role === UserRole.ADMIN && !adminCode) {
        setError("Administradores precisam do Código de Acesso Mestre.");
        return;
    }

    setIsLoading(true);

    try {
        // Automatically handles incremental usernames inside service
        const user = await StorageService.registerUser(email, regPassword, firstName, lastName, role, adminCode);
        localStorage.setItem('last_login_identifier', user.username); // Store username for next login convenience
        onLogin(user);
    } catch (err: any) {
        let msg = err.message;
        if (msg.includes('auth/email-already-in-use')) msg = "Este email já está registado.";
        if (msg.includes('auth/weak-password')) msg = "Senha muito fraca.";
        setError(msg || 'Erro ao criar conta.');
    } finally {
        setIsLoading(false);
    }
  };

  // Helper for input validation classes
  const inputClass = (value: string) => `w-full px-3 py-2 border rounded-md focus:ring-2 outline-none text-sm transition-colors ${touched && !value ? 'border-red-400 bg-red-50 focus:ring-red-200' : 'border-slate-300 focus:ring-brand-500'}`;
  const labelClass = (value: string) => `block text-xs font-semibold mb-1 ${touched && !value ? 'text-red-500' : 'text-slate-600'}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md border border-slate-200 relative">
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
                onClick={() => { setIsRegistering(false); setError(''); setTouched(false); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${!isRegistering ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Entrar
            </button>
            <button 
                type="button"
                onClick={() => { setIsRegistering(true); setError(''); setTouched(false); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${isRegistering ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Criar Conta
            </button>
        </div>

        {isRegistering ? (
            <form onSubmit={handleRegister} className="space-y-4 animate-fade-in">
                <div>
                     <label className={labelClass(email)}>Email*</label>
                     <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={`pl-9 ${inputClass(email)}`}
                            placeholder="seu@email.com"
                        />
                     </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass(firstName)}>Nome*</label>
                        <input
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className={inputClass(firstName)}
                            placeholder="Ex: João"
                        />
                    </div>
                    <div>
                        <label className={labelClass(lastName)}>Apelido*</label>
                        <input
                            type="text"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            className={inputClass(lastName)}
                            placeholder="Ex: Silva"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Função</label>
                    <div className="grid grid-cols-3 gap-2">
                        <label className={`cursor-pointer border rounded-md p-1 flex flex-col items-center justify-center gap-1 transition-all ${role === UserRole.ADMIN ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <input type="radio" name="role" className="hidden" checked={role === UserRole.ADMIN} onChange={() => setRole(UserRole.ADMIN)} />
                            <ShieldCheck className="w-3 h-3" />
                            <span className="font-semibold text-[9px]">Admin</span>
                        </label>
                        <label className={`cursor-pointer border rounded-md p-1 flex flex-col items-center justify-center gap-1 transition-all ${role === UserRole.MANAGEMENT ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <input type="radio" name="role" className="hidden" checked={role === UserRole.MANAGEMENT} onChange={() => setRole(UserRole.MANAGEMENT)} />
                            <UserIcon className="w-3 h-3" />
                            <span className="font-semibold text-[9px]">Coordenador</span>
                        </label>
                        <label className={`cursor-pointer border rounded-md p-1 flex flex-col items-center justify-center gap-1 transition-all ${role === UserRole.WAREHOUSE ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <input type="radio" name="role" className="hidden" checked={role === UserRole.WAREHOUSE} onChange={() => setRole(UserRole.WAREHOUSE)} />
                            <Lock className="w-3 h-3" />
                            <span className="font-semibold text-[9px]">Logística</span>
                        </label>
                    </div>
                </div>

                <div>
                    <label className={labelClass(regPassword)}>Senha Pessoal (min 6 chars)</label>
                    <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className={inputClass(regPassword)}
                        placeholder="Crie sua senha"
                    />
                </div>

                {role === UserRole.ADMIN ? (
                     <div className="animate-fade-in">
                        <label className={`block text-xs font-bold mb-1 flex items-center gap-1 ${touched && !adminCode ? 'text-red-600' : 'text-purple-600'}`}>
                            <Key className="w-3 h-3" /> Código Mestre (Admin)
                        </label>
                        <input
                            type="password"
                            value={adminCode}
                            onChange={(e) => setAdminCode(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md focus:ring-2 outline-none text-sm ${touched && !adminCode ? 'border-red-400 bg-red-50 focus:ring-red-200' : 'border-purple-300 bg-purple-50 focus:ring-purple-500'}`}
                            placeholder="Código: admin97"
                        />
                        <p className="text-[10px] text-purple-600 mt-1">Código padrão: <strong>admin97</strong> ou <strong>admin</strong></p>
                    </div>
                ) : (
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700 flex items-start gap-2">
                        <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="font-bold">Convite necessário</p>
                            <p>Para se registar, o seu email já deve ter sido autorizado por um Administrador.</p>
                        </div>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-brand-600 text-white py-2 rounded-md hover:bg-brand-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2 mt-2"
                >
                    {isLoading ? 'Criando...' : <><UserPlus className="w-4 h-4" /> Criar Conta</>}
                </button>
            </form>
        ) : (
            <form onSubmit={handleLogin} className="space-y-4 animate-fade-in">
                <div>
                    <label className={labelClass(loginIdentifier)}>Email ou Utilizador</label>
                    <div className="relative">
                        <UserIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={loginIdentifier}
                            onChange={(e) => setLoginIdentifier(e.target.value)}
                            className={`pl-10 ${inputClass(loginIdentifier)}`}
                            placeholder="Email recomendado"
                        />
                    </div>
                </div>
                <div>
                    <label className={labelClass(loginPassword)}>Senha</label>
                    <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className={inputClass(loginPassword)}
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
            <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200 flex items-start gap-2 animate-pulse">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
            </div>
        )}
      </div>
    </div>
  );
};

export default Login;