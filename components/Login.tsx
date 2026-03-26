import React, { useState, useEffect } from 'react';
import { User, UserRole, Company } from '../types';
import { Lock, User as UserIcon, LogIn, UserPlus, AlertCircle, ShieldCheck, Mail, Key, Building, Eye, EyeOff, CheckCircle, Moon, Sun, Wrench } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface LoginProps {
  onLogin: (user: User) => void;
  toggleTheme: () => void;
  isDarkMode: boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin, toggleTheme, isDarkMode }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Login State
  const [loginIdentifier, setLoginIdentifier] = useState(''); // Email ONLY
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  
  // Reset Password State
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // Register State
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [adminCode, setAdminCode] = useState('');

  // Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>(Object.values(UserRole));

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [touched, setTouched] = useState(false); // Validation trigger
  
  // New State for Success Screen
  const [createdUser, setCreatedUser] = useState<User | null>(null);

  // Persistence logic & Fetch Companies
  useEffect(() => {
    const savedId = localStorage.getItem('last_login_identifier');
    if (savedId) {
        setLoginIdentifier(savedId);
    }
    
    // Fetch companies and settings for registration form
    const loadData = async () => {
        try {
            const [companyList, settings] = await Promise.all([
                StorageService.getCompanies(),
                StorageService.getSettings()
            ]);
            setCompanies(companyList || []);
            
            if (settings.permissions) {
                const roles = Object.keys(settings.permissions);
                if (roles.length > 0) {
                    setAvailableRoles(roles);
                    // If current role is not in the list, default to WAREHOUSE or first available
                    if (!roles.includes(role)) {
                        setRole((roles.includes(UserRole.WAREHOUSE) ? UserRole.WAREHOUSE : roles[0]) as UserRole);
                    }
                }
            }
        } catch (e) {
            console.warn("Could not load data (permission denied or offline).");
        }
    };
    loadData();
  }, []);

  // Fetch usernames when entering registration mode to check for collisions
  // Removed useEffect for existingUsernames

  // Developer Helper: Log Hash when typing admin code
  useEffect(() => {
    if (adminCode.length > 3) {
        StorageService.debugGetHash(adminCode).then(h => {
            console.log(`[DEV] Hash para seu código: ${h}`);
        });
    }
  }, [adminCode]);

  // Helper to preview username
  // Removed getPreviewUsername

  const getRoleLabel = (r: string) => {
      if (r === UserRole.MANAGEMENT) return 'Coordenação';
      if (r === UserRole.WAREHOUSE) return 'Logística';
      if (r === UserRole.TECHNICAL) return 'Técnico';
      if (r === UserRole.VIEWER) return 'Viewer';
      if (r === UserRole.ADMIN) return 'Administrador';
      return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase().replace(/_/g, ' ');
  };

  const getRoleIcon = (r: string) => {
      if (r === UserRole.MANAGEMENT) return UserIcon;
      if (r === UserRole.WAREHOUSE) return Lock;
      if (r === UserRole.TECHNICAL) return Wrench;
      if (r === UserRole.ADMIN) return ShieldCheck;
      return UserIcon;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError('');
    setResetMessage('');

    if (!loginIdentifier) {
        setError('Por favor, insira o seu email para recuperar a senha.');
        return;
    }

    setIsLoading(true);
    try {
        await StorageService.sendPasswordResetEmail(loginIdentifier);
        setResetMessage('Email de recuperação enviado! Verifique a sua caixa de entrada.');
    } catch (err: any) {
        let msg = err.message;
        if (msg.includes('auth/user-not-found')) msg = "Utilizador não encontrado.";
        else if (msg.includes('auth/invalid-email')) msg = "Formato de email inválido.";
        setError(msg);
    } finally {
        setIsLoading(false);
    }
  };

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
        else if (msg.includes('auth/invalid-email')) msg = "Formato de email inválido.";
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
    
    if (!email || !adminCode || !regPassword || !confirmPassword) {
        setError("Preencha todos os campos.");
        return;
    }

    if (regPassword.length < 6) {
        setError("A senha deve ter pelo menos 6 caracteres.");
        return;
    }

    if (regPassword !== confirmPassword) {
        setError("As senhas não coincidem.");
        return;
    }

    setIsLoading(true);

    try {
        let user;
        try {
            // 1. Try to complete registration using an invite code
            user = await StorageService.completeRegistration(email, adminCode, regPassword);
        } catch (inviteErr: any) {
            // 2. If no invite found, check if it's the Master Code to create an Admin
            if (inviteErr.message === "Não foi encontrado nenhum convite para este email.") {
                user = await StorageService.registerUser(email, regPassword, "Admin", "", UserRole.ADMIN, adminCode, "");
            } else {
                throw inviteErr;
            }
        }

        localStorage.setItem('last_login_identifier', user.email); // Store email for next login convenience
        
        // SHOW SUCCESS SCREEN INSTEAD OF DIRECT LOGIN
        setCreatedUser(user);

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
  const inputClass = (value: string) => `w-full px-3 py-2 border rounded-md focus:ring-2 outline-none text-sm transition-colors dark:bg-slate-900 dark:text-white ${touched && !value ? 'border-red-400 bg-red-50 focus:ring-red-200 dark:bg-red-900/20' : 'border-slate-300 focus:ring-brand-500 dark:border-slate-600'}`;
  const labelClass = (value: string) => `block text-xs font-semibold mb-1 ${touched && !value ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`;

  // RENDER SUCCESS SCREEN
  if (createdUser) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4 transition-colors duration-200">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700 text-center animate-fade-in">
                <div className="flex justify-center mb-6">
                    <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-full">
                        <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Conta Criada!</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-6">Registo realizado com sucesso.</p>
                
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-6">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Seu Email de Acesso</p>
                    <p className="text-xl font-mono font-bold text-brand-600 dark:text-brand-400 tracking-wide">{createdUser.email}</p>
                    <p className="text-xs text-slate-400 mt-2">Use este email para entrar.</p>
                </div>

                <button
                    onClick={() => onLogin(createdUser)}
                    className="w-full bg-brand-600 text-white py-3 rounded-md hover:bg-brand-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2"
                >
                    <LogIn className="w-4 h-4" /> Aceder à Plataforma
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-100 dark:bg-slate-950 transition-colors duration-200 relative">
      
      <div className="absolute top-4 right-4">
        <button 
            onClick={toggleTheme}
            className="p-2 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-all"
        >
            {isDarkMode ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
        </button>
      </div>
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-800 py-8 px-4 shadow-xl rounded-lg sm:px-10 border border-slate-200 dark:border-slate-700 relative transition-all duration-200">
            <div className="flex flex-col items-center justify-center mb-6">
                <img 
                    src="https://setling.pt/wp-content/uploads/2024/07/setling-logo-white-110.svg" 
                    alt="Setling Logo"
                    className="h-20 mb-2 object-contain transition-all duration-200 invert dark:invert-0"
                />
                <h2 className="text-blue-500 font-bold text-lg -mt-2 tracking-widest opacity-80">GESTÃO DE PEDIDOS</h2>
            </div>
            
            {isResettingPassword ? (
                <form onSubmit={handleResetPassword} className="space-y-4 animate-fade-in">
                    <div className="text-center mb-4">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Recuperar Senha</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Insira o seu email para receber um link de recuperação.</p>
                    </div>
                    <div>
                        <label className={labelClass(loginIdentifier)}>Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                            <input
                                type="email"
                                value={loginIdentifier}
                                onChange={(e) => setLoginIdentifier(e.target.value)}
                                className={`pl-10 ${inputClass(loginIdentifier)}`}
                                placeholder="email@setling.pt"
                            />
                        </div>
                    </div>
                    
                    {resetMessage && (
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm rounded-md border border-green-200 dark:border-green-800">
                            {resetMessage}
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-brand-600 text-white py-2 rounded-md hover:bg-brand-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2"
                        >
                            {isLoading ? 'Enviando...' : 'Enviar Link'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsResettingPassword(false); setError(''); setResetMessage(''); }}
                            className="w-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium"
                        >
                            Voltar ao Login
                        </button>
                    </div>
                </form>
            ) : (
                <>
                    {/* Toggle */}
                    <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg mb-6 mt-4">
                        <button 
                            type="button"
                            onClick={() => { setIsRegistering(false); setError(''); setTouched(false); }}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${!isRegistering ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            Entrar
                        </button>
                        <button 
                            type="button"
                            onClick={() => { setIsRegistering(true); setError(''); setTouched(false); }}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${isRegistering ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            Completar Registo
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

                    <div>
                        <label className={`block text-xs font-bold mb-1 flex items-center gap-1 ${touched && !adminCode ? 'text-red-600' : 'text-brand-600 dark:text-brand-400'}`}>
                            <Key className="w-3 h-3" /> Código de Acesso*
                        </label>
                        <input
                            type="text"
                            value={adminCode}
                            onChange={(e) => setAdminCode(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md focus:ring-2 outline-none text-sm dark:bg-slate-900 dark:text-white ${touched && !adminCode ? 'border-red-400 bg-red-50 focus:ring-red-200 dark:bg-red-900/20' : 'border-slate-300 bg-white dark:bg-slate-900 focus:ring-brand-500 dark:border-slate-700'}`}
                            placeholder="Insira o código de 6 dígitos"
                        />
                    </div>

                    <div>
                        <label className={labelClass(regPassword)}>Senha Pessoal (min 6 chars)*</label>
                        <div className="relative">
                            <input
                                type={showRegPassword ? "text" : "password"}
                                value={regPassword}
                                onChange={(e) => setRegPassword(e.target.value)}
                                className={`${inputClass(regPassword)} pr-10`}
                                placeholder="Crie sua senha"
                            />
                            <button
                                type="button"
                                onClick={() => setShowRegPassword(!showRegPassword)}
                                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                                tabIndex={-1}
                            >
                                {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className={labelClass(confirmPassword)}>Confirmar Senha*</label>
                        <div className="relative">
                            <input
                                type={showRegPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={`${inputClass(confirmPassword)} pr-10`}
                                placeholder="Repita sua senha"
                            />
                             {/* We use same toggle state for both password fields in register for better UX */}
                             <button
                                type="button"
                                onClick={() => setShowRegPassword(!showRegPassword)}
                                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                                tabIndex={-1}
                            >
                                {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {regPassword && confirmPassword && regPassword !== confirmPassword && (
                            <p className="text-[10px] text-red-500 mt-1">As senhas não coincidem.</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-brand-600 text-white py-2 rounded-md hover:bg-brand-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2 mt-2"
                    >
                        {isLoading ? 'Completando...' : <><UserPlus className="w-4 h-4" /> Completar Registo</>}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleLogin} className="space-y-4 animate-fade-in">
                    <div>
                        <label className={labelClass(loginIdentifier)}>Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                            <input
                                type="email"
                                value={loginIdentifier}
                                onChange={(e) => setLoginIdentifier(e.target.value)}
                                className={`pl-10 ${inputClass(loginIdentifier)}`}
                                placeholder="seu@email.com"
                            />
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center">
                            <label className={labelClass(loginPassword)}>Senha</label>
                            <button
                                type="button"
                                onClick={() => { setIsResettingPassword(true); setError(''); setTouched(false); }}
                                className="text-xs text-brand-600 dark:text-brand-400 hover:underline focus:outline-none"
                                tabIndex={-1}
                            >
                                Esqueceu a senha?
                            </button>
                        </div>
                        <div className="relative">
                            <input
                                type={showLoginPassword ? "text" : "password"}
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                className={`${inputClass(loginPassword)} pr-10`}
                                placeholder="Password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowLoginPassword(!showLoginPassword)}
                                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                                tabIndex={-1}
                            >
                                {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
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
            </>
            )}

            {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded-md border border-red-200 dark:border-red-800 flex items-start gap-2 animate-pulse">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <p>{error}</p>
                    </div>
                </div>
            )}
        </div>
      </div>
      
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">v1.1.2</span>
      </div>
    </div>
  );
};

export default Login;