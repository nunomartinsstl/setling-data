import { Order, StockItem, User, UserRole, AppSettings, MasterMaterial } from '../types';
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
    console.log("Firebase: Cliente inicializado.");
  }
} catch (e) {
  console.error("Firebase: Erro crítico na inicialização:", e);
}

const KEYS = {
  ORDERS: 'nexus_orders',
  STOCK: 'nexus_stock',
  MASTER: 'nexus_master',
  USERS: 'nexus_users',
  SETTINGS: 'nexus_settings'
};

// Helper: SHA-256 Hash for simple password security
const hashPassword = async (password: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Helper to convert Firebase Object/Array response to Array always
const toArray = <T>(data: any): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Object.values(data);
};

// Helper: Timeout wrapper
const withTimeout = <T>(promise: Promise<T>, ms: number = 3000): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("Timeout: O banco de dados não respondeu a tempo."));
        }, ms);
        promise.then((value) => { clearTimeout(timer); resolve(value); })
               .catch((reason) => { clearTimeout(timer); reject(reason); });
    });
};

export const StorageService = {
  isConnected: () => isFirebaseActive,

  // --- AUTHENTICATION ---

  registerUser: async (firstName: string, lastName: string, password: string, role: UserRole): Promise<User> => {
    const username = `${firstName.trim().toLowerCase()}-${lastName.trim().toLowerCase()}`;
    const hashedPassword = await hashPassword(password);
    
    const newUser = {
        username,
        firstName,
        lastName,
        role,
        password: hashedPassword
    };

    if (isFirebaseActive) {
        // Check if exists
        const userRef = ref(db, `${KEYS.USERS}/${username}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            throw new Error(`O usuário "${username}" já existe.`);
        }
        await set(userRef, newUser);
    } else {
        // Local fallback (simple simulation)
        const localUsers = JSON.parse(localStorage.getItem(KEYS.USERS) || '{}');
        if (localUsers[username]) throw new Error("Usuário já existe (local).");
        localUsers[username] = newUser;
        localStorage.setItem(KEYS.USERS, JSON.stringify(localUsers));
    }

    return { username, role };
  },

  authenticateUser: async (username: string, password: string): Promise<User> => {
    const hashedPassword = await hashPassword(password);
    const targetUsername = username.toLowerCase().trim();

    if (isFirebaseActive) {
        try {
            const snapshot = await withTimeout<DataSnapshot>(get(child(ref(db), `${KEYS.USERS}/${targetUsername}`)));
            if (snapshot.exists()) {
                const userData = snapshot.val();
                if (userData.password === hashedPassword) {
                    return { username: userData.username, role: userData.role };
                }
            }
        } catch (e) {
            console.warn("Erro ao autenticar online, tentando localmente:", e);
        }
    }

    // Fallback or Offline Auth
    const localUsers = JSON.parse(localStorage.getItem(KEYS.USERS) || '{}');
    const user = localUsers[targetUsername];
    if (user && user.password === hashedPassword) {
        return { username: user.username, role: user.role };
    }

    throw new Error("Usuário ou senha incorretos.");
  },

  // --- DATA METHODS ---

  getOrders: async (): Promise<Order[]> => {
    let data: Order[] = [];
    try {
        const localData = localStorage.getItem(KEYS.ORDERS);
        if (localData) {
            data = JSON.parse(localData);
        }
    } catch(e) { console.error("Erro lendo cache local", e); }

    if (isFirebaseActive) {
      try {
        const snapshot = await withTimeout<DataSnapshot>(get(child(ref(db), KEYS.ORDERS)), 4000);
        if (snapshot.exists()) {
          data = toArray<Order>(snapshot.val());
          localStorage.setItem(KEYS.ORDERS, JSON.stringify(data));
        }
      } catch (error: any) {
        console.warn("Firebase Falhou (Leitura Pedidos):", error.code || error.message);
      }
    }
    return data;
  },

  addOrders: async (newOrders: Order[]) => {
    const current = await StorageService.getOrders();
    const updated = [...current, ...newOrders];
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(updated));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.ORDERS), updated);
      } catch(error: any) {
        console.error("Firebase Falhou (Escrita Pedidos):", error.code || error.message);
        if (error.code === 'PERMISSION_DENIED') alert("Erro de Permissão.");
      }
    }
    return updated;
  },

  updateOrder: async (updatedOrder: Order) => {
    const current = await StorageService.getOrders();
    const updatedList = current.map(o => o.id === updatedOrder.id ? updatedOrder : o);
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedList));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.ORDERS), updatedList);
      } catch (error: any) {
        console.error("Firebase Falhou (Update Order):", error.message);
        throw error;
      }
    }
    return updatedList;
  },

  updateOrderStatus: async (orderId: string, newStatus: 'FINISHED' | 'OPEN') => {
    const current = await StorageService.getOrders();
    const updated = current.map(order => 
      order.id === orderId ? { ...order, status: newStatus } : order
    );
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(updated));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.ORDERS), updated);
      } catch (error: any) {
         console.warn("Firebase Falhou (Update Status):", error.message);
      }
    }
    return updated;
  },

  deleteOrder: async (orderId: string) => {
    const current = await StorageService.getOrders();
    const updated = current.filter(order => order.id !== orderId);
    
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(updated));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.ORDERS), updated);
      } catch (error: any) {
        console.error("Firebase Falhou (Delete Order):", error.message);
        throw error;
      }
    }
    return updated;
  },

  getStock: async (): Promise<StockItem[]> => {
    let data: StockItem[] = [];
    try {
        const localData = localStorage.getItem(KEYS.STOCK);
        if (localData) {
            data = JSON.parse(localData);
        }
    } catch(e) { console.error("Erro lendo cache local", e); }

    if (isFirebaseActive) {
      try {
        const snapshot = await withTimeout<DataSnapshot>(get(child(ref(db), KEYS.STOCK)), 4000);
        if (snapshot.exists()) {
          data = toArray<StockItem>(snapshot.val());
          localStorage.setItem(KEYS.STOCK, JSON.stringify(data));
        }
      } catch (error: any) {
        console.warn("Firebase Falhou (Leitura Estoque):", error.message);
      }
    }
    return data;
  },

  replaceStock: async (newStock: StockItem[]) => {
    localStorage.setItem(KEYS.STOCK, JSON.stringify(newStock));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.STOCK), newStock);
      } catch (error: any) {
        console.error("Firebase Falhou (Escrita Estoque):", error.code || error.message);
        if (error.code === 'PERMISSION_DENIED') alert("Erro de Permissão.");
      }
    }
    return newStock;
  },

  // --- MASTER MATERIALS ---
  getMasterMaterials: async (): Promise<MasterMaterial[]> => {
    let data: MasterMaterial[] = [];
    try {
        const localData = localStorage.getItem(KEYS.MASTER);
        if (localData) {
            data = JSON.parse(localData);
        }
    } catch(e) { console.error("Erro lendo cache local", e); }

    if (isFirebaseActive) {
      try {
        const snapshot = await withTimeout<DataSnapshot>(get(child(ref(db), KEYS.MASTER)), 4000);
        if (snapshot.exists()) {
          data = toArray<MasterMaterial>(snapshot.val());
          localStorage.setItem(KEYS.MASTER, JSON.stringify(data));
        }
      } catch (error: any) {
        console.warn("Firebase Falhou (Leitura Master):", error.message);
      }
    }
    return data;
  },

  replaceMasterMaterials: async (newMaster: MasterMaterial[]) => {
    localStorage.setItem(KEYS.MASTER, JSON.stringify(newMaster));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.MASTER), newMaster);
      } catch (error: any) {
        console.error("Firebase Falhou (Escrita Master):", error.code || error.message);
        if (error.code === 'PERMISSION_DENIED') alert("Erro de Permissão.");
      }
    }
    return newMaster;
  },

  // --- SETTINGS ---
  getSettings: async (): Promise<AppSettings> => {
    let settings: AppSettings = { emailRecipients: [] };
    try {
        const localData = localStorage.getItem(KEYS.SETTINGS);
        if (localData) settings = JSON.parse(localData);
    } catch(e) {}

    if (isFirebaseActive) {
        try {
            const snapshot = await get(child(ref(db), KEYS.SETTINGS));
            if (snapshot.exists()) {
                settings = snapshot.val();
                localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
            }
        } catch(e) {}
    }
    // Ensure array exists
    if(!settings.emailRecipients) settings.emailRecipients = [];
    return settings;
  },

  saveSettings: async (settings: AppSettings) => {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    if (isFirebaseActive) {
        await set(ref(db, KEYS.SETTINGS), settings);
    }
  }
};