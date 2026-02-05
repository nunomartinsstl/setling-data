import React, { useState, useEffect } from 'react';
import { User, ViewState, Order, StockItem, MasterMaterial, UserRole, Company, CategoryOption } from './types';
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
import { StorageService, DEFAULT_CATEGORIES } from './services/storageService';

const LOGO_AVAC = "https://setling-avac.com/wp-content/uploads/2024/10/setling-avac-logo-color-192px.svg";
const LOGO_HOTELARIA = "https://setlinghotelaria.pt/wp-content/uploads/2024/12/setling-hotelaria-logo-big.svg";
const LOGO_GENERIC = "https://setling.pt/wp-content/uploads/2024/07/setling-logo-white-110.svg";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('LOGIN');
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [masterList, setMasterList] = useState<MasterMaterial[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]); // Store companies
  const [categories, setCategories] = useState<CategoryOption[]>(DEFAULT_CATEGORIES);
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
      // 1. Fetch current data
      const [fetchedStock, fetchedMaster, fetchedCompanies, fetchedSettings] = await Promise.all([
        StorageService.getStock(),
        StorageService.getMasterMaterials(),
        StorageService.getCompanies(),
        StorageService.getSettings()
      ]);
      
      setCompanies(fetchedCompanies);
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
      
      // 2. AUTO-PROCESS COMPLETED ORDERS (Force check on refresh)
      // Only execute for roles that can potentially affect stock or manage orders, though technically safe for all
      if (user && (user.role === UserRole.ADMIN || user.role === UserRole.WAREHOUSE || user.role === UserRole.MANAGEMENT)) {
         // Step A: Deduct stock for any new completed orders
         await StorageService.deductStockForCompletedOrders();
         
         // Step B: Re-read stock (because step A might have changed it)
         const updatedStock = await StorageService.getStock();
         
         // Step C: Check for Backorders (using updated stock)
         await StorageService.processBackorders(updatedStock);
         
         // Update local stock state
         setStock(updatedStock);
      } else {
         setStock(fetchedStock);
      }

      // 3. Reconcile Custom Items
      // This checks if any "Custom" items in orders now exist in the master list, and links them via SKU
      await StorageService.reconcileCustomItems(fetchedMaster);

      // 4. Sync Custom Materials (Legacy placeholder logic)
      await StorageService.syncCustomMaterials(fetchedMaster);

      // 5. Fetch Orders (now updated)
      const fetchedOrders = await StorageService.getOrders();

      setOrders(fetchedOrders);
      setMasterList(fetchedMaster);
    } catch (error) {
      console.error("Failed to fetch data", error);
    }
  };

  // --- FILTERED ORDERS LOGIC ---
  // Admins see all. Users see only their company's orders or legacy orders (undefined companyId).
  const visibleOrders = orders.filter(o => {
      if (user?.role === UserRole.ADMIN || user?.role === UserRole.WAREHOUSE) return true; // Warehouse sees all to pick
      return !o.companyId || o.companyId === user?.companyId;
  });

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
        return <Dashboard orders={visibleOrders} stock={stock} userRole={user.role} onNavigate={setView} />;
      case 'CREATE_ORDER':
        return (
            <OrderManager 
              orders={orders} // Pass all orders so reservation logic works correctly
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
            />
          );
      case 'OPEN_ORDERS':
        return (
          <OrderManager 
            orders={visibleOrders} 
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
          />
        );
      case 'FINISHED_ORDERS':
        return (
          <OrderManager 
            orders={visibleOrders} 
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
          />
        );
      case 'PURCHASE_ORDERS':
         return (
             <PurchaseOrderManager 
                masterList={masterList}
                currentUsername={user.username}
                logoUrl={logoUrl}
             />
         );
      case 'STOCK':
        return (
          <StockManager 
            stock={stock} 
            masterList={masterList}
            userRole={user.role} 
            refreshData={refreshData} 
          />
        );
      case 'SHORTAGES':
        return (
            <ShortagesReport 
                orders={orders} // Pass all orders to calculate aggregate demand
                stock={stock} 
                onNavigateToOrder={(id) => console.log(id)} 
            />
        );
      case 'QUERY':
        return <QueryAssistant orders={visibleOrders} stock={stock} />;
      case 'SETTINGS':
        return <Settings />;
      case 'USERS':
        return <UsersManager />;
      default:
        return <Dashboard orders={visibleOrders} stock={stock} userRole={user.role} onNavigate={setView} />;
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
    >
      {renderContent()}
    </Layout>
  );
};

export default App;