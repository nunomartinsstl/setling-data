import { Order, StockItem, User, UserRole, AppSettings, MasterMaterial, OrderLineItem, Invite } from '../types';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, child, DataSnapshot, query, orderByChild, equalTo, limitToFirst, remove, update } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, deleteUser } from "firebase/auth";

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
let auth: any;
let isFirebaseActive = false;

// ADMIN HASHES (SHA-256)
// Accepted: "admin97" OR "admin"
const VALID_ADMIN_HASHES = [
    "e48be3eb581c3224ae15fcfb5c5ff67f443cf918f51f924677eb51fc7b627493", // admin97
    "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"  // admin
];

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "API_KEY_HERE") {
    const app = initializeApp(firebaseConfig);
    // FIX: Explicitly pass databaseURL to handle custom regions (Europe West 1)
    db = getDatabase(app, firebaseConfig.databaseURL);
    auth = getAuth(app);
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
  INVITES: 'nexus_invites',
  SETTINGS: 'nexus_settings'
};

// Helper: SHA-256 Hash
const hashString = async (text: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Helper to convert Firebase Object/Array response to Array always
const toArray = <T>(data: any): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Object.values(data) as T[];
};

// Helper: Normalize string (remove accents/diacritics)
const normalizeString = (str: string): string => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

const sanitizeEmail = (email: string) => {
    return email.replace(/\./g, '_').toLowerCase();
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

// Helper: Sort function by SKU (Material) - Numeric aware
const sortBySku = (a: any, b: any) => {
    const skuA = (a.sku || '').toString();
    const skuB = (b.sku || '').toString();
    return skuA.localeCompare(skuB, undefined, { numeric: true, sensitivity: 'base' });
};

// Force Offline Mode Helper
const activateOfflineMode = () => {
    console.warn("StorageService: Switching to OFFLINE mode due to auth error.");
    isFirebaseActive = false;
};

export const StorageService = {
  isConnected: () => isFirebaseActive,

  debugGetHash: async (text: string) => {
      return await hashString(text);
  },

  // --- AUTHENTICATION & INVITES ---
  
  createInvite: async (email: string, role: UserRole) => {
      if (!isFirebaseActive) throw new Error("Recurso disponível apenas online.");
      
      const cleanEmail = sanitizeEmail(email);
      const inviteRef = ref(db, `${KEYS.INVITES}/${cleanEmail}`);
      
      // Check if user exists in DB
      const usersRef = ref(db, KEYS.USERS);
      const q = query(usersRef, orderByChild('email'), equalTo(email));
      const userSnap = await get(q);

      if (userSnap.exists()) {
          throw new Error("Este email já está associado a um utilizador ativo.");
      }

      // Overwrite invite even if used, because user is not active in DB
      const inviteData: Invite = {
          email: email.toLowerCase(),
          role,
          used: false,
          dateCreated: new Date().toISOString()
      };

      await set(inviteRef, inviteData);
      return inviteData;
  },

  validateAdminCode: async (inputCode: string): Promise<boolean> => {
      const inputHash = await hashString(inputCode);
      // Also allow plain 'admin' for local dev convenience if hashes fail
      if (inputCode === 'admin' || inputCode === 'admin97') return true;
      return VALID_ADMIN_HASHES.includes(inputHash);
  },

  registerUser: async (email: string, password: string, firstName: string, lastName: string, role: UserRole, adminCode?: string, companyId?: string): Promise<User> => {
    // 1. Pre-Check Admin Code (Local Check)
    if (role === UserRole.ADMIN) {
        if (!adminCode) throw new Error("Código de acesso necessário para Admin.");
        const isValid = await StorageService.validateAdminCode(adminCode);
        if (!isValid) throw new Error("Código de acesso inválido.");
    } else {
        if (!companyId) throw new Error("É obrigatório selecionar uma empresa.");
    }

    if (!isFirebaseActive) {
        // Already offline, create local user
        return {
            uid: 'local_user_' + Date.now(),
            username: `${firstName}-${lastName}`,
            email: email,
            firstName,
            lastName,
            role,
            companyId: role !== UserRole.ADMIN ? companyId : undefined
        };
    }

    // 2. Try Firebase Auth
    let userCredential;
    let reusedAuth = false;

    try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
        // Check for existing auth user but missing DB profile
        if (e.code === 'auth/email-already-in-use') {
            try {
                // Try to sign in to verify ownership
                userCredential = await signInWithEmailAndPassword(auth, email, password);
                
                // Check if profile exists
                const userRef = ref(db, `${KEYS.USERS}/${userCredential.user.uid}`);
                const snap = await get(userRef);
                
                if (snap.exists()) {
                    throw new Error("Este email já está registado e ativo.");
                }
                
                // If we get here, Auth exists, Password matches, but DB profile is gone.
                // Allow recreation (Reuse Auth).
                reusedAuth = true;
                console.log("Reusing existing Auth credentials for deleted user profile.");

            } catch (innerE: any) {
                // If sign in fails, throw original error or specific error
                if (innerE.message === "Este email já está registado e ativo.") throw innerE;
                // If wrong password or other login error, assume email is taken
                throw new Error("Este email já está registado.");
            }
        } else {
            console.error("Register Auth Error:", e.code, e.message);
            
            // --- FALLBACK FOR CONFIGURATION ERROR ---
            if (e.code === 'auth/configuration-not-found' || e.code === 'auth/operation-not-allowed') {
                activateOfflineMode();
                console.log("Fallback: Creating Local Admin User due to Firebase Config Error.");
                return {
                    uid: 'offline_admin',
                    username: `${firstName}-${lastName}`,
                    email: email,
                    firstName,
                    lastName,
                    role: role // Keep requested role
                };
            }
            // ----------------------------------------
    
            if (e.code === 'auth/weak-password') throw new Error("Senha muito fraca (min 6 caracteres).");
            throw e;
        }
    }

    const firebaseUser = userCredential.user;

    // 3. Database Operations
    try {
        if (role !== UserRole.ADMIN) {
            const cleanEmail = sanitizeEmail(email);
            const inviteRef = ref(db, `${KEYS.INVITES}/${cleanEmail}`);
            const inviteSnap = await get(inviteRef);

            if (!inviteSnap.exists()) {
                throw new Error("Este email não foi convidado. Peça ao administrador para o adicionar.");
            }
            const inviteData = inviteSnap.val();
            
            // If reusing auth, we assume the invite check was done during invite creation (createInvite resets used status)
            // But we should double check:
            if (inviteData.used && !reusedAuth) { 
                 // If reusing auth, we permit used invite IF we just verified the DB profile was missing?
                 // Actually, createInvite sets used=false. So if it's true, it might be stolen?
                 // Let's enforce used=false unless we handle specific logic.
                 throw new Error("Este convite já foi utilizado.");
            }
            
            if (role !== inviteData.role) {
                 role = inviteData.role; 
            }
        }

        const normFirst = normalizeString(firstName);
        const normLast = normalizeString(lastName);
        let baseUsername = `${normFirst}-${normLast}`;
        let finalUsername = baseUsername;
        let counter = 2;

        const usersRef = ref(db, KEYS.USERS);
        
        try {
            while(counter < 20) {
                let exists = false;
                const q = query(usersRef, orderByChild('username'), equalTo(finalUsername));
                const snapshot = await get(q);
                exists = snapshot.exists();

                if (exists) {
                    finalUsername = `${baseUsername}${counter}`;
                    counter++;
                } else {
                    break;
                }
            }
        } catch (err: any) {
            finalUsername = `${baseUsername}-${Math.floor(Math.random() * 1000)}`;
        }

        const newUserProfile: User = {
            uid: firebaseUser.uid,
            email: email,
            username: finalUsername,
            firstName,
            lastName,
            role,
            companyId: role !== UserRole.ADMIN ? companyId : undefined
        };

        await set(ref(db, `${KEYS.USERS}/${firebaseUser.uid}`), newUserProfile);

        if (role !== UserRole.ADMIN) {
            const cleanEmail = sanitizeEmail(email);
            await set(ref(db, `${KEYS.INVITES}/${cleanEmail}/used`), true);
        }

        return newUserProfile;

    } catch (err: any) {
        console.error("Registration failed during DB phase.", err);
        if (!reusedAuth) {
            // Only delete user if we just created it. If we reused it, don't delete auth!
            await deleteUser(firebaseUser).catch(e => console.error("Failed to rollback user", e));
        }
        throw err;
    }
  },

  authenticateUser: async (identifier: string, password: string): Promise<User> => {
    // --- OFFLINE/FALLBACK LOGIN ---
    if (!isFirebaseActive || identifier === 'admin') {
        if ((identifier === 'admin' && (password === 'admin' || password === 'admin97'))) {
             if (isFirebaseActive) activateOfflineMode();
             return {
                 uid: 'offline_admin',
                 username: 'Admin Local',
                 email: 'admin@local',
                 firstName: 'Admin',
                 lastName: 'Local',
                 role: UserRole.ADMIN
             };
        }
        if (!isFirebaseActive) throw new Error("Offline. Use: admin / admin");
    }

    let targetEmail = identifier.trim();

    // 1. Resolve Username
    // Only try to resolve if it is NOT an email
    if (!targetEmail.includes('@')) {
        const usersRef = ref(db, KEYS.USERS);
        let userFound: User | null = null;
        try {
            const q = query(usersRef, orderByChild('username'), equalTo(targetEmail));
            const snapshot = await get(q);
            if (snapshot.exists()) {
                userFound = Object.values(snapshot.val())[0] as User;
            }
        } catch (err: any) {
             console.warn("Username lookup failed (likely permission issue):", err);
        }
        
        if (userFound && userFound.email) {
            targetEmail = userFound.email;
        } else {
             throw new Error("Nome de utilizador não encontrado ou não permitido. Por favor, entre com o seu Email.");
        }
    }

    // 2. Auth Login
    let userCredential;
    try {
        userCredential = await signInWithEmailAndPassword(auth, targetEmail, password);
    } catch (e: any) {
        console.error("Login Auth Error:", e.code, e.message);
        
        if (e.code === 'auth/configuration-not-found' || e.code === 'auth/operation-not-allowed') {
            activateOfflineMode();
            throw new Error("Erro Firebase. Tente entrar com: admin / admin (Modo Offline)");
        }

        if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') {
             throw new Error("Email ou senha incorretos.");
        }
        if (e.code === 'auth/invalid-email') {
             throw new Error("Formato de email inválido.");
        }
        throw e;
    }
    
    const firebaseUser = userCredential.user;
    const userRef = ref(db, `${KEYS.USERS}/${firebaseUser.uid}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        throw new Error("Perfil de utilizador não encontrado.");
    }

    return snapshot.val() as User;
  },

  logout: async () => {
      if (isFirebaseActive) {
          await signOut(auth);
      }
  },

  getUsers: async (): Promise<User[]> => {
      let users: User[] = [];
      if (isFirebaseActive) {
          try {
              const snapshot = await get(ref(db, KEYS.USERS));
              if(snapshot.exists()) {
                  const data = snapshot.val();
                  users = Object.values(data);
              }
          } catch(e) {}
      } 
      return users;
  },

  updateUserRole: async (uid: string, newRole: UserRole) => {
      if (!isFirebaseActive) throw new Error("Disponível apenas online.");
      try {
          await update(ref(db, `${KEYS.USERS}/${uid}`), { role: newRole });
      } catch(e: any) {
          throw new Error("Erro ao atualizar função: " + e.message);
      }
  },

  deleteUserProfile: async (uid: string) => {
      if (!isFirebaseActive) throw new Error("Disponível apenas online.");
      try {
          await remove(ref(db, `${KEYS.USERS}/${uid}`));
      } catch(e: any) {
          throw new Error("Erro ao excluir utilizador: " + e.message);
      }
  },

  // --- DANGER ZONE ---
  resetAllUsers: async (currentAdminUid: string) => {
      if (!isFirebaseActive) throw new Error("Disponível apenas online.");
      
      try {
          // 1. Get all users
          const usersSnap = await get(ref(db, KEYS.USERS));
          if (!usersSnap.exists()) return; // Nothing to reset
          
          const allUsers = usersSnap.val();
          const updates: Record<string, any> = {};

          // 2. Prepare deletes for everyone except current admin
          Object.keys(allUsers).forEach(key => {
              if (key !== currentAdminUid) {
                  updates[`${KEYS.USERS}/${key}`] = null;
              }
          });

          // 3. Clear all invites as well (clean slate)
          updates[KEYS.INVITES] = null;

          // 4. Execute atomic update
          if (Object.keys(updates).length > 0) {
              await update(ref(db), updates);
          }

      } catch (e: any) {
          console.error("Reset All Users Error:", e);
          throw new Error("Erro ao resetar utilizadores: " + e.message);
      }
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

    const targetOrder = { 
        ...updatedOrders[targetIndex], 
        status: newStatus,
        completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : undefined 
    };
    updatedOrders[targetIndex] = targetOrder;

    if (newStatus === 'COMPLETED' && targetOrder.originalOrderId) {
        const parentIndex = updatedOrders.findIndex(o => o.id === targetOrder.originalOrderId);
        if (parentIndex !== -1) {
            const parentOrder = { ...updatedOrders[parentIndex] };
            const childItems = targetOrder.items;
            
            const parentItems = parentOrder.items.map(pItem => {
                const matchedChildItem = childItems.find(cItem => cItem.sku === pItem.sku);
                if (matchedChildItem) {
                    return {
                        ...pItem,
                        fulfilledInOrderId: targetOrder.displayId
                    };
                }
                return pItem;
            });
            parentOrder.items = parentItems;
            updatedOrders[parentIndex] = parentOrder;
        }
    }

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
    await StorageService.processBackorders(newStock);
    return newStock;
  },

  syncCustomMaterials: async (masterList: MasterMaterial[]) => {
    if (!masterList || masterList.length === 0) return;
    const allOrders = await StorageService.getOrders();
    let hasChanges = false;
    
    const masterMap = new Map<string, string>();
    const descMap = new Map<string, string>(); 

    masterList.forEach(m => {
        const norm = m.description.toLowerCase().trim();
        masterMap.set(norm, m.sku);
        descMap.set(norm, m.description);
    });

    const updatedOrders = allOrders.map(order => {
        let orderChanged = false;
        const newItems = order.items.map(item => {
            if (item.isCustom) {
                const cleanDesc = item.description.replace('(Novo) ', '');
                const normDesc = cleanDesc.toLowerCase().trim();
                
                if (masterMap.has(normDesc)) {
                    orderChanged = true;
                    return {
                        ...item,
                        sku: masterMap.get(normDesc)!,
                        isCustom: false,
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
        const currentStock = await StorageService.getStock();
        await StorageService.processBackorders(currentStock);
    }
  },

  processBackorders: async (currentStock: StockItem[]) => {
    const allOrders = await StorageService.getOrders();
    const getPickedQtyForSku = (order: Order, sku: string): number => {
        const rawPicked = order.pickedItems;
        const pickedList: any[] = (!rawPicked) ? [] : (Array.isArray(rawPicked) ? rawPicked : Object.values(rawPicked));
        
        if (pickedList.length > 0) {
            const cleanSku = sku.trim().toLowerCase();
            return pickedList
                .filter((p: any) => (p.material || '').trim().toLowerCase() === cleanSku)
                .reduce((sum: number, p: any) => sum + (Number(p.pickedQty) || 0), 0);
        }
        return 0;
    };

    const candidates = allOrders.filter(o => 
        o.status === 'COMPLETED' && 
        o.items.some(i => {
             const picked = getPickedQtyForSku(o, i.sku);
             return picked < i.quantity && !i.backorderCreated && !i.isCustom && !i.fulfilledInOrderId;
        })
    );

    if (candidates.length === 0) return;

    const ordersToCreate: Order[] = [];
    const ordersToUpdate: Order[] = [];
    const stockMap = new Map<string, number>();
    currentStock.forEach(s => {
        const existing = stockMap.get(s.sku) || 0;
        stockMap.set(s.sku, existing + Number(s.quantity));
    });

    for (const order of candidates) {
        const itemsToReopen: OrderLineItem[] = [];
        let hasUpdates = false;

        const updatedItems = order.items.map(item => {
            const picked = getPickedQtyForSku(order, item.sku);
            const missing = item.quantity - picked;

            if (missing <= 0 || item.isCustom || item.backorderCreated || item.fulfilledInOrderId) {
                return item;
            }

            const stockAvailable = stockMap.get(item.sku) || 0;
            if (stockAvailable > 0) {
                hasUpdates = true;
                const toFulfill = Math.min(missing, stockAvailable);
                itemsToReopen.push({
                    ...item,
                    quantity: toFulfill, 
                    quantityPicked: 0, 
                    backorderCreated: false
                });
                stockMap.set(item.sku, stockAvailable - toFulfill);
                return { ...item, backorderCreated: true };
            }
            return item;
        });

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
            ordersToUpdate.push({ ...order, items: updatedItems, reopenCount: reopenCount });
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
    return data.sort(sortBySku);
  },

  mergeMasterMaterials: async (newMaterials: MasterMaterial[]) => {
    const currentMaster = await StorageService.getMasterMaterials();
    const currentSkuSet = new Set(currentMaster.map(m => m.sku));
    const addedMaterials = newMaterials.filter(m => !currentSkuSet.has(m.sku));
    
    if (addedMaterials.length === 0) {
        return currentMaster;
    }
    const merged = [...currentMaster, ...addedMaterials].sort(sortBySku);
    localStorage.setItem(KEYS.MASTER, JSON.stringify(merged));

    if (isFirebaseActive) {
      try {
        await set(ref(db, KEYS.MASTER), merged);
      } catch (error: any) {
        console.error("Firebase Falhou (Escrita Master):", error.code || error.message);
      }
    }
    await StorageService.syncCustomMaterials(merged);
    return merged;
  },

  getSettings: async (): Promise<AppSettings> => {
    let settings: AppSettings = { emailRecipients: [], companies: [] };
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
    if(!settings.companies) settings.companies = [];
    return settings;
  },

  saveSettings: async (settings: AppSettings) => {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    if (isFirebaseActive) {
        await set(ref(db, KEYS.SETTINGS), settings);
    }
  }
};