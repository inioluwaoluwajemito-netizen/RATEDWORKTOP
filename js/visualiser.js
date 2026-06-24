/* ============================================
   RatedWorktops Visualiser Logic
   ============================================ */

let currentUser = null;
let currentProfile = null;
let allBrands = [];
let allCategories = [];
let allStones = [];
let selectedStone = null;

// DOM Elements
const creditsCountEl = document.getElementById('credits-count');
const stoneListEl = document.getElementById('stone-list');
const filterCategory = document.getElementById('filter-category');
const filterBrand = document.getElementById('filter-brand');

const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const previewImage = document.getElementById('preview-image');
const actionBar = document.getElementById('action-bar');
const resetBtn = document.getElementById('reset-btn');
const generateBtn = document.getElementById('generate-btn');

const processingOverlay = document.getElementById('processing-overlay');
const processingText = document.getElementById('processing-text');
const simulatedHighlight = document.getElementById('simulated-highlight');

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Check Authentication
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = session.user;

  // 2. Load User Profile
  await loadProfile();

  // 3. Load Materials from Supabase
  await loadFiltersAndStones();

  // 4. Setup Upload Listeners
  setupUploadListeners();
  
  // 5. Setup Action Listeners
  setupActionListeners();

  // Setup Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
  });
});

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('credits')
    .eq('id', currentUser.id)
    .single();

  if (data) {
    currentProfile = data;
    creditsCountEl.textContent = data.credits;
  }
}

async function loadFiltersAndStones() {
  // Fetch categories
  const { data: cats } = await supabaseClient.from('categories').select('*').order('display_order');
  if (cats) {
    allCategories = cats;
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      filterCategory.appendChild(opt);
    });
  }

  // Fetch brands & their stones
  const { data: brands } = await supabaseClient.from('brands').select('*, colours(*)');
  if (brands) {
    allBrands = brands;
    brands.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = b.name;
      filterBrand.appendChild(opt);

      // Flatten colours
      if (b.colours) {
        b.colours.forEach(c => {
          allStones.push({
            ...c,
            brandName: b.name,
            categoryName: b.category
          });
        });
      }
    });
  }

  renderStones();

  filterCategory.addEventListener('change', renderStones);
  filterBrand.addEventListener('change', renderStones);
  const searchInput = document.getElementById('search-stone');
  if(searchInput) {
    searchInput.addEventListener('input', renderStones);
  }
}

function renderStones() {
  stoneListEl.innerHTML = '';
  const selCat = filterCategory.value;
  const selBrand = filterBrand.value;
  const searchInput = document.getElementById('search-stone');
  const query = searchInput ? searchInput.value.toLowerCase() : '';

  const filtered = allStones.filter(s => {
    if (selCat !== 'all' && s.categoryName !== selCat) return false;
    if (selBrand !== 'all' && s.brandName !== selBrand) return false;
    if (query && !s.name.toLowerCase().includes(query)) return false;
    return true;
  });

  if (filtered.length === 0) {
    stoneListEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);font-size:12px">No stones found.</div>';
    return;
  }

  filtered.forEach(stone => {
    const el = document.createElement('div');
    el.className = 'stone-item';
    if (selectedStone && selectedStone.id === stone.id) el.classList.add('selected');
    
    // Assign a rough color based on texture type (since we don't have images)
    let bg = '#444';
    if (stone.texture === 'marble') bg = '#f0f0f0';
    if (stone.texture === 'quartz') bg = '#dcdcdc';
    if (stone.texture === 'granite') bg = '#3d3d3d';
    if (stone.texture === 'black') bg = '#1a1a1a';

    el.innerHTML = `
      <div class="stone-thumb" style="background:${bg}"></div>
      <div class="stone-info">
        <div class="stone-name" title="${stone.name}">${stone.name}</div>
        <div class="stone-brand">${stone.brandName}</div>
      </div>
    `;

    el.addEventListener('click', () => {
      document.querySelectorAll('.stone-item').forEach(i => i.classList.remove('selected'));
      el.classList.add('selected');
      selectedStone = stone;
    });

    stoneListEl.appendChild(el);
  });
}

function setupUploadListeners() {
  uploadArea.addEventListener('click', () => {
    if (!previewImage.src || previewImage.style.display === 'none') {
      fileInput.click();
    }
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload a valid image file.', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImage.src = e.target.result;
    previewImage.style.display = 'block';
    
    // Hide the upload prompt UI inside the area
    uploadArea.querySelector('.upload-icon').style.display = 'none';
    uploadArea.querySelector('.upload-title').style.display = 'none';
    uploadArea.querySelector('.upload-desc').style.display = 'none';
    
    actionBar.classList.add('visible');
    simulatedHighlight.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function setupActionListeners() {
  resetBtn.addEventListener('click', () => {
    previewImage.src = '';
    previewImage.style.display = 'none';
    fileInput.value = '';
    
    uploadArea.querySelector('.upload-icon').style.display = 'block';
    uploadArea.querySelector('.upload-title').style.display = 'block';
    uploadArea.querySelector('.upload-desc').style.display = 'block';
    
    actionBar.classList.remove('visible');
    simulatedHighlight.style.display = 'none';
    
    generateBtn.style.display = 'flex';
    generateBtn.disabled = false;
    generateBtn.innerHTML = `<i data-lucide="sparkles" style="width:16px;height:16px"></i> Generate AI Render`;
    
    document.getElementById('post-render-actions').style.display = 'none';
    lucide.createIcons();
  });

  generateBtn.addEventListener('click', async () => {
    if (!selectedStone) {
      showToast('Please select a material from the sidebar first.', 'error');
      return;
    }

    if (currentProfile.credits <= 0) {
      showToast('Not enough credits! Please upgrade your plan.', 'error');
      return;
    }

    // 1. Show Processing
    processingOverlay.style.display = 'flex';
    processingText.textContent = 'Analysing worktop surfaces...';

    // Mock processing steps
    await new Promise(r => setTimeout(r, 1200));
    processingText.textContent = `Applying ${selectedStone.name}...`;
    await new Promise(r => setTimeout(r, 1500));
    processingText.textContent = 'Rendering shadows & lighting...';
    await new Promise(r => setTimeout(r, 1000));

    // 2. Hide Processing
    processingOverlay.style.display = 'none';

    // 3. Show Simulated Highlight based on selected stone
    let highlightColor = '#ffffff';
    if (selectedStone.texture === 'black' || selectedStone.texture === 'granite') highlightColor = '#111111';
    else if (selectedStone.texture === 'slate') highlightColor = '#333333';
    
    simulatedHighlight.innerHTML = `<polygon points="10,60 90,60 95,75 5,75" fill="${highlightColor}" opacity="0.6" style="mix-blend-mode: multiply;" />`;
    simulatedHighlight.style.display = 'block';

    // 4. Deduct Credit
    const newCredits = currentProfile.credits - 1;
    const { error } = await supabaseClient
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', currentUser.id);

    if (!error) {
      currentProfile.credits = newCredits;
      creditsCountEl.textContent = newCredits;
      showToast('Visualisation complete! 1 credit deducted.', 'success');
      
      generateBtn.style.display = 'none';
      document.getElementById('post-render-actions').style.display = 'flex';
    } else {
      showToast('Failed to update credits.', 'error');
    }
  });

  // --- Post-Render Handlers ---

  document.getElementById('share-btn').addEventListener('click', () => {
    document.getElementById('share-modal').classList.add('open');
  });

  document.getElementById('download-btn').addEventListener('click', () => {
    if (!previewImage.src) return;
    showToast('Preparing your image...', 'info');

    // Create a canvas to draw the image + watermark
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Simulate drawing the highlight polygon (very rough approximation for the download)
      ctx.fillStyle = selectedStone.texture === 'black' ? 'rgba(17, 17, 17, 0.4)' : 'rgba(255, 255, 255, 0.4)';
      ctx.globalCompositeOperation = 'multiply';
      ctx.beginPath();
      ctx.moveTo(img.width * 0.1, img.height * 0.6);
      ctx.lineTo(img.width * 0.9, img.height * 0.6);
      ctx.lineTo(img.width * 0.95, img.height * 0.75);
      ctx.lineTo(img.width * 0.05, img.height * 0.75);
      ctx.fill();
      
      // Draw watermark
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = `bold ${Math.floor(img.width * 0.03)}px 'Playfair Display'`;
      ctx.textAlign = 'right';
      ctx.fillText('🪨 Created with RatedWorktops', img.width - 20, img.height - 20);

      // Trigger download
      const link = document.createElement('a');
      link.download = `ratedworktops-${selectedStone.name.replace(/\\s+/g, '-').toLowerCase()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
      
      showToast('Image downloaded successfully!', 'success');
    };
    img.src = previewImage.src;
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-btn');
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0"></div> Saving...`;
    btn.disabled = true;

    // 1. Check existing projects count
    const { data: existing, error: countErr } = await supabaseClient
      .from('projects')
      .select('id')
      .eq('user_id', currentUser.id);

    if (countErr) {
      showToast('Failed to verify projects limit.', 'error');
      resetSaveBtn(btn);
      return;
    }

    if (existing && existing.length >= 2) {
      showToast('Save limit reached! Please delete a project in "My Projects" first.', 'error');
      resetSaveBtn(btn);
      return;
    }

    // 2. Insert new project
    const { error: insertErr } = await supabaseClient
      .from('projects')
      .insert([{
        user_id: currentUser.id,
        stone_name: selectedStone.name,
        brand_name: selectedStone.brandName,
        image_url: previewImage.src // Storing base64 text for MVP
      }]);

    if (insertErr) {
      showToast('Failed to save project. ' + insertErr.message, 'error');
    } else {
      showToast('Project saved successfully!', 'success');
      btn.innerHTML = `<i data-lucide="check" style="width:16px;height:16px"></i> Saved`;
      btn.style.background = '#4ade80';
      btn.style.borderColor = '#4ade80';
      btn.style.color = '#000';
    }
    lucide.createIcons();
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

function resetSaveBtn(btn) {
  btn.disabled = false;
  btn.innerHTML = `<i data-lucide="bookmark" style="width:16px;height:16px"></i> Save Project`;
  lucide.createIcons();
}
