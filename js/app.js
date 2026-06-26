/* ============================================
   RatedWorktops Customer App — Shared JavaScript
   ============================================ */

// ── Supabase Initialization ───────────────────
const supabaseUrl = 'https://cvzeelapjwdvpotuvbrz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2emVlbGFwandkdnBvdHV2YnJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxODI0NzAsImV4cCI6MjA5Nzc1ODQ3MH0.1zhb3W30NmK8wwW5q6_eJ_ExHd0zoyWhYvCG7w5T3S4';
// We use window.supabase since we load from CDN
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

// ── LocalStorage helpers (Deprecated for DB) ──
const store = {
  get: (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem('rw_' + key)) ?? fallback; }
    catch { return fallback; }
  },
  set: (key, val) => localStorage.setItem('rw_' + key, JSON.stringify(val)),
  remove: (key) => localStorage.removeItem('rw_' + key)
};

// ── Auth helpers ──────────────────────────────
async function getCurrentUser() {
  if (!supabaseClient) return null;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;
  
  // Fetch full profile from public.profiles
  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
  if (profile) {
    return { ...profile, email: session.user.email };
  }
  return session.user;
}

async function requireAuth(redirect = 'login.html') {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirect;
    return null;
  }
  return user;
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

async function registerUser({ name, email, password }) {
  if (!supabaseClient) return { ok: false, error: 'Database disconnected' };
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { name } }
  });
  if (error) return { ok: false, error: error.message };
  
  if (data.user) {
    // Attempt to create a profile (might fail if trigger already does it, but we don't have a trigger here)
    const { error: profileError } = await supabaseClient.from('profiles').insert([{
      id: data.user.id,
      name,
      email,
      plan: 'Free',
      credits: 10
    }]);
    if (profileError) console.error('Profile creation error:', profileError);
  }
  return { ok: true, user: data.user };
}

async function loginUser({ email, password }) {
  if (!supabaseClient) return { ok: false, error: 'Database disconnected' };
  
  let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  
  // Auto-registration fallback for the demo account
  if (error && error.message === 'Invalid login credentials' && email === 'demo@ratedworktops.com') {
    console.log('Demo account not found in Supabase Auth. Registering it automatically...');
    
    // Register the demo account automatically with default stats
    const regResult = await registerUser({
      name: 'Sophie Anderson',
      email: 'demo@ratedworktops.com',
      password: 'Demo123'
    });
    
    if (regResult.ok) {
      // Re-attempt sign in after auto-registration
      const retry = await supabaseClient.auth.signInWithPassword({ email, password });
      if (!retry.error) {
        return { ok: true, user: retry.data.user };
      }
      error = retry.error;
    }
  }
  
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user };
}

async function updateCurrentUser(updates) {
  if (!supabaseClient) return null;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabaseClient.from('profiles')
    .update(updates)
    .eq('id', session.user.id)
    .select()
    .single();
  if (error) console.error('Update profile error:', error);
  return data;
}

async function uploadFileToStorage(bucket, path, file) {
  if (!supabaseClient) return { ok: false, error: 'Database disconnected' };
  const { data, error } = await supabaseClient.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg'
  });
  if (error) {
    console.error('Storage upload error:', error);
    return { ok: false, error: error.message };
  }
  const { data: { publicUrl } } = supabaseClient.storage.from(bucket).getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

// ── Seed demo data ────────────────────────────
function seedAppData() {
  // Seed settings from admin (or defaults)
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

  // Seed demo account
  const users = store.get('app_users', []);
  if (!users.find(u => u.email === 'demo@ratedworktops.com')) {
    users.push({
      id: 1,
      name: 'Sophie Anderson',
      email: 'demo@ratedworktops.com',
      password: 'Demo123',
      plan: 'Pro',
      credits: 78,
      visualisations: 23,
      downloads: 15,
      shares: 8,
      projects: [],
      joined: '2025-11-14T00:00:00.000Z',
      verified: true
    });
    store.set('app_users', users);
  }

  // Seed brands / stones (shared with admin)
  if (!store.get('brands')) {
    store.set('brands', [
      {
        id: 1, name: 'Silestone', category: 'Quartz', enabled: true,
        description: 'Premium quartz surfaces by Cosentino',
        colours: [
          { id: 101, name: 'Eternal Calacatta Gold', sku: 'SIL-ECG', enabled: true, texture: 'marble' },
          { id: 102, name: 'Nebula Pearl', sku: 'SIL-NP', enabled: true, texture: 'quartz' },
          { id: 103, name: 'Iconic Black', sku: 'SIL-IB', enabled: true, texture: 'black' },
          { id: 104, name: 'Miami White', sku: 'SIL-MW', enabled: true, texture: 'marble' },
          { id: 105, name: 'Lunar Smoke', sku: 'SIL-LS', enabled: true, texture: 'slate' },
        ]
      },
      {
        id: 2, name: 'Dekton', category: 'Sintered Stone', enabled: true,
        description: 'Ultra-compact surface by Cosentino',
        colours: [
          { id: 201, name: 'Kreta', sku: 'DEK-KR', enabled: true, texture: 'slate' },
          { id: 202, name: 'Opera', sku: 'DEK-OP', enabled: true, texture: 'marble' },
          { id: 203, name: 'Laurent', sku: 'DEK-LR', enabled: true, texture: 'black' },
          { id: 204, name: 'Vera', sku: 'DEK-VR', enabled: true, texture: 'quartz' },
        ]
      },
      {
        id: 3, name: 'Caesarstone', category: 'Quartz', enabled: true,
        description: 'Global leader in quartz surfaces',
        colours: [
          { id: 301, name: 'Statuario Nuvo', sku: 'CAE-SN', enabled: true, texture: 'marble' },
          { id: 302, name: 'Vanilla Noir', sku: 'CAE-VN', enabled: true, texture: 'granite' },
          { id: 303, name: 'Cloudburst Concrete', sku: 'CAE-CC', enabled: true, texture: 'slate' },
          { id: 304, name: 'Pure White', sku: 'CAE-PW', enabled: true, texture: 'marble' },
        ]
      },
      {
        id: 4, name: 'Calacatta Premium', category: 'Marble', enabled: true,
        description: 'Natural marble from Carrara quarries',
        colours: [
          { id: 401, name: 'Calacatta Gold', sku: 'CAL-GD', enabled: true, texture: 'marble' },
          { id: 402, name: 'Calacatta Extra', sku: 'CAL-EX', enabled: true, texture: 'marble' },
          { id: 403, name: 'Calacatta Viola', sku: 'CAL-VI', enabled: true, texture: 'marble' },
        ]
      },
      {
        id: 5, name: 'Neolith', category: 'Sintered Stone', enabled: true,
        description: 'The most advanced sintered stone',
        colours: [
          { id: 501, name: 'Arctic White', sku: 'NEO-AW', enabled: true, texture: 'marble' },
          { id: 502, name: 'Iron Grey', sku: 'NEO-IG', enabled: true, texture: 'slate' },
          { id: 503, name: 'Nero Zimbabwe', sku: 'NEO-NZ', enabled: true, texture: 'black' },
        ]
      },
      {
        id: 6, name: 'Porcelanosa', category: 'Porcelain', enabled: true,
        description: 'Spanish luxury porcelain tiles and surfaces',
        colours: [
          { id: 601, name: 'Toscana Stone', sku: 'POR-TS', enabled: true, texture: 'quartz' },
          { id: 602, name: 'Natural Grey', sku: 'POR-NG', enabled: true, texture: 'slate' },
        ]
      }
    ]);
  }

  if (!store.get('categories')) {
    store.set('categories', [
      { id: 1, name: 'Marble', icon: '🤍', enabled: true, order: 1 },
      { id: 2, name: 'Granite', icon: '🖤', enabled: true, order: 2 },
      { id: 3, name: 'Quartz', icon: '💎', enabled: true, order: 3 },
      { id: 4, name: 'Quartzite', icon: '🪨', enabled: true, order: 4 },
      { id: 5, name: 'Porcelain', icon: '⬜', enabled: true, order: 5 },
      { id: 6, name: 'Sintered Stone', icon: '🔷', enabled: true, order: 6 },
      { id: 7, name: 'Limestone', icon: '🟤', enabled: true, order: 7 },
      { id: 8, name: 'Onyx', icon: '💜', enabled: false, order: 8 },
      { id: 9, name: 'Travertine', icon: '🪵', enabled: false, order: 9 }
    ]);
  }
}

// ── Stone helpers ─────────────────────────────
function hydrateCollections(brands, colours) {
  if (brands && !brands.find(b => b.id === 4)) {
    brands.push({
      id: 4,
      name: 'Calacatta Premium',
      category: 'Marble',
      enabled: true,
      description: 'Natural marble from Carrara quarries'
    });
  }
  const additionalColours = [
    { id: 401, brand_id: 4, name: 'Calacatta Gold', sku: 'CAL-GD', enabled: true, texture: 'marble' },
    { id: 402, brand_id: 4, name: 'Carrara White Marble', sku: 'CAL-CW', enabled: true, texture: 'marble' },
    { id: 403, brand_id: 4, name: 'Nero Marquina', sku: 'CAL-NM', enabled: true, texture: 'marble' },
    { id: 404, brand_id: 4, name: 'Arabescato Vagli', sku: 'CAL-AV', enabled: true, texture: 'marble' },
    { id: 205, brand_id: 2, name: 'Charcoal Granite', sku: 'DEK-CG', enabled: true, texture: 'granite' },
    
    { id: 405, brand_id: 4, name: 'Calacatta Viola', sku: 'CAL-VI', enabled: true, texture: 'marble' },
    { id: 203, brand_id: 2, name: 'Laurent', sku: 'DEK-LR', enabled: true, texture: 'black' },
    { id: 303, brand_id: 3, name: 'Cloudburst Concrete', sku: 'CAE-CC', enabled: true, texture: 'slate' },
    { id: 104, brand_id: 1, name: 'Miami White', sku: 'SIL-MW', enabled: true, texture: 'marble' }
  ];
  if (colours) {
    additionalColours.forEach(ac => {
      if (!colours.find(c => c.sku === ac.sku)) {
        colours.push(ac);
      }
    });
  }
}

async function getAllStones() {
  if (!supabaseClient) return [];
  const { data: brands, error: bErr } = await supabaseClient.from('brands').select('*').eq('enabled', true);
  const { data: colours, error: cErr } = await supabaseClient.from('colours').select('*').eq('enabled', true);
  
  if (bErr || cErr) {
    console.error(bErr || cErr);
    return [];
  }
  
  hydrateCollections(brands, colours);
  
  const stones = [];
  brands.forEach(brand => {
    const brandColours = colours.filter(c => c.brand_id == brand.id);
    brandColours.forEach(colour => {
      stones.push({
        id: `${brand.id}-${colour.id}`,
        brandId: brand.id,
        colourId: colour.id,
        name: colour.name,
        brand: brand.name,
        category: brand.category,
        sku: colour.sku,
        texture: colour.texture,
        description: brand.description
      });
    });
  });
  return stones;
}

async function getStoneById(id) {
  const stones = await getAllStones();
  return stones.find(s => s.id === id);
}

async function getBrands() {
  if (!supabaseClient) return [];
  const { data: brands, error: bErr } = await supabaseClient.from('brands').select('*').eq('enabled', true);
  const { data: colours, error: cErr } = await supabaseClient.from('colours').select('*'); // We fetch all colours or just enabled
  
  if (bErr || cErr) return [];
  
  hydrateCollections(brands, colours);
  
  // Attach colours to brands for backward compatibility
  return brands.map(brand => {
    return {
      ...brand,
      colours: colours.filter(c => c.brand_id == brand.id && c.enabled)
    };
  });
}

async function getCategories() {
  if (!supabaseClient) return [];
  const { data } = await supabaseClient.from('categories').select('*').eq('enabled', true).order('display_order', { ascending: true });
  return data || [];
}

// ── Texture CSS & Image Mappings ───────────────
const TEXTURES = {
  marble: 'linear-gradient(135deg,#e8e0d4 0%,#d4ccc2 25%,#ece4d8 50%,#bfb5a8 75%,#d4ccc2 100%)',
  granite: 'linear-gradient(135deg,#2a2a2a 0%,#3d3530 35%,#2a2828 55%,#4a4540 100%)',
  quartz: 'linear-gradient(135deg,#f0e8d8 0%,#e8dcc8 40%,#d8ccb8 70%,#e8dcc8 100%)',
  black: 'linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 40%,#1a1a1a 100%)',
  slate: 'linear-gradient(135deg,#4a5568 0%,#2d3748 50%,#4a5568 100%)',
  default: 'linear-gradient(135deg,#c9a96e,#a07840)'
};

const STONE_IMAGES = {
  'SIL-ECG': 'images/stones/eternal_calacatta_gold.png',
  'SIL-NP': 'images/stones/nebula_pearl.png',
  'SIL-IB': 'images/stones/iconic_black.png',
  'DEK-KR': 'images/stones/kreta.png',
  'DEK-OP': 'images/stones/opera.png',
  'CAE-SN': 'images/stones/statuario_nuvo.png',
  'CAE-VN': 'images/stones/vanilla_noir.png',
  'CAL-GD': 'images/stones/eternal_calacatta_gold.png',
  'CAL-CW': 'images/stones/carrara_white_marble.png',
  'CAL-NM': 'images/stones/nero_marquina.png',
  'CAL-AV': 'images/stones/arabescato_vagli.png',
  'DEK-CG': 'images/stones/charcoal_granite.png',
  'CAL-VI': 'images/stones/calacatta_viola.png',
  'DEK-LR': 'images/stones/laurent.png',
  'CAE-CC': 'images/stones/cloudburst_concrete.png',
  'SIL-MW': 'images/stones/miami_white.png'
};

function getTexture(key) {
  return TEXTURES[key] || TEXTURES.default;
}

function getStoneImage(sku) {
  return STONE_IMAGES[sku] || 'images/stones/eternal_calacatta_gold.png';
}

// ── Navigation build ──────────────────────────
async function buildNav(activePage = '') {
  const user = await getCurrentUser();
  const navEl = document.getElementById('main-nav');
  if (!navEl) return;

  const links = user ? [
    { href: 'visualiser.html', label: 'Visualizer' },
    { href: 'stones.html', label: 'Stone Catalog' },
    { href: 'my-projects.html', label: 'My Renders' },
    { href: 'account.html', label: 'Credits' }
  ] : [
    { href: 'index.html#how-it-works', label: 'How it works' },
    { href: 'stones.html', label: 'Stones' },
    { href: 'index.html#pricing', label: 'Pricing' }
  ];

  navEl.innerHTML = `
    <div class="nav-inner">
      <a href="index.html" class="nav-logo" style="display:flex; align-items:center; gap:12px; text-decoration:none;">
        <div class="logo-icon" style="width:36px; height:36px; background:var(--gold); border-radius:6px; display:flex; align-items:center; justify-content:center; font-family:'Playfair Display',serif; font-size:20px; font-weight:800; color:#000; box-shadow: 0 4px 10px rgba(201, 169, 110, 0.25);">R</div>
        <div style="display:flex; flex-direction:column; gap:1px; text-align:left;">
          <span style="font-family:'Playfair Display',serif; font-size:16px; font-weight:700; color:var(--text-primary); line-height:1.2;">Rated Worktops</span>
          <span style="font-size:8px; font-weight:600; color:var(--text-secondary); letter-spacing:1px; text-transform:uppercase; line-height:1;">STONE VISUALIZER</span>
        </div>
      </a>
      <div class="nav-links">
        ${links.map(l => `<a href="${l.href}" class="nav-link ${activePage === l.href ? 'active' : ''}">${l.label}</a>`).join('')}
      </div>
      <div class="nav-actions">
        ${user
          ? `<a href="account.html" class="credits-badge" style="text-decoration:none; cursor:pointer; display:flex; align-items:center; gap:6px; padding:6px 12px; background:var(--gold-glow); border:1px solid var(--border-gold); border-radius:99px; font-size:12px; font-weight:600; color:var(--gold);"><i data-lucide="zap" style="width:12px;height:12px;color:var(--gold);"></i> <span id="credits-count">${user.credits ?? 0}</span> credits</a>
             <div class="nav-avatar" onclick="toggleUserMenu()" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--gold-dark));display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#000;cursor:pointer;position:relative;flex-shrink:0" title="${user.name}">${user.name.charAt(0)}
               <div id="user-menu" style="display:none;position:absolute;top:44px;right:0;background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;padding:8px;min-width:180px;box-shadow:0 20px 60px rgba(0,0,0,0.5);z-index:100">
                 <div style="padding:10px 12px;border-bottom:1px solid var(--border);margin-bottom:6px">
                   <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${user.name}</div>
                   <div style="font-size:11px;color:var(--text-muted)">${user.email}</div>
                 </div>
                 <a href="account.html" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:13px;color:var(--text-secondary);transition:background 0.15s">
                   <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                   Account
                 </a>
                 <a href="my-projects.html" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:13px;color:var(--text-secondary);transition:background 0.15s">
                   <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                   My Renders
                 </a>
                 <button onclick="logout()" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:13px;color:var(--danger);background:none;border:none;cursor:pointer;width:100%;font-family:inherit;transition:background 0.15s">
                   <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                   Sign Out
                 </button>
               </div>
             </div>`
          : `<a href="login.html" class="btn btn-ghost btn-sm" style="background:transparent; border:none; color:var(--text-primary); font-size:13.5px; font-weight:600;">Sign in</a>
             <a href="register.html" class="btn btn-primary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">Start free <i data-lucide="chevron-right" style="width:14px;height:14px;"></i></a>`
        }
      </div>
    </div>
  `;

  // Scroll effect
  window.addEventListener('scroll', () => {
    navEl.classList.toggle('scrolled', window.scrollY > 20);
  });

  // Close user menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-menu');
    if (menu && !e.target.closest('.nav-avatar')) {
      menu.style.display = 'none';
    }
  });
}

function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// ── Footer build ──────────────────────────────
function buildFooter() {
  const footerEl = document.getElementById('main-footer');
  if (!footerEl) return;
  footerEl.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="logo-icon">🪨</div>
          <div class="brand-name">RatedWorktops</div>
          <p>AI-powered worktop visualisation. See your dream kitchen before it's built.</p>
        </div>
        <div class="footer-col">
          <h4>Product</h4>
          <a href="visualiser.html">Visualiser</a>
          <a href="stones.html">Stone Library</a>
          <a href="index.html#how-it-works">How It Works</a>
          <a href="index.html#pricing">Pricing</a>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <a href="#">About Us</a>
          <a href="#">Blog</a>
          <a href="#">Contact</a>
        </div>
        <div class="footer-col">
          <h4>Legal</h4>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Cookie Policy</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} RatedWorktops. All rights reserved.</span>
        <span>Made with ❤️ in the UK</span>
      </div>
    </div>
  `;
}

// ── Toast ─────────────────────────────────────
function showToast(msg, type = 'success') {
  const icons = {
    success: `<svg width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="16" height="16" fill="none" stroke="#f87171" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg width="16" height="16" fill="none" stroke="#60a5fa" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
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
  toast.innerHTML = `${icons[type]}<span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// ── Format helpers ────────────────────────────
function formatDate(str) {
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Credits helpers ───────────────────────────
function canGenerate() {
  const user = getCurrentUser();
  if (!user) return false;
  const settings = store.get('settings', {});
  if (!settings.subscriptionsEnabled) return true; // Free mode — unlimited
  return user.credits > 0;
}

function spendCredit() {
  const user = getCurrentUser();
  if (!user) return;
  const settings = store.get('settings', {});
  if (settings.subscriptionsEnabled && user.credits > 0) {
    updateCurrentUser({ credits: user.credits - 1, visualisations: (user.visualisations || 0) + 1 });
  } else if (!settings.subscriptionsEnabled) {
    updateCurrentUser({ visualisations: (user.visualisations || 0) + 1 });
  }
}

// ── DOM ready ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  seedAppData();
});
