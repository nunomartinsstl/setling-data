
import React, { useState, useEffect } from 'react';
import { User, ViewState, Order, StockItem, MasterMaterial, UserRole, Company, CategoryOption, Receipt, Transfer, RolePermissions } from './types';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import OrderManager from './components/OrderManager';
import StockManager from './components/StockManager';
import QueryAssistant from './components/QueryAssistant';
import Settings from './components/Settings';
import UsersManager from './components/UsersManager';
import PurchaseOrderManager from './components/PurchaseOrderManager';
import ShortagesReport from './components/ShortagesReport';
import ReceiptsManager from './components/ReceiptsManager';
import TransfersManager from './components/TransfersManager';
import { StorageService, DEFAULT_CATEGORIES, DEFAULT_PERMISSIONS } from './services/storageService';
import { calculateShortages } from './src/utils/inventory';

const LOGO_AVAC = "https://setling-avac.com/wp-content/uploads/2024/10/setling-avac-logo-color-192px.svg";
const LOGO_HOTELARIA = "https://setlinghotelaria.pt/wp-content/uploads/2024/12/setling-hotelaria-logo-big.svg";
const LOGO_GENERIC = "https://setling.pt/wp-content/uploads/2024/07/setling-logo-white-110.svg";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('LOGIN');
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [masterList, setMasterList] = useState<MasterMaterial[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]); // Store companies
  const [categories, setCategories] = useState<CategoryOption[]>(DEFAULT_CATEGORIES);
  const [allUsers, setAllUsers] = useState<User[]>([]); // Store all users for lookups
  const [currentPermissions, setCurrentPermissions] = useState<RolePermissions>(DEFAULT_PERMISSIONS[UserRole.VIEWER]);
  
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  
  // Dynamic Logo based on Company/Role
  const [logoUrl, setLogoUrl] = useState(LOGO_AVAC);

  // Dark Mode State
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('theme');
        return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const isConnected = StorageService.isConnected();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Auth Subscription
  useEffect(() => {
      const unsubscribe = StorageService.subscribeToAuth((u) => {
          if (u) {
              setUser(u);
              setView(prev => prev === 'LOGIN' ? 'DASHBOARD' : prev);
          } else {
              setUser(null);
              setView('LOGIN');
          }
          setAuthChecking(false);
      });
      return () => unsubscribe();
  }, []);

  const toggleTheme = () => setDarkMode(!darkMode);

  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user]);

  const refreshData = async () => {
    try {
      // 1. Fetch public/shared data (Safe to fail individually if needed, but usually open)
      const [fetchedStock, fetchedMaster, fetchedCompanies, fetchedSettings] = await Promise.all([
        StorageService.getStock(),
        StorageService.getMasterMaterials(),
        StorageService.getCompanies(),
        StorageService.getSettings(),
      ]);
      
      // Update Permissions based on User Role and Settings
      if (user && fetchedSettings.permissions && fetchedSettings.permissions[user.role]) {
          setCurrentPermissions(fetchedSettings.permissions[user.role]);
      } else if (user) {
          setCurrentPermissions(DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS[UserRole.VIEWER]);
      }

      // 2. Fetch sensitive data independently (Receipts, Users)
      // If the current user (e.g. Technician) lacks permission, we catch the error 
      // instead of breaking the entire application load.
      let fetchedReceipts: Receipt[] = [];
      let fetchedTransfers: Transfer[] = [];
      let fetchedUsers: User[] = [];

      try {
          // Check dynamic permission instead of hardcoded role
          if (fetchedSettings.permissions?.[user?.role || UserRole.VIEWER]?.canViewReceipts ?? DEFAULT_PERMISSIONS[user?.role || UserRole.VIEWER].canViewReceipts) {
              fetchedReceipts = await StorageService.getReceipts();
          }
      } catch (e) {
          console.warn("Receipts access restricted or failed.", e);
      }

      try {
          if (fetchedSettings.permissions?.[user?.role || UserRole.VIEWER]?.canViewTransfers ?? DEFAULT_PERMISSIONS[user?.role || UserRole.VIEWER].canViewTransfers) {
              fetchedTransfers = await StorageService.getTransfers();
          }
      } catch (e) {
          console.warn("Transfers access restricted or failed.", e);
      }

      try {
          if (fetchedSettings.permissions?.[user?.role || UserRole.VIEWER]?.canManageUsers ?? DEFAULT_PERMISSIONS[user?.role || UserRole.VIEWER].canManageUsers) {
              fetchedUsers = await StorageService.getUsers();
          } else if (user?.role === UserRole.TECHNICAL || user?.role === UserRole.MANAGEMENT) {
              // Technicians need a restricted list of supervisors, so we might need a separate call or allow reading users but not editing
              // For now, let's try to fetch for everyone but fail silently, as OrderManager needs allUsers for email lookup
              fetchedUsers = await StorageService.getUsers();
          }
      } catch (e) {
          console.warn("Users list access restricted or failed.", e);
      }
      
      setCompanies(fetchedCompanies);
      setReceipts(fetchedReceipts);
      setTransfers(fetchedTransfers);
      setAllUsers(fetchedUsers);
      
      if (fetchedSettings.categories && fetchedSettings.categories.length > 0) {
          setCategories(fetchedSettings.categories);
      } else {
          setCategories(DEFAULT_CATEGORIES);
      }

      // Determine Company for Logo
      if (user?.role === UserRole.ADMIN) {
          setLogoUrl(LOGO_GENERIC);
      } else {
          try {
              if (user?.companyId && fetchedCompanies.length > 0) {
                  const userCompany = fetchedCompanies.find(c => c.id === user.companyId);
                  if (userCompany && userCompany.name.toLowerCase().includes('hotelaria')) {
                      setLogoUrl(LOGO_HOTELARIA);
                  } else {
                      setLogoUrl(LOGO_AVAC);
                  }
              } else {
                   setLogoUrl(LOGO_AVAC);
              }
          } catch (e) {
              console.warn("Could not determine company logo, using default.");
              setLogoUrl(LOGO_AVAC);
          }
      }
      
      // 3. AUTO-PROCESS COMPLETED ORDERS (Force check on refresh)
      let currentStockState = fetchedStock;

      if (user && (user.role === UserRole.ADMIN || user.role === UserRole.WAREHOUSE || user.role === UserRole.MANAGEMENT)) {
         try {
             // Step 0: Reconcile Custom Items FIRST (Fix N/A SKUs so they can be backordered)
             await StorageService.reconcileCustomItems(fetchedMaster, currentStockState);

             // Step A: Deduct stock for any new completed orders
             await StorageService.deductStockForCompletedOrders();
             
             // Step B: Re-read stock (because step A might have changed it)
             const updatedStock = await StorageService.getStock();
             
             // Step C: Check for Backorders (using updated stock)
             await StorageService.processBackorders(updatedStock);
             
             // Update local stock state
             currentStockState = updatedStock;
             setStock(updatedStock);
         } catch(e) {
             console.error("Error during auto-process stock routine", e);
             setStock(fetchedStock); // Fallback
         }
      } else {
         setStock(fetchedStock);
      }

      // 5. Sync Custom Materials (Legacy placeholder logic)
      await StorageService.syncCustomMaterials(fetchedMaster);

      // 6. Fetch Orders (now updated)
      const fetchedOrders = await StorageService.getOrders();

      setOrders(fetchedOrders);
      setMasterList(fetchedMaster);
    } catch (error) {
      console.error("Critical failure during data refresh", error);
    }
  };

  // --- FILTERED ORDERS LOGIC ---
  const visibleOrders = orders.filter(o => {
      // Admins and Warehouse/Management usually see all, but let's respect company scope for non-admins
      if (user?.role === UserRole.ADMIN) return true;
      if (user?.role === UserRole.WAREHOUSE || user?.role === UserRole.MANAGEMENT) return true;
      return !o.companyId || o.companyId === user?.companyId;
  });

  // Calculate Shortages for Badge
  const shortageCount = React.useMemo(() => {
    if (!orders || !stock) return 0;
    // Count all instances of missing materials (MISSING or EXHAUSTED)
    return calculateShortages(orders, stock).length;
  }, [orders, stock]);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setView('DASHBOARD');
  };

  const handleLogout = () => {
    StorageService.logout();
    setUser(null);
    setView('LOGIN');
    setOrders([]);
    setStock([]);
    setMasterList([]);
    setReceipts([]);
    setLogoUrl(LOGO_AVAC); // Reset
  };

  if (authChecking) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
        </div>
      );
    }

  if (!user || view === 'LOGIN') {
    return <Login onLogin={handleLogin} toggleTheme={toggleTheme} isDarkMode={darkMode} />;
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
        </div>
      );
    }

    switch (view) {
      case 'DASHBOARD':
        return <Dashboard orders={visibleOrders} stock={stock} userRole={user.role} permissions={currentPermissions} onNavigate={setView} shortageCount={shortageCount} />;
      case 'CREATE_ORDER':
        return currentPermissions.canCreateOrder ? (
            <OrderManager 
              orders={orders} 
              allActiveOrders={orders} 
              stock={stock}
              masterList={masterList}
              type="OPEN"
              mode="CREATE"
              userRole={user.role} 
              refreshData={refreshData} 
              currentUsername={user.username}
              userCompanyId={user.companyId}
              companies={companies}
              categories={categories}
              currentUser={user}
              allUsers={allUsers}
              onNavigate={setView}
            />
          ) : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'OPEN_ORDERS':
        return currentPermissions.canViewOpenOrders ? (
          <OrderManager 
            orders={visibleOrders} 
            allActiveOrders={orders} 
            stock={stock}
            masterList={masterList}
            type="OPEN" 
            mode="LIST"
            userRole={user.role} 
            refreshData={refreshData} 
            currentUsername={user.username}
            userCompanyId={user.companyId}
            companies={companies}
            categories={categories}
            currentUser={user}
            allUsers={allUsers}
          />
        ) : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'FINISHED_ORDERS':
        return currentPermissions.canViewFinishedOrders ? (
          <OrderManager 
            orders={visibleOrders} 
            allActiveOrders={orders} 
            stock={stock}
            masterList={masterList}
            type="FINISHED" 
            mode="LIST"
            userRole={user.role} 
            refreshData={refreshData}
            currentUsername={user.username}
            userCompanyId={user.companyId}
            companies={companies}
            categories={categories}
            currentUser={user}
            allUsers={allUsers}
          />
        ) : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'PURCHASE_ORDERS':
         return currentPermissions.canCreatePurchaseOrder ? (
             <PurchaseOrderManager 
                masterList={masterList}
                currentUsername={user.username}
                logoUrl={logoUrl}
                companies={companies}
                userRole={user.role}
                userCompanyId={user.companyId}
             />
         ) : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'STOCK':
        return currentPermissions.canViewStock ? (
          <StockManager 
            stock={stock} 
            masterList={masterList}
            userRole={user.role} 
            refreshData={refreshData} 
          />
        ) : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'RECEIPTS':
        return currentPermissions.canViewReceipts ? (
          <ReceiptsManager 
            receipts={receipts}
            masterList={masterList}
          />
        ) : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'TRANSFERS':
        return currentPermissions.canViewTransfers ? (
          <TransfersManager 
            transfers={transfers}
            masterList={masterList}
          />
        ) : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'SHORTAGES':
        return currentPermissions.canViewShortages ? (
            <ShortagesReport 
                orders={orders} // Pass all orders to calculate aggregate demand
                stock={stock} 
                onNavigateToOrder={(id) => console.log(id)} 
            />
        ) : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'QUERY':
        return currentPermissions.canSearch ? <QueryAssistant orders={visibleOrders} stock={stock} /> : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'SETTINGS':
        return currentPermissions.canManageSettings ? <Settings /> : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      case 'USERS':
        return currentPermissions.canManageUsers ? <UsersManager /> : <p className="p-8 text-center text-slate-500">Acesso negado.</p>;
      default:
        return <Dashboard orders={visibleOrders} stock={stock} userRole={user.role} permissions={currentPermissions} onNavigate={setView} shortageCount={shortageCount} />;
    }
  };

  return (
    <Layout
      user={user}
      currentView={view}
      onNavigate={setView}
      onLogout={handleLogout}
      isConnected={isConnected}
      onRefresh={refreshData}
      toggleTheme={toggleTheme}
      isDarkMode={darkMode}
      logoUrl={logoUrl}
      permissions={currentPermissions}
      shortageCount={shortageCount}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;
