import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, child, update, remove, Database } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, Auth } from 'firebase/auth';
import { User, UserRole, Order, StockItem, MasterMaterial, AppSettings, PurchaseOrder, Supplier, Company } from '../types';

// Safely access environment variables
const env = ((import.meta as any).env || {}) as any;

// Configuration with fallbacks to your specific project credentials
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyARcjDl6-8W15RHX17GLy3H68VfbRIOOgU",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "setling-avac-data.firebaseapp.com",
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || "https://setling-avac-data-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "setling-avac-data",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "setling-avac-data.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "730262521814",
  appId: env.VITE_FIREBASE_APP_ID || "1:730262521814:web:a5e56c714d51f465f00677"
};

// Check if critical config is present
const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;

let app;
let db: Database | undefined;
let auth: Auth | undefined;
let isFirebaseActive = false;

if (hasConfig) {
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
        isFirebaseActive = true;
        console.log("Firebase connected to:", firebaseConfig.projectId);
    } catch (e) {
        console.error("Firebase initialization failed:", e);
    }
} else {
    console.warn("Firebase configuration missing. App running in offline mode.");
}

// UPDATED KEYS TO MATCH YOUR DATABASE STRUCTURE (nexus_ prefix)
const KEYS = {
  USERS: 'nexus_users',
  ORDERS: 'nexus_orders',
  STOCK: 'nexus_stock',
  MASTER_MATERIALS: 'nexus_master',
  SETTINGS: 'nexus_settings',
  PURCHASE_ORDERS: 'nexus_purchase_orders', // Separate nexus for purchase orders
  INVITES: 'nexus_invites'
};

export const MATERIAL_CATEGORIES = [
    { code: 'A00', name: 'Diversos' },
    { code: 'A01', name: 'Cabos' },
    { code: 'A02', name: 'Tubos' },
    { code: 'A03', name: 'Iluminação' },
];

export const StorageService = {
  isConnected: () => isFirebaseActive,

  subscribeToAuth: (callback: (user: User | null) => void) => {
    if (!auth || !db) {
        callback(null);
        return () => {};
    }
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && db) {
        try {
            const snapshot = await get(child(ref(db), `${KEYS.USERS}/${firebaseUser.uid}`));
            if (snapshot.exists()) {
            callback(snapshot.val() as User);
            } else {
            callback({
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                username: firebaseUser.displayName || 'User',
                role: UserRole.VIEWER
            });
            }
        } catch (e) {
            console.error("Error fetching user profile:", e);
            callback(null);
        }
      } else {
        callback(null);
      }
    });
  },

  logout: async () => {
    if (auth) await signOut(auth);
  },

  authenticateUser: async (identifier: string, password: string) => {
    if (!auth || !db) throw new Error("Serviço offline. Verifique a configuração.");
    const cred = await signInWithEmailAndPassword(auth, identifier, password);
    const snapshot = await get(child(ref(db), `${KEYS.USERS}/${cred.user.uid}`));
    return snapshot.val() as User;
  },

  registerUser: async (email: string, password: string, firstName: string, lastName: string, role: UserRole, adminCode: string, companyId: string) => {
      if (!auth || !db) throw new Error("Serviço offline.");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      const username = `${firstName}-${lastName}`.toLowerCase();

      const newUser: User = {
          uid,
          email,
          username,
          firstName,
          lastName,
          role,
          companyId
      };

      await set(ref(db, `${KEYS.USERS}/${uid}`), newUser);
      await updateProfile(userCredential.user, { displayName: username });
      return newUser;
  },

  getUsers: async (): Promise<User[]> => {
      if (!db) return [];
      const snapshot = await get(child(ref(db), KEYS.USERS));
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },

  getSettings: async (): Promise<AppSettings> => {
      if (!db) return { emailRecipients: [] };
      const snapshot = await get(child(ref(db), KEYS.SETTINGS));
      return snapshot.val() || { emailRecipients: [] };
  },

  getCompanies: async (): Promise<Company[]> => {
      if (!db) return [];
      try {
          const snapshot = await get(child(ref(db), `${KEYS.SETTINGS}/companies`));
          if (!snapshot.exists()) return [];
          const val = snapshot.val();
          return Array.isArray(val) ? val : Object.values(val);
      } catch (e) {
          // Silent fail for permission denied on login screen
          return [];
      }
  },

  saveSettings: async (settings: AppSettings) => {
      if (!db) return;
      await set(ref(db, KEYS.SETTINGS), settings);
  },

  getStock: async (): Promise<StockItem[]> => {
      if (!db) return [];
      const snapshot = await get(child(ref(db), KEYS.STOCK));
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },
  
  replaceStock: async (newStock: StockItem[]) => {
      if (!db) return;
      await set(ref(db, KEYS.STOCK), newStock);
  },

  getOrders: async (): Promise<Order[]> => {
      if (!db) return [];
      const snapshot = await get(child(ref(db), KEYS.ORDERS));
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },

  addOrders: async (orders: Order[]) => {
      if (!db) return;
      const updates: any = {};
      orders.forEach(o => {
          updates[`${KEYS.ORDERS}/${o.id}`] = o;
      });
      await update(ref(db), updates);
  },

  updateOrder: async (order: Order) => {
      if (!db) return;
      await set(ref(db, `${KEYS.ORDERS}/${order.id}`), order);
  },

  deleteOrder: async (id: string) => {
      if (!db) return;
      await remove(ref(db, `${KEYS.ORDERS}/${id}`));
  },

  getMasterMaterials: async (): Promise<MasterMaterial[]> => {
      if (!db) return [];
      const snapshot = await get(child(ref(db), KEYS.MASTER_MATERIALS));
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },

  mergeMasterMaterials: async (materials: MasterMaterial[]) => {
       if (!db) return;
       await set(ref(db, KEYS.MASTER_MATERIALS), materials);
  },

  syncCustomMaterials: async (masterList: MasterMaterial[]) => {
      // Placeholder for sync logic
  },

  createInvite: async (email: string, role: UserRole) => {
      if (!db) return;
      const id = Date.now().toString();
      await set(ref(db, `${KEYS.INVITES}/${id}`), { email, role, used: false, dateCreated: new Date().toISOString() });
  },

  updateUserRole: async (uid: string, role: UserRole) => {
      if (!db) return;
      await update(ref(db, `${KEYS.USERS}/${uid}`), { role });
  },

  updateUserCompany: async (uid: string, companyId: string) => {
      if (!db) return;
      await update(ref(db, `${KEYS.USERS}/${uid}`), { companyId });
  },

  deleteUserProfile: async (uid: string) => {
      if (!db) return;
      await remove(ref(db, `${KEYS.USERS}/${uid}`));
  },

  resetAllUsers: async (currentUid: string) => {
      // Placeholder
  },

  debugGetHash: async (code: string) => {
      return code;
  },

  // PURCHASE ORDERS
  getPurchaseOrders: async (): Promise<PurchaseOrder[]> => {
    if (!db) return [];
    try {
        const snapshot = await get(child(ref(db), KEYS.PURCHASE_ORDERS));
        if (!snapshot.exists()) return [];
        const val = snapshot.val();
        // Handle Firebase object-as-array behavior
        return Array.isArray(val) ? val : Object.values(val);
    } catch (e) {
        console.error("Error fetching purchase orders", e);
        return [];
    }
  },

  savePurchaseOrder: async (po: PurchaseOrder) => {
      if (!isFirebaseActive || !db) throw new Error("Disponível apenas online.");
      
      try {
          if (!po.id) throw new Error("ID interno obrigatório");
          
          // Generate Incremental ID if not present (New Order)
          if (!po.displayId) {
              const currentOrders = await StorageService.getPurchaseOrders();
              let maxId = 0;
              
              if (currentOrders && currentOrders.length > 0) {
                  // Safely iterate to find max ID
                  for (const order of currentOrders) {
                      const val = Number(order.displayId);
                      if (Number.isFinite(val) && val > maxId) {
                          maxId = val;
                      }
                  }
              }
              // Start at 1
              po.displayId = maxId + 1;
          }

          // Safety check against -Infinity or NaN before saving
          if (!Number.isFinite(po.displayId)) {
              // Fallback to timestamp based ID if calculation failed completely
              console.warn("Generating fallback ID for purchase order");
              po.displayId = Math.floor(Date.now() / 1000); 
          }

          // Save to nexus_purchase_orders/{id}
          await set(ref(db, `${KEYS.PURCHASE_ORDERS}/${po.id}`), po);
          return po;
      } catch(e: any) {
          throw new Error("Erro ao salvar pedido de compra: " + e.message);
      }
  },
};