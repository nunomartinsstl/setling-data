import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, child, update, remove, Database } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, Auth } from 'firebase/auth';
import { User, UserRole, Order, StockItem, MasterMaterial, AppSettings, PurchaseOrder, Supplier, Company, OrderLineItem } from '../types';

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

export const DEFAULT_CATEGORIES = [
    { code: 'ABR', name: 'ABRAÇADEIRAS' },
    { code: 'ACC', name: 'ACESSÓRIOS' },
    { code: 'ARC', name: 'AR COMPRIMIDO' },
    { code: 'CBL', name: 'CABO LIYCY' },
    { code: 'CBP', name: 'CABO PRETO' },
    { code: 'CBR', name: 'CABO DE REDE' },
    { code: 'CBV', name: 'CABO VARIADO' },
    { code: 'CCF', name: 'CABO' },
    { code: 'CDR', name: 'CONDUTA' },
    { code: 'CIH', name: 'CABO ISE' },
    { code: 'CMV', name: 'COMANDOS' },
    { code: 'COB', name: 'COBRE' },
    { code: 'COM', name: 'COMPONENTES' },
    { code: 'CON', name: 'CONSUMÍVEIS' },
    { code: 'DIF', name: 'DIFUSÃO' },
    { code: 'DVS', name: 'DIVERSOS' },
    { code: 'ECO', name: 'ECONOMATO' },
    { code: 'ELE', name: 'ELETRICO' },
    { code: 'EQU', name: 'EQUIPAMENTOS' },
    { code: 'FAR', name: 'FARDAMENTO' },
    { code: 'FIL', name: 'FILTROS' },
    { code: 'FRM', name: 'FERRAMENTAS' },
    { code: 'GAL', name: 'GALVANIZADOS' },
    { code: 'GAS', name: 'GASES' },
    { code: 'HID', name: 'HIDRÁULICA' },
    { code: 'INX', name: 'INOX' },
    { code: 'ISO', name: 'ISOLAMENTO' },
    { code: 'LAT', name: 'LATÃO' },
    { code: 'LIQ', name: 'LIQUIDOS' },
    { code: 'PAR', name: 'PARAFUSOS' },
    { code: 'PIR', name: 'PISO RADIANTE' },
    { code: 'PPR', name: 'PPR' },
    { code: 'PRF', name: 'PERFIL' },
    { code: 'PVC', name: 'PVC' },
    { code: 'REN', name: 'RENTING' },
    { code: 'ROU', name: 'ROUPA' },
    { code: 'SOL', name: 'SOLAR' },
    { code: 'TUB', name: 'TUBO' },
    { code: 'TUC', name: 'TUBO CALANDRADO' },
    { code: 'TUF', name: 'TUBO FLÉXIVEL' },
    { code: 'TUG', name: 'TUBO GRIS' },
    { code: 'TUS', name: 'TUBO SPIRO' },
    { code: 'VDE', name: 'VASO DE EXPANSÃO' },
    { code: 'VEN', name: 'VENTILADORES' }
];

// Re-export for compatibility, but prefer using AppSettings
export const MATERIAL_CATEGORIES = DEFAULT_CATEGORIES;

// Helper to normalize string for matching
const normalizeText = (text: string): string => {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

// Safe array helper for Firebase data
const toArray = (data: any) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Object.values(data);
};

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

  // Looks for Custom items in orders and matches them with Master List descriptions
  // If match found, converts Custom item to Standard item (sets SKU)
  // This allows logic like picked quantity tracking to work correctly across backorders
  reconcileCustomItems: async (masterList: MasterMaterial[]) => {
     if (!db || !masterList || masterList.length === 0) return;
     
     try {
         const allOrders = await StorageService.getOrders();
         const updates: any = {};
         let hasUpdates = false;

         // Create a map for fast lookup of Master Materials by Description
         const descToSkuMap = new Map<string, string>();
         masterList.forEach(m => {
             descToSkuMap.set(normalizeText(m.description), m.sku);
         });

         allOrders.forEach(order => {
             // Only process if order has items
             if (!order.items) return;
             
             let orderChanged = false;
             const newItems = order.items.map(item => {
                 // Check if item is custom AND has a description
                 if (item.isCustom && item.description) {
                     const matchSku = descToSkuMap.get(normalizeText(item.description));
                     
                     if (matchSku) {
                         // FOUND MATCH! Convert to standard item
                         orderChanged = true;
                         return {
                             ...item,
                             sku: matchSku,
                             isCustom: false,
                             // description: item.description // Keep original description or update? Keep original to avoid confusion
                         };
                     }
                 }
                 return item;
             });

             if (orderChanged) {
                 hasUpdates = true;
                 updates[`${KEYS.ORDERS}/${order.id}/items`] = newItems;
             }
         });

         if (hasUpdates) {
             await update(ref(db), updates);
             console.log("Reconciled custom items with master list.");
         }

     } catch (e) {
         console.error("Error reconciling custom items:", e);
     }
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

  deletePurchaseOrder: async (id: string) => {
      if (!db) return;
      await remove(ref(db, `${KEYS.PURCHASE_ORDERS}/${id}`));
  },

  processBackorders: async (newStockList: StockItem[]) => {
    try {
        // 1. Get all orders
        const allOrders = await StorageService.getOrders();
        
        // 2. Map new stock for fast lookup (Case Insensitive for SKU)
        const stockSkuMap = new Map<string, StockItem>();
        const stockDescMap = new Map<string, StockItem>();
        
        newStockList.forEach(s => {
            if(s.sku) stockSkuMap.set(s.sku.toString().trim().toUpperCase(), s);
            if(s.description) stockDescMap.set(normalizeText(s.description), s);
        });

        const newBackorders: Order[] = [];
        const updatedParents: Order[] = [];

        // 3. Filter for COMPLETED orders
        const completedOrders = allOrders.filter(o => o.status === 'COMPLETED');

        for (const order of completedOrders) {
            const itemsToReopen: OrderLineItem[] = [];
            let parentUpdated = false;
            
            // Ensure items is an array (Firebase safety)
            const safeItems = toArray(order.items);
            const newItems = safeItems.map((i: OrderLineItem) => ({...i}));
            
            // Track usage of picked items to handle multiple lines of same SKU
            const skuPickedUsage = new Map<string, number>();

            // Parse picked logs once
            const pickedLogs = toArray(order.pickedItems);

            for (let i = 0; i < newItems.length; i++) {
                const item = newItems[i];
                
                // Skip if this line was already backordered
                if (item.backorderCreated) continue;

                let qtyMissing = 0;
                
                if (item.isCustom) {
                    // Custom items logic: usually not in pickedLogs by SKU unless converted.
                    // If not marked backordered, assume fully missing.
                    qtyMissing = item.quantity;
                } else {
                    // Standard Item: Calculate what was actually picked vs requested
                    // Use UpperCase for matching
                    const currentSku = (item.sku || '').toString().trim().toUpperCase();
                    
                    const totalPickedForSku = pickedLogs
                        .filter((p: any) => (p.material || '').toString().trim().toUpperCase() === currentSku)
                        .reduce((sum: number, p: any) => sum + (Number(p.pickedQty) || 0), 0);

                    // Calculate how much of that picked amount is already "used" by previous lines in this loop
                    const usedPicked = skuPickedUsage.get(currentSku) || 0;
                    const availablePicked = Math.max(0, totalPickedForSku - usedPicked);
                    
                    // The amount picked for THIS line specifically
                    const linePicked = Math.min(item.quantity, availablePicked);
                    
                    // Update usage
                    skuPickedUsage.set(currentSku, usedPicked + linePicked);

                    qtyMissing = Math.max(0, item.quantity - linePicked);
                }

                if (qtyMissing > 0) {
                    let stockItemFound: StockItem | undefined;

                    if (item.isCustom) {
                        // Try match by description
                        const descKey = normalizeText(item.description);
                        stockItemFound = stockDescMap.get(descKey);
                    } else {
                        // Match by SKU (Case Insensitive)
                        stockItemFound = stockSkuMap.get((item.sku || '').toString().trim().toUpperCase());
                    }

                    // Check if we found stock and it has quantity > 0
                    if (stockItemFound && stockItemFound.quantity > 0) {
                        
                        // Prepare the new item
                        // If it was custom but we found a match, convert to standard
                        const isNowStandard = item.isCustom && !!stockItemFound.sku;
                        
                        const reopenItem: OrderLineItem = {
                            ...item,
                            sku: isNowStandard ? stockItemFound.sku : item.sku,
                            description: isNowStandard ? stockItemFound.description : item.description,
                            isCustom: isNowStandard ? false : item.isCustom,
                            
                            quantity: qtyMissing, // Only request missing amount
                            quantityPicked: 0,
                            backorderCreated: false, // Reset flag for new order
                        };

                        // Fix: Firebase does not support 'undefined'. Delete property explicitly.
                        delete reopenItem.fulfilledInOrderId;

                        itemsToReopen.push(reopenItem);
                        
                        // Mark parent as handled
                        item.backorderCreated = true;
                        parentUpdated = true;
                    }
                }
            }

            // If we generated items for this order, create the backorder
            if (itemsToReopen.length > 0) {
                // Determine Title: [Original Title]_re_[Incremental]
                const currentReopenCount = order.reopenCount || 0;
                const nextReopenCount = currentReopenCount + 1;
                
                // Strip existing suffix to get base title
                let cleanTitle = order.title.replace(/_re_\d+$/, "").replace(/ \(Reabertura \d+\)$/, "").trim();
                const newTitle = `${cleanTitle}_re_${nextReopenCount}`;
                
                const backorder: Order = {
                    ...order, // Inherit metadata
                    id: Math.random().toString(36).substr(2, 9),
                    displayId: 0, // System will assign if needed
                    status: 'OPEN', 
                    dateCreated: new Date().toISOString(),
                    dueDate: order.dueDate, // Keep priority
                    items: itemsToReopen,
                    originalOrderId: order.originalOrderId || order.id,
                    reopenCount: nextReopenCount, // Set count for this iteration
                    title: newTitle,
                    changeLog: [{
                        date: new Date().toISOString(),
                        actor: 'SYSTEM',
                        details: `Gerado automaticamente por entrada de stock.`
                    }],
                    pickedItems: [] // Clear warehouse logs
                };
                
                newBackorders.push(backorder);
                
                // Update parent's count so next time we know it's _re_2, etc
                order.reopenCount = nextReopenCount;
            }

            if (parentUpdated) {
                updatedParents.push({ ...order, items: newItems });
            }
        }

        // 4. Save Changes
        if (newBackorders.length > 0 || updatedParents.length > 0) {
            const allUpdates = [...newBackorders, ...updatedParents];
            await StorageService.addOrders(allUpdates);
            return newBackorders.length;
        }
        return 0;

    } catch (err) {
        console.error("Error processing backorders:", err);
        return 0;
    }
  }
};