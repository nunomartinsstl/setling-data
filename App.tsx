import React, { useState, useEffect } from 'react';
import { User, ViewState, Order, StockItem, MasterMaterial } from './types';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import OrderManager from './components/OrderManager';
import StockManager from './components/StockManager';
import QueryAssistant from './components/QueryAssistant';
import Settings from './components/Settings';
import UsersManager from './components/UsersManager';
import PurchaseOrderManager from './components/PurchaseOrderManager';
import { StorageService } from './services/storageService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('LOGIN');
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [masterList, setMasterList] = useState<MasterMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

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
    // Prevent double loading indicator if we are just restoring session silently
    // But helpful to show activity
    // setLoading(true); 
    try {
      // 1. Fetch current data
      const [fetchedStock, fetchedMaster] = await Promise.all([
        StorageService.getStock(),
        StorageService.getMasterMaterials()
      ]);
      
      // 2. Sync Custom Items (Requires master list)
      // This will update orders in DB if matches are found
      await StorageService.syncCustomMaterials(fetchedMaster);

      // 3. Fetch Orders (now updated)
      const fetchedOrders = await StorageService.getOrders();

      setOrders(fetchedOrders);
      setStock(fetchedStock);
      setMasterList(fetchedMaster);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      // setLoading(false);
    }
  };

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
        return <Dashboard orders={orders} stock={stock} userRole={user.role} onNavigate={setView} />;
      case 'CREATE_ORDER':
        return (
            <OrderManager 
              orders={orders} 
              stock={stock}
              masterList={masterList}
              type="OPEN"
              mode="CREATE" // New Prop
              userRole={user.role} 
              refreshData={refreshData} 
              currentUsername={user.username}
            />
          );
      case 'OPEN_ORDERS':
        return (
          <OrderManager 
            orders={orders} 
            stock={stock}
            masterList={masterList}
            type="OPEN" 
            mode="LIST" // New Prop
            userRole={user.role} 
            refreshData={refreshData} 
            currentUsername={user.username}
          />
        );
      case 'FINISHED_ORDERS':
        return (
          <OrderManager 
            orders={orders} 
            stock={stock}
            masterList={masterList}
            type="FINISHED" 
            mode="LIST"
            userRole={user.role} 
            refreshData={refreshData}
            currentUsername={user.username}
          />
        );
      case 'PURCHASE_ORDERS':
         return (
             <PurchaseOrderManager 
                masterList={masterList}
                currentUsername={user.username}
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
      case 'QUERY':
        return <QueryAssistant orders={orders} stock={stock} />;
      case 'SETTINGS':
        return <Settings />;
      case 'USERS':
        return <UsersManager />;
      default:
        return <Dashboard orders={orders} stock={stock} userRole={user.role} onNavigate={setView} />;
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
    >
      {renderContent()}
    </Layout>
  );
};

export default App;