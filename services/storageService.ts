import { Order, StockItem, User, UserRole, AppSettings, MasterMaterial, OrderLineItem } from '../types';
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

// Helper: Sort function by SKU (Material)
const sortBySku = (a: any, b: any) => {
    const skuA = (a.sku || '').toLowerCase();
    const skuB = (b.sku || '').toLowerCase();
    return skuA.localeCompare(skuB, undefined, { numeric: true, sensitivity: 'base' });
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

  getUsers: async (): Promise<User[]> => {
      let users: User[] = [];
      if (isFirebaseActive) {
          try {
              const snapshot = await get(ref(db, KEYS.USERS));
              if(snapshot.exists()) {
                  const data = snapshot.val();
                  users = Object.values(data).map((u: any) => ({
                      username: u.username,
                      firstName: u.firstName,
                      lastName: u.lastName,
                      role: u.role
                  }));
              }
          } catch(e) {}
      } else {
          const localUsers = JSON.parse(localStorage.getItem(KEYS.USERS) || '{}');
          users = Object.values(localUsers).map((u: any) => ({
              username: u.username,
              firstName: u.firstName,
              lastName: u.lastName,
              role: u.role
          }));
      }
      return users;
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
        } else {
            data = [];
        }
        localStorage.setItem(KEYS.ORDERS, JSON.stringify(data));
      } catch (error: any) {
        console.warn("Firebase Falhou (Leitura Pedidos):", error.code || error.message);
      }
    }
    return data;
  },

  getNextDisplayId: async (): Promise<number> => {
    const orders = await StorageService.getOrders();
    if (orders.length === 0) return 1;
    const maxId = Math.max(...orders.map(o => o.displayId || 0));
    return maxId + 1;
  },

  addOrders: async (newOrders: Order[]) => {
    const current = await StorageService.getOrders();
    
    // Assign Incremental IDs if missing
    let nextId = 1;
    if (current.length > 0) {
        nextId = Math.max(...current.map(o => o.displayId || 0)) + 1;
    }

    const processedNewOrders = newOrders.map((o, idx) => ({
        ...o,
        displayId: o.displayId || (nextId + idx)
    }));

    const updated = [...current, ...processedNewOrders];
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(updated));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.ORDERS), updated);
      } catch(error: any) {
        console.error("Firebase Falhou (Escrita Pedidos):", error.code || error.message);
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
        throw error;
      }
    }
    return updatedList;
  },

  updateOrderStatus: async (orderId: string, newStatus: 'COMPLETED' | 'OPEN' | 'IN_PROCESS' | 'IN PROCESS') => {
    const current = await StorageService.getOrders();
    let updatedOrders = [...current];
    
    const targetIndex = updatedOrders.findIndex(o => o.id === orderId);
    if (targetIndex === -1) return current;

    const targetOrder = { ...updatedOrders[targetIndex], status: newStatus };
    updatedOrders[targetIndex] = targetOrder;

    // --- LOGIC: If a child order (backorder) is completed, update the parent ---
    if (newStatus === 'COMPLETED' && targetOrder.originalOrderId) {
        const parentIndex = updatedOrders.findIndex(o => o.id === targetOrder.originalOrderId);
        if (parentIndex !== -1) {
            const parentOrder = { ...updatedOrders[parentIndex] };
            
            // Map items from child to parent to verify what was fulfilled
            const childItems = targetOrder.items;
            
            const parentItems = parentOrder.items.map(pItem => {
                // If this item exists in the completed child order
                const matchedChildItem = childItems.find(cItem => cItem.sku === pItem.sku);
                
                if (matchedChildItem) {
                    // Mark as fulfilled in this specific child order ID
                    return {
                        ...pItem,
                        fulfilledInOrderId: targetOrder.displayId
                    };
                }
                return pItem;
            });

            parentOrder.items = parentItems;
            
            // Ensure parent is marked COMPLETED if it wasn't (usually it is when backorder is created, but safe to enforce)
            if (parentOrder.status !== 'COMPLETED') {
                parentOrder.status = 'COMPLETED';
            }

            updatedOrders[parentIndex] = parentOrder;
        }
    }
    // --------------------------------------------------------------------------

    localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedOrders));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.ORDERS), updatedOrders);
      } catch (error: any) {
         console.warn("Firebase Falhou (Update Status):", error.message);
      }
    }
    return updatedOrders;
  },

  deleteOrder: async (orderId: string) => {
    const current = await StorageService.getOrders();
    const updated = current.filter(order => order.id !== orderId);
    
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(updated));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.ORDERS), updated);
      } catch (error: any) {
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
        } else {
            data = [];
        }
        localStorage.setItem(KEYS.STOCK, JSON.stringify(data));
      } catch (error: any) {
        console.warn("Firebase Falhou (Leitura Estoque):", error.message);
      }
    }
    // Sort before returning by SKU
    return data.sort(sortBySku);
  },

  replaceStock: async (newStock: StockItem[]) => {
    localStorage.setItem(KEYS.STOCK, JSON.stringify(newStock));
    
    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.STOCK), newStock);
      } catch (error: any) {
        console.error("Firebase Falhou (Escrita Estoque):", error.code || error.message);
      }
    }
    
    // Auto-trigger backorder processing
    await StorageService.processBackorders(newStock);

    return newStock;
  },

  // --- SYNC CUSTOM ITEMS WITH MASTER LIST ---
  syncCustomMaterials: async (masterList: MasterMaterial[]) => {
    if (!masterList || masterList.length === 0) return;

    const allOrders = await StorageService.getOrders();
    let hasChanges = false;
    
    const masterMap = new Map<string, string>(); // NormDesc -> SKU
    // Also keep a map for valid descriptions case-sensitive
    const descMap = new Map<string, string>(); // NormDesc -> Original Description

    masterList.forEach(m => {
        const norm = m.description.toLowerCase().trim();
        masterMap.set(norm, m.sku);
        descMap.set(norm, m.description);
    });

    const updatedOrders = allOrders.map(order => {
        let orderChanged = false;
        const newItems = order.items.map(item => {
            if (item.isCustom) {
                // Remove prefix if exists (legacy support) then normalize
                const cleanDesc = item.description.replace('(Novo) ', '');
                const normDesc = cleanDesc.toLowerCase().trim();
                
                if (masterMap.has(normDesc)) {
                    // Match found! Convert to standard item
                    orderChanged = true;
                    return {
                        ...item,
                        sku: masterMap.get(normDesc)!,
                        isCustom: false,
                        // Use the official description from master list
                        description: descMap.get(normDesc) || cleanDesc 
                    };
                }
            }
            return item;
        });

        if (orderChanged) {
            hasChanges = true;
            return { ...order, items: newItems };
        }
        return order;
    });

    if (hasChanges) {
        console.log("Sync: Converted custom items to valid stock items.");
        localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedOrders));
        if (isFirebaseActive) {
            await set(ref(db, KEYS.ORDERS), updatedOrders);
        }
        // After converting, we must check if these "new" standard items can be fulfilled
        const currentStock = await StorageService.getStock();
        await StorageService.processBackorders(currentStock);
    }
  },

  // --- BACKORDER LOGIC ---
  processBackorders: async (currentStock: StockItem[]) => {
    const allOrders = await StorageService.getOrders();
    
    // Helper to extract actual picked quantity from the warehouse logs (pickedItems)
    // This is safer than relying on item.quantityPicked which might be stale
    const getPickedQtyForSku = (order: Order, sku: string): number => {
        if (order.pickedItems && Array.isArray(order.pickedItems)) {
            const cleanSku = sku.trim();
            return order.pickedItems
                .filter((p: any) => (p.material || '').trim() === cleanSku)
                .reduce((sum: number, p: any) => sum + (Number(p.pickedQty) || 0), 0);
        }
        return 0;
    };

    // Find COMPLETED orders that have items not fully picked AND haven't been re-opened yet
    const candidates = allOrders.filter(o => 
        o.status === 'COMPLETED' && 
        o.items.some(i => {
             // Calculate truly missing
             const picked = getPickedQtyForSku(o, i.sku);
             // Only consider shortage if missing > 0 and not yet handled
             return picked < i.quantity && !i.backorderCreated && !i.isCustom;
        })
    );

    if (candidates.length === 0) return;

    const ordersToCreate: Order[] = [];
    const ordersToUpdate: Order[] = [];

    const stockMap = new Map<string, number>();
    currentStock.forEach(s => {
        const existing = stockMap.get(s.sku) || 0;
        stockMap.set(s.sku, existing + s.quantity);
    });

    for (const order of candidates) {
        const itemsToReopen: OrderLineItem[] = [];
        let hasUpdates = false;

        const updatedItems = order.items.map(item => {
            // STRICT CHECK: If fully picked, IGNORE completely.
            const picked = getPickedQtyForSku(order, item.sku);
            const missing = item.quantity - picked;

            // If missing is zero or negative, the item is satisfied. 
            // Do NOT include it in itemsToReopen.
            if (missing <= 0 || item.isCustom || item.backorderCreated) {
                return item;
            }

            // If we are here, there is a shortage. Check stock.
            const stockAvailable = stockMap.get(item.sku) || 0;
            
            if (stockAvailable > 0) {
                hasUpdates = true;
                const toFulfill = Math.min(missing, stockAvailable);
                
                // Create the partial item for the NEW order
                itemsToReopen.push({
                    ...item,
                    quantity: toFulfill, // Only the amount we can fulfill now
                    quantityPicked: 0, 
                    backorderCreated: false
                });

                stockMap.set(item.sku, stockAvailable - toFulfill);
                
                // Mark original item as having a backorder created. 
                return { ...item, backorderCreated: true };
            }
            return item;
        });

        // Only create order if we actually have items to fulfill now
        if (itemsToReopen.length > 0) {
            const reopenCount = (order.reopenCount || 0) + 1;
            const newTitle = `${order.title.substring(0, 15)}_re_${reopenCount}`;
            
            const newOrder: Order = {
                id: Math.random().toString(36).substr(2, 9),
                displayId: order.displayId, 
                title: newTitle,
                creator: 'Sistema (Auto)',
                status: 'OPEN',
                dateCreated: new Date().toISOString(),
                dueDate: order.dueDate,
                items: itemsToReopen,
                reopenCount: reopenCount,
                originalOrderId: order.id,
                changeLog: [{
                    date: new Date().toISOString(),
                    actor: 'Sistema',
                    details: 'Pedido reaberto automaticamente após reposição de stock.'
                }]
            };

            ordersToCreate.push(newOrder);
            ordersToUpdate.push({ ...order, items: updatedItems });
        }
    }

    if (ordersToCreate.length > 0) {
        for (const upd of ordersToUpdate) {
            await StorageService.updateOrder(upd);
        }
        await StorageService.addOrders(ordersToCreate);
        console.log(`Auto-reopened ${ordersToCreate.length} orders.`);
    }
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
        } else {
            data = [];
        }
        localStorage.setItem(KEYS.MASTER, JSON.stringify(data));
      } catch (error: any) {
        console.warn("Firebase Falhou (Leitura Master):", error.message);
      }
    }
    // Sort before returning by SKU
    return data.sort(sortBySku);
  },

  replaceMasterMaterials: async (newMaster: MasterMaterial[]) => {
    localStorage.setItem(KEYS.MASTER, JSON.stringify(newMaster));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.MASTER), newMaster);
      } catch (error: any) {
        console.error("Firebase Falhou (Escrita Master):", error.code || error.message);
      }
    }
    
    // Trigger Sync when master list is updated
    await StorageService.syncCustomMaterials(newMaster);
    
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