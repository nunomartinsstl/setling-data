import React from 'react';
import { User, ViewState, UserRole } from '../types';
import { LayoutDashboard, ShoppingCart, CheckCircle, Package, Search, LogOut, Menu, Wifi, WifiOff, Settings, PlusCircle, RefreshCw, Users, Moon, Sun, ShoppingBag } from 'lucide-react';

interface LayoutProps {
  user: User;
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
  children: React.ReactNode;
  isConnected: boolean;
  onRefresh?: () => void;
  toggleTheme: () => void;
  isDarkMode: boolean;
}

const NavItem = ({ view, icon: Icon, label, isActive, onClick }: { view: ViewState, icon: any, label: string, isActive: boolean, onClick: () => void }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
        isActive 
          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 font-semibold' 
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
      }`}
    >
      <Icon className={`w-5 h-5 ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`} />
      <span>{label}</span>
    </button>
  );
};

const Layout: React.FC<LayoutProps> = ({ user, currentView, onNavigate, onLogout, children, isConnected, onRefresh, toggleTheme, isDarkMode }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Helper booleans
  const isAdmin = user.role === UserRole.ADMIN;
  const isManagement = user.role === UserRole.MANAGEMENT;
  
  const handleNavClick = (view: ViewState) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  const handleRefresh = async () => {
    if (onRefresh) {
        setIsRefreshing(true);
        await onRefresh();
        setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const getRoleLabel = () => {
    if (isAdmin) return 'Administrador';
    if (isManagement) return 'Coordenador';
    return 'Logística';
  };

  const getRoleColor = () => {
     if (isAdmin) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
     if (isManagement) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
     return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  };

  const canCreate = isAdmin || isManagement;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-200 ease-in-out flex flex-col
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header - Fixed */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
            <button 
              onClick={() => { onNavigate('DASHBOARD'); setMobileMenuOpen(false); }}
              className="text-left focus:outline-none w-full group"
            >
                <h1 className="text-2xl font-bold text-[#2c52ad] dark:text-blue-400 tracking-tight group-hover:opacity-80 transition-opacity">SETLING</h1>
                <p className="text-xs text-slate-400 font-medium group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors">Gestão de Pedidos</p>
            </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="mb-6 px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Logado como</p>
              <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{user.username}</p>
              <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${getRoleColor()}`}>
                {getRoleLabel()}
              </span>
            </div>

            <nav className="space-y-1">
              <NavItem 
                view="DASHBOARD" 
                icon={LayoutDashboard} 
                label="Painel" 
                isActive={currentView === 'DASHBOARD'} 
                onClick={() => handleNavClick('DASHBOARD')} 
              />
              
              {canCreate && (
                <>
                    <NavItem 
                        view="CREATE_ORDER" 
                        icon={PlusCircle} 
                        label="Pedido ao Armazém" 
                        isActive={currentView === 'CREATE_ORDER'} 
                        onClick={() => handleNavClick('CREATE_ORDER')} 
                    />
                    <NavItem 
                        view="PURCHASE_ORDERS" 
                        icon={ShoppingBag} 
                        label="Pedidos de Compra" 
                        isActive={currentView === 'PURCHASE_ORDERS'} 
                        onClick={() => handleNavClick('PURCHASE_ORDERS')} 
                    />
                </>
              )}

              <NavItem 
                view="OPEN_ORDERS" 
                icon={ShoppingCart} 
                label="Pedidos Abertos" 
                isActive={currentView === 'OPEN_ORDERS'} 
                onClick={() => handleNavClick('OPEN_ORDERS')} 
              />
              
              <NavItem 
                view="FINISHED_ORDERS" 
                icon={CheckCircle} 
                label="Pedidos Finalizados" 
                isActive={currentView === 'FINISHED_ORDERS'} 
                onClick={() => handleNavClick('FINISHED_ORDERS')} 
              />
              
              <NavItem 
                view="STOCK" 
                icon={Package} 
                label="Stock e Materiais" 
                isActive={currentView === 'STOCK'} 
                onClick={() => handleNavClick('STOCK')} 
              />
              
              <NavItem 
                view="QUERY" 
                icon={Search} 
                label="Busca" 
                isActive={currentView === 'QUERY'} 
                onClick={() => handleNavClick('QUERY')} 
              />
              
              {isAdmin && (
                <>
                    <NavItem 
                    view="USERS" 
                    icon={Users} 
                    label="Utilizadores" 
                    isActive={currentView === 'USERS'} 
                    onClick={() => handleNavClick('USERS')} 
                    />
                    <NavItem 
                    view="SETTINGS" 
                    icon={Settings} 
                    label="Configurações" 
                    isActive={currentView === 'SETTINGS'} 
                    onClick={() => handleNavClick('SETTINGS')} 
                    />
                </>
              )}
            </nav>
        </div>

        {/* Footer - Fixed */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 space-y-2 flex-shrink-0 bg-white dark:bg-slate-800">
            <div className={`px-4 py-2 rounded-lg text-xs flex items-center gap-2 ${isConnected ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>
               {isConnected ? <Wifi className="w-4 h-4"/> : <WifiOff className="w-4 h-4"/>}
               <span className="font-semibold">{isConnected ? 'Online' : 'Offline'}</span>
            </div>

            <button
              onClick={onLogout}
              className="w-full flex items-center space-x-3 px-4 py-2 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Sair</span>
            </button>
            
            <div className="text-center pt-1">
                <span className="text-[10px] text-slate-300 dark:text-slate-600 font-mono">v1.1.0</span>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        <header className="lg:hidden h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 justify-between transition-colors duration-200 flex-shrink-0">
          <button 
            onClick={() => onNavigate('DASHBOARD')}
            className="focus:outline-none"
          >
            <span className="font-bold text-[#2c52ad] dark:text-blue-400 text-xl">SETLING</span>
          </button>
          <div className="flex items-center gap-2">
            <button 
                onClick={toggleTheme}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all"
                title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
            >
                {isDarkMode ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
            </button>
            <button 
                onClick={handleRefresh}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
                title="Atualizar"
            >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-brand-600' : ''}`} />
            </button>
            <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-slate-600 dark:text-slate-300">
                <Menu className="w-6 h-6" />
            </button>
          </div>
        </header>

        {/* Desktop Header Actions (Non-Floating) */}
        <div className="hidden lg:flex w-full justify-end items-center px-8 pt-6 pb-2 gap-3 flex-shrink-0">
             <button 
                onClick={toggleTheme}
                className="flex items-center justify-center p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all hover:text-brand-600 dark:hover:text-brand-400"
                title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
            >
                {isDarkMode ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
            </button>
             <button 
                onClick={handleRefresh}
                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all hover:text-brand-600 dark:hover:text-brand-400"
            >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Atualizar
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:px-8 lg:pb-8 lg:pt-2">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;