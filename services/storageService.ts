import { OrderItem, StockItem } from '../types';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, child, DataSnapshot } from 'firebase/database';

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyARcjDl6-8W15RHX17GLy3H68VfbRIOOgU",
  authDomain: "setling-avac-data.firebaseapp.com",
  databaseURL: "https://setling-avac-data-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "setling-avac-data",
  storageBucket: "setling-avac-data.firebasestorage.app",
  messagingSenderId: "730262521814",
  appId: "1:730262521814:web:a5e56c714d51f465f00677"
};

// Initialize Firebase
let db: any;
let isFirebaseActive = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "API_KEY_HERE") {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    isFirebaseActive = true;
    console.log("Firebase inicializado.");
  }
} catch (e) {
  console.error("Erro ao iniciar Firebase:", e);
}

const KEYS = {
  ORDERS: 'nexus_orders',
  STOCK: 'nexus_stock',
};

// Helper to convert Firebase Object/Array response to Array always
const toArray = <T>(data: any): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Object.values(data);
};

// Helper: Timeout wrapper to prevent hanging promises
const withTimeout = <T>(promise: Promise<T>, ms: number = 5000): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("Timeout de conexão"));
        }, ms);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((reason) => {
                clearTimeout(timer);
                reject(reason);
            });
    });
};

export const StorageService = {
  isConnected: () => isFirebaseActive,

  getOrders: async (): Promise<OrderItem[]> => {
    if (isFirebaseActive) {
      try {
        // Wrap the fetch in a timeout so it doesn't spin forever
        const snapshot = await withTimeout<DataSnapshot>(get(child(ref(db), KEYS.ORDERS)), 5000);
        
        if (snapshot.exists()) {
          return toArray<OrderItem>(snapshot.val());
        }
        return [];
      } catch (error) {
        console.warn("Erro ao buscar pedidos (ou timeout):", error);
        // Fallback to local storage or empty array if Firebase fails/times out
        return []; 
      }
    } else {
      const data = localStorage.getItem(KEYS.ORDERS);
      return data ? JSON.parse(data) : [];
    }
  },

  addOrders: async (newOrders: OrderItem[]) => {
    const current = await StorageService.getOrders();
    const updated = [...current, ...newOrders];
    
    if (isFirebaseActive) {
      await set(ref(db, KEYS.ORDERS), updated);
    } else {
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(updated));
    }
    return updated;
  },

  updateOrderStatus: async (orderId: string, newStatus: 'FINISHED' | 'OPEN') => {
    const current = await StorageService.getOrders();
    const updated = current.map(order => 
      order.id === orderId ? { ...order, status: newStatus } : order
    );

    if (isFirebaseActive) {
      await set(ref(db, KEYS.ORDERS), updated);
    } else {
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(updated));
    }
    return updated;
  },

  getStock: async (): Promise<StockItem[]> => {
    if (isFirebaseActive) {
      try {
        const snapshot = await withTimeout<DataSnapshot>(get(child(ref(db), KEYS.STOCK)), 5000);
        
        if (snapshot.exists()) {
          return toArray<StockItem>(snapshot.val());
        }
        return [];
      } catch (error) {
        console.warn("Erro ao buscar estoque (ou timeout):", error);
        return [];
      }
    } else {
      const data = localStorage.getItem(KEYS.STOCK);
      return data ? JSON.parse(data) : [];
    }
  },

  replaceStock: async (newStock: StockItem[]) => {
    if (isFirebaseActive) {
      await set(ref(db, KEYS.STOCK), newStock);
    } else {
      localStorage.setItem(KEYS.STOCK, JSON.stringify(newStock));
    }
    return newStock;
  }
};