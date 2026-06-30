/* ============================================
   RatedWorktops Visualiser Logic
   ============================================ */

let currentUser = null;
let currentProfile = null;
let allBrands = [];
let allCategories = [];
let allStones = [];
let selectedStone = null;

// Shape Drawing State
let isDrawMode = false;
let points = [];
let originalFileUrl = null;

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

const drawingCanvas = document.getElementById('drawing-canvas');
const drawModeBtn = document.getElementById('draw-mode-btn');
const clearPointsBtn = document.getElementById('clear-points-btn');
const drawingTip = document.getElementById('drawing-tip');
const drawingToolbar = document.getElementById('drawing-toolbar');
let isRendering = false;

async function generateRender() {
  if (isRendering) return;
  if (!selectedStone) {
    showToast('Please select a material from the sidebar first.', 'error');
    return;
  }

  const settings = store.get('settings', {});
  const isFreeMode = settings.subscriptionsEnabled === false;

  if (!isFreeMode && currentProfile.credits <= 0) {
    showToast('Not enough credits! Please upgrade your plan.', 'error');
    return;
  }

  isRendering = true;

  // Hide previous render immediately to show transition
  simulatedHighlight.style.display = 'none';

  processingOverlay.style.display = 'flex';
  processingText.textContent = 'Analysing countertop shape...';

  await new Promise(r => setTimeout(r, 1200));
  processingText.textContent = `Applying ${selectedStone.name}...`;
  await new Promise(r => setTimeout(r, 1500));
  processingText.textContent = 'Rendering shadows & lighting...';
  await new Promise(r => setTimeout(r, 1000));

  processingOverlay.style.display = 'none';

  const imgUrl = getStoneImage(selectedStone.sku);
  let polygonPoints = "10,60 90,60 95,75 5,75";
  if (points.length >= 3) {
    polygonPoints = points.map(p => `${p.x},${p.y}`).join(" ");
  }

  // Use unique pattern ID to avoid SVG pattern caching bug in browsers
  const patternId = 'stone-pattern-' + selectedStone.sku + '-' + Date.now();

  simulatedHighlight.innerHTML = `
    <defs>
      <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="80" height="80">
        <image href="${imgUrl}" x="0" y="0" width="80" height="80" />
      </pattern>
    </defs>
    <polygon points="${polygonPoints}" fill="url(#${patternId})" opacity="0.85" style="mix-blend-mode: overlay; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.35));" />
    ${points.length >= 3 ? '' : `<polygon points="60.5,15 86.5,15 86.5,56 60.5,56" fill="url(#${patternId})" opacity="0.85" style="mix-blend-mode: overlay;" />`}
  `;
  
  drawingCanvas.style.display = 'none';
  simulatedHighlight.style.display = 'block';
  
  // Deduct credits and update metrics
  const newCredits = isFreeMode ? currentProfile.credits : (currentProfile.credits - 1);
  const newVisualisations = (currentProfile.visualisations || 0) + 1;
  const { error } = await supabaseClient
    .from('profiles')
    .update({ 
      credits: newCredits,
      visualisations: newVisualisations
    })
    .eq('id', currentUser.id);

  if (!error) {
    currentProfile.credits = newCredits;
    currentProfile.visualisations = newVisualisations;
    
    const navCredits = document.getElementById('credits-count');
    if (navCredits) navCredits.textContent = newCredits;
    
    const sidebarCredits = document.getElementById('credits-count-sidebar');
    if (sidebarCredits) sidebarCredits.textContent = newCredits;
    
    const headerCredits = document.getElementById('credits-count-header');
    if (headerCredits) headerCredits.textContent = newCredits;
    
    if (isFreeMode) {
      showToast('Visualisation complete!', 'success');
    } else {
      showToast('Visualisation complete! 1 credit deducted.', 'success');
    }
    
    const preRenderControls = document.getElementById('pre-render-controls');
    if (preRenderControls) preRenderControls.style.display = 'none';
    document.getElementById('post-render-actions').style.display = 'flex';
  } else {
    showToast('Failed to update credits.', 'error');
  }

  isRendering = false;
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Check Authentication
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html' + window.location.search;
    return;
  }
  currentUser = session.user;

  // Using custom HTML header markup for the dashboard view to prevent dropdown overlap

  // 2. Load User Profile
  await loadProfile();

  // 3. Load Materials from Supabase
  await loadFiltersAndStones();

  // 4. Setup Upload Listeners
  setupUploadListeners();
  
  // 5. Setup Action Listeners
  setupActionListeners();

  // 6. Setup Shape Drawing Listeners
  setupDrawingListeners();

  // Mode Selection Tabs Wire Up
  const modeAutoBtn = document.getElementById('mode-auto-btn');
  const modeHybridBtn = document.getElementById('mode-hybrid-btn');
  const modeDescText = document.getElementById('mode-desc-text');

  if (modeAutoBtn && modeHybridBtn) {
    modeAutoBtn.addEventListener('click', () => {
      modeAutoBtn.classList.add('active');
      modeHybridBtn.classList.remove('active');
      if (modeDescText) modeDescText.textContent = 'AI detects worktop & splashback surfaces automatically.';
    });

    modeHybridBtn.addEventListener('click', () => {
      modeHybridBtn.classList.add('active');
      modeAutoBtn.classList.remove('active');
      if (modeDescText) modeDescText.textContent = 'Manual coordinates tracing mixed with AI boundary alignment.';
    });
  }

  // Setup Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
  });

  // Setup Mobile Nav Tabs
  setupMobileNavListeners();
});

async function loadProfile() {
  let { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.error('Error loading profile:', error.message);
  }

  // Fallback: If no profile exists yet (e.g. first-time Google Sign-In user), create one
  if (!data) {
    const defaultName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || 'Google User';
    const { data: newProfile, error: insertErr } = await supabaseClient
      .from('profiles')
      .insert([{
        id: currentUser.id,
        name: defaultName,
        email: currentUser.email,
        plan: 'Free',
        credits: 10,
        visualisations: 0,
        downloads: 0,
        shares: 0,
        status: 'active'
      }])
      .select('*')
      .single();

    if (insertErr) {
      console.error('Error creating default profile for OAuth login:', insertErr.message);
    } else {
      data = newProfile;
    }
  }

  if (data) {
    currentProfile = data;
    const navCredits = document.getElementById('credits-count');
    if (navCredits) navCredits.textContent = data.credits;
    
    const sidebarCredits = document.getElementById('credits-count-sidebar');
    if (sidebarCredits) sidebarCredits.textContent = data.credits;

    const headerCredits = document.getElementById('credits-count-header');
    if (headerCredits) headerCredits.textContent = data.credits;

    // Display user profile name in the header navbar
    const nameDisplay = document.getElementById('user-name-display');
    if (nameDisplay) {
      nameDisplay.textContent = data.name || data.full_name || 'User';
      nameDisplay.style.display = 'inline-block';
    }
  }
}

async function loadFiltersAndStones() {
  const cats = await getCategories();
  if (cats && cats.length) {
    allCategories = cats;
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      filterCategory.appendChild(opt);
    });
  }

  const brands = await getBrands();
  if (brands && brands.length) {
    allBrands = brands;
    brands.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = b.name;
      filterBrand.appendChild(opt);

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

  const urlParams = new URLSearchParams(window.location.search);
  const stoneIdParam = urlParams.get('stone');
  if (stoneIdParam) {
    const parts = stoneIdParam.split('-');
    const colourId = parts.length > 1 ? parts[1] : parts[0];
    const stone = allStones.find(s => s.id == colourId);
    if (stone) {
      selectedStone = stone;
      filterCategory.value = stone.categoryName;
      filterBrand.value = stone.brandName;
      renderStones();
      updateSelectedMaterialCard(stone);
    }
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
    el.className = 'stone-card-item';
    if (selectedStone && selectedStone.id === stone.id) el.classList.add('selected');
    
    const imgUrl = getStoneImage(stone.sku);

    const categoryLabel = (stone.categoryName || stone.category || 'Marble').toUpperCase();
    const finishLabel = (stone.texture === 'granite' || stone.texture === 'slate') ? 'HONED' : 'POLISHED';
    el.innerHTML = `
      <div class="stone-card-thumb" style="background-image: url('${imgUrl}'); background-size: cover; background-position: center;"></div>
      <div class="stone-card-info">
        <div class="stone-card-name" title="${stone.name}">${stone.name}</div>
        <div class="stone-card-meta">${categoryLabel} · ${finishLabel}</div>
      </div>
    `;

    el.addEventListener('click', () => {
      document.querySelectorAll('.stone-card-item').forEach(i => i.classList.remove('selected'));
      el.classList.add('selected');
      selectedStone = stone;
      updateSelectedMaterialCard(stone);

      // Automatically generate render if image is present
      if (previewImage.src && previewImage.style.display === 'block' && !isDrawMode) {
        const postActions = document.getElementById('post-render-actions');
        if (postActions && postActions.style.display === 'flex') {
          // Already generated once: update render instantly
          updateRenderInstantly();
        } else {
          // First time generating: run the full generateRender
          generateRender();
        }
      }
    });

    stoneListEl.appendChild(el);
  });
}

function updateSelectedMaterialCard(stone) {
  const container = document.getElementById('selected-material-container');
  if (!container) return;

  if (!stone) {
    container.innerHTML = `
      <div id="selected-material-card" class="material-card-empty">
        <i data-lucide="info" style="width:16px;height:16px;color:var(--text-secondary);"></i>
        <span>Pick a stone from the catalog</span>
      </div>
    `;
  } else {
    const imgUrl = getStoneImage(stone.sku);
    container.innerHTML = `
      <div id="selected-material-card" class="material-card-selected fade-up" style="animation-duration: 0.3s;">
        <div class="material-card-header">
          <div class="material-card-thumb" style="background-image: url('${imgUrl}');"></div>
          <div class="material-card-details">
            <div class="material-card-name" title="${stone.name}">${stone.name}</div>
            <div class="material-card-brand">${stone.brandName}</div>
          </div>
        </div>
        <div class="material-card-specs">
          <span>Category: ${stone.categoryName}</span>
          <span style="font-family: monospace;">SKU: ${stone.sku}</span>
        </div>
      </div>
    `;
  }
  lucide.createIcons();
}

function setupUploadListeners() {
  uploadArea.addEventListener('click', (e) => {
    if (e.target.closest('#drawing-canvas') || e.target.closest('#drawing-toolbar') || e.target.closest('.vis-control-panel')) {
      return;
    }
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

function compressImage(file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          } else {
            resolve(file); // Fallback to original
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file); // Fallback
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file); // Fallback
    reader.readAsDataURL(file);
  });
}

async function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload a valid image file.', 'error');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast('File is too large. Please upload an image up to 10MB.', 'error');
    return;
  }

  showToast('Optimizing image for upload...', 'info');
  const optimizedFile = await compressImage(file);

  showToast('Uploading to secure database storage...', 'info');

  const uuid = Math.random().toString(36).substring(2, 15);
  const path = `originals/${currentUser.id}/${uuid}.jpg`;
  const uploadRes = await uploadFileToStorage('ratedworktops', path, optimizedFile);

  if (uploadRes.ok) {
    originalFileUrl = uploadRes.url;
    showToast('Image uploaded successfully!', 'success');
  } else {
    console.warn('Storage upload failed, falling back to client-side:', uploadRes.error);
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImage.src = e.target.result;
    previewImage.style.display = 'block';
    
    const uploadWrapper = uploadArea.querySelector('.upload-content-wrapper') || document.getElementById('upload-content');
    if (uploadWrapper) {
      uploadWrapper.style.display = 'none';
    } else {
      const upIcon = uploadArea.querySelector('.upload-icon') || uploadArea.querySelector('[data-lucide="upload"]') || uploadArea.querySelector('[data-lucide="upload-cloud"]');
      if (upIcon) upIcon.style.display = 'none';
      const upTitle = uploadArea.querySelector('.upload-title');
      if (upTitle) upTitle.style.display = 'none';
      const upDesc = uploadArea.querySelector('.upload-desc');
      if (upDesc) upDesc.style.display = 'none';
    }
    
    drawingToolbar.style.display = 'flex';
    
    actionBar.classList.add('visible');
    simulatedHighlight.style.display = 'none';
  };
  reader.readAsDataURL(optimizedFile);
}

function setupDrawingListeners() {
  drawingCanvas.addEventListener('click', (e) => {
    if (!isDrawMode) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    points.push({ x, y });
    
    clearPointsBtn.style.display = 'inline-flex';
    redrawCanvas();
  });

  drawModeBtn.addEventListener('click', () => {
    isDrawMode = !isDrawMode;
    if (isDrawMode) {
      drawingCanvas.style.display = 'block';
      drawingCanvas.style.pointerEvents = 'auto';
      drawModeBtn.classList.remove('btn-ghost');
      drawModeBtn.classList.add('btn-primary');
      drawModeBtn.innerHTML = `<i data-lucide="check" style="width:13px;height:13px;"></i> Done Drawing`;
      drawingTip.textContent = 'Click on countertop corners. When finished, click "Done Drawing"';
    } else {
      drawingCanvas.style.pointerEvents = 'none';
      drawModeBtn.classList.remove('btn-primary');
      drawModeBtn.classList.add('btn-ghost');
      drawModeBtn.innerHTML = `<i data-lucide="pen-tool" style="width:13px;height:13px;"></i> Draw Shape`;
      drawingTip.textContent = points.length >= 3 ? 'Countertop shape configured!' : 'Countertop outline set!';
    }
    lucide.createIcons();
    redrawCanvas();
  });

  clearPointsBtn.addEventListener('click', () => {
    points = [];
    clearPointsBtn.style.display = 'none';
    drawingTip.textContent = 'Click on photo to trace countertop';
    redrawCanvas();
  });

  window.addEventListener('resize', redrawCanvas);
}

function redrawCanvas() {
  if (!drawingCanvas || drawingCanvas.style.display === 'none') return;
  
  const ctx = drawingCanvas.getContext('2d');
  const w = drawingCanvas.clientWidth;
  const h = drawingCanvas.clientHeight;
  
  drawingCanvas.width = w;
  drawingCanvas.height = h;
  
  ctx.clearRect(0, 0, w, h);
  
  if (points.length === 0) return;
  
  ctx.beginPath();
  const firstX = (points[0].x / 100) * w;
  const firstY = (points[0].y / 100) * h;
  ctx.moveTo(firstX, firstY);
  
  for (let i = 1; i < points.length; i++) {
    const px = (points[i].x / 100) * w;
    const py = (points[i].y / 100) * h;
    ctx.lineTo(px, py);
  }
  
  if (points.length >= 3) {
    ctx.closePath();
    ctx.fillStyle = 'rgba(201, 169, 110, 0.2)';
    ctx.fill();
  }
  
  ctx.strokeStyle = '#c9a96e';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  points.forEach((pt) => {
    const px = (pt.x / 100) * w;
    const py = (pt.y / 100) * h;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#c9a96e';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function setupActionListeners() {
  resetBtn.addEventListener('click', () => {
    previewImage.src = '';
    previewImage.style.display = 'none';
    fileInput.value = '';
    
    const uploadWrapper = uploadArea.querySelector('.upload-content-wrapper') || document.getElementById('upload-content');
    if (uploadWrapper) {
      uploadWrapper.style.display = 'flex';
    } else {
      const upIcon = uploadArea.querySelector('.upload-icon') || uploadArea.querySelector('[data-lucide="upload"]') || uploadArea.querySelector('[data-lucide="upload-cloud"]');
      if (upIcon) upIcon.style.display = 'block';
      const upTitle = uploadArea.querySelector('.upload-title');
      if (upTitle) upTitle.style.display = 'block';
      const upDesc = uploadArea.querySelector('.upload-desc');
      if (upDesc) upDesc.style.display = 'block';
    }
    
    drawingToolbar.style.display = 'none';
    drawingCanvas.style.display = 'none';
    clearPointsBtn.style.display = 'none';
    drawingTip.textContent = 'Click on photo to trace countertop';
    
    points = [];
    isDrawMode = false;
    originalFileUrl = null;
    
    if (actionBar) actionBar.classList.remove('visible');
    simulatedHighlight.style.display = 'none';
    
    // Hide drawing components if active
    drawingCanvas.style.display = 'none';

    // Show pre-render controls
    const preRenderControls = document.getElementById('pre-render-controls');
    if (preRenderControls) preRenderControls.style.display = 'flex';

    generateBtn.disabled = false;
    generateBtn.innerHTML = `<i data-lucide="sparkles" style="width:16px;height:16px"></i> Generate AI Render`;
    
    document.getElementById('post-render-actions').style.display = 'none';
    
    // Reset selected stone display and selection state
    selectedStone = null;
    document.querySelectorAll('.stone-card-item').forEach(i => i.classList.remove('selected'));
    updateSelectedMaterialCard(null);

    lucide.createIcons();
  });

  const clearWorkspaceBtn = document.getElementById('clear-workspace-btn');
  if (clearWorkspaceBtn) {
    clearWorkspaceBtn.addEventListener('click', () => {
      // Clear points and redraw canvas
      points = [];
      redrawCanvas();
      clearPointsBtn.style.display = 'none';
      drawingTip.textContent = 'Click on photo to trace countertop';
      
      // Hide highlights
      simulatedHighlight.style.display = 'none';
      
      // Reset selected stone
      selectedStone = null;
      document.querySelectorAll('.stone-card-item').forEach(i => i.classList.remove('selected'));
      updateSelectedMaterialCard(null);

      // Revert to pre-render controls
      const postActions = document.getElementById('post-render-actions');
      const preControls = document.getElementById('pre-render-controls');
      if (postActions) postActions.style.display = 'none';
      if (preControls) preControls.style.display = 'flex';
      
      showToast('Workspace cleared!', 'info');
    });
  }

  generateBtn.addEventListener('click', async () => {
    await generateRender();
  });

  document.getElementById('share-btn').addEventListener('click', () => {
    document.getElementById('share-modal').classList.add('open');
  });

  async function trackShare() {
    if (!currentProfile) return;
    const newShares = (currentProfile.shares || 0) + 1;
    await supabaseClient
      .from('profiles')
      .update({ shares: newShares })
      .eq('id', currentUser.id);
    currentProfile.shares = newShares;
  }

  document.getElementById('share-whatsapp').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const text = encodeURIComponent(`Check out this beautiful ${selectedStone.brandName} ${selectedStone.name} kitchen design I created on RatedWorktops!`);
    const url = encodeURIComponent(`${window.location.origin}${window.location.pathname}?stone=${selectedStone.brand_id}-${selectedStone.id}`);
    window.open(`https://api.whatsapp.com/send?text=${text}%20${url}`, '_blank');
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('share-facebook').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const url = encodeURIComponent(`${window.location.origin}${window.location.pathname}?stone=${selectedStone.brand_id}-${selectedStone.id}`);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('share-x').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const text = encodeURIComponent(`Check out this beautiful ${selectedStone.brandName} ${selectedStone.name} kitchen design I created on @RatedWorktops!`);
    const url = encodeURIComponent(`${window.location.origin}${window.location.pathname}?stone=${selectedStone.brand_id}-${selectedStone.id}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('share-email').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const subject = encodeURIComponent(`My Kitchen Design - RatedWorktops`);
    const body = encodeURIComponent(`Hi!\n\nCheck out this beautiful ${selectedStone.brandName} ${selectedStone.name} kitchen design I created on RatedWorktops:\n\n${window.location.origin}${window.location.pathname}?stone=${selectedStone.brand_id}-${selectedStone.id}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('share-copy-link').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const shareLink = `${window.location.origin}${window.location.pathname}?stone=${selectedStone.brand_id}-${selectedStone.id}`;
    navigator.clipboard.writeText(shareLink).then(() => {
      showToast('Link copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy link.', 'error');
    });
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('download-btn').addEventListener('click', async () => {
    if (!previewImage.src) return;
    showToast('Preparing your image...', 'info');

    // Increment downloads metric in DB
    if (currentProfile) {
      const newDownloads = (currentProfile.downloads || 0) + 1;
      await supabaseClient
        .from('profiles')
        .update({ downloads: newDownloads })
        .eq('id', currentUser.id);
      currentProfile.downloads = newDownloads;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      const stoneImg = new Image();
      stoneImg.crossOrigin = "Anonymous";
      stoneImg.onload = () => {
        ctx.drawImage(img, 0, 0);

        const pattern = ctx.createPattern(stoneImg, 'repeat');
        ctx.fillStyle = pattern;
        
        ctx.globalCompositeOperation = 'overlay';
        ctx.beginPath();
        if (points.length >= 3) {
          ctx.moveTo((points[0].x / 100) * img.width, (points[0].y / 100) * img.height);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo((points[i].x / 100) * img.width, (points[i].y / 100) * img.height);
          }
        } else {
          ctx.moveTo(img.width * 0.1, img.height * 0.6);
          ctx.lineTo(img.width * 0.9, img.height * 0.6);
          ctx.lineTo(img.width * 0.95, img.height * 0.75);
          ctx.lineTo(img.width * 0.05, img.height * 0.75);
        }
        ctx.closePath();
        ctx.fill();
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = `bold ${Math.floor(img.width * 0.03)}px 'Playfair Display'`;
        ctx.textAlign = 'right';
        ctx.fillText('🪨 Created with RatedWorktops', img.width - 20, img.height - 20);

        const link = document.createElement('a');
        link.download = `ratedworktops-${selectedStone.name.replace(/\s+/g, '-').toLowerCase()}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
        
        showToast('Image downloaded successfully!', 'success');
      };
      stoneImg.src = getStoneImage(selectedStone.sku);
    };
    img.src = previewImage.src;
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-btn');
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0"></div> Saving...`;
    btn.disabled = true;

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

    getRenderedCanvasBlob().then(async (blob) => {
      if (!blob) {
        showToast('Failed to compile render canvas.', 'error');
        resetSaveBtn(btn);
        return;
      }

      showToast('Saving design file to cloud storage...', 'info');
      const uuid = Math.random().toString(36).substring(2, 15);
      const path = `outputs/${currentUser.id}/${uuid}.jpg`;
      const uploadRes = await uploadFileToStorage('ratedworktops', path, blob);

      if (uploadRes.ok) {
        const { error: insertErr } = await supabaseClient
          .from('projects')
          .insert([{
            user_id: currentUser.id,
            stone_name: selectedStone.name,
            brand_name: selectedStone.brandName,
            image_url: uploadRes.url
          }]);

        if (insertErr) {
          showToast('Failed to save project database row. ' + insertErr.message, 'error');
          resetSaveBtn(btn);
        } else {
          showToast('Project saved successfully!', 'success');
          btn.innerHTML = `<i data-lucide="check" style="width:16px;height:16px"></i> Saved`;
          btn.style.background = '#4ade80';
          btn.style.borderColor = '#4ade80';
          btn.style.color = '#000';
        }
      } else {
        showToast('Failed to upload rendered image. ' + uploadRes.error, 'error');
        resetSaveBtn(btn);
      }
      lucide.createIcons();
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

function getRenderedCanvasBlob() {
  return new Promise((resolve) => {
    if (!previewImage.src || !selectedStone) {
      resolve(null);
      return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      const stoneImg = new Image();
      stoneImg.crossOrigin = "Anonymous";
      stoneImg.onload = () => {
        ctx.drawImage(img, 0, 0);

        const pattern = ctx.createPattern(stoneImg, 'repeat');
        ctx.fillStyle = pattern;
        
        ctx.globalCompositeOperation = 'overlay';
        ctx.beginPath();
        if (points.length >= 3) {
          ctx.moveTo((points[0].x / 100) * img.width, (points[0].y / 100) * img.height);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo((points[i].x / 100) * img.width, (points[i].y / 100) * img.height);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          // Countertop
          ctx.moveTo(img.width * 0.1, img.height * 0.6);
          ctx.lineTo(img.width * 0.9, img.height * 0.6);
          ctx.lineTo(img.width * 0.95, img.height * 0.75);
          ctx.lineTo(img.width * 0.05, img.height * 0.75);
          ctx.closePath();
          ctx.fill();

          // Splashback (the black face)
          ctx.beginPath();
          ctx.moveTo(img.width * 0.605, img.height * 0.15);
          ctx.lineTo(img.width * 0.865, img.height * 0.15);
          ctx.lineTo(img.width * 0.865, img.height * 0.56);
          ctx.lineTo(img.width * 0.605, img.height * 0.56);
          ctx.closePath();
          ctx.fill();
        }
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = `bold ${Math.floor(img.width * 0.03)}px 'Playfair Display'`;
        ctx.textAlign = 'right';
        ctx.fillText('🪨 Created with RatedWorktops', img.width - 20, img.height - 20);

        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.9);
      };
      stoneImg.onerror = () => resolve(null);
      stoneImg.src = getStoneImage(selectedStone.sku);
    };
    img.onerror = () => resolve(null);
    img.src = previewImage.src;
  });
}

function resetSaveBtn(btn) {
  btn.disabled = false;
  btn.innerHTML = `<i data-lucide="bookmark" style="width:16px;height:16px"></i> Save Project`;
  lucide.createIcons();
}

function setupMobileNavListeners() {
  const tabCatalog = document.getElementById('nav-tab-catalog');
  const tabCanvas = document.getElementById('nav-tab-canvas');
  const tabControls = document.getElementById('nav-tab-controls');

  const visSidebar = document.getElementById('vis-sidebar');
  const visMain = document.getElementById('vis-main');
  const visControlPanel = document.getElementById('vis-control-panel');

  if (!tabCatalog || !tabCanvas || !tabControls) return;

  function switchTab(activeTabBtn, activePanel) {
    // Remove active class from all tabs
    tabCatalog.classList.remove('active');
    tabCanvas.classList.remove('active');
    tabControls.classList.remove('active');

    // Remove active-tab class from all panels
    visSidebar.classList.remove('active-tab');
    visMain.classList.remove('active-tab');
    visControlPanel.classList.remove('active-tab');

    // Set active
    activeTabBtn.classList.add('active');
    activePanel.classList.add('active-tab');

    // Redraw canvas context on transition to ensure correct scaling/coordinates matching
    setTimeout(() => {
      redrawCanvas();
    }, 50);
  }

  tabCatalog.addEventListener('click', () => switchTab(tabCatalog, visSidebar));
  tabCanvas.addEventListener('click', () => switchTab(tabCanvas, visMain));
  tabControls.addEventListener('click', () => switchTab(tabControls, visControlPanel));
}


function updateRenderInstantly() {
  if (!selectedStone) return;
  const imgUrl = getStoneImage(selectedStone.sku);
  let polygonPoints = "10,60 90,60 95,75 5,75";
  if (points.length >= 3) {
    polygonPoints = points.map(p => `${p.x},${p.y}`).join(" ");
  }

  const patternId = 'stone-pattern-' + selectedStone.sku + '-' + Date.now();

  simulatedHighlight.innerHTML = `
    <defs>
      <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="80" height="80">
        <image href="${imgUrl}" x="0" y="0" width="80" height="80" />
      </pattern>
    </defs>
    <polygon points="${polygonPoints}" fill="url(#${patternId})" opacity="0.85" style="mix-blend-mode: overlay; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.35));" />
    ${points.length >= 3 ? '' : `<polygon points="60.5,15 86.5,15 86.5,56 60.5,56" fill="url(#${patternId})" opacity="0.85" style="mix-blend-mode: overlay;" />`}
  `;

  drawingCanvas.style.display = 'none';
  simulatedHighlight.style.display = 'block';
}
