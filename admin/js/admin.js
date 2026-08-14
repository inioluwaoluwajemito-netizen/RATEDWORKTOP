/* ============================================
   RatedWorktops Admin — Shared JavaScript
   ============================================ */

// ── Supabase Configuration ────────────────────
// Replace these with your own live Supabase project credentials to connect to a real database
const SUPABASE_URL = 'https://cvzeelapjwdvpotuvbrz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2emVlbGFwandkdnBvdHV2YnJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxODI0NzAsImV4cCI6MjA5Nzc1ODQ3MH0.1zhb3W30NmK8wwW5q6_eJ_ExHd0zoyWhYvCG7w5T3S4';

// ── Supabase Initialization ───────────────────
// Use real Supabase when the library and credentials are available.
// The mock client below is a fallback for offline/local development only.
function safeGetLocalStorage(key, fallback = []) {
  try {
    const val = localStorage.getItem(key);
    if (!val || val === 'undefined') return fallback;
    return JSON.parse(val);
  } catch (e) {
    return fallback;
  }
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[safeSetLocalStorage] Storage write failed:', e);
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

const store = {
  _cache: {},
  get(key, fallback = null) {
    try {
      if (this._cache[key] !== undefined && this._cache[key] !== null) return this._cache[key];
      const item = localStorage.getItem('rw_' + key) || localStorage.getItem('ratedworktops_' + key);
      return item ? JSON.parse(item) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, val) {
    try {
      this._cache[key] = val;
      localStorage.setItem('rw_' + key, JSON.stringify(val));
      localStorage.setItem('ratedworktops_' + key, JSON.stringify(val));
    } catch (e) { }
  }
};

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
  if (!colours || !Array.isArray(colours)) return;
  let brands = safeGetLocalStorage('rw_brands');
  if (!brands || !brands.length) {
    initBrandsAndColours();
    brands = safeGetLocalStorage('rw_brands');
  }
  const updatedBrands = brands.map(brand => {
    const matchingCols = colours.filter(c =>
      String(c.brand_id) === String(brand.id) ||
      String(c.brand_id).toLowerCase() === String(brand.name).toLowerCase() ||
      (c.brand_name && c.brand_name.toLowerCase() === brand.name.toLowerCase())
    );
    const existing = brand.colours || [];
    const combined = [...existing];
    matchingCols.forEach(mc => {
      const idx = combined.findIndex(c => c.id == mc.id || (c.name && c.name === mc.name));
      if (idx >= 0) combined[idx] = { ...combined[idx], ...mc };
      else combined.push(mc);
    });
    return {
      ...brand,
      colours: combined
    };
  });
  localStorage.setItem('rw_brands', JSON.stringify(updatedBrands));
  if (typeof store !== 'undefined' && store.set) {
    store.set('brands', updatedBrands);
  }
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
  // Clear ALL legacy localStorage brand/colour caches on load
  // Supabase is now the single source of truth
  const keysToRemove = [
    'rw_brands', 'rw_local_brands', 'rw_local_colours',
    'rw_deleted_brands', 'rw_colours', 'rw_local_categories',
    'rw_categories'
  ];
  keysToRemove.forEach(key => {
    try { localStorage.removeItem(key); } catch(e) {}
  });
  console.log('[initBrandsAndColours] Cleared all legacy localStorage caches — Supabase is now the source of truth.');
}

function fetchBrandsSync() {
  // No more localStorage seed data — return whatever is in the in-memory store
  // or an empty array. Supabase is the only source of truth.
  if (typeof store !== 'undefined') {
    const cached = store.get('brands', []);
    if (cached && cached.length > 0) return cached;
  }
  return [];
}

// ── Async Admin Data Helpers ──────────────────
async function fetchBrands() {
  if (supabaseClient) {
    try {
      const [bRes, cRes] = await Promise.all([
        supabaseClient.from('brands').select('*'),
        supabaseClient.from('colours').select('*')
      ]);

      if (bRes && !bRes.error && bRes.data) {
        const dbBrands = bRes.data.filter(b => b && b.name);
        const dbColours = (cRes && !cRes.error && cRes.data) ? cRes.data : [];

        const brandMap = new Map();
        dbBrands.forEach(b => {
          if (!b || !b.name) return;
          brandMap.set(String(b.id), {
            id: b.id,
            name: b.name,
            category: b.category || 'Quartz',
            description: b.description || '',
            enabled: b.enabled !== false,
            colours: []
          });
        });

        dbColours.forEach(c => {
          if (!c || !c.name) return;
          const rawBrandId = String(c.brand_id || '').toLowerCase().trim();
          const rawBrandName = String(c.brand_name || '').toLowerCase().trim();

          let targetBrand = null;
          for (const b of brandMap.values()) {
            const bId = String(b.id || '').toLowerCase().trim();
            const bName = String(b.name || '').toLowerCase().trim();

            if (
              (rawBrandId && (rawBrandId === bId || rawBrandId === bName)) ||
              (rawBrandName && (rawBrandName === bName || rawBrandName === bId))
            ) {
              targetBrand = b;
              break;
            }
          }

          if (targetBrand) {
            targetBrand.colours.push({
              id: c.id,
              brand_id: c.brand_id,
              name: c.name,
              sku: c.sku || '',
              finish: c.finish || 'Polished',
              thickness: c.thickness || '20mm',
              price_tier: c.price_tier || 'Standard',
              price_per_m2: c.price_per_m2 || 150,
              image_url: c.image_url || 'images/placeholder-kitchen.jpg',
              texture: c.texture || 'marble',
              enabled: c.enabled !== false
            });
          }
        });

        const results = Array.from(brandMap.values());
        store.set('brands', results);
        return results;
      }
    } catch (e) {
      console.warn('[Admin Brands] Supabase fetch notice:', e);
    }
  }

  // Fallback to local storage cache only if offline
  const syncBrands = fetchBrandsSync();
  store.set('brands', syncBrands);
  return syncBrands;
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
        let adminUser = profiles.find(p => p.email === 'ratedworktopsapp@gmail.com');
        if (!adminUser) {
          adminUser = {
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
          profiles.push(adminUser);
          localStorage.setItem('rw_profiles', JSON.stringify(profiles));
          syncProfilesToUsers(profiles);
        }

        const session = {
          user: {
            id: adminUser.id,
            email: adminUser.email,
            user_metadata: { name: adminUser.name }
          },
          access_token: 'mock-token-' + adminUser.id,
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

  async rpc(functionName, params) {
    if (functionName === 'delete_user_completely' && params) {
      const targetId = params.target_user_id || params.user_id;
      if (targetId) {
        try {
          let profiles = JSON.parse(localStorage.getItem('rw_profiles') || '[]');
          profiles = profiles.filter(p => p.id != targetId && String(p.id) !== String(targetId));
          localStorage.setItem('rw_profiles', JSON.stringify(profiles));
        } catch (e) { }
      }
    }
    return { data: true, error: null };
  }
}

if (typeof window !== 'undefined') {
  window.MockSupabaseQuery = MockSupabaseQuery;
  window.MockSupabaseClient = MockSupabaseClient;
}

function createMockSupabaseClient() {
  const ClientClass = typeof MockSupabaseClient !== 'undefined' ? MockSupabaseClient : (typeof window !== 'undefined' ? window.MockSupabaseClient : null);
  if (ClientClass) return new ClientClass();
  return null;
}
if (typeof window !== 'undefined') {
  window.createMockSupabaseClient = createMockSupabaseClient;
}

// Instantiate real Supabase client — always use real Supabase when the library is loaded
const useRealSupabase = !!(typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
const supabaseClient = useRealSupabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : createMockSupabaseClient();

// Seed initial mock data to ensure localStorage is always populated
initProfilesTable();
initBrandsAndColours();

// ── Demo credentials ──────────────────────────
const ADMIN_CREDENTIALS = {
  email: 'ratedworktopsapp@gmail.com',
  password: 'Ratedworktopsapp@'
};

// ── Auth Guard ────────────────────────────────
async function requireAuth() {
  let session = null;

  // 0. Check localStorage admin session / bypass flag
  try {
    const adminFlag = localStorage.getItem('rw_admin_logged_in');
    const sessionStr = localStorage.getItem('rw_session');
    if (sessionStr) {
      session = JSON.parse(sessionStr);
    }
    if (adminFlag === 'true' && (!session || !session.user)) {
      session = { user: { email: 'ratedworktopsapp@gmail.com' } };
    }
  } catch (e) { }

  // 1. Check local/mock session FIRST — instant, no network, no lock issues
  if (!session || !session.user) {
    try {
      const mockClient = createMockSupabaseClient();
      if (mockClient) {
        const { data } = await mockClient.auth.getSession();
        session = data ? data.session : null;
      }
    } catch (e) { }
  }

  // 2. If no local session, try real Supabase with 1s timeout
  if (!session || !session.user) {
    try {
      if (supabaseClient && supabaseClient.auth) {
        const realSessionPromise = supabaseClient.auth.getSession();
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ data: { session: null } }), 1000));
        const { data } = await Promise.race([realSessionPromise, timeoutPromise]);
        session = data ? data.session : null;
      }
    } catch (e) { }
  }

  const userEmail = session && session.user && session.user.email ? session.user.email.toLowerCase().trim() : '';

  if (!session || !session.user || (userEmail && userEmail !== 'ratedworktopsapp@gmail.com')) {
    const currentPath = window.location.pathname;
    if (!currentPath.endsWith('/index.html') && !currentPath.endsWith('/admin/') && !currentPath.endsWith('/admin')) {
      window.location.href = 'index.html';
    }
    return false;
  }
  return true;
}

async function logout() {
  try {
    await supabaseClient.auth.signOut();
  } catch (e) { }
  try {
    const mockClient = createMockSupabaseClient();
    if (mockClient) {
      await mockClient.auth.signOut();
    }
  } catch (e) { }
  // Clear ALL auth state so requireAuth() doesn't bypass
  localStorage.removeItem('rw_admin_logged_in');
  localStorage.removeItem('rw_session');
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
          { id: 104, name: 'Miami White', sku: 'SIL-MW', enabled: true, texture: 'marble', price: '' },
          { id: 105, name: 'Desert Silver', sku: 'SIL-DS', enabled: true, texture: 'slate', price: '' }
        ]
      },
      {
        id: 2, name: 'Dekton', category: 'Sintered Stone', enabled: true,
        logo: '', description: 'Ultra-compact surface by Cosentino',
        colours: [
          { id: 201, name: 'Kreta', sku: 'DEK-KR', enabled: true, texture: 'slate', price: '' },
          { id: 202, name: 'Opera', sku: 'DEK-OP', enabled: true, texture: 'marble', price: '' },
          { id: 203, name: 'Laurent', sku: 'DEK-LR', enabled: true, texture: 'black', price: '' },
          { id: 204, name: 'Kira', sku: 'DEK-KI', enabled: true, texture: 'marble', price: '' },
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
          { id: 304, name: 'Empira White', sku: 'CAE-EW', enabled: true, texture: 'marble', price: '' }
        ]
      },
      {
        id: 4, name: 'Neolith', category: 'Sintered Stone', enabled: true,
        logo: '', description: 'The most advanced sintered stone',
        colours: [
          { id: 501, name: 'Arctic White', sku: 'NEO-AW', enabled: true, texture: 'quartz', price: '' },
          { id: 502, name: 'Iron Grey', sku: 'NEO-IG', enabled: true, texture: 'slate', price: '' },
          { id: 503, name: 'Nero Zimbabwe', sku: 'NEO-NZ', enabled: true, texture: 'black', price: '' }
        ]
      },
      {
        id: 5, name: 'Calacatta Premium', category: 'Marble', enabled: true,
        logo: '', description: 'Natural marble from Carrara quarries',
        colours: []
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

  // Analytics data (Generate 365 days)
  if (!store.get('analytics') || store.get('analytics').length < 300) {
    const yearData = [];
    for (let i = 365; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      yearData.push({
        date: d.toISOString().split('T')[0],
        visualisations: Math.floor(Math.random() * 40) + 5,
        downloads: Math.floor(Math.random() * 20) + 2,
        shares: Math.floor(Math.random() * 10) + 1,
        newUsers: Math.floor(Math.random() * 5)
      });
    }
    store.set('analytics', yearData);
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
    warning: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:#fbbf24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:#60a5fa"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  };
  const iconHtml = icons[type] || icons.success;
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${iconHtml}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
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

  ctx.clearRect(0, 0, w, h);
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

async function fetchCategories() {
  const localCats = store.get('categories', []);
  if (!supabaseClient) return localCats;

  const dbPromise = (async () => {
    try {
      const { data } = await supabaseClient.from('categories').select('*').order('display_order');
      if (data && data.length > 0) {
        return data.map(c => ({
          id: c.id,
          name: c.name,
          icon: c.icon || '🪨',
          enabled: c.enabled !== false,
          display_order: c.display_order || c.order || 1
        }));
      }
    } catch (e) { }
    return null;
  })();

  const timeoutPromise = new Promise(res => setTimeout(() => res(null), 2000));
  const remoteCats = await Promise.race([dbPromise, timeoutPromise]);

  if (!remoteCats || remoteCats.length === 0) return localCats;

  const merged = [...remoteCats];
  for (const lc of localCats) {
    if (!merged.some(c => c.id == lc.id || (c.name && c.name.toLowerCase() === lc.name.toLowerCase()))) {
      merged.push(lc);
    }
  }
  return merged;
}

async function fetchUsers() {
  if (!supabaseClient) return store.get('users', []);

  try {
    const { data, error } = await supabaseClient.from('profiles').select('*');
    if (!error && data && Array.isArray(data)) {
      const dbUsers = data.map(p => ({
        id: p.id,
        name: p.name || p.full_name || (p.email ? p.email.split('@')[0] : 'Unknown'),
        email: p.email,
        plan: p.plan || 'Free',
        credits: p.credits !== undefined ? p.credits : 10,
        visualisations: p.visualisations || 0,
        downloads: p.downloads || 0,
        shares: p.shares || 0,
        status: p.status || 'active',
        joined: p.created_at || new Date().toISOString(),
        lastActive: p.updated_at || p.created_at || new Date().toISOString()
      }));
      store.set('users', dbUsers);
      return dbUsers;
    }
  } catch (e) {
    console.warn('[Admin fetchUsers] DB fetch notice:', e);
  }

  return store.get('users', []);
}

const DEFAULT_SETTINGS = {
  freeCreditsEnabled: true,
  subscriptionsEnabled: true,
  freeCreditsCount: 10,
  monthlyPrice: 9.99,
  monthlyCredits: 100,
  annualPrice: 89.99,
  annualCredits: 1500,
  tempStorageHours: 48,
  maxSavedProjects: 2
};

function normalizeSettingsData(data) {
  if (!data) return DEFAULT_SETTINGS;
  const source = data.data || data;
  return {
    freeCreditsEnabled: (typeof source.free_credits_enabled === 'boolean') ? source.free_credits_enabled : ((typeof source.freeCreditsEnabled === 'boolean') ? source.freeCreditsEnabled : DEFAULT_SETTINGS.freeCreditsEnabled),
    subscriptionsEnabled: (typeof source.subscriptions_enabled === 'boolean') ? source.subscriptions_enabled : ((typeof source.subscriptionsEnabled === 'boolean') ? source.subscriptionsEnabled : DEFAULT_SETTINGS.subscriptionsEnabled),
    freeCreditsCount: source.free_credits_count !== undefined && source.free_credits_count !== null ? Number(source.free_credits_count) : (source.freeCreditsCount !== undefined && source.freeCreditsCount !== null ? Number(source.freeCreditsCount) : DEFAULT_SETTINGS.freeCreditsCount),
    monthlyPrice: source.monthly_price !== undefined && source.monthly_price !== null ? Number(source.monthly_price) : (source.monthlyPrice !== undefined && source.monthlyPrice !== null ? Number(source.monthlyPrice) : DEFAULT_SETTINGS.monthlyPrice),
    monthlyCredits: source.monthly_credits !== undefined && source.monthly_credits !== null ? Number(source.monthly_credits) : (source.monthlyCredits !== undefined && source.monthlyCredits !== null ? Number(source.monthlyCredits) : DEFAULT_SETTINGS.monthlyCredits),
    annualPrice: source.annual_price !== undefined && source.annual_price !== null ? Number(source.annual_price) : (source.annualPrice !== undefined && source.annualPrice !== null ? Number(source.annualPrice) : DEFAULT_SETTINGS.annualPrice),
    annualCredits: source.annual_credits !== undefined && source.annual_credits !== null ? Number(source.annual_credits) : (source.annualCredits !== undefined && source.annualCredits !== null ? Number(source.annualCredits) : DEFAULT_SETTINGS.annualCredits),
    tempStorageHours: source.temp_storage_hours !== undefined && source.temp_storage_hours !== null ? Number(source.temp_storage_hours) : (source.tempStorageHours !== undefined && source.tempStorageHours !== null ? Number(source.tempStorageHours) : DEFAULT_SETTINGS.tempStorageHours),
    maxSavedProjects: source.max_saved_projects !== undefined && source.max_saved_projects !== null ? Number(source.max_saved_projects) : (source.maxSavedProjects !== undefined && source.maxSavedProjects !== null ? Number(source.maxSavedProjects) : DEFAULT_SETTINGS.maxSavedProjects),
    _updatedAt: source._updatedAt || source.updated_at || new Date().toISOString()
  };
}

// ── Async Admin Write Helpers ─────────────────
// ALL writes go directly to Supabase. No localStorage.

async function saveBrandToDB(brand) {
  if (!supabaseClient) {
    console.error('[saveBrandToDB] No Supabase client available');
    if (typeof showToast === 'function') showToast('Cannot save: no database connection', 'error');
    return null;
  }

  // ID must be a numeric bigint
  let brandId = Number(brand.id);
  if (!brand.id || isNaN(brandId)) {
    brandId = Date.now() + Math.floor(Math.random() * 1000);
  }

  const payload = {
    id: brandId,
    name: brand.name,
    category: brand.category || 'Quartz',
    description: brand.description || '',
    enabled: brand.enabled !== false
  };

  try {
    const { error: err } = await supabaseClient.from('brands').upsert([payload]);
    if (err) {
      console.error('[saveBrandToDB] DB write error:', err);
      if (typeof showToast === 'function') showToast('Failed to save brand: ' + err.message, 'error');
      throw new Error('Supabase brand save failed: ' + err.message);
    }
    console.log('[saveBrandToDB] Saved brand to Supabase:', brandId, brand.name);
  } catch (e) {
    console.error('[saveBrandToDB] Exception:', e);
    if (typeof showToast === 'function') showToast('Error saving brand: ' + e.message, 'error');
    throw e;
  }

  return { ...payload, colours: brand.colours || [] };
}

async function deleteBrandFromDB(id, brandName) {
  // Clear from in-memory store
  if (typeof store !== 'undefined' && store.get) {
    try {
      let b = store.get('brands') || [];
      store.set('brands', b.filter(item => item.id != id && String(item.id) !== String(id)));
    } catch (e) { }
  }

  if (!supabaseClient) return;
  try {
    const numId = Number(id);
    // Delete associated colours first
    await supabaseClient.from('colours').delete().eq('brand_id', numId);
    // Delete brand
    const { error: bErr } = await supabaseClient.from('brands').delete().eq('id', numId);
    if (brandName) {
      await supabaseClient.from('brands').delete().eq('name', brandName);
    }
    if (bErr) {
      console.error('[deleteBrandFromDB] Error:', bErr);
      if (typeof showToast === 'function') showToast('Failed to delete brand: ' + bErr.message, 'error');
      throw new Error('Supabase brand delete failed: ' + bErr.message);
    }
    console.log('[deleteBrandFromDB] Deleted brand from Supabase:', id, brandName);
  } catch (e) {
    console.error('[deleteBrandFromDB] Exception:', e);
    if (typeof showToast === 'function') showToast('Error deleting brand: ' + e.message, 'error');
    throw e;
  }
}

async function saveColourToDB(colour) {
  if (!supabaseClient) {
    console.error('[saveColourToDB] No Supabase client available');
    if (typeof showToast === 'function') showToast('Cannot save: no database connection', 'error');
    return null;
  }

  // Generate numeric BIGINT ID
  let colId = Number(colour.id);
  if (!colour.id || isNaN(colId)) {
    colId = Date.now() + Math.floor(Math.random() * 1000);
  }

  // Resolve brand_id to numeric
  let brandId = Number(colour.brand_id);
  if (isNaN(brandId) || !brandId) {
    // Try to look up the brand by name
    try {
      const brands = await fetchBrands();
      const found = brands ? brands.find(b =>
        String(b.id) === String(colour.brand_id) ||
        (b.name && b.name.toLowerCase() === String(colour.brand_name || colour.brand_id || '').toLowerCase())
      ) : null;
      if (found && !isNaN(Number(found.id))) {
        brandId = Number(found.id);
      }
    } catch(e) {}
  }
  if (isNaN(brandId)) brandId = 0;

  const payload = {
    id: colId,
    brand_id: brandId,
    brand_name: colour.brand_name || '',
    name: colour.name,
    sku: colour.sku || (colour.name.replace(/\s+/g, '-').toUpperCase()),
    finish: colour.finish || 'Polished',
    texture: colour.texture || 'marble',
    image_url: colour.image_url || '',
    enabled: colour.enabled !== false
  };

  try {
    const { error: err } = await supabaseClient.from('colours').upsert([payload]);
    if (err) {
      console.error('[saveColourToDB] DB write error:', err);
      if (typeof showToast === 'function') showToast('Failed to save stone colour: ' + err.message, 'error');
      throw new Error('Supabase colour save failed: ' + err.message);
    }
    console.log('[saveColourToDB] Saved colour to Supabase:', colId, colour.name);
  } catch (dbErr) {
    console.error('[saveColourToDB] Exception:', dbErr);
    if (typeof showToast === 'function') showToast('Error saving stone colour: ' + dbErr.message, 'error');
    throw dbErr;
  }

  return payload;
}

async function deleteColourFromDB(id, brandId, colourName) {
  // Clear from in-memory store
  if (typeof store !== 'undefined' && store.get) {
    try {
      let b = store.get('brands') || [];
      b.forEach(brand => {
        if (brand.colours) brand.colours = brand.colours.filter(c => c.id != id && String(c.id) !== String(id));
      });
      store.set('brands', b);
    } catch (e) { }
  }

  if (!supabaseClient) return;
  try {
    const numId = Number(id);
    const { error: err } = await supabaseClient.from('colours').delete().eq('id', numId);
    if (err) console.warn('[deleteColourFromDB] DB delete notice:', err);
    if (colourName) {
      await supabaseClient.from('colours').delete().eq('name', colourName);
    }
    console.log('[deleteColourFromDB] Deleted colour from Supabase:', id, colourName);
  } catch (e) {
    console.warn('[deleteColourFromDB] Exception:', e);
  }
}

async function saveCategoryToDB(cat) {
  let localCats = [];
  try { localCats = JSON.parse(localStorage.getItem('rw_local_categories') || '[]'); } catch (e) { }

  const catId = cat.id || ('cat_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36));
  const fullCatRecord = {
    id: catId,
    name: cat.name,
    icon: cat.icon || '🪨',
    enabled: cat.enabled !== false,
    display_order: cat.display_order || (localCats.length + 1)
  };

  const existingIdx = localCats.findIndex(c => c.id == catId || (c.name && c.name.toLowerCase() === cat.name.toLowerCase()));
  if (existingIdx >= 0) {
    localCats[existingIdx] = fullCatRecord;
  } else {
    localCats.push(fullCatRecord);
  }
  try { localStorage.setItem('rw_local_categories', JSON.stringify(localCats)); } catch (e) { }

  let rwCats = safeGetLocalStorage('rw_categories');
  const cIdx = rwCats.findIndex(c => c.id == catId || (c.name && c.name.toLowerCase() === cat.name.toLowerCase()));
  if (cIdx >= 0) {
    rwCats[cIdx] = { ...rwCats[cIdx], ...fullCatRecord };
  } else {
    rwCats.push(fullCatRecord);
  }
  try { localStorage.setItem('rw_categories', JSON.stringify(rwCats)); } catch (e) { }

  if (!supabaseClient) return fullCatRecord;
  try {
    const { error: err } = await supabaseClient.from('categories').upsert([{
      id: String(catId),
      name: cat.name,
      icon: cat.icon || '🪨',
      enabled: cat.enabled !== false,
      display_order: cat.display_order || 1
    }]);
    if (err) console.warn('[saveCategoryToDB] DB write notice:', err);
  } catch (e) {
    console.warn('[saveCategoryToDB] DB write notice:', e);
  }
  return fullCatRecord;
}

async function deleteCategoryFromDB(id) {
  try {
    let cats = safeGetLocalStorage('rw_categories');
    cats = cats.filter(c => c.id != id && String(c.id) !== String(id) && c.name != id);
    localStorage.setItem('rw_categories', JSON.stringify(cats));
  } catch (e) { }

  if (!supabaseClient) return;
  try {
    const strId = String(id);
    await supabaseClient.from('categories').delete().eq('id', strId);
  } catch (e) {
    console.warn('[deleteCategoryFromDB] DB delete notice:', e);
  }
}

async function updateProfileInDB(id, updates) {
  if (!id) return { error: 'No user ID provided' };

  // 1. Update local memory store and localStorage
  try {
    let users = store.get('users', []);
    users = users.map(u => u.id == id || String(u.id) === String(id) ? { ...u, ...updates } : u);
    store.set('users', users);
  } catch (e) { }

  if (typeof localStorage !== 'undefined') {
    try {
      let cached = JSON.parse(localStorage.getItem('rw_users') || '[]');
      cached = cached.map(u => u.id == id || String(u.id) === String(id) ? { ...u, ...updates } : u);
      localStorage.setItem('rw_users', JSON.stringify(cached));
    } catch (e) { }
  }

  // 2. Update Supabase DB profiles table
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient.from('profiles').update(updates).eq('id', id);
      if (error) {
        console.warn('[updateProfileInDB] Supabase DB profile update notice:', error.message);
      }
    } catch (err) {
      console.warn('[updateProfileInDB] Notice:', err);
    }
  }

  return { error: null };
}

async function fetchSettings() {
  // 1. Primary Source of Truth: Fetch fresh settings directly from Supabase DB settings table (id=1)
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('settings').select('*').eq('id', 1).maybeSingle();
      if (!error && data) {
        const normalized = normalizeSettingsData(data);
        store.set('settings', normalized);
        safeSetLocalStorage('ratedworktops_settings', normalized);
        safeSetLocalStorage('rw_settings', normalized);
        return normalized;
      }
    } catch (err) {
      console.warn('[Admin Settings] Supabase DB fetch notice:', err);
    }

    // 2. Backup DB location: Fetch from admin profile in profiles table
    try {
      const { data, error } = await supabaseClient.from('profiles').select('settings').eq('email', 'ratedworktopsapp@gmail.com').maybeSingle();
      if (!error && data && data.settings) {
        const normalized = normalizeSettingsData(data.settings);
        store.set('settings', normalized);
        safeSetLocalStorage('ratedworktops_settings', normalized);
        safeSetLocalStorage('rw_settings', normalized);
        return normalized;
      }
    } catch (err) {
      console.warn('[Admin Settings] Admin profile settings fetch notice:', err);
    }
  }

  // 3. Fallback only if offline/unreachable: return cached or defaults
  let cached = store.get('settings') || safeGetLocalStorage('ratedworktops_settings', null) || safeGetLocalStorage('rw_settings', null);
  return cached ? normalizeSettingsData(cached) : DEFAULT_SETTINGS;
}

// ── Async Admin Write Helpers ─────────────────

async function deleteProfileFromDB(id) {
  if (!id) return { error: new Error('No user ID provided') };

  // 1. Delete from memory store & local cache
  try {
    let localUsers = store.get('users', []);
    localUsers = localUsers.filter(u => String(u.id) !== String(id) && (u.email && String(u.email).toLowerCase() !== String(id).toLowerCase()));
    store.set('users', localUsers);
  } catch (e) { }

  if (typeof localStorage !== 'undefined') {
    try {
      ['rw_users', 'rw_local_users', 'rw_profiles', 'rw_app_users'].forEach(key => {
        let cached = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(cached)) {
          cached = cached.filter(u => String(u.id) !== String(id) && (u.email && String(u.email).toLowerCase() !== String(id).toLowerCase()));
          localStorage.setItem(key, JSON.stringify(cached));
        }
      });
    } catch (e) { }
  }

  if (!supabaseClient) return { error: null };

  let rpcSuccess = false;
  try {
    if (typeof supabaseClient.rpc === 'function') {
      const res = await supabaseClient.rpc('delete_user_completely', { target_user_id: id });
      if (res && !res.error) rpcSuccess = true;
    }
  } catch (rpcErr) {
    console.warn('[deleteProfileFromDB] RPC delete notice:', rpcErr);
  }

  let dbError = null;
  try {
    const deleteRes = await supabaseClient.from('profiles').delete().eq('id', id);
    if (deleteRes && deleteRes.error) {
      dbError = deleteRes.error;
    }
  } catch (dbErr) {
    dbError = dbErr;
  }

  if (rpcSuccess) return { error: null };
  if (dbError) return { error: dbError };

  return { error: null };
}

async function updateSettingsInDB(settings) {
  const now = new Date().toISOString();
  const normalized = { ...normalizeSettingsData(settings), _updatedAt: now };

  if (!supabaseClient) {
    return { data: null, error: new Error('Supabase client not connected') };
  }

  const payload = {
    id: 1,
    free_credits_enabled: normalized.freeCreditsEnabled,
    subscriptions_enabled: normalized.subscriptionsEnabled,
    free_credits_count: normalized.freeCreditsCount,
    monthly_price: normalized.monthlyPrice,
    monthly_credits: normalized.monthlyCredits,
    annual_price: normalized.annualPrice,
    annual_credits: normalized.annualCredits,
    temp_storage_hours: normalized.tempStorageHours,
    max_saved_projects: normalized.maxSavedProjects,
    data: normalized,
    updated_at: now
  };

  // Direct write to Supabase settings table (id=1)
  let { data, error } = await supabaseClient.from('settings').upsert(payload, { onConflict: 'id' }).select();

  // If error relates to missing updated_at column in schema, retry without updated_at
  if (error && error.message && error.message.toLowerCase().includes('updated_at')) {
    const payloadNoUpdatedAt = { ...payload };
    delete payloadNoUpdatedAt.updated_at;
    const retryRes = await supabaseClient.from('settings').upsert(payloadNoUpdatedAt, { onConflict: 'id' }).select();
    if (!retryRes.error && retryRes.data && retryRes.data.length > 0) {
      data = retryRes.data;
      error = null;
    }
  }

  if (error || !data || data.length === 0) {
    // Fallback update by ID
    const updateRes = await supabaseClient.from('settings').update(payload).eq('id', 1).select();
    if (!updateRes.error && updateRes.data && updateRes.data.length > 0) {
      data = updateRes.data;
      error = null;
    } else if (!error && updateRes.error) {
      error = updateRes.error;
    }
  }

  if (!error && data && data.length > 0) {
    if (typeof store !== 'undefined' && store.set) {
      store.set('settings', normalized);
    }
    console.log('[Admin Settings] Settings successfully persisted to Supabase DB settings table!');
    return { data: data[0], error: null };
  } else {
    console.error('[Admin Settings] Supabase DB write failed:', error ? error.message : '0 rows updated');
    return { data: null, error: error || new Error('0 rows updated in settings table') };
  }
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

// ── Notification System ───────────────────────
const _adminNotifications = [];

function getNotifIcon(type) {
  const icons = {
    user: `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    subscription: `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
    credit: `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    settings: `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
    warning: `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    stone: `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`
  };
  return icons[type] || icons.user;
}

function getNotifStyle(type) {
  const styles = {
    user: { bg: 'rgba(201,169,110,0.15)', color: 'var(--gold)' },
    subscription: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
    credit: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
    settings: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
    warning: { bg: 'rgba(248,113,113,0.15)', color: 'var(--danger)' },
    stone: { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
  };
  return styles[type] || styles.user;
}

function formatTimeAgo(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' mins ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' hours ago';
  return Math.floor(diff / 86400) + ' days ago';
}

function addNotification(text, type = 'user', timestamp = null) {
  const notif = {
    id: Date.now() + Math.random(),
    text,
    type,
    timestamp: timestamp || new Date().toISOString(),
    unread: true
  };
  _adminNotifications.unshift(notif);
  // Keep max 50 notifications
  if (_adminNotifications.length > 50) _adminNotifications.pop();
  renderNotifications();
  // Show notification dot
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = 'block';
  // Show toast for live events
  if (typeof showToast === 'function') {
    showToast(text, 'info');
  }
}

function renderNotifications() {
  const list = document.querySelector('.notif-list');
  if (!list) return;

  if (_adminNotifications.length === 0) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No notifications yet</div>`;
    return;
  }

  list.innerHTML = _adminNotifications.slice(0, 20).map(n => {
    const style = getNotifStyle(n.type);
    const icon = getNotifIcon(n.type);
    return `
      <div class="notif-item${n.unread ? ' unread' : ''}">
        <div class="notif-icon-circle" style="background:${style.bg};color:${style.color}">${icon}</div>
        <div class="notif-content">
          <div class="notif-text">${n.text}</div>
          <div class="notif-time">${formatTimeAgo(n.timestamp)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function setupRealtimeNotifications() {
  if (!supabaseClient || !useRealSupabase) return;

  try {
    // Listen for new user registrations
    supabaseClient
      .channel('admin-profiles')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (payload) => {
        const p = payload.new;
        const name = p.name || p.full_name || (p.email ? p.email.split('@')[0] : 'Unknown');
        addNotification(`New user registered: <strong>${name}</strong> (${p.email || 'unknown'})`, 'user', p.created_at);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const p = payload.new;
        const old = payload.old;
        const name = p.name || p.full_name || (p.email ? p.email.split('@')[0] : 'Unknown');
        // Plan change
        if (old && old.plan !== p.plan) {
          addNotification(`<strong>${name}</strong> changed plan: ${old.plan} → ${p.plan}`, 'subscription', p.updated_at);
        }
        // Credit change
        if (old && old.credits !== undefined && p.credits !== undefined && old.credits !== p.credits) {
          const diff = p.credits - old.credits;
          const direction = diff > 0 ? 'gained' : 'used';
          addNotification(`<strong>${name}</strong> ${direction} ${Math.abs(diff)} credits (now ${p.credits})`, 'credit', p.updated_at);
        }
        // Status change
        if (old && old.status !== p.status) {
          addNotification(`<strong>${name}</strong> status changed to <strong>${p.status}</strong>`, 'warning', p.updated_at);
        }
      })
      .subscribe();

    // Listen for settings changes
    supabaseClient
      .channel('admin-settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings' }, (payload) => {
        addNotification('Platform settings were updated', 'settings');
      })
      .subscribe();

    // Listen for brand/colour changes
    supabaseClient
      .channel('admin-brands')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'brands' }, (payload) => {
        const b = payload.new;
        addNotification(`New brand added: <strong>${b.name || 'Unknown'}</strong>`, 'stone');
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'colours' }, (payload) => {
        const c = payload.new;
        addNotification(`New stone colour added: <strong>${c.name || 'Unknown'}</strong>`, 'stone');
      })
      .subscribe();

    console.log('[Admin] Realtime notifications connected');
  } catch (e) {
    console.warn('[Admin] Realtime setup notice:', e);
  }
}

// Load saved notifications from localStorage on startup
function loadSavedNotifications() {
  try {
    const saved = JSON.parse(localStorage.getItem('rw_admin_notifications') || '[]');
    if (Array.isArray(saved) && saved.length > 0) {
      saved.forEach(n => _adminNotifications.push(n));
    }
  } catch (e) { }
}

// Save notifications to localStorage periodically
function saveNotifications() {
  try {
    localStorage.setItem('rw_admin_notifications', JSON.stringify(_adminNotifications.slice(0, 50)));
  } catch (e) { }
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

  // Load saved notifications and render
  loadSavedNotifications();
  renderNotifications();

  // Setup Supabase Realtime listeners for live notifications
  setupRealtimeNotifications();

  // Save notifications every 30 seconds
  setInterval(saveNotifications, 30000);

  // Notifications dropdown toggle
  const notifBtn = document.getElementById('notif-btn');
  const notifDropdown = document.getElementById('notif-dropdown');
  const notifDot = document.getElementById('notif-dot');
  const markReadBtn = document.getElementById('notif-mark-read');

  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', (e) => {
      const isHidden = notifDropdown.style.display === 'none';
      notifDropdown.style.display = isHidden ? 'flex' : 'none';
      e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
      if (!notifDropdown.contains(e.target) && e.target !== notifBtn && !notifBtn.contains(e.target)) {
        notifDropdown.style.display = 'none';
      }
    });

    if (markReadBtn) {
      markReadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (notifDot) notifDot.style.display = 'none';
        _adminNotifications.forEach(n => n.unread = false);
        renderNotifications();
        saveNotifications();
        showToast('All notifications marked as read', 'success');
      });
    }
  }

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
});
