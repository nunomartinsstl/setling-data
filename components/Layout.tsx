import React from 'react';
import { User, ViewState, UserRole } from '../types';
import { LayoutDashboard, ShoppingCart, CheckCircle, Package, Search, LogOut, Menu, Wifi, WifiOff } from 'lucide-react';

interface LayoutProps {
  user: User;
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
  children: React.ReactNode;
  isConnected: boolean;
}

const Layout: React.FC<LayoutProps> = ({ user, currentView, onNavigate, onLogout, children, isConnected }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const NavItem = ({ view, icon: Icon, label }: { view: ViewState, icon: any, label: string }) => {
    const isActive = currentView === view;
    return (
      <button
        onClick={() => {
          onNavigate(view);
          setMobileMenuOpen(false);
        }}
        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
          isActive 
            ? 'bg-brand-50 text-brand-700 font-semibold' 
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <Icon className={`w-5 h-5 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
        <span>{label}</span>
      </button>
    );
  };

  const isManagement = user.role === UserRole.MANAGEMENT;

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <h1 className="text-2xl font-bold text-brand-600 tracking-tight">SETLING</h1>
            <p className="text-xs text-slate-400 font-medium">Gestão Inteligente</p>
          </div>

          <div className="p-4">
            <div className="mb-6 px-4 py-3 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs text-slate-500 uppercase font-semibold">Logado como</p>
              <p className="font-medium text-slate-800 truncate">{user.username}</p>
              <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                isManagement ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {isManagement ? 'Gerência' : 'Armazém'}
              </span>
            </div>

            <nav className="space-y-1">
              <NavItem view="DASHBOARD" icon={LayoutDashboard} label="Painel" />
              <NavItem view="OPEN_ORDERS" icon={ShoppingCart} label="Pedidos Abertos" />
              <NavItem view="FINISHED_ORDERS" icon={CheckCircle} label="Pedidos Finalizados" />
              
              {!isManagement && (
                <NavItem view="STOCK" icon={Package} label="Estoque" />
              )}
              
              <NavItem view="QUERY" icon={Search} label="Busca" />
            </nav>
          </div>

          <div className="mt-auto p-4 border-t border-slate-100 space-y-2">
            
            {/* Connection Status Indicator */}
            <div className={`px-4 py-2 rounded-lg text-xs flex items-center gap-2 ${isConnected ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
               {isConnected ? <Wifi className="w-4 h-4"/> : <WifiOff className="w-4 h-4"/>}
               <span className="font-semibold">{isConnected ? 'Banco de Dados Online' : 'Modo Local (Offline)'}</span>
            </div>

            <button
              onClick={onLogout}
              className="w-full flex items-center space-x-3 px-4 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        <header className="lg:hidden h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between">
          <span className="font-bold text-brand-600 text-xl">SETLING</span>
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-slate-600">
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;