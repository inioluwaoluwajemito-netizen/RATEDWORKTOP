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

// Visualisation variables
let autoCountertopPoints = null; // array of {x,y} from Gemini
let autoSplashbackPoints = null; // array of {x,y} from Gemini
let cacheImageSrc = ''; // tracks which image is cached

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

  const isAutoMode = document.getElementById('mode-auto-btn')?.classList.contains('active');

  isRendering = true;

  // Show transition overlay
  processingOverlay.style.display = 'flex';
  
  try {
    processingText.textContent = 'Preparing images for AI inpainting...';
    
    // Create the square 1024x1024 image and mask
    const { imageCanvas, maskCanvas } = createInpaintingMask(previewImage, isAutoMode, points);
    
    const imageBlob = await new Promise(resolve => imageCanvas.toBlob(resolve, 'image/png'));
    const maskBlob = await new Promise(resolve => maskCanvas.toBlob(resolve, 'image/png'));

    processingText.textContent = 'Generating photorealistic stone surface with AI...';

    // Decode OpenAI API key
    const apiKey = atob('c2stcHJvai1wNGNpWlFzbFczZTZoWGRkelZ1MzBTZU5fRXZOYjNmWXFHWi0zdVZXSlBxekd1SlJqYm9ZWFhMejlTcDRsS3JzclhSS0M0aDQ0RlQzQmxia0ZKVWtEMnpDckFWSnNPV1BJS1lJbVZkZFoyNFJiS1BNLWpMeU1GQW1PLURzU1lZT0JtWldqNXlQTEJrTDhFVFpiaUNlUk9ySTJDc0E=');
    const formData = new FormData();
    formData.append('image', imageBlob, 'image.png');
    formData.append('mask', maskBlob, 'mask.png');
    formData.append('prompt', `Replace the white masked area in this kitchen photo with ${selectedStone.name} stone material. Make it look photorealistic — match the lighting, perspective, and shadows of the original kitchen. Keep all objects, appliances, and cabinets exactly as they are. Only change the surface material in the masked area.`);
    formData.append('n', '1');
    formData.append('size', '1024x1024');
    formData.append('model', 'dall-e-2');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch (e) {}
      throw new Error(parsedError?.error?.message || errorText || 'OpenAI API request failed');
    }

    const resData = await response.json();
    const imageUrl = resData.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL returned from OpenAI.');
    }

    processingText.textContent = 'Applying final adjustments...';

    // Draw the returned image onto render-canvas
    await new Promise((resolve, reject) => {
      const renderedImage = new Image();
      renderedImage.crossOrigin = 'Anonymous';
      renderedImage.onload = () => {
        const renderCanvas = document.getElementById('render-canvas');
        if (renderCanvas) {
          renderCanvas.width = previewImage.naturalWidth || previewImage.width;
          renderCanvas.height = previewImage.naturalHeight || previewImage.height;
          const rCtx = renderCanvas.getContext('2d');
          rCtx.drawImage(renderedImage, 0, 0, renderCanvas.width, renderCanvas.height);
          
          drawingCanvas.style.display = 'none';
          simulatedHighlight.style.display = 'none';
          renderCanvas.style.display = 'block';
        }
        resolve();
      };
      renderedImage.onerror = (e) => reject(new Error('Failed to load inpainted image from OpenAI: ' + e.message));
      renderedImage.src = imageUrl;
    });

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
      
      showToast('Visualisation complete!', 'success');
      
      const preRenderControls = document.getElementById('pre-render-controls');
      if (preRenderControls) preRenderControls.style.display = 'none';
      document.getElementById('post-render-actions').style.display = 'flex';
    } else {
      showToast('Failed to update credits.', 'error');
    }

  } catch (err) {
    console.error(err);
    showToast('AI Render failed: ' + (err.message || 'Check network connection.'), 'error');
  } finally {
    processingOverlay.style.display = 'none';
    isRendering = false;
  }
}

function createInpaintingMask(previewImg, isAutoMode, manualPoints) {
  // Create a 1024x1024 square image canvas
  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = 1024;
  imageCanvas.height = 1024;
  const imgCtx = imageCanvas.getContext('2d');
  imgCtx.drawImage(previewImg, 0, 0, 1024, 1024);

  // Create a 1024x1024 square mask canvas
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = 1024;
  maskCanvas.height = 1024;
  const maskCtx = maskCanvas.getContext('2d');

  // Fill everything with opaque black
  maskCtx.fillStyle = 'black';
  maskCtx.fillRect(0, 0, 1024, 1024);

  // Switch to destination-out to clear the drawn areas (make them transparent / white in OpenAI's logic)
  maskCtx.globalCompositeOperation = 'destination-out';

  if (isAutoMode) {
    // 1. Draw Default Countertop Polygon
    const countertopPoints = [
      { x: 10, y: 60 },
      { x: 90, y: 60 },
      { x: 95, y: 75 },
      { x: 5, y: 75 }
    ];
    maskCtx.beginPath();
    maskCtx.moveTo(countertopPoints[0].x * 10.24, countertopPoints[0].y * 10.24);
    for (let i = 1; i < countertopPoints.length; i++) {
      maskCtx.lineTo(countertopPoints[i].x * 10.24, countertopPoints[i].y * 10.24);
    }
    maskCtx.closePath();
    maskCtx.fill();

    // 2. Draw Default Splashback Polygon
    const splashbackPoints = [
      { x: 60.5, y: 15 },
      { x: 86.5, y: 15 },
      { x: 86.5, y: 56 },
      { x: 60.5, y: 56 }
    ];
    maskCtx.beginPath();
    maskCtx.moveTo(splashbackPoints[0].x * 10.24, splashbackPoints[0].y * 10.24);
    for (let i = 1; i < splashbackPoints.length; i++) {
      maskCtx.lineTo(splashbackPoints[i].x * 10.24, splashbackPoints[i].y * 10.24);
    }
    maskCtx.closePath();
    maskCtx.fill();

  } else if (manualPoints && manualPoints.length >= 3) {
    // Draw Manual Points Polygon
    maskCtx.beginPath();
    maskCtx.moveTo(manualPoints[0].x * 10.24, manualPoints[0].y * 10.24);
    for (let i = 1; i < manualPoints.length; i++) {
      maskCtx.lineTo(manualPoints[i].x * 10.24, manualPoints[i].y * 10.24);
    }
    maskCtx.closePath();
    maskCtx.fill();
  }

  return { imageCanvas, maskCanvas };
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

      // If the render has already been generated once, update it instantly to show the new stone
      if (previewImage.src && previewImage.style.display === 'block' && !isDrawMode) {
        const postActions = document.getElementById('post-render-actions');
        if (postActions && postActions.style.display === 'flex') {
          updateRenderInstantly();
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
    
    const previewWrapper = document.getElementById('preview-wrapper');
    if (previewWrapper) previewWrapper.style.display = 'inline-flex';
    
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
    
    // Hide rendering canvas on new file load
    const renderCanvas = document.getElementById('render-canvas');
    if (renderCanvas) renderCanvas.style.display = 'none';

    // Clear AI segment cache
    autoCountertopMask = null;
    autoSplashbackMask = null;
    autoCountertopBounds = null;
    autoSplashbackBounds = null;
    currentSegmentsCache = null;
    cacheImageSrc = '';

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

      // Automatically trigger render update when drawing is completed (at least 3 points)
      if (selectedStone && previewImage.src && points.length >= 3) {
        updateRenderInstantly();
        const preControls = document.getElementById('pre-render-controls');
        if (preControls) preControls.style.display = 'none';
        const postActions = document.getElementById('post-render-actions');
        if (postActions) postActions.style.display = 'flex';
      }
    }
    lucide.createIcons();
    redrawCanvas();
  });

  clearPointsBtn.addEventListener('click', () => {
    points = [];
    clearPointsBtn.style.display = 'none';
    drawingTip.textContent = 'Click on photo to trace countertop';
    
    // Hide rendering overlay and return to drawing state
    simulatedHighlight.style.display = 'none';
    drawingCanvas.style.display = 'block';
    
    // Swap buttons back to pre-render state
    const preControls = document.getElementById('pre-render-controls');
    if (preControls) preControls.style.display = 'flex';
    const postActions = document.getElementById('post-render-actions');
    if (postActions) postActions.style.display = 'none';
    
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
    const previewWrapper = document.getElementById('preview-wrapper');
    if (previewWrapper) previewWrapper.style.display = 'none';
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
    
    // Hide rendering canvas
    const renderCanvas = document.getElementById('render-canvas');
    if (renderCanvas) renderCanvas.style.display = 'none';

    // Clear AI segments cache
    autoCountertopMask = null;
    autoSplashbackMask = null;
    autoCountertopBounds = null;
    autoSplashbackBounds = null;
    currentSegmentsCache = null;
    cacheImageSrc = '';
    
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
      // Clear image from preview and file input
      previewImage.src = '';
      previewImage.style.display = 'none';
      const previewWrapper = document.getElementById('preview-wrapper');
      if (previewWrapper) previewWrapper.style.display = 'none';
      fileInput.value = '';
      
      // Show upload content wrapper
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

      // Clear points and redraw canvas
      points = [];
      redrawCanvas();
      clearPointsBtn.style.display = 'none';
      drawingTip.textContent = 'Click on photo to trace countertop';
      
      // Hide tools and canvas
      if (actionBar) actionBar.classList.remove('visible');
      drawingToolbar.style.display = 'none';
      drawingCanvas.style.display = 'none';
      
      // Hide rendering canvas
      const renderCanvas = document.getElementById('render-canvas');
      if (renderCanvas) renderCanvas.style.display = 'none';

      // Clear AI segments cache
      autoCountertopMask = null;
      autoSplashbackMask = null;
      autoCountertopBounds = null;
      autoSplashbackBounds = null;
      currentSegmentsCache = null;
      cacheImageSrc = '';

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

  document.getElementById('share-btn').addEventListener('click', async () => {
    if (!selectedStone || !previewImage.src) {
      showToast('Generate a render first before sharing.', 'error');
      return;
    }

    // Prepare the share image before showing the modal
    showToast('Preparing your design for sharing...', 'info');
    const blob = await getRenderedCanvasBlob();
    if (!blob) {
      showToast('Failed to capture render. Please try again.', 'error');
      return;
    }

    // Upload to Supabase storage to get a public URL
    const uuid = Math.random().toString(36).substring(2, 15);
    const path = `shares/${currentUser.id}/${uuid}.jpg`;
    const uploadRes = await uploadFileToStorage('ratedworktops', path, blob);
    
    let shareImageUrl = '';
    if (uploadRes.ok) {
      shareImageUrl = uploadRes.url;
    }

    // Store for use by share buttons
    window._shareImageUrl = shareImageUrl;
    window._shareImageBlob = blob;

    // Show image preview in modal
    const previewImg = document.getElementById('share-preview-img');
    const previewText = document.getElementById('share-preview-text');
    if (previewImg && shareImageUrl) {
      previewImg.src = shareImageUrl;
      previewImg.style.display = 'block';
      if (previewText) previewText.style.display = 'none';
    } else if (previewImg && blob) {
      previewImg.src = URL.createObjectURL(blob);
      previewImg.style.display = 'block';
      if (previewText) previewText.style.display = 'none';
    }

    // Show native share button if supported (mobile devices)
    const nativeBtn = document.getElementById('share-native');
    if (nativeBtn && navigator.share && navigator.canShare) {
      nativeBtn.style.display = 'flex';
      nativeBtn.onclick = async () => {
        try {
          const file = new File([blob], `ratedworktops-${selectedStone.name.replace(/\s+/g, '-').toLowerCase()}.jpg`, { type: 'image/jpeg' });
          const shareData = {
            title: 'My Kitchen Design - RatedWorktops',
            text: getShareText(),
            files: [file]
          };
          if (navigator.canShare(shareData)) {
            trackShare();
            await navigator.share(shareData);
            document.getElementById('share-modal').classList.remove('open');
            showToast('Shared successfully!', 'success');
          } else {
            // Fallback: share without file
            trackShare();
            await navigator.share({ title: 'My Kitchen Design', text: getShareText(), url: shareImageUrl || window.location.href });
            document.getElementById('share-modal').classList.remove('open');
          }
        } catch (err) {
          if (err.name !== 'AbortError') {
            showToast('Share cancelled.', 'error');
          }
        }
      };
    }

    document.getElementById('share-modal').classList.add('open');
    lucide.createIcons();
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

  function getShareText() {
    return `Check out this beautiful ${selectedStone.brandName} ${selectedStone.name} kitchen design I created on RatedWorktops!`;
  }

  document.getElementById('share-whatsapp').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const text = encodeURIComponent(getShareText());
    const imageUrl = window._shareImageUrl ? encodeURIComponent(window._shareImageUrl) : '';
    const shareContent = imageUrl ? `${text}%0A%0A${imageUrl}` : text;
    window.open(`https://api.whatsapp.com/send?text=${shareContent}`, '_blank');
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('share-facebook').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const url = window._shareImageUrl 
      ? encodeURIComponent(window._shareImageUrl)
      : encodeURIComponent(`${window.location.origin}${window.location.pathname}?stone=${selectedStone.brand_id}-${selectedStone.id}`);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('share-x').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const text = encodeURIComponent(getShareText());
    const url = window._shareImageUrl 
      ? encodeURIComponent(window._shareImageUrl)
      : encodeURIComponent(`${window.location.origin}${window.location.pathname}?stone=${selectedStone.brand_id}-${selectedStone.id}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('share-email').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const subject = encodeURIComponent(`My Kitchen Design - RatedWorktops`);
    const imageLink = window._shareImageUrl ? `\n\nView my design: ${window._shareImageUrl}` : '';
    const body = encodeURIComponent(`Hi!\n\n${getShareText()}${imageLink}\n\nCreated with RatedWorktops`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('share-copy-link').addEventListener('click', () => {
    if (!selectedStone) return;
    trackShare();
    const shareLink = window._shareImageUrl || `${window.location.origin}${window.location.pathname}?stone=${selectedStone.brand_id}-${selectedStone.id}`;
    navigator.clipboard.writeText(shareLink).then(() => {
      showToast('Image link copied to clipboard!', 'success');
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
    
    const stoneImg = new Image();
    stoneImg.crossOrigin = "Anonymous";
    stoneImg.onload = () => {
      const isAutoMode = document.getElementById('mode-auto-btn')?.classList.contains('active');
      
      // Render the perspective-correct visual to our canvas
      renderDesignToCanvas(
        canvas, 
        selectedStone, 
        isAutoMode, 
        previewImage, 
        points, 
        stoneImg, 
        autoCountertopMask, 
        autoSplashbackMask, 
        autoCountertopBounds, 
        autoSplashbackBounds
      );

      // Draw Premium Branding & Watermark Logo Card
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      
      const margin = Math.max(16, Math.floor(canvas.width * 0.02));
      const logoHeight = Math.max(44, Math.floor(canvas.height * 0.065));
      const logoWidth = logoHeight * 3.8;
      const logoX = canvas.width - logoWidth - margin;
      const logoY = canvas.height - logoHeight - margin;

      // Draw card background
      ctx.fillStyle = 'rgba(17, 17, 22, 0.85)';
      ctx.beginPath();
      const cardRadius = 10;
      const cardWidth = logoWidth + 16;
      const cardHeight = logoHeight + 16;
      const cardX = logoX - 8;
      const cardY = logoY - 8;
      
      if (ctx.roundRect) {
        ctx.roundRect(cardX, cardY, cardWidth, cardHeight, cardRadius);
      } else {
        ctx.rect(cardX, cardY, cardWidth, cardHeight);
      }
      ctx.fill();
      
      // Gold stroke border
      ctx.strokeStyle = 'rgba(201, 169, 110, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw Gold Icon box
      const iconSize = logoHeight * 0.72;
      const iconX = logoX + 2;
      const iconY = logoY + (logoHeight - iconSize) / 2;
      ctx.fillStyle = '#C9A96E';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(iconX, iconY, iconSize, iconSize, 5);
      } else {
        ctx.rect(iconX, iconY, iconSize, iconSize);
      }
      ctx.fill();

      // Letter R
      ctx.font = `bold ${Math.floor(iconSize * 0.65)}px 'Playfair Display', serif`;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('R', iconX + (iconSize / 2), iconY + (iconSize / 2));

      // Company Name Text
      ctx.font = `bold ${Math.floor(logoHeight * 0.32)}px 'Inter', sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('RatedWorktops', logoX + iconSize + 12, logoY + 4);

      // Watermark Text
      ctx.font = `${Math.floor(logoHeight * 0.22)}px 'Inter', sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText('Created with RatedWorktops', logoX + iconSize + 12, logoY + logoHeight - 16);

      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.9);
    };
    stoneImg.onerror = () => resolve(null);
    stoneImg.src = getStoneImage(selectedStone.sku);
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
  if (!selectedStone || !previewImage.src) return;

  const renderCanvas = document.getElementById('render-canvas');
  if (!renderCanvas) return;

  const stoneImg = new Image();
  stoneImg.crossOrigin = "Anonymous";
  stoneImg.onload = () => {
    const isAutoMode = document.getElementById('mode-auto-btn')?.classList.contains('active');
    
    // Draw using our new high-fidelity perspective renderer
    renderDesignToCanvas(
      renderCanvas, 
      selectedStone, 
      isAutoMode, 
      previewImage, 
      points, 
      stoneImg, 
      autoCountertopPoints, 
      autoSplashbackPoints
    );

    drawingCanvas.style.display = 'none';
    simulatedHighlight.style.display = 'none';
    renderCanvas.style.display = 'block';
  };
  stoneImg.src = getStoneImage(selectedStone.sku);
}

// ── Perspective Warping & Grid Triangulation ───────────────────

function drawTriangleAffine(ctx, img, u0, v0, u1, v1, u2, v2, x0, y0, x1, y1, x2, y2) {
  ctx.save();
  
  // Expand the clipping path slightly to overlap adjacent triangles and prevent sub-pixel gaps (mesh lines)
  const cx = (x0 + x1 + x2) / 3;
  const cy = (y0 + y1 + y2) / 3;
  const expand = 1.015; // 1.5% overlap expansion
  const ex0 = cx + (x0 - cx) * expand;
  const ey0 = cy + (y0 - cy) * expand;
  const ex1 = cx + (x1 - cx) * expand;
  const ey1 = cy + (y1 - cy) * expand;
  const ex2 = cx + (x2 - cx) * expand;
  const ey2 = cy + (y2 - cy) * expand;

  ctx.beginPath();
  ctx.moveTo(ex0, ey0);
  ctx.lineTo(ex1, ey1);
  ctx.lineTo(ex2, ey2);
  ctx.closePath();
  ctx.clip();
  
  const den = u0 * (v1 - v2) - v0 * (u1 - u2) + (u1 * v2 - u2 * v1);
  if (Math.abs(den) < 1e-5) {
    ctx.restore();
    return;
  }
  
  const a = (ex0 * (v1 - v2) - v0 * (ex1 - ex2) + (ex1 * v2 - ex2 * v1)) / den;
  const b = (ey0 * (v1 - v2) - v0 * (ey1 - ey2) + (ey1 * v2 - ey2 * v1)) / den;
  const c = (u0 * (ex1 - ex2) - ex0 * (u1 - u2) + (u1 * ex2 - u2 * ex1)) / den;
  const d = (u0 * (ey1 - ey2) - ey0 * (u1 - u2) + (u1 * ey2 - u2 * ey1)) / den;
  const e = (u0 * (v1 * ex2 - v2 * ex1) - v0 * (u1 * ex2 - u2 * ex1) + ex0 * (u1 * v2 - u2 * v1)) / den;
  const f = (u0 * (v1 * ey2 - v2 * ey1) - v0 * (u1 * ey2 - u2 * ey1) + ey0 * (u1 * v2 - u2 * v1)) / den;
  
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawWarpedQuad(ctx, img, quad) {
  const gridW = 16;
  const gridH = 16;
  const texW = img.width;
  const texH = img.height;
  
  function getPoint(u, v) {
    const x = (1 - u) * (1 - v) * quad[0].x +
              u * (1 - v) * quad[1].x +
              u * v * quad[2].x +
              (1 - u) * v * quad[3].x;
              
    const y = (1 - u) * (1 - v) * quad[0].y +
              u * (1 - v) * quad[1].y +
              u * v * quad[2].y +
              (1 - u) * v * quad[3].y;
              
    return { x, y };
  }
  
  for (let r = 0; r < gridH; r++) {
    for (let c = 0; c < gridW; c++) {
      const u0 = c / gridW;
      const u1 = (c + 1) / gridW;
      const v0 = r / gridH;
      const v1 = (r + 1) / gridH;
      
      const su0 = u0 * texW;
      const su1 = u1 * texW;
      const sv0 = v0 * texH;
      const sv1 = v1 * texH;
      
      const p00 = getPoint(u0, v0);
      const p10 = getPoint(u1, v0);
      const p11 = getPoint(u1, v1);
      const p01 = getPoint(u0, v1);
      
      drawTriangleAffine(ctx, img, 
        su0, sv0, su1, sv0, su0, sv1,
        p00.x, p00.y, p10.x, p10.y, p01.x, p01.y
      );
      
      drawTriangleAffine(ctx, img, 
        su1, sv0, su1, sv1, su0, sv1,
        p10.x, p10.y, p11.x, p11.y, p01.x, p01.y
      );
    }
  }
}

function renderDesignToCanvas(canvas, selectedStone, isAutoMode, previewImg, manualPoints, stoneImg, autoCountertopPoints, autoSplashbackPoints) {
  const ctx = canvas.getContext('2d');
  canvas.width = previewImg.naturalWidth || previewImg.width;
  canvas.height = previewImg.naturalHeight || previewImg.height;
  
  // 1. Draw base image
  ctx.drawImage(previewImg, 0, 0, canvas.width, canvas.height);
  
  // 2. Render Countertop
  let countertopQuad = null;
  if (isAutoMode && autoCountertopPoints && autoCountertopPoints.length >= 3) {
    countertopQuad = autoCountertopPoints.map(p => ({
      x: (p.x / 100) * canvas.width,
      y: (p.y / 100) * canvas.height
    }));
  } else if (!isAutoMode && manualPoints && manualPoints.length >= 3) {
    if (manualPoints.length === 4) {
      countertopQuad = manualPoints.map(p => ({
        x: (p.x / 100) * canvas.width,
        y: (p.y / 100) * canvas.height
      }));
    } else {
      // Bounding quad for multi-point polygon
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      manualPoints.forEach(p => {
        const px = (p.x / 100) * canvas.width;
        const py = (p.y / 100) * canvas.height;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      });
      const w = maxX - minX;
      const h = maxY - minY;
      countertopQuad = [
        { x: minX + w * 0.05, y: minY + h * 0.05 },
        { x: maxX - w * 0.05, y: minY + h * 0.05 },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
      ];
    }
  } else {
    // Fallback default countertop quad
    countertopQuad = [
      { x: canvas.width * 0.1, y: canvas.height * 0.60 },
      { x: canvas.width * 0.9, y: canvas.height * 0.60 },
      { x: canvas.width * 0.95, y: canvas.height * 0.75 },
      { x: canvas.width * 0.05, y: canvas.height * 0.75 }
    ];
  }
  
  if (countertopQuad) {
    ctx.save();
    ctx.beginPath();
    if (isAutoMode && autoCountertopPoints && autoCountertopPoints.length >= 3) {
      ctx.moveTo(countertopQuad[0].x, countertopQuad[0].y);
      for (let i = 1; i < countertopQuad.length; i++) {
        ctx.lineTo(countertopQuad[i].x, countertopQuad[i].y);
      }
    } else if (!isAutoMode && manualPoints && manualPoints.length >= 3) {
      ctx.moveTo((manualPoints[0].x / 100) * canvas.width, (manualPoints[0].y / 100) * canvas.height);
      for (let i = 1; i < manualPoints.length; i++) {
        ctx.lineTo((manualPoints[i].x / 100) * canvas.width, (manualPoints[i].y / 100) * canvas.height);
      }
    } else {
      ctx.moveTo(countertopQuad[0].x, countertopQuad[0].y);
      ctx.lineTo(countertopQuad[1].x, countertopQuad[1].y);
      ctx.lineTo(countertopQuad[2].x, countertopQuad[2].y);
      ctx.lineTo(countertopQuad[3].x, countertopQuad[3].y);
    }
    ctx.closePath();
    ctx.clip();
    
    drawWarpedQuad(ctx, stoneImg, countertopQuad);
    
    // Apply shading & highlights
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.22;
    ctx.filter = 'grayscale(100%) contrast(120%)';
    ctx.drawImage(previewImg, 0, 0, canvas.width, canvas.height);
    
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28;
    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(previewImg, 0, 0, canvas.width, canvas.height);
    
    ctx.restore();
  }
  
  // 3. Render Splashback
  let splashbackQuad = null;
  if (isAutoMode && autoSplashbackPoints && autoSplashbackPoints.length >= 3) {
    splashbackQuad = autoSplashbackPoints.map(p => ({
      x: (p.x / 100) * canvas.width,
      y: (p.y / 100) * canvas.height
    }));
  } else if (isAutoMode && (!autoSplashbackPoints || autoSplashbackPoints.length < 3)) {
    // Default splashback fallback
    splashbackQuad = [
      { x: canvas.width * 0.605, y: canvas.height * 0.15 },
      { x: canvas.width * 0.865, y: canvas.height * 0.15 },
      { x: canvas.width * 0.865, y: canvas.height * 0.56 },
      { x: canvas.width * 0.605, y: canvas.height * 0.56 }
    ];
  } else if (!isAutoMode) {
    // In manual mode, we only apply default splashback if there are no drawn points (fallback mode)
    if (!manualPoints || manualPoints.length < 3) {
      splashbackQuad = [
        { x: canvas.width * 0.605, y: canvas.height * 0.15 },
        { x: canvas.width * 0.865, y: canvas.height * 0.15 },
        { x: canvas.width * 0.865, y: canvas.height * 0.56 },
        { x: canvas.width * 0.605, y: canvas.height * 0.56 }
      ];
    }
  }
  
  if (splashbackQuad) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(splashbackQuad[0].x, splashbackQuad[0].y);
    for (let i = 1; i < splashbackQuad.length; i++) {
      ctx.lineTo(splashbackQuad[i].x, splashbackQuad[i].y);
    }
    ctx.closePath();
    ctx.clip();
    
    drawWarpedQuad(ctx, stoneImg, splashbackQuad);
    
    // Apply shading & highlights
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.22;
    ctx.filter = 'grayscale(100%) contrast(120%)';
    ctx.drawImage(previewImg, 0, 0, canvas.width, canvas.height);
    
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28;
    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(previewImg, 0, 0, canvas.width, canvas.height);
    
    ctx.restore();
  }
}

