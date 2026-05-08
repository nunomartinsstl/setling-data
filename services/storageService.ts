
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';
import Fuse from 'fuse.js';
import { User, UserRole, Order, StockItem, MasterMaterial, AppSettings, PurchaseOrder, Company, OrderLineItem, PickedItem, Receipt, RolePermissions, Invite } from '../types';

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

let db: firebase.database.Database | undefined;
let auth: firebase.auth.Auth | undefined;
let isFirebaseActive = false;

if (hasConfig) {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.database();
        auth = firebase.auth();
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
  USERNAMES: 'nexus_public_usernames', // New public mapping node
  ORDERS: 'nexus_orders',
  STOCK: 'nexus_stock',
  MASTER_MATERIALS: 'nexus_master',
  SETTINGS: 'nexus_settings',
  PURCHASE_ORDERS: 'nexus_purchase_orders', 
  INVITES: 'nexus_invites',
  RECEIPTS: 'nexus_receipts',
  TRANSFERS: 'nexus_transfers'
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

// Re-export for compatibility
export const MATERIAL_CATEGORIES = DEFAULT_CATEGORIES;

export const EMPTY_PERMISSIONS: RolePermissions = {
    canCreateOrder: false, canViewOpenOrders: false, canViewOwnOpenOrders: false, canViewFinishedOrders: false, canViewOwnFinishedOrders: false, canCreatePurchaseOrder: false, canViewStock: false, canManageStock: false, canViewReceipts: false, canViewTransfers: false, canViewShortages: false, canSearch: false, canManageUsers: false, canManageSettings: false
};

// DEFAULT PERMISSIONS (Fallback if not in DB)
export const DEFAULT_PERMISSIONS: Record<UserRole, RolePermissions> = {
    [UserRole.ADMIN]: {
        canCreateOrder: true, canViewOpenOrders: true, canViewOwnOpenOrders: true, canViewFinishedOrders: true, canViewOwnFinishedOrders: true, canCreatePurchaseOrder: true, canViewStock: true, canManageStock: true, canViewReceipts: true, canViewTransfers: true, canViewShortages: true, canSearch: true, canManageUsers: true, canManageSettings: true
    },
    [UserRole.MANAGEMENT]: {
        canCreateOrder: true, canViewOpenOrders: true, canViewOwnOpenOrders: true, canViewFinishedOrders: true, canViewOwnFinishedOrders: true, canCreatePurchaseOrder: true, canViewStock: true, canManageStock: false, canViewReceipts: true, canViewTransfers: true, canViewShortages: true, canSearch: true, canManageUsers: false, canManageSettings: false
    },
    [UserRole.WAREHOUSE]: {
        canCreateOrder: true, canViewOpenOrders: true, canViewOwnOpenOrders: true, canViewFinishedOrders: true, canViewOwnFinishedOrders: true, canCreatePurchaseOrder: true, canViewStock: true, canManageStock: true, canViewReceipts: true, canViewTransfers: true, canViewShortages: true, canSearch: true, canManageUsers: false, canManageSettings: false
    },
    [UserRole.TECHNICAL]: {
        // UPDATED: Now includes canCreatePurchaseOrder: true
        canCreateOrder: true, canViewOpenOrders: false, canViewOwnOpenOrders: true, canViewFinishedOrders: false, canViewOwnFinishedOrders: true, canCreatePurchaseOrder: true, canViewStock: true, canManageStock: false, canViewReceipts: false, canViewTransfers: false, canViewShortages: false, canSearch: true, canManageUsers: false, canManageSettings: false
    },
    [UserRole.VIEWER]: {
        canCreateOrder: false, canViewOpenOrders: false, canViewOwnOpenOrders: false, canViewFinishedOrders: false, canViewOwnFinishedOrders: false, canCreatePurchaseOrder: false, canViewStock: true, canManageStock: false, canViewReceipts: false, canViewTransfers: false, canViewShortages: false, canSearch: false, canManageUsers: false, canManageSettings: false
    }
};

export const DEFAULT_HIERARCHY: Record<string, number> = {
    [UserRole.ADMIN]: 1,
    [UserRole.MANAGEMENT]: 2,
    [UserRole.WAREHOUSE]: 3,
    [UserRole.TECHNICAL]: 4,
    [UserRole.VIEWER]: 5
};

// Helper to normalize string for matching descriptions (keep this for fuzzy description search)
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

    let dbUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      // Clean up previous DB listener if it exists
      if (dbUnsubscribe) {
          dbUnsubscribe();
          dbUnsubscribe = null;
      }

      if (firebaseUser && db) {
        const userRef = db.ref(`${KEYS.USERS}/${firebaseUser.uid}`);
        
        const listener = userRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val() as User);
            } else {
                // Return a temporary VIEWER user while the profile is being created
                callback({
                    uid: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    username: firebaseUser.displayName || 'User',
                    role: UserRole.VIEWER
                });
            }
        }, (error) => {
            console.error("Error fetching user profile:", error);
            callback(null);
        });

        dbUnsubscribe = () => userRef.off('value', listener);
      } else {
        callback(null);
      }
    });

    return () => {
        authUnsubscribe();
        if (dbUnsubscribe) dbUnsubscribe();
    };
  },

  logout: async () => {
    if (auth) await auth.signOut();
  },

  authenticateUser: async (identifier: string, password: string) => {
    if (!auth || !db) throw new Error("Serviço offline. Verifique a configuração.");
    
    let email = identifier;
    
    // If not an email, try to look up as username
    if (!identifier.includes('@')) {
        const usernameKey = normalizeText(identifier);
        const usernameSnap = await db.ref(`${KEYS.USERNAMES}/${usernameKey}`).get();
        
        if (usernameSnap.exists()) {
            email = usernameSnap.val();
        } else {
            throw new Error("Utilizador ou email não encontrado.");
        }
    }

    const cred = await auth.signInWithEmailAndPassword(email, password);
    const snapshot = await db.ref(`${KEYS.USERS}/${cred.user!.uid}`).get();
    return snapshot.val() as User;
  },

  sendPasswordResetEmail: async (identifier: string) => {
    if (!auth || !db) throw new Error("Serviço offline.");
    if (!identifier) throw new Error("Por favor, insira um utilizador ou email.");
    
    let email = identifier;
    
    // If not an email, try to look up as username
    if (!identifier.includes('@')) {
        const usernameKey = normalizeText(identifier);
        const usernameSnap = await db.ref(`${KEYS.USERNAMES}/${usernameKey}`).get();
        
        if (usernameSnap.exists()) {
            email = usernameSnap.val();
        } else {
            throw new Error("Utilizador não encontrado.");
        }
    }

    await auth.sendPasswordResetEmail(email);
  },

  completeRegistration: async (email: string, code: string, password: string) => {
      if (!auth || !db) throw new Error("Serviço offline.");

      // 1. Verify the code and email in INVITES
      // Search by email to find any invite, even if created with a random key
      const inviteSnap = await db.ref(KEYS.INVITES).orderByChild('email').equalTo(email).get();
      
      if (!inviteSnap.exists()) {
          throw new Error("Não foi encontrado nenhum convite para este email.");
      }

      const invites = inviteSnap.val();
      const inviteKeys = Object.keys(invites);
      
      // Find the specific invite that matches the code
      let matchingInviteKey = '';
      let inviteData: Invite | null = null;
      
      for (const key of inviteKeys) {
          if (invites[key].code === code) {
              matchingInviteKey = key;
              inviteData = invites[key];
              break;
          }
      }
      
      if (!inviteData) {
          throw new Error("Código de acesso inválido para este email.");
      }

      let uid = '';
      let userCredential;

      // 2. Create Auth User
      try {
          userCredential = await auth.createUserWithEmailAndPassword(email, password);
          uid = userCredential.user!.uid;
      } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
              throw new Error("Este email já está registado. Se esqueceu a senha, use a opção de recuperar senha.");
          }
          throw err;
      }

      // 3. Create DB User Profile
      try {
          const newUser: User = {
              uid,
              email,
              username: inviteData.username || '',
              firstName: inviteData.firstName || '',
              lastName: inviteData.lastName || '',
              role: inviteData.role || UserRole.WAREHOUSE,
              companyId: inviteData.companyId || '',
              supervisorId: inviteData.supervisorId || ''
          };

          await db.ref(`${KEYS.USERS}/${uid}`).set(newUser);
          
          // Save username mapping
          if (newUser.username) {
              const usernameKey = normalizeText(newUser.username);
              await db.ref(`${KEYS.USERNAMES}/${usernameKey}`).set(email);
          }

          // 4. Consume Invite (Delete it)
          // Delete ALL invites for this email to clean up any duplicates
          const cleanupUpdates: any = {};
          inviteKeys.forEach(key => {
              cleanupUpdates[`${KEYS.INVITES}/${key}`] = null;
          });
          await db.ref().update(cleanupUpdates);

          return newUser;

      } catch (dbErr) {
          // ROLLBACK: Delete the Auth user if DB creation fails
          if (userCredential && userCredential.user) {
              await userCredential.user.delete();
          }
          throw dbErr;
      }
  },

  registerUser: async (email: string, password: string, firstName: string, lastName: string, role: UserRole, adminCode: string, companyId: string) => {
      if (!auth || !db) throw new Error("Serviço offline.");
      
      let uid = '';
      let userCredential;
      let isOrphan = false;

      try {
          // 1. Attempt standard registration (Creates Auth User)
          userCredential = await auth.createUserWithEmailAndPassword(email, password);
          uid = userCredential.user!.uid;
      } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
              try {
                  const loginCred = await auth.signInWithEmailAndPassword(email, password);
                  const snapshot = await db.ref(`${KEYS.USERS}/${loginCred.user!.uid}`).get();
                  
                  if (!snapshot.exists()) {
                      console.log("Recuperando utilizador órfão (Auth sem DB).");
                      uid = loginCred.user!.uid;
                      userCredential = loginCred;
                      isOrphan = true;
                  } else {
                      throw new Error("Este email já está em uso.");
                  }
              } catch (loginErr: any) {
                  if (loginErr.message === "Este email já está em uso.") throw loginErr;
                  throw new Error("Email já registado. Tente usar a SENHA ORIGINAL para recuperar a conta ou peça ao Admin para apagar no Console.");
              }
          } else {
              throw err;
          }
      }

      // --- SECURITY CHECKS (Post-Auth, Pre-DB) ---
      try {
          // A. Validate Admin Code
          if (role === UserRole.ADMIN) {
              const settingsSnap = await db.ref(KEYS.SETTINGS).get();
              const settings = settingsSnap.val() || {};
              const validCode = settings.adminAccessCode; 
              
              if (!validCode) {
                   const usersSnap = await db.ref(KEYS.USERS).limitToFirst(1).get();
                   if (usersSnap.exists()) {
                       throw new Error("Erro de configuração: Código Mestre não definido no sistema.");
                   }
              } else if (adminCode !== validCode) {
                  throw new Error("Código de Acesso Mestre incorreto.");
              }
          } 
          // B. Validate Invite (Non-Admin)
          else {
              const inviteSnap = await db.ref(KEYS.INVITES).orderByChild('email').equalTo(email).get();
              if (!inviteSnap.exists()) {
                  throw new Error("Este email não possui um convite válido. Peça ao Administrador para enviar um novo convite.");
              }
              
              const inviteKey = Object.keys(inviteSnap.val())[0];
              const inviteData = inviteSnap.val()[inviteKey];
              
              // Consume Invite (Delete it so it can't be reused)
              await db.ref(`${KEYS.INVITES}/${inviteKey}`).remove();
              
              // Force role from invite to prevent client-side tampering
              if (inviteData.role) {
                  role = inviteData.role; 
              }
          }
      } catch (securityErr) {
          // ROLLBACK: Delete the Auth user if security checks fail
          if (userCredential && userCredential.user) {
              await userCredential.user.delete();
          }
          throw securityErr;
      }

      // --- SMART RECOVERY: Check if this email existed in DB (Auth deleted, DB remained) ---
      // We scan for the email to see if we can adopt an old profile
      let oldProfile: User | null = null;
      let oldUid: string | null = null;

      try {
          // Try optimized query first
          const querySnap = await db.ref(KEYS.USERS).orderByChild('email').equalTo(email).get();
          if (querySnap.exists()) {
              const val = querySnap.val();
              oldUid = Object.keys(val)[0];
              oldProfile = val[oldUid];
          } else {
              // Fallback: Client-side filter (if index missing)
              const allSnap = await db.ref(KEYS.USERS).get();
              if (allSnap.exists()) {
                  const all = allSnap.val();
                  const foundKey = Object.keys(all).find(k => all[k].email === email);
                  if (foundKey) {
                      oldUid = foundKey;
                      oldProfile = all[foundKey];
                  }
              }
          }
      } catch (e) {
          console.warn("Error checking for old profile:", e);
      }

      let newUser: User;

      if (oldProfile && oldUid) {
          console.log(`[RECOVERY] Adopting old profile from ${oldUid} to ${uid}`);
          // ADOPT OLD PROFILE
          newUser = {
              ...oldProfile,
              uid: uid, // NEW UID
              firstName: firstName, // Update names if user changed them
              lastName: lastName,
              // Keep role, companyId, username, supervisorId from old profile
          };

          // 1. Save to New Location
          await db.ref(`${KEYS.USERS}/${uid}`).set(newUser);
          
          // 2. Delete Old Location (Cleanup)
          if (oldUid !== uid) {
              await db.ref(`${KEYS.USERS}/${oldUid}`).remove();
          }

      } else {
          // STANDARD NEW USER
          const username = `${firstName}-${lastName}`.toLowerCase();
          newUser = {
              uid,
              email,
              username,
              firstName,
              lastName,
              role,
              companyId
          };
          try {
              await db.ref(`${KEYS.USERS}/${uid}`).set(newUser);
          } catch (dbErr) {
              console.error("Failed to save user to DB, rolling back Auth", dbErr);
              if (userCredential && userCredential.user) {
                  await userCredential.user.delete();
              }
              // Restore invite if it was consumed
              if (role !== UserRole.ADMIN) {
                  try {
                      await db.ref(KEYS.INVITES).push().set({ email, role, createdAt: new Date().toISOString() });
                  } catch (restoreErr) {
                      console.error("Failed to restore invite", restoreErr);
                  }
              }
              throw new Error("Erro ao guardar dados do utilizador. O registo foi cancelado.");
          }
      }

      // 3. Update Public Mapping (Username -> Email)
      try {
          const usernameKey = normalizeText(newUser.username);
          if (usernameKey) {
              await db.ref(`${KEYS.USERNAMES}/${usernameKey}`).set(email);
          }
      } catch (e) {
          console.warn("Failed to save public username mapping", e);
      }

      if (userCredential && userCredential.user) {
          await userCredential.user.updateProfile({ displayName: newUser.username });
      }
      return newUser;
  },

  getUsers: async (): Promise<User[]> => {
      if (!db) return [];
      const snapshot = await db.ref(KEYS.USERS).get();
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },

  getSettings: async (): Promise<AppSettings> => {
      if (!db) return { emailRecipients: [] };
      const snapshot = await db.ref(KEYS.SETTINGS).get();
      const val = snapshot.val() || { emailRecipients: [] };
      
      // MERGE DEFAULTS: Ensure permissions object exists and has all keys
      val.autoDecrementStock = true;
      
      if (!val.permissions) {
          val.permissions = DEFAULT_PERMISSIONS;
      } else {
          // Merge deep to ensure new keys are added to existing config, but don't re-add deleted roles
          Object.keys(val.permissions).forEach((role) => {
              const r = role as UserRole;
              if (DEFAULT_PERMISSIONS[r]) {
                  // Ensure all keys exist within role
                  val.permissions[r] = { ...DEFAULT_PERMISSIONS[r], ...val.permissions[r] };
              } else {
                  // For custom roles, ensure they have all keys from a base role (like VIEWER)
                  val.permissions[r] = { ...EMPTY_PERMISSIONS, ...val.permissions[r] };
              }
          });
          
          // Ensure ADMIN always exists
          if (!val.permissions[UserRole.ADMIN]) {
              val.permissions[UserRole.ADMIN] = DEFAULT_PERMISSIONS[UserRole.ADMIN];
          }
      }

      if (!val.roleHierarchy) {
          val.roleHierarchy = DEFAULT_HIERARCHY;
      } else {
          // Ensure all current roles have a hierarchy level
          Object.keys(val.permissions).forEach(role => {
              if (val.roleHierarchy[role] === undefined) {
                  val.roleHierarchy[role] = DEFAULT_HIERARCHY[role] || 10; // Default to 10 for custom roles
              }
          });
      }

      return val;
  },

  getCompanies: async (): Promise<Company[]> => {
      if (!db) return [];
      try {
          const snapshot = await db.ref(`${KEYS.SETTINGS}/companies`).get();
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
      try {
          // Remove undefined values which cause Firebase errors
          const sanitizedSettings = JSON.parse(JSON.stringify(settings));
          await db.ref(KEYS.SETTINGS).set(sanitizedSettings);
      } catch (e) {
          console.error("Error saving settings to Firebase:", e, "Settings object:", settings);
          throw e;
      }
  },

  getStock: async (): Promise<StockItem[]> => {
      if (!db) return [];
      const snapshot = await db.ref(KEYS.STOCK).get();
      if (!snapshot.exists()) return [];
      // If it's an object (sparse array), Object.values fixes it. If array, it's fine.
      return Object.values(snapshot.val());
  },
  
  replaceStock: async (newStock: StockItem[]) => {
      if (!db) return;
      await db.ref(KEYS.STOCK).set(newStock);
  },

  decrementStock: async (pickedItems: PickedItem[]): Promise<{ success: boolean; details: string[] }> => {
      // FORCE ARRAY: Firebase might return { "0": {...}, "1": {...} } as an object
      const itemsToProcess = toArray(pickedItems);
      
      console.log("[STOCK-DEBUG] Starting decrement for items:", itemsToProcess);

      if (!db || !itemsToProcess || itemsToProcess.length === 0) {
          console.warn("[STOCK-DEBUG] Abort: No items or no DB.");
          return { success: false, details: ["Nenhum item para processar."] };
      }

      try {
          const stockRef = db.ref(KEYS.STOCK);
          const logs: string[] = [];
          
          const transactionResult = await stockRef.transaction((currentData) => {
              if (!currentData) {
                  console.warn("[STOCK-DEBUG] Transaction found NO stock data in DB.");
                  return currentData;
              }

              // Iterate through items picked by the warehouse app
              itemsToProcess.forEach((picked: any, idx: number) => {
                  // Ensure we are working with strings, but NO trimming/replacing
                  const pickedSku = String(picked.material || ''); 
                  const pickedBin = String(picked.bin || '');
                  const qtyToDeduct = Number(picked.pickedQty);

                  console.log(`[STOCK-DEBUG] Item #${idx} -> SKU: '${pickedSku}', BIN: '${pickedBin}', QTY: ${qtyToDeduct}`);

                  if (qtyToDeduct > 0 && pickedSku) {
                      let matched = false;
                      // We must iterate the stock DB structure
                      for (const key in currentData) {
                          const stockItem = currentData[key];
                          if (!stockItem) continue;

                          const stockSku = String(stockItem.sku || '');
                          const stockBatch = String(stockItem.batch || '');

                          // EXACT MATCH REQUIRED
                          const isSkuMatch = stockSku === pickedSku;
                          // If picked bin is empty/undefined, we require logic to handle it.
                          // Here we assume strict bin matching if provided.
                          const isBinMatch = pickedBin ? (stockBatch === pickedBin) : false;

                          if (isSkuMatch && isBinMatch) {
                              const currentQty = Number(stockItem.quantity) || 0;
                              
                              console.log(`[STOCK-DEBUG] MATCH FOUND at Key '${key}'. DB Stock: ${currentQty}. Deducting: ${qtyToDeduct}`);

                              // Deduct
                              const deduction = Math.min(currentQty, qtyToDeduct);
                              
                              if (deduction > 0) {
                                  stockItem.quantity = currentQty - deduction;
                                  stockItem.lastUpdated = new Date().toISOString();
                                  console.log(`[STOCK-DEBUG] NEW DB Stock: ${stockItem.quantity}`);
                              } else {
                                  console.warn(`[STOCK-DEBUG] Stock was 0, could not deduct.`);
                              }
                              matched = true;
                              break; // Stop looking for this specific picked line
                          }
                      }
                      if (!matched) {
                           console.error(`[STOCK-DEBUG] NO MATCH for SKU: '${pickedSku}' + Bin: '${pickedBin}'`);
                      }
                  } else {
                      console.warn(`[STOCK-DEBUG] Skipped Item #${idx} due to invalid data.`);
                  }
              });

              return currentData; // Commit changes
          });

          if (transactionResult.committed) {
              console.log("[STOCK-DEBUG] Transaction Committed Successfully.");
              // Post-process logs for the UI 
              itemsToProcess.forEach((p: any) => {
                  if(Number(p.pickedQty) > 0) {
                      logs.push(`Processado: ${p.material} (${p.pickedQty})`);
                  }
              });
              return { success: true, details: logs };
          } else {
              console.error("[STOCK-DEBUG] Transaction Failed/Aborted by Firebase.");
              return { success: false, details: ["Transação abortada pelo banco de dados."] };
          }

      } catch (e: any) {
          console.error("[STOCK-DEBUG] Exception in decrementStock:", e);
          return { success: false, details: [e.message] };
      }
  },
  
  // NEW: Process completed orders automatically on refresh
  deductStockForCompletedOrders: async (): Promise<number> => {
    if (!db) return 0;
    try {
        const orders = await StorageService.getOrders();
        // Identify orders that are COMPLETED but not yet processed
        const unprocessed = orders.filter(o => o.status === 'COMPLETED' && !o.stockProcessed);

        if (unprocessed.length === 0) return 0;

        let processedCount = 0;
        console.log(`[AUTO-PROCESS] Found ${unprocessed.length} orders to process.`);

        for (const order of unprocessed) {
            // A. Prepare Items to Deduct
            let itemsToDeduct = toArray(order.pickedItems);
            
            // Fallback: If no picked items log exists (e.g. legacy or external app didn't sync pickedItems properly), 
            // assume fully picked for Standard items to ensure stock consistency.
            if (itemsToDeduct.length === 0) {
                 console.log(`[AUTO-PROCESS] Order ${order.id} has no picked logs. Assuming full pick for standard items.`);
                 itemsToDeduct = order.items
                      .filter(i => !i.isCustom && i.sku)
                      .map(i => ({
                          material: i.sku,
                          pickedQty: i.quantity,
                          bin: ''
                      }));
            }

            // B. Deduct Stock - DISABLED AS PER USER REQUEST
            // if (itemsToDeduct.length > 0) {
            //    await StorageService.decrementStock(itemsToDeduct);
            // }

            // C. Mark as Processed and Save
            order.stockProcessed = true;
            // if(!order.changeLog) order.changeLog = [];
            // order.changeLog.push({
            //    date: new Date().toISOString(),
            //    actor: 'SYSTEM',
            //    details: `Stock debitado automaticamente após finalização externa.`
            // });

            await StorageService.updateOrder(order);
            processedCount++;
            console.log(`[AUTO-PROCESS] Order ${order.id} processed.`);
        }

        return processedCount;

    } catch (e) {
        console.error("Error in auto-processing completed orders:", e);
        return 0;
    }
  },

  getMasterMaterials: async (): Promise<MasterMaterial[]> => {
      if (!db) return [];
      const snapshot = await db.ref(KEYS.MASTER_MATERIALS).get();
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },

  mergeMasterMaterials: async (materials: MasterMaterial[]) => {
      if (!db) return;
      await db.ref(KEYS.MASTER_MATERIALS).set(materials);
  },

  getOrders: async (): Promise<Order[]> => {
      if (!db) return [];
      const snapshot = await db.ref(KEYS.ORDERS).get();
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },

  addOrders: async (orders: Order[]) => {
      if (!db) return;
      const updates: any = {};
      orders.forEach(o => {
          updates[`${KEYS.ORDERS}/${o.id}`] = o;
      });
      await db.ref().update(updates);
  },

  updateOrder: async (order: Order) => {
      if (!db) return;
      await db.ref(`${KEYS.ORDERS}/${order.id}`).set(order);
  },

  deleteOrder: async (orderId: string) => {
      if (!db) return;
      await db.ref(`${KEYS.ORDERS}/${orderId}`).remove();
  },

  getReceipts: async (): Promise<Receipt[]> => {
      if (!db) return [];
      const snapshot = await db.ref(KEYS.RECEIPTS).get();
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },

  getTransfers: async (): Promise<any[]> => {
      if (!db) return [];
      const snapshot = await db.ref(KEYS.TRANSFERS).get();
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },

  getPurchaseOrders: async (): Promise<PurchaseOrder[]> => {
      if (!db) return [];
      const snapshot = await db.ref(KEYS.PURCHASE_ORDERS).get();
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
  },

  savePurchaseOrder: async (po: PurchaseOrder): Promise<PurchaseOrder> => {
      if (!db) throw new Error("Offline");
      // Generate Display ID if not present
      if (!po.displayId) {
          // Simple increment logic or timestamp based
          po.displayId = Math.floor(Date.now() / 1000); 
      }
      await db.ref(`${KEYS.PURCHASE_ORDERS}/${po.id}`).set(po);
      return po;
  },

  deletePurchaseOrder: async (id: string) => {
      if (!db) return;
      await db.ref(`${KEYS.PURCHASE_ORDERS}/${id}`).remove();
  },

  // User Management
  generateUniqueUsername: async (firstName: string, lastName: string): Promise<string> => {
      if (!db) return '';
      
      const norm = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, '-');
      const baseUsername = `${norm(firstName || 'user')}-${norm(lastName || '')}`.replace(/-+$/, '').replace(/^-+/, '');
      
      const usersSnap = await db.ref(KEYS.USERS).get();
      const existingUsernames = new Set<string>();
      if (usersSnap.exists()) {
          Object.values(usersSnap.val()).forEach((u: any) => {
              if (u.username) existingUsernames.add(u.username.toLowerCase());
          });
      }
      
      const invitesSnap = await db.ref(KEYS.INVITES).get();
      if (invitesSnap.exists()) {
          Object.values(invitesSnap.val()).forEach((i: any) => {
              if (i.username) existingUsernames.add(i.username.toLowerCase());
          });
      }

      let username = baseUsername;
      let counter = 2;
      
      while (existingUsernames.has(username)) {
          username = `${baseUsername}${counter}`;
          counter++;
      }
      
      return username;
  },

  createInvite: async (email: string, role: UserRole, firstName: string, lastName: string, companyId: string, supervisorId: string) => {
      if (!db) return '';
      
      // Clean up any existing invites for this email first to prevent duplicates
      const existingSnap = await db.ref(KEYS.INVITES).orderByChild('email').equalTo(email).get();
      if (existingSnap.exists()) {
          const cleanupUpdates: any = {};
          Object.keys(existingSnap.val()).forEach(key => {
              cleanupUpdates[`${KEYS.INVITES}/${key}`] = null;
          });
          await db.ref().update(cleanupUpdates);
      }

      // 1. Generate a random 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // 2. Generate username
      const username = await StorageService.generateUniqueUsername(firstName, lastName);

      const emailKey = normalizeText(email).replace(/\./g, '_');
      const newInvite: Invite = {
          id: emailKey,
          email,
          username,
          role,
          firstName,
          lastName,
          companyId,
          supervisorId,
          code,
          dateCreated: new Date().toISOString()
      };
      
      await db.ref(`${KEYS.INVITES}/${emailKey}`).set(newInvite);
      return code;
  },

  getInviteByEmail: async (email: string): Promise<Invite | null> => {
      if (!db) return null;
      const snapshot = await db.ref(KEYS.INVITES).orderByChild('email').equalTo(email).get();
      if (!snapshot.exists()) return null;
      const invites = snapshot.val();
      const keys = Object.keys(invites);
      // If multiple exist (should be rare now), return the one with latest dateCreated
      let latestInvite: any = null;
      keys.forEach(key => {
          const invite = invites[key];
          if (!latestInvite || (invite.dateCreated && latestInvite.dateCreated && new Date(invite.dateCreated) > new Date(latestInvite.dateCreated))) {
              latestInvite = { ...invite, id: key };
          }
      });
      return latestInvite;
  },

  getPendingInvites: async (): Promise<Invite[]> => {
      if (!db) return [];
      const snapshot = await db.ref(KEYS.INVITES).get();
      if (!snapshot.exists()) return [];
      const data = snapshot.val();
      return Object.keys(data).map(key => ({
          ...data[key],
          id: key
      }));
  },

  deleteInvite: async (inviteId: string) => {
      if (!db) return;
      await db.ref(`${KEYS.INVITES}/${inviteId}`).remove();
  },

  updateUserRole: async (uid: string, role: UserRole) => {
      if (!db) return;
      await db.ref(`${KEYS.USERS}/${uid}/role`).set(role);
  },

  updateUserCompany: async (uid: string, companyId: string) => {
      if (!db) return;
      await db.ref(`${KEYS.USERS}/${uid}/companyId`).set(companyId);
  },

  updateUserSupervisor: async (uid: string, supervisorId: string) => {
      if (!db) return;
      await db.ref(`${KEYS.USERS}/${uid}/supervisorId`).set(supervisorId);
  },

  deleteUserProfile: async (uid: string) => {
      if (!db) return;
      
      // Get user data to find username and clear mapping
      const snap = await db.ref(`${KEYS.USERS}/${uid}`).get();
      if(snap.exists()) {
          const u = snap.val();
          if(u.username) {
              const key = normalizeText(u.username);
              await db.ref(`${KEYS.USERNAMES}/${key}`).remove();
          }
      }
      
      await db.ref(`${KEYS.USERS}/${uid}`).remove();
  },

  resetAllUsers: async (currentUserId: string) => {
      if (!db) return;
      const snapshot = await db.ref(KEYS.USERS).get();
      if (snapshot.exists()) {
          const users = snapshot.val();
          const updates: any = {};
          
          // Clear Users (except current)
          Object.keys(users).forEach(uid => {
              if (uid !== currentUserId) updates[`${KEYS.USERS}/${uid}`] = null;
          });
          
          // Clear All Invites
          updates[KEYS.INVITES] = null;
          
          // Clear Public Mapping completely
          updates[KEYS.USERNAMES] = null;
          
          // Re-add current user to mapping if needed
          const currentUser = users[currentUserId];
          if(currentUser && currentUser.username) {
              const key = normalizeText(currentUser.username);
              updates[`${KEYS.USERNAMES}/${key}`] = currentUser.email;
          }

          await db.ref().update(updates);
      }
  },

  // ----------------------------------------------------------------
  // REOPEN ORDERS LOGIC (Fixing Issue #1)
  // ----------------------------------------------------------------
  processBackorders: async (newStock: StockItem[]): Promise<number> => {
      if (!db) return 0;
      
      try {
          // 1. Map New Stock for fast lookup (Mutable for allocation)
          // Normalize SKU to ensure matching (trim + uppercase)
          const normalizeSku = (s: string) => s.trim().toUpperCase();
          
          const stockMap = new Map<string, number>();
          newStock.forEach(s => {
              if (s.sku) stockMap.set(normalizeSku(s.sku), s.quantity);
          });

          // 2. Fetch Orders
          const allOrders = await StorageService.getOrders();
          
          // 3. Filter for candidates: COMPLETED orders with unfulfilled items not yet backordered
          const candidates = allOrders.filter(o => o.status === 'COMPLETED');
          
          // Helper to get picked qty
          const getPickedQty = (order: Order, sku: string) => {
              const pickedList = toArray(order.pickedItems);
              return pickedList
                  .filter((p: any) => normalizeSku(p.material || '') === normalizeSku(sku))
                  .reduce((acc: number, p: any) => acc + (Number(p.pickedQty) || 0), 0);
          };

          // 4. Collect all demands per SKU
          interface Demand {
              order: Order;
              itemIndex: number; // To update the original item
              sku: string;
              missingQty: number;
              dateCreated: string;
              description: string;
              unit?: string;
              originalItem: OrderLineItem;
          }

          const demandsBySku = new Map<string, Demand[]>();

          for (const order of candidates) {
              if (!order.items) continue;
              
              order.items.forEach((item, index) => {
                  if (item.isCustom) return;
                  if (item.backorderCreated) return; // Already handled
                  if (!item.sku) return;

                  const skuNorm = normalizeSku(item.sku);
                  const picked = getPickedQty(order, item.sku);
                  
                  if (picked < item.quantity) {
                      const missing = item.quantity - picked;
                      if (missing > 0) {
                          if (!demandsBySku.has(skuNorm)) {
                              demandsBySku.set(skuNorm, []);
                          }
                          demandsBySku.get(skuNorm)!.push({
                              order,
                              itemIndex: index,
                              sku: item.sku, // Keep original SKU for new order
                              missingQty: missing,
                              dateCreated: order.dateCreated,
                              description: item.description,
                              unit: item.unit,
                              originalItem: item
                          });
                      }
                  }
              });
          }

          // 5. Allocate Stock (Smart Logic)
          const allocations = new Map<string, Demand[]>(); // OrderID -> Allocated Demands

          demandsBySku.forEach((demands, skuNorm) => {
              let available = stockMap.get(skuNorm) || 0;
              if (available <= 0) return;

              // Sort Demands:
              // 1. Exact Match (missing === available)
              // 2. Oldest First
              demands.sort((a, b) => {
                  const aExact = a.missingQty === available;
                  const bExact = b.missingQty === available;
                  if (aExact && !bExact) return -1;
                  if (!aExact && bExact) return 1;
                  
                  return new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime();
              });

              for (const demand of demands) {
                  if (available >= demand.missingQty) {
                      // Allocate
                      available -= demand.missingQty;
                      stockMap.set(skuNorm, available); // Update available for next iteration

                      if (!allocations.has(demand.order.id)) {
                          allocations.set(demand.order.id, []);
                      }
                      allocations.get(demand.order.id)!.push(demand);
                  }
              }
          });

          // 6. Create Backorders
          let updatedCount = 0;
          const updates: any = {};

          for (const [originalOrderId, allocatedDemands] of allocations.entries()) {
              if (allocatedDemands.length === 0) continue;

              const originalOrder = allocatedDemands[0].order; // All have same order
              
              // A. Create New Order
              const nextReopenCount = (originalOrder.reopenCount || 0) + 1;
              const newOrderId = `${originalOrder.id}_re_${nextReopenCount}`;
              
              const newItems: OrderLineItem[] = allocatedDemands.map(d => {
                  const item = {
                      ...d.originalItem,
                      quantity: d.missingQty, // Only what's missing
                      quantityPicked: 0,
                      backorderCreated: false
                  };
                  delete item.fulfilledInOrderId;
                  if (!item.image) delete item.image;
                  // Ensure no undefined
                  Object.keys(item).forEach(key => {
                      if ((item as any)[key] === undefined) {
                          delete (item as any)[key];
                      }
                  });
                  return item;
              });

              const newOrder: Order = {
                  ...originalOrder,
                  id: newOrderId,
                  title: `${originalOrder.title} (Reabertura #${nextReopenCount})`,
                  status: 'OPEN',
                  dateCreated: new Date().toISOString(),
                  items: newItems,
                  pickedItems: [],
                  changeLog: [{
                      date: new Date().toISOString(),
                      actor: 'SYSTEM',
                      details: `Gerado automaticamente a partir de ${originalOrder.id} por chegada de stock.`
                  }],
                  originalOrderId: originalOrder.id,
                  reopenCount: 0, // Reset for the new order
                  stockProcessed: false
              };
              delete newOrder.displayId;

              updates[`${KEYS.ORDERS}/${newOrderId}`] = newOrder;

              // B. Update Original Order
              let originalModified = false;
              allocatedDemands.forEach(d => {
                  if (originalOrder.items[d.itemIndex]) {
                      originalOrder.items[d.itemIndex].backorderCreated = true;
                      originalOrder.items[d.itemIndex].fulfilledInOrderId = newOrderId;
                      originalModified = true;
                  }
              });

              if (originalModified) {
                  originalOrder.reopenCount = nextReopenCount;
                  if (!originalOrder.changeLog) originalOrder.changeLog = [];
                  originalOrder.changeLog.push({
                      date: new Date().toISOString(),
                      actor: 'SYSTEM',
                      details: `Backorder gerado: ${newOrderId}`
                  });
                  updates[`${KEYS.ORDERS}/${originalOrder.id}`] = originalOrder;
                  updatedCount++;
                  console.log(`[BACKORDER] Created ${newOrderId} from ${originalOrder.id}`);
              }
          }

          if (Object.keys(updates).length > 0) {
              await db.ref().update(updates);
          }

          return updatedCount;

      } catch (e) {
          console.error("Error processing backorders:", e);
          return 0;
      }
  },

  reconcileCustomItems: async (masterList: MasterMaterial[], currentStock: StockItem[] = []) => {
      if (!db) return;
      
      try {
          const orders = await StorageService.getOrders();
          const updates: any = {};
          let updatedCount = 0;

          // Helper to normalize
          const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

          // Create a searchable list from MasterList and Stock
          const searchOptions = {
              keys: ['normDesc', 'description', 'sku'],
              threshold: 0.4,
              includeScore: true
          };
          
          const searchableItems = new Map<string, { sku: string, description: string, normDesc: string }>();
          
          masterList.forEach(m => {
              if (m.description) searchableItems.set(m.sku, { sku: m.sku, description: m.description, normDesc: norm(m.description) });
          });
          currentStock.forEach(s => {
              if (s.description) searchableItems.set(s.sku, { sku: s.sku, description: s.description, normDesc: norm(s.description) });
          });

          const fuse = new Fuse(Array.from(searchableItems.values()), searchOptions);

          for (const order of orders) {
              // Only check active orders or pending ones (Allow COMPLETED to fix retroactive SKU matches)
              if ((order.status as any) === 'REJECTED') continue;

              let orderModified = false;
              let hasPendingCustom = false;

              if (!order.items) continue;

              for (const item of order.items) {
                  // Check if item is "Provisional" (N/A SKU or isCustom with no SKU)
                  // Also check if it is "FOTO_PENDENTE" - we can't resolve photos by description usually, but if they typed a description...
                  // Do not rematch if user explicitly rejected the algorithm's matching previously
                  if ((item.isCustom || item.sku === 'N/A' || !item.sku) && item.sku !== 'FOTO_PENDENTE' && !item.autoMatchRejected) {
                      const d = norm(item.description);
                      
                      const results = fuse.search(d);
                      let bestMatch = null;
                      
                      // Check for exact match first (which fuse handles but just to be safe)
                      const exactMatch = Array.from(searchableItems.values()).find(i => i.normDesc === d);
                      if (exactMatch) {
                          bestMatch = exactMatch;
                      } else if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.3) {
                          bestMatch = results[0].item;
                      }

                      if (bestMatch) {
                          // MATCH FOUND!
                          const newSku = bestMatch.sku;
                          
                          // Update Item
                          item.sku = newSku;
                          item.isCustom = false; // No longer custom
                          item.originalDescription = item.description;
                          // If it was a fuzzy match, it needs validation
                          if (!exactMatch) {
                              item.unverifiedMatch = true;
                          }
                          
                          // Update to official description from masterList if available
                          const officialDesc = masterList.find(m => m.sku === newSku)?.description || bestMatch.description;
                          item.description = officialDesc;
                          
                          orderModified = true;
                          
                          // Log
                          if (!order.changeLog) order.changeLog = [];
                          order.changeLog.push({
                              date: new Date().toISOString(),
                              actor: 'SYSTEM',
                              details: `Material "${item.originalDescription}" identificado automaticamente. ${!exactMatch ? '(Por validar)' : ''} Código atribuído: ${newSku}`
                          });
                      } else {
                          hasPendingCustom = true;
                      }
                  } else if (item.isCustom) {
                       hasPendingCustom = true;
                  }
              }

              if (orderModified) {
                  // Update Status if it was PENDING and now has no custom items
                  if (order.status === 'PENDING' && !hasPendingCustom) {
                      order.status = 'OPEN';
                      if (!order.changeLog) order.changeLog = [];
                      order.changeLog.push({
                          date: new Date().toISOString(),
                          actor: 'SYSTEM',
                          details: `Estado alterado para OPEN (Todos os materiais identificados).`
                      });
                  }
                  
                  updates[`${KEYS.ORDERS}/${order.id}`] = order;
                  updatedCount++;
              }
          }

          // ... (existing SKU matching logic) ...

          // ---------------------------------------------------------
          // NEW LOGIC: Downgrade OPEN -> PENDING if stock is insufficient
          // ---------------------------------------------------------
          
          // 1. Build Mutable Stock Map
          const stockMap = new Map<string, number>();
          currentStock.forEach(s => {
              if (s.sku) stockMap.set(norm(s.sku), s.quantity);
          });

          // 2. Helper to get picked qty (copied for scope)
          const getPickedQty = (order: Order, sku: string) => {
              if (!order.pickedItems || !Array.isArray(order.pickedItems)) return 0;
              return order.pickedItems
                  .filter((p: any) => norm(p.material || '') === norm(sku))
                  .reduce((acc: number, p: any) => acc + (Number(p.pickedQty) || 0), 0);
          };

          // 3. Prioritize Orders: IN_PROCESS first (reserved), then OPEN/PENDING by Date
          const activeOrders = orders.filter(o => 
              o.status === 'IN_PROCESS' || 
              o.status === 'IN PROCESS' || 
              o.status === 'OPEN' || 
              o.status === 'PENDING'
          );

          // Sort: IN_PROCESS first, then by Date
          activeOrders.sort((a, b) => {
              const aProcess = a.status === 'IN_PROCESS' || a.status === 'IN PROCESS';
              const bProcess = b.status === 'IN_PROCESS' || b.status === 'IN PROCESS';
              if (aProcess && !bProcess) return -1;
              if (!aProcess && bProcess) return 1;
              return new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime();
          });

          // 4. Simulate Allocation
          for (const order of activeOrders) {
              if (!order.items) continue;
              
              let canFulfillAny = false; // Changed from canFulfill (all) to canFulfillAny (at least one)
              let isPartiallyPicked = false;

              // Check each item
              for (const item of order.items) {
                  if (item.isCustom) continue; // Custom items don't consume stock
                  if (!item.sku) continue;
                  
                  const sku = norm(item.sku);
                  const picked = getPickedQty(order, item.sku);
                  if (picked > 0) isPartiallyPicked = true;

                  const needed = Math.max(0, item.quantity - picked);
                  
                  if (needed > 0) {
                      const available = stockMap.get(sku) || 0;
                      // Allocate whatever is available (partial or full)
                      const allocate = Math.min(available, needed);
                      
                      if (allocate > 0) {
                          stockMap.set(sku, available - allocate);
                          canFulfillAny = true;
                      }
                  } else {
                      // If needed is 0, it means it's already picked/fulfilled
                      canFulfillAny = true;
                  }
              }

              // 5. Update Status
              // We only change OPEN <-> PENDING. 
              // We DO NOT touch IN_PROCESS (it's already being worked on).
              // We DO NOT downgrade if it's partially picked (it's effectively in process).
              
              const isProcess = order.status === 'IN_PROCESS' || order.status === 'IN PROCESS';
              
              if (!isProcess && !isPartiallyPicked) {
                  // If we have stock items but CANNOT fulfill ANY of them -> PENDING
                  // If we have NO stock items (only custom), it defaults to PENDING (canFulfillAny=false)
                  
                  if (!canFulfillAny && order.status === 'OPEN') {
                      // Downgrade
                      order.status = 'PENDING';
                      if (!order.changeLog) order.changeLog = [];
                      order.changeLog.push({
                          date: new Date().toISOString(),
                          actor: 'SYSTEM',
                          details: 'Estado alterado para PENDING (Stock insuficiente para todos os itens).'
                      });
                      updates[`${KEYS.ORDERS}/${order.id}`] = order;
                      updatedCount++;
                  } else if (canFulfillAny && order.status === 'PENDING') {
                      // Upgrade
                      // Ensure no custom items are blocking (optional, but safer)
                      
                      // If it has unresolved custom items, we might want to keep it PENDING?
                      // User said: "an order should be only flagged as pending when all of its items and quantities are missing."
                      // If we have 1 stock item (available) and 1 custom item (unresolved).
                      // canFulfillAny = true.
                      // Should it be OPEN? Yes, so we can pick the stock item.
                      
                      if (canFulfillAny) { // Simplified condition
                          order.status = 'OPEN';
                          if (!order.changeLog) order.changeLog = [];
                          order.changeLog.push({
                              date: new Date().toISOString(),
                              actor: 'SYSTEM',
                              details: 'Estado alterado para OPEN (Stock disponível).'
                          });
                          updates[`${KEYS.ORDERS}/${order.id}`] = order;
                          updatedCount++;
                      }
                  }
              }
          }

          if (updatedCount > 0) {
              await db.ref().update(updates);
              console.log(`[RECONCILE] Updated ${updatedCount} orders.`);
          }
      } catch (e) {
          console.error("Error reconciling custom items:", e);
      }
  },

  syncCustomMaterials: async () => {
      // Placeholder
  },

  debugGetHash: async (text: string) => {
      // Simple hash implementation for debugging/admin code check
      let hash = 0;
      if (text.length === 0) return hash.toString();
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
      }
      return hash.toString();
  }
};
