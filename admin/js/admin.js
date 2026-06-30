/* ============================================
   RatedWorktops Admin — Shared JavaScript
   ============================================ */

// ── Supabase Configuration ────────────────────
// Replace these with your own live Supabase project credentials to connect to a real database
const SUPABASE_URL = ''; 
const SUPABASE_ANON_KEY = ''; 

// ── Supabase Initialization ───────────────────
// We mock Supabase to run completely local storage/client-side.
function safeGetLocalStorage(key, fallback = []) {
  try {
    const val = localStorage.getItem(key);
    if (!val || val === 'undefined') return fallback;
    return JSON.parse(val);
  } catch (e) {
    return fallback;
  }
}

function safeToISOString(dateStr) {
  if (!dateStr) return new Date().toISOString();
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

class MockSupabaseQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orderByField = null;
    this.orderByAsc = true;
    this.limitCount = null;
    this.isSingle = false;
    this.insertRows = null;
    this.updateChanges = null;
    this.deleteFlag = false;
    this.upsertRow = null;
  }
  
  select(cols) {
    return this;
  }
  
  eq(col, val) {
    this.filters.push({ col, val, op: 'eq' });
    return this;
  }
  
  order(col, options) {
    this.orderByField = col;
    this.orderByAsc = options ? (options.ascending !== false) : true;
    return this;
  }
  
  limit(count) {
    this.limitCount = count;
    return this;
  }
  
  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }
  
  insert(rows) {
    this.insertRows = rows;
    return this;
  }
  
  update(changes) {
    this.updateChanges = changes;
    return this;
  }
  
  delete() {
    this.deleteFlag = true;
    return this;
  }
  
  upsert(row) {
    this.upsertRow = row;
    return this;
  }
  
  async then(resolve, reject) {
    try {
      const res = await this.execute();
      resolve(res);
    } catch (e) {
      if (reject) reject(e);
      else resolve({ data: null, error: e });
    }
  }
  
  async execute() {
    let key = 'rw_' + this.table;
    let data = [];
    
    data = safeGetLocalStorage(key, null);
    if (data === null) {
      if (this.table === 'brands') {
        data = safeGetLocalStorage('rw_brands');
      } else if (this.table === 'categories') {
        data = safeGetLocalStorage('rw_categories');
      } else if (this.table === 'settings') {
        const s = safeGetLocalStorage('rw_settings', {});
        data = [s];
      } else if (this.table === 'profiles') {
        const appUsers = safeGetLocalStorage('rw_app_users');
        data = appUsers.map(u => ({
          id: u.id,
          name: u.name,
          full_name: u.name,
          email: u.email,
          plan: u.plan || 'Free',
          credits: u.credits !== undefined ? u.credits : 10,
          created_at: safeToISOString(u.joined),
          updated_at: new Date().toISOString()
        }));
      } else if (this.table === 'colours') {
        const brands = safeGetLocalStorage('rw_brands');
        const cols = [];
        brands.forEach(b => {
          if (b.colours) {
            b.colours.forEach(c => {
              cols.push({ ...c, brand_id: b.id });
            });
          }
        });
        data = cols;
      } else {
        data = [];
      }
    }
    
    if (!Array.isArray(data)) {
      data = [];
    }
    
    if (this.table === 'settings' && (!data || data.length === 0)) {
      const defSettings = {
        freeCreditsEnabled: true,
        subscriptionsEnabled: true,
        freeCreditsCount: 10,
        monthlyPrice: 9.99,
        annualPrice: 89.99,
        monthlyCredits: 100,
        annualCredits: 1500,
        tempStorageHours: 48,
        maxSavedProjects: 2
      };
      data = [defSettings];
      localStorage.setItem('rw_settings', JSON.stringify(defSettings));
    }
    
    if (this.table === 'settings' && !Array.isArray(data)) {
      data = [data];
    }
    
    // Write Actions
    if (this.insertRows) {
      const rows = Array.isArray(this.insertRows) ? this.insertRows : [this.insertRows];
      const rowsWithIds = rows.map(r => {
        const nr = { ...r };
        if (!nr.id) {
          nr.id = Date.now() + Math.floor(Math.random() * 1000);
        }
        if (!nr.created_at) {
          nr.created_at = new Date().toISOString();
        }
        return nr;
      });
      data = data.concat(rowsWithIds);
      localStorage.setItem(key, JSON.stringify(data));
      
      if (this.table === 'profiles') syncProfilesToUsers(data);
      if (this.table === 'colours') syncColoursToBrands(data);
      
      return { data: this.isSingle ? rowsWithIds[0] : (Array.isArray(this.insertRows) ? rowsWithIds : rowsWithIds[0]), error: null };
    }
    
    if (this.updateChanges) {
      data = data.map(item => {
        let match = true;
        for (const filter of this.filters) {
          if (filter.op === 'eq' && item[filter.col] != filter.val) {
            match = false;
            break;
          }
        }
        if (match) {
          const newItem = { ...item, ...this.updateChanges };
          newItem.updated_at = new Date().toISOString();
          return newItem;
        }
        return item;
      });
      localStorage.setItem(key, JSON.stringify(data));
      
      if (this.table === 'profiles') syncProfilesToUsers(data);
      if (this.table === 'colours') syncColoursToBrands(data);
      
      const matchedItems = data.filter(item => {
        for (const filter of this.filters) {
          if (filter.op === 'eq' && item[filter.col] != filter.val) return false;
        }
        return true;
      });
      return { data: this.isSingle ? matchedItems[0] : matchedItems, error: null };
    }
    
    if (this.deleteFlag) {
      data = data.filter(item => {
        let match = true;
        for (const filter of this.filters) {
          if (filter.op === 'eq' && item[filter.col] != filter.val) {
            match = false;
            break;
          }
        }
        return !match;
      });
      localStorage.setItem(key, JSON.stringify(data));
      
      if (this.table === 'profiles') syncProfilesToUsers(data);
      if (this.table === 'colours') syncColoursToBrands(data);
      
      return { data: null, error: null };
    }
    
    if (this.upsertRow) {
      const rows = Array.isArray(this.upsertRow) ? this.upsertRow : [this.upsertRow];
      rows.forEach(r => {
        const idx = data.findIndex(item => item.id == r.id);
        if (idx >= 0) {
          data[idx] = { ...data[idx], ...r };
        } else {
          data.push({ ...r, id: r.id || Date.now() + Math.floor(Math.random() * 1000) });
        }
      });
      localStorage.setItem(key, JSON.stringify(data));
      
      if (this.table === 'profiles') syncProfilesToUsers(data);
      if (this.table === 'colours') syncColoursToBrands(data);
      if (this.table === 'settings') {
        const row = Array.isArray(this.upsertRow) ? this.upsertRow[0] : this.upsertRow;
        localStorage.setItem('rw_settings', JSON.stringify(row));
      }
      
      return { data: Array.isArray(this.upsertRow) ? rows : rows[0], error: null };
    }
    
    // Read Actions
    let result = [...data];
    for (const filter of this.filters) {
      if (filter.op === 'eq') {
        result = result.filter(item => item[filter.col] == filter.val);
      }
    }
    
    if (this.orderByField) {
      result.sort((a, b) => {
        const valA = a[this.orderByField];
        const valB = b[this.orderByField];
        if (valA < valB) return this.orderByAsc ? -1 : 1;
        if (valA > valB) return this.orderByAsc ? 1 : -1;
        return 0;
      });
    }
    
    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }
    
    if (this.isSingle) {
      return { data: result[0] || null, error: null };
    }
    
    if (this.table === 'settings') {
      return { data: result[0] || {}, error: null };
    }
    
    return { data: result, error: null };
  }
}

function syncProfilesToUsers(profiles) {
  const appUsers = profiles.map(p => ({
    id: p.id,
    name: p.name || p.full_name || 'Unknown',
    email: p.email,
    password: p.password || 'Demo123',
    plan: p.plan || 'Free',
    credits: p.credits !== undefined ? p.credits : 10,
    visualisations: p.visualisations || 0,
    downloads: p.downloads || 0,
    shares: p.shares || 0,
    joined: p.created_at || new Date().toISOString(),
    verified: true
  }));
  localStorage.setItem('rw_app_users', JSON.stringify(appUsers));
  
  const adminUsers = profiles.map(p => ({
    id: p.id,
    name: p.name || p.full_name || 'Unknown',
    email: p.email,
    plan: p.plan || 'Free',
    credits: p.credits !== undefined ? p.credits : 10,
    visualisations: p.visualisations || 0,
    downloads: p.downloads || 0,
    shares: p.shares || 0,
    status: p.status || 'active',
    joined: (p.created_at || new Date().toISOString()).split('T')[0],
    lastActive: (p.updated_at || new Date().toISOString()).split('T')[0]
  }));
  localStorage.setItem('rw_users', JSON.stringify(adminUsers));
}

function syncColoursToBrands(colours) {
  const brands = safeGetLocalStorage('rw_brands');
  const updatedBrands = brands.map(brand => {
    return {
      ...brand,
      colours: colours.filter(c => c.brand_id == brand.id)
    };
  });
  localStorage.setItem('rw_brands', JSON.stringify(updatedBrands));
}

function initProfilesTable() {
  let profiles = safeGetLocalStorage('rw_profiles');
  
  const appUsers = safeGetLocalStorage('rw_app_users');
  const adminUsers = safeGetLocalStorage('rw_users');
  const userMap = {};
  
  adminUsers.forEach(u => {
    userMap[u.email] = {
      id: u.id,
      name: u.name,
      email: u.email,
      plan: u.plan || 'Free',
      credits: u.credits !== undefined ? u.credits : 10,
      visualisations: u.visualisations || 0,
      downloads: u.downloads || 0,
      shares: u.shares || 0,
      status: u.status || 'active',
      created_at: safeToISOString(u.joined),
      updated_at: new Date().toISOString()
    };
  });
  
  appUsers.forEach(u => {
    userMap[u.email] = {
      id: u.id,
      name: u.name,
      email: u.email,
      password: u.password,
      plan: u.plan || 'Free',
      credits: u.credits !== undefined ? u.credits : 10,
      visualisations: u.visualisations || 0,
      downloads: u.downloads || 0,
      shares: u.shares || 0,
      status: u.status || 'active',
      created_at: safeToISOString(u.joined),
      updated_at: new Date().toISOString()
    };
  });
  
  if (!userMap['demo@ratedworktops.com']) {
    userMap['demo@ratedworktops.com'] = {
      id: 1,
      name: 'Sophie Anderson',
      email: 'demo@ratedworktops.com',
      password: 'Demo123',
      plan: 'Pro',
      credits: 78,
      visualisations: 23,
      downloads: 15,
      shares: 8,
      status: 'active',
      created_at: new Date('2025-11-14').toISOString(),
      updated_at: new Date().toISOString()
    };
  }
  
  if (!userMap['ratedworktopsapp@gmail.com']) {
    userMap['ratedworktopsapp@gmail.com'] = {
      id: 999,
      name: 'Site Administrator',
      email: 'ratedworktopsapp@gmail.com',
      password: 'Ratedworktopsapp@',
      plan: 'Admin',
      credits: 99999,
      visualisations: 0,
      downloads: 0,
      shares: 0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
  
  profiles.forEach(p => {
    if (p.email) {
      userMap[p.email] = {
        ...(userMap[p.email] || {}),
        ...p
      };
    }
  });
  
  if (userMap['demo@ratedworktops.com']) {
    userMap['demo@ratedworktops.com'].password = 'Demo123';
  }
  if (userMap['ratedworktopsapp@gmail.com']) {
    userMap['ratedworktopsapp@gmail.com'].password = 'Ratedworktopsapp@';
  }
  
  const finalProfiles = Object.values(userMap);
  localStorage.setItem('rw_profiles', JSON.stringify(finalProfiles));
  syncProfilesToUsers(finalProfiles);
}

function initBrandsAndColours() {
  const storedBrands = localStorage.getItem('rw_brands');
  let brands = [];
  if (storedBrands) {
    try {
      brands = JSON.parse(storedBrands);
    } catch (e) {
      brands = [];
    }
  }
  
  if (brands.length === 0) {
    brands = [
      {
        id: 1, name: 'Silestone', category: 'Quartz', enabled: true,
        logo: '', description: 'Premium quartz surfaces by Cosentino',
        colours: [
          { id: 101, name: 'Eternal Calacatta Gold', sku: 'SIL-ECG', enabled: true, texture: 'marble', price: '' },
          { id: 102, name: 'Nebula Pearl', sku: 'SIL-NP', enabled: true, texture: 'quartz', price: '' },
          { id: 103, name: 'Iconic Black', sku: 'SIL-IB', enabled: true, texture: 'black', price: '' },
          { id: 104, name: 'Miami White', sku: 'SIL-MW', enabled: true, texture: 'marble', price: '' },
        ]
      },
      {
        id: 2, name: 'Dekton', category: 'Sintered Stone', enabled: true,
        logo: '', description: 'Ultra-compact surface by Cosentino',
        colours: [
          { id: 201, name: 'Kreta', sku: 'DEK-KR', enabled: true, texture: 'slate', price: '' },
          { id: 202, name: 'Opera', sku: 'DEK-OP', enabled: true, texture: 'marble', price: '' },
          { id: 203, name: 'Laurent', sku: 'DEK-LR', enabled: true, texture: 'black', price: '' },
          { id: 205, name: 'Charcoal Granite', sku: 'DEK-CG', enabled: true, texture: 'granite', price: '' }
        ]
      },
      {
        id: 3, name: 'Caesarstone', category: 'Quartz', enabled: true,
        logo: '', description: 'Global leader in quartz surfaces',
        colours: [
          { id: 301, name: 'Statuario Nuvo', sku: 'CAE-SN', enabled: true, texture: 'marble', price: '' },
          { id: 302, name: 'Vanilla Noir', sku: 'CAE-VN', enabled: true, texture: 'granite', price: '' },
          { id: 303, name: 'Cloudburst Concrete', sku: 'CAE-CC', enabled: true, texture: 'slate', price: '' },
        ]
      },
      {
        id: 4, name: 'Calacatta Premium', category: 'Marble', enabled: true,
        logo: '', description: 'Natural marble from Carrara quarries',
        colours: [
          { id: 401, name: 'Calacatta Gold', sku: 'CAL-GD', enabled: true, texture: 'marble', price: '' },
          { id: 402, name: 'Carrara White Marble', sku: 'CAL-CW', enabled: true, texture: 'marble', price: '' },
          { id: 403, name: 'Nero Marquina', sku: 'CAL-NM', enabled: true, texture: 'marble', price: '' },
          { id: 404, name: 'Arabescato Vagli', sku: 'CAL-AV', enabled: true, texture: 'marble', price: '' },
          { id: 405, name: 'Calacatta Viola', sku: 'CAL-VI', enabled: true, texture: 'marble', price: '' }
        ]
      }
    ];
    localStorage.setItem('rw_brands', JSON.stringify(brands));
  }
  
  let colours = [];
  const storedColours = localStorage.getItem('rw_colours');
  if (storedColours) {
    try {
      colours = JSON.parse(storedColours);
    } catch (e) {
      colours = [];
    }
  }
  
  if (colours.length === 0) {
    brands.forEach(b => {
      if (b.colours) {
        b.colours.forEach(c => {
          colours.push({ ...c, brand_id: b.id });
        });
      }
    });
    localStorage.setItem('rw_colours', JSON.stringify(colours));
  }
}

class MockSupabaseClient {
  constructor() {
    this.auth = {
      getSession: async () => {
        const sessionStr = localStorage.getItem('rw_session');
        if (!sessionStr) return { data: { session: null }, error: null };
        try {
          const session = JSON.parse(sessionStr);
          return { data: { session }, error: null };
        } catch (e) {
          return { data: { session: null }, error: null };
        }
      },
      signUp: async ({ email, password, options }) => {
        initProfilesTable();
        let profiles = JSON.parse(localStorage.getItem('rw_profiles')) || [];
        if (profiles.find(p => p.email === email)) {
          return { data: { user: null }, error: { message: 'User already exists' } };
        }
        
        const name = (options && options.data && options.data.name) ? options.data.name : email.split('@')[0];
        const newUser = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          name,
          email,
          password,
          plan: 'Free',
          credits: 10,
          visualisations: 0,
          downloads: 0,
          shares: 0,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        profiles.push(newUser);
        localStorage.setItem('rw_profiles', JSON.stringify(profiles));
        syncProfilesToUsers(profiles);
        
        const session = {
          user: {
            id: newUser.id,
            email: newUser.email,
            user_metadata: { name: newUser.name }
          },
          access_token: 'mock-token-' + newUser.id,
          expires_at: Math.floor(Date.now() / 1000) + 3600
        };
        localStorage.setItem('rw_session', JSON.stringify(session));
        return { data: { user: session.user, session }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        initProfilesTable();
        let profiles = JSON.parse(localStorage.getItem('rw_profiles')) || [];
        const user = profiles.find(p => p.email === email);
        if (!user || user.password !== password) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        }
        if (user.status === 'suspended') {
          return { data: { user: null, session: null }, error: { message: 'Your account has been suspended' } };
        }
        
        const session = {
          user: {
            id: user.id,
            email: user.email,
            user_metadata: { name: user.name }
          },
          access_token: 'mock-token-' + user.id,
          expires_at: Math.floor(Date.now() / 1000) + 3600
        };
        localStorage.setItem('rw_session', JSON.stringify(session));
        return { data: { user: session.user, session }, error: null };
      },
      signInWithOAuth: async ({ provider, options }) => {
        initProfilesTable();
        let profiles = JSON.parse(localStorage.getItem('rw_profiles')) || [];
        let googleUser = profiles.find(p => p.email === 'demo@ratedworktops.com');
        if (!googleUser) {
          googleUser = {
            id: 1,
            name: 'Sophie Anderson',
            email: 'demo@ratedworktops.com',
            password: 'Demo123',
            plan: 'Pro',
            credits: 78,
            visualisations: 23,
            downloads: 15,
            shares: 8,
            status: 'active',
            created_at: new Date('2025-11-14').toISOString(),
            updated_at: new Date().toISOString()
          };
          profiles.push(googleUser);
          localStorage.setItem('rw_profiles', JSON.stringify(profiles));
          syncProfilesToUsers(profiles);
        }
        
        const session = {
          user: {
            id: googleUser.id,
            email: googleUser.email,
            user_metadata: { name: googleUser.name }
          },
          access_token: 'mock-token-' + googleUser.id,
          expires_at: Math.floor(Date.now() / 1000) + 3600
        };
        localStorage.setItem('rw_session', JSON.stringify(session));
        
        if (options && options.redirectTo) {
          window.location.href = options.redirectTo;
        }
        return { data: { user: session.user, session }, error: null };
      },
      signOut: async () => {
        localStorage.removeItem('rw_session');
        return { error: null };
      },
      updateUser: async (attributes) => {
        initProfilesTable();
        const sessionStr = localStorage.getItem('rw_session');
        if (!sessionStr) return { data: { user: null }, error: { message: 'No active session' } };
        
        const session = JSON.parse(sessionStr);
        let profiles = JSON.parse(localStorage.getItem('rw_profiles')) || [];
        const userIdx = profiles.findIndex(p => p.id == session.user.id);
        
        if (userIdx >= 0) {
          if (attributes.password) {
            profiles[userIdx].password = attributes.password;
          }
          if (attributes.data && attributes.data.name) {
            profiles[userIdx].name = attributes.data.name;
            session.user.user_metadata.name = attributes.data.name;
            localStorage.setItem('rw_session', JSON.stringify(session));
          }
          localStorage.setItem('rw_profiles', JSON.stringify(profiles));
          syncProfilesToUsers(profiles);
          return { data: { user: session.user }, error: null };
        }
        return { data: { user: null }, error: { message: 'User not found' } };
      },
      resetPasswordForEmail: async (email, options) => {
        return { data: {}, error: null };
      }
    };
    
    this.storage = {
      from: (bucket) => {
        return {
          upload: async (path, file, options) => {
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result;
                try {
                  localStorage.setItem('rw_storage_' + bucket + '_' + path, base64data);
                } catch (e) {
                  console.warn('LocalStorage limit exceeded for file upload, using memory URL.');
                }
                const objectUrl = URL.createObjectURL(file);
                window._mockStorage = window._mockStorage || {};
                window._mockStorage[bucket + '_' + path] = objectUrl;
                
                resolve({ data: { path }, error: null });
              };
              reader.onerror = (err) => {
                resolve({ data: null, error: { message: err.message || 'File upload failed' } });
              };
              reader.readAsDataURL(file);
            });
          },
          getPublicUrl: (path) => {
            const cacheKey = bucket + '_' + path;
            const memoryUrl = window._mockStorage ? window._mockStorage[cacheKey] : null;
            if (memoryUrl) {
              return { data: { publicUrl: memoryUrl } };
            }
            const base64 = localStorage.getItem('rw_storage_' + bucket + '_' + path);
            if (base64) {
              return { data: { publicUrl: base64 } };
            }
            return { data: { publicUrl: 'images/placeholder-kitchen.jpg' } };
          }
        };
      }
    };
  }
  
  from(table) {
    return new MockSupabaseQuery(table);
  }
}

// Instantiate real Supabase client if credentials are provided, or fall back to the mock client
const useRealSupabase = typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase;
const supabaseClient = useRealSupabase 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : new MockSupabaseClient();

// Seed initial mock data if using mock database
if (!useRealSupabase) {
  initProfilesTable();
  initBrandsAndColours();
}

// ── Demo credentials ──────────────────────────
const ADMIN_CREDENTIALS = {
  email: 'ratedworktopsapp@gmail.com',
  password: 'Ratedworktopsapp@'
};

// ── LocalStorage helpers (Deprecated for DB) ──
const store = {
  get: (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem('rw_' + key)) ?? fallback; }
    catch { return fallback; }
  },
  set: (key, val) => localStorage.setItem('rw_' + key, JSON.stringify(val)),
  remove: (key) => localStorage.removeItem('rw_' + key)
};

// ── Auth Guard ────────────────────────────────
async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session || session.user.email !== 'ratedworktopsapp@gmail.com') {
    window.location.href = '../admin/index.html';
    return false;
  }
  return true;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// ── Seed demo data if empty ───────────────────
function seedData() {
  // Settings
  if (!store.get('settings')) {
    store.set('settings', {
      freeCreditsEnabled: true,
      subscriptionsEnabled: true,
      freeCreditsCount: 10,
      monthlyPrice: 9.99,
      annualPrice: 89.99,
      monthlyCredits: 100,
      annualCredits: 1500,
      tempStorageHours: 48,
      maxSavedProjects: 2
    });
  }

  // Categories
  if (!store.get('categories')) {
    store.set('categories', [
      { id: 1, name: 'Marble', icon: '🤍', enabled: true, order: 1 },
      { id: 2, name: 'Granite', icon: '🖤', enabled: true, order: 2 },
      { id: 3, name: 'Quartz', icon: '💎', enabled: true, order: 3 },
      { id: 4, name: 'Quartzite', icon: '🪨', enabled: true, order: 4 },
      { id: 5, name: 'Porcelain', icon: '⬜', enabled: true, order: 5 },
      { id: 6, name: 'Sintered Stone', icon: '🔷', enabled: true, order: 6 },
      { id: 7, name: 'Limestone', icon: '🟤', enabled: false, order: 7 },
      { id: 8, name: 'Onyx', icon: '💜', enabled: false, order: 8 },
      { id: 9, name: 'Travertine', icon: '🪵', enabled: false, order: 9 }
    ]);
  }

  // Stone Brands
  if (!store.get('brands')) {
    store.set('brands', [
      {
        id: 1, name: 'Silestone', category: 'Quartz', enabled: true,
        logo: '', description: 'Premium quartz surfaces by Cosentino',
        colours: [
          { id: 101, name: 'Eternal Calacatta Gold', sku: 'SIL-ECG', enabled: true, texture: 'marble', price: '' },
          { id: 102, name: 'Nebula Pearl', sku: 'SIL-NP', enabled: true, texture: 'quartz', price: '' },
          { id: 103, name: 'Iconic Black', sku: 'SIL-IB', enabled: true, texture: 'black', price: '' },
          { id: 104, name: 'Miami White', sku: 'SIL-MW', enabled: false, texture: 'marble', price: '' },
        ]
      },
      {
        id: 2, name: 'Dekton', category: 'Sintered Stone', enabled: true,
        logo: '', description: 'Ultra-compact surface by Cosentino',
        colours: [
          { id: 201, name: 'Kreta', sku: 'DEK-KR', enabled: true, texture: 'slate', price: '' },
          { id: 202, name: 'Opera', sku: 'DEK-OP', enabled: true, texture: 'marble', price: '' },
          { id: 203, name: 'Laurent', sku: 'DEK-LR', enabled: true, texture: 'black', price: '' },
        ]
      },
      {
        id: 3, name: 'Caesarstone', category: 'Quartz', enabled: true,
        logo: '', description: 'Global leader in quartz surfaces',
        colours: [
          { id: 301, name: 'Statuario Nuvo', sku: 'CAE-SN', enabled: true, texture: 'marble', price: '' },
          { id: 302, name: 'Vanilla Noir', sku: 'CAE-VN', enabled: true, texture: 'granite', price: '' },
          { id: 303, name: 'Cloudburst Concrete', sku: 'CAE-CC', enabled: false, texture: 'slate', price: '' },
        ]
      },
      {
        id: 4, name: 'Calacatta Premium', category: 'Marble', enabled: false,
        logo: '', description: 'Natural marble from Carrara quarries',
        colours: [
          { id: 401, name: 'Calacatta Gold', sku: 'CAL-GD', enabled: true, texture: 'marble', price: '' },
          { id: 402, name: 'Calacatta Extra', sku: 'CAL-EX', enabled: true, texture: 'marble', price: '' },
        ]
      }
    ]);
  }

  // Users
  if (!store.get('users')) {
    store.set('users', [
      { id: 1, name: 'Sophie Anderson', email: 'sophie@example.com', plan: 'Pro', credits: 78, visualisations: 23, downloads: 15, shares: 8, status: 'active', joined: '2025-11-14', lastActive: '2026-06-21' },
      { id: 2, name: 'James Mitchell', email: 'james.m@example.com', plan: 'Free', credits: 3, visualisations: 7, downloads: 2, shares: 1, status: 'active', joined: '2026-01-08', lastActive: '2026-06-20' },
      { id: 3, name: 'Priya Sharma', email: 'priya.s@home.co.uk', plan: 'Studio', credits: 312, visualisations: 89, downloads: 67, shares: 44, status: 'active', joined: '2025-09-02', lastActive: '2026-06-22' },
      { id: 4, name: 'Robert Chen', email: 'rchen@design.io', plan: 'Pro', credits: 0, visualisations: 11, downloads: 9, shares: 3, status: 'suspended', joined: '2025-12-20', lastActive: '2026-05-31' },
      { id: 5, name: 'Emma Williams', email: 'emma.w@gmail.com', plan: 'Free', credits: 10, visualisations: 0, downloads: 0, shares: 0, status: 'active', joined: '2026-06-15', lastActive: '2026-06-15' },
      { id: 6, name: 'Liam Patel', email: 'l.patel@studio.com', plan: 'Studio', credits: 890, visualisations: 214, downloads: 178, shares: 103, status: 'active', joined: '2025-07-19', lastActive: '2026-06-22' },
      { id: 7, name: 'Grace Thompson', email: 'grace.t@interior.co', plan: 'Pro', credits: 45, visualisations: 55, downloads: 40, shares: 22, status: 'active', joined: '2026-02-28', lastActive: '2026-06-19' },
      { id: 8, name: 'Oliver Scott', email: 'o.scott@build.ltd', plan: 'Free', credits: 0, visualisations: 10, downloads: 1, shares: 0, status: 'suspended', joined: '2026-04-11', lastActive: '2026-06-01' }
    ]);
  }

  // Analytics data
  if (!store.get('analytics')) {
    const last30 = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      last30.push({
        date: d.toISOString().split('T')[0],
        visualisations: Math.floor(Math.random() * 40) + 5,
        downloads: Math.floor(Math.random() * 20) + 2,
        shares: Math.floor(Math.random() * 10) + 1,
        newUsers: Math.floor(Math.random() * 5)
      });
    }
    store.set('analytics', last30);
  }
}

// Call seedData to ensure mock analytics data is present
seedData();

// ── Sidebar active state ──────────────────────
function setActiveSidebarItem() {
  const path = window.location.pathname;
  const page = path.split('/').pop().replace('.html', '');
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    const itemPage = href.split('/').pop().replace('.html', '');
    if (itemPage === page || (page === 'dashboard' && itemPage === 'dashboard')) {
      item.classList.add('active');
    }
  });
}

// ── Toast notification ────────────────────────
function showToast(msg, type = 'success') {
  const icons = {
    success: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:#4ade80"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:#f87171"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    warning: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:#fbbf24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  };
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Confirm dialog ────────────────────────────
function confirmAction(message, onConfirm) {
  const overlay = document.getElementById('confirm-overlay');
  if (!overlay) return onConfirm(); // fallback
  document.getElementById('confirm-message').textContent = message;
  overlay.classList.add('open');
  document.getElementById('confirm-yes').onclick = () => {
    overlay.classList.remove('open');
    onConfirm();
  };
  document.getElementById('confirm-no').onclick = () => {
    overlay.classList.remove('open');
  };
}

// ── Modal helpers ─────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ── Format helpers ────────────────────────────
function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(n) {
  return '£' + Number(n).toFixed(2);
}

// ── Get aggregate stats ───────────────────────
async function getStats() {
  const users = await fetchUsers();
  const analytics = store.get('analytics', []); // Mocked for now
  const settings = await fetchSettings();

  const totalVis = analytics.reduce((s, d) => s + d.visualisations, 0);
  const totalDl = analytics.reduce((s, d) => s + d.downloads, 0);
  const totalShares = analytics.reduce((s, d) => s + d.shares, 0);
  const activeUsers = users.filter(u => u.status === 'active').length;
  const paidUsers = users.filter(u => u.plan !== 'Free').length;

  const monthlyRevenue = paidUsers * (settings.monthlyPrice || 9.99);

  return {
    totalUsers: users.length,
    activeUsers,
    paidUsers,
    totalVisualisations: totalVis,
    totalDownloads: totalDl,
    totalShares,
    revenue: monthlyRevenue
  };
}

// ── Mini bar chart ────────────────────────────
function renderMiniChart(canvasId, data, color = '#c9a96e') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.clearRect(0,0,w,h);
  if (!data || !data.length) return;
  
  const max = Math.max(...data, 1);
  const barW = Math.max(2, (w / data.length) - 2);
  
  ctx.fillStyle = color;
  data.forEach((val, i) => {
    const barH = (val / max) * h;
    const x = i * (w / data.length);
    const y = h - barH;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 2);
    ctx.fill();
  });
}

// ── Async Admin Data Helpers ──────────────────
async function fetchBrands() {
  if (!supabaseClient) return store.get('brands', []);
  const { data: brands, error: bErr } = await supabaseClient.from('brands').select('*');
  const { data: colours, error: cErr } = await supabaseClient.from('colours').select('*');
  if (bErr || cErr) return store.get('brands', []);
  
  return brands.map(brand => {
    return {
      ...brand,
      colours: colours.filter(c => c.brand_id == brand.id)
    };
  });
}

async function fetchCategories() {
  if (!supabaseClient) return store.get('categories', []);
  const { data } = await supabaseClient.from('categories').select('*').order('display_order');
  return data || store.get('categories', []);
}

async function fetchUsers() {
  if (!supabaseClient) return store.get('users', []);
  const { data } = await supabaseClient.from('profiles').select('*');
  // Map Supabase profiles to admin format
  return data ? data.map(p => ({
    id: p.id,
    name: p.name || p.full_name || 'Unknown',
    email: p.email,
    plan: p.plan || 'Free',
    credits: p.credits !== undefined ? p.credits : 0,
    visualisations: p.visualisations || 0,
    downloads: p.downloads || 0,
    shares: p.shares || 0,
    status: p.status || 'active',
    joined: p.created_at || new Date().toISOString(),
    lastActive: p.updated_at || new Date().toISOString()
  })) : store.get('users', []);
}

async function fetchSettings() {
  if (!supabaseClient) return store.get('settings', {});
  const { data } = await supabaseClient.from('settings').select('*').single();
  return data || store.get('settings', {});
}

// ── Async Admin Write Helpers ─────────────────
async function saveBrandToDB(brand) {
  if (!supabaseClient) return;
  if (brand.id) {
    await supabaseClient.from('brands').update({
      name: brand.name,
      category: brand.category,
      description: brand.description,
      enabled: brand.enabled
    }).eq('id', brand.id);
  } else {
    await supabaseClient.from('brands').insert([{
      name: brand.name,
      category: brand.category,
      description: brand.description,
      enabled: brand.enabled
    }]);
  }
}

async function deleteBrandFromDB(id) {
  if (!supabaseClient) return;
  await supabaseClient.from('colours').delete().eq('brand_id', id);
  await supabaseClient.from('brands').delete().eq('id', id);
}

async function saveColourToDB(colour) {
  if (!supabaseClient) return;
  if (colour.id) {
    await supabaseClient.from('colours').update({
      name: colour.name,
      sku: colour.sku,
      texture: colour.texture,
      enabled: colour.enabled
    }).eq('id', colour.id);
  } else {
    await supabaseClient.from('colours').insert([{
      brand_id: colour.brand_id,
      name: colour.name,
      sku: colour.sku,
      texture: colour.texture,
      enabled: colour.enabled
    }]);
  }
}

async function deleteColourFromDB(id) {
  if (!supabaseClient) return;
  await supabaseClient.from('colours').delete().eq('id', id);
}

async function saveCategoryToDB(cat) {
  if (!supabaseClient) return;
  if (cat.id) {
    await supabaseClient.from('categories').update({
      name: cat.name,
      icon: cat.icon,
      enabled: cat.enabled,
      display_order: cat.display_order
    }).eq('id', cat.id);
  } else {
    await supabaseClient.from('categories').insert([{
      name: cat.name,
      icon: cat.icon,
      enabled: cat.enabled,
      display_order: cat.display_order
    }]);
  }
}

async function deleteCategoryFromDB(id) {
  if (!supabaseClient) return;
  await supabaseClient.from('categories').delete().eq('id', id);
}

async function updateProfileInDB(id, updates) {
  if (!supabaseClient) return;
  await supabaseClient.from('profiles').update(updates).eq('id', id);
}

async function updateSettingsInDB(settings) {
  if (!supabaseClient) return;
  // Upsert settings (assuming id = 1)
  await supabaseClient.from('settings').upsert({ id: 1, ...settings });
}

function drawMiniBarChart(canvas, data, color = '#c9a96e') {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const max = Math.max(...data, 1);
  const barW = W / data.length;
  ctx.clearRect(0, 0, W, H);

  data.forEach((v, i) => {
    const barH = (v / max) * (H - 8);
    const x = i * barW + 2;
    const y = H - barH;
    const gradient = ctx.createLinearGradient(0, y, 0, H);
    gradient.addColorStop(0, color + 'cc');
    gradient.addColorStop(1, color + '22');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barW - 4, barH, 3);
    ctx.fill();
  });
}

// ── On DOM ready ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  seedData();
  setActiveSidebarItem();

  // Mobile sidebar toggle
  const menuBtn = document.getElementById('menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
});
