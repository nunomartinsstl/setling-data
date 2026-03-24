
import React from 'react';
import { User, ViewState, UserRole, RolePermissions } from '../types';
import { LayoutDashboard, ShoppingCart, CheckCircle, Package, Search, LogOut, Menu, Wifi, WifiOff, Settings, PlusCircle, RefreshCw, Users, Moon, Sun, ShoppingBag, ChevronDown, ChevronRight, AlertTriangle, ArrowDownCircle, ArrowRightLeft } from 'lucide-react';

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
  logoUrl: string;
  permissions: RolePermissions;
  shortageCount?: number;
}

const NavItem = ({ view, icon: Icon, label, isActive, onClick, isChild = false, badgeCount }: { view: ViewState, icon: any, label: string, isActive: boolean, onClick: () => void, isChild?: boolean, badgeCount?: number }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-all duration-200 group ${
        isActive 
          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 font-semibold shadow-sm' 
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
      } ${isChild ? 'text-sm' : ''}`}
    >
      <div className="flex items-center space-x-3">
        <Icon className={`flex-shrink-0 transition-colors ${isChild ? 'w-4 h-4' : 'w-5 h-5'} ${
          isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 group-hover:text-slate-500 dark:group-hover:text-slate-300'
        }`} />
        <span>{label}</span>
      </div>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
          {badgeCount}
        </span>
      )}
    </button>
  );
};

const Layout: React.FC<LayoutProps> = ({ user, currentView, onNavigate, onLogout, children, isConnected, onRefresh, toggleTheme, isDarkMode, logoUrl, permissions, shortageCount = 0 }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  
  // State for collapsible warehouse menu
  const [isWarehouseGroupOpen, setIsWarehouseGroupOpen] = React.useState(false);

  // Helper booleans
  const isAdmin = user.role === UserRole.ADMIN;
  const isManagement = user.role === UserRole.MANAGEMENT;
  const isTechnical = user.role === UserRole.TECHNICAL;
  
  // Auto-expand if active view is a child
  React.useEffect(() => {
    if (['CREATE_ORDER', 'OPEN_ORDERS', 'FINISHED_ORDERS'].includes(currentView)) {
        setIsWarehouseGroupOpen(true);
    }
  }, [currentView]);

  // Logic to determine logo styling
  const isGenericLogo = logoUrl.includes('setling-logo-white');
  const logoClasses = isGenericLogo 
    ? "h-12 object-contain mb-2 transition-all invert dark:invert-0" 
    : "h-12 object-contain mb-2 transition-all dark:brightness-0 dark:invert";

  const mobileLogoClasses = isGenericLogo 
    ? "h-8 object-contain transition-all invert dark:invert-0" 
    : "h-8 object-contain transition-all dark:brightness-0 dark:invert";

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
    const role = user.role;
    if (role === UserRole.ADMIN) return 'Administrador';
    if (role === UserRole.MANAGEMENT) return 'Coordenação';
    if (role === UserRole.TECHNICAL) return 'Técnico';
    if (role === UserRole.WAREHOUSE) return 'Logística';
    if (role === UserRole.VIEWER) return 'Viewer';
    return role;
  };

  const getRoleColor = () => {
     if (isAdmin) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
     if (isManagement) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
     if (isTechnical) return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300';
     return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  };

  const isWarehouseActive = ['CREATE_ORDER', 'OPEN_ORDERS', 'FINISHED_ORDERS'].includes(currentView);
  
  // Only show dashboard if permissions allow seeing something useful, but generally everyone can see dashboard
  const showDashboard = true; 

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
                <img 
                    src={logoUrl} 
                    alt="Setling" 
                    className={logoClasses}
                />
                <p className="text-xs text-slate-400 font-medium group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors pl-1">Gestão de Pedidos</p>
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
              {showDashboard && (
                  <NavItem 
                    view="DASHBOARD" 
                    icon={LayoutDashboard} 
                    label="Dashboard" 
                    isActive={currentView === 'DASHBOARD'} 
                    onClick={() => handleNavClick('DASHBOARD')} 
                  />
              )}
              
              {/* Nested Warehouse Group - Only show if at least one sub-permission is true */}
              {(permissions.canCreateOrder || permissions.canViewOpenOrders || permissions.canViewOwnOpenOrders || permissions.canViewFinishedOrders || permissions.canViewOwnFinishedOrders) && (
                  <div className="space-y-1">
                      <button
                        onClick={() => setIsWarehouseGroupOpen(!isWarehouseGroupOpen)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors group ${
                            isWarehouseActive && !isWarehouseGroupOpen 
                                ? 'bg-brand-50/50 dark:bg-slate-800 text-brand-700 dark:text-brand-400 font-medium' 
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Package className={`w-5 h-5 transition-colors ${isWarehouseActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 group-hover:text-slate-500 dark:group-hover:text-slate-300'}`} />
                          <span>{isTechnical ? 'Requisições' : 'Pedidos ao Armazém'}</span>
                        </div>
                        <div className={`transition-transform duration-200 ${isWarehouseGroupOpen ? 'rotate-180' : ''}`}>
                             <ChevronDown className="w-4 h-4 text-slate-400" />
                        </div>
                      </button>

                      {isWarehouseGroupOpen && (
                        <div className="relative ml-5 pl-2 space-y-1 border-l-2 border-slate-100 dark:border-slate-700 animate-slide-down">
                             {permissions.canCreateOrder && (
                                <NavItem 
                                    view="CREATE_ORDER" 
                                    icon={PlusCircle} 
                                    label={isTechnical ? "Criar Requisição" : "Criar Pedido"}
                                    isActive={currentView === 'CREATE_ORDER'} 
                                    onClick={() => handleNavClick('CREATE_ORDER')}
                                    isChild={true}
                                />
                            )}
                            {(permissions.canViewOpenOrders || permissions.canViewOwnOpenOrders) && (
                                <NavItem 
                                    view="OPEN_ORDERS" 
                                    icon={ShoppingCart} 
                                    label="Pedidos Abertos" 
                                    isActive={currentView === 'OPEN_ORDERS'} 
                                    onClick={() => handleNavClick('OPEN_ORDERS')}
                                    isChild={true}
                                />
                            )}
                            {(permissions.canViewFinishedOrders || permissions.canViewOwnFinishedOrders) && (
                                <NavItem 
                                    view="FINISHED_ORDERS" 
                                    icon={CheckCircle} 
                                    label="Pedidos Finalizados" 
                                    isActive={currentView === 'FINISHED_ORDERS'} 
                                    onClick={() => handleNavClick('FINISHED_ORDERS')}
                                    isChild={true}
                                />
                            )}
                        </div>
                      )}
                  </div>
              )}

              {permissions.canCreatePurchaseOrder && (
                 <NavItem 
                    view="PURCHASE_ORDERS" 
                    icon={ShoppingBag} 
                    label="Pedidos de Compra" 
                    isActive={currentView === 'PURCHASE_ORDERS'} 
                    onClick={() => handleNavClick('PURCHASE_ORDERS')} 
                />
              )}
              
              {permissions.canViewStock && (
                  <NavItem 
                    view="STOCK" 
                    icon={Package} 
                    label="Stock e Materiais" 
                    isActive={currentView === 'STOCK'} 
                    onClick={() => handleNavClick('STOCK')} 
                  />
              )}

              {permissions.canViewReceipts && (
                  <NavItem 
                    view="RECEIPTS" 
                    icon={ArrowDownCircle} 
                    label="Entradas" 
                    isActive={currentView === 'RECEIPTS'} 
                    onClick={() => handleNavClick('RECEIPTS')} 
                  />
              )}

              {permissions.canViewTransfers && (
                  <NavItem 
                    view="TRANSFERS" 
                    icon={ArrowRightLeft} 
                    label="Transferências" 
                    isActive={currentView === 'TRANSFERS'} 
                    onClick={() => handleNavClick('TRANSFERS')} 
                  />
              )}

              {permissions.canViewShortages && (
                  <NavItem 
                    view="SHORTAGES" 
                    icon={AlertTriangle} 
                    label="Material em Falta" 
                    isActive={currentView === 'SHORTAGES'} 
                    onClick={() => handleNavClick('SHORTAGES')} 
                    badgeCount={shortageCount}
                  />
              )}
              
              {permissions.canSearch && (
                  <NavItem 
                    view="QUERY" 
                    icon={Search} 
                    label="Pesquisa" 
                    isActive={currentView === 'QUERY'} 
                    onClick={() => handleNavClick('QUERY')} 
                  />
              )}
              
              {/* Admin Tools are gated by specific permissions */}
              {permissions.canManageUsers && (
                <NavItem 
                view="USERS" 
                icon={Users} 
                label="Utilizadores" 
                isActive={currentView === 'USERS'} 
                onClick={() => handleNavClick('USERS')} 
                />
              )}
              
              {permissions.canManageSettings && (
                <NavItem 
                view="SETTINGS" 
                icon={Settings} 
                label="Configurações" 
                isActive={currentView === 'SETTINGS'} 
                onClick={() => handleNavClick('SETTINGS')} 
                />
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
                <span className="text-[10px] text-slate-300 dark:text-slate-600 font-mono">v1.2.0</span>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        {/* ... Header and desktop nav (unchanged) ... */}
        <header className="lg:hidden h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 justify-between transition-colors duration-200 flex-shrink-0">
          <button 
            onClick={() => { onNavigate('DASHBOARD'); }}
            className="focus:outline-none"
          >
            <img 
                src={logoUrl} 
                alt="Setling" 
                className={mobileLogoClasses}
            />
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
