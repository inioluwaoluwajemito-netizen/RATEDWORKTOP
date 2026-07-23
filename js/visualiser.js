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


const drawModeBtn = document.getElementById('draw-mode-btn');
const clearPointsBtn = document.getElementById('clear-points-btn');
const drawingTip = document.getElementById('drawing-tip');

let isRendering = false;

// ── Progress Bar Helper ────────────────────────────────────────
const PROGRESS_STAGES = [
  { pct: 15,  title: 'Preparing your photo...',          detail: 'Encoding image and mask' },
  { pct: 40,  title: 'Sending to AI...',                 detail: 'Uploading to OpenAI' },
  { pct: 85,  title: 'Rendering stone surface...',       detail: 'AI is painting your worktop' },
  { pct: 100, title: 'Saving your design...',            detail: 'Almost there!' }
];

let _progressTicker = null;
let _progressTarget = 0;

function setProgress(stage) { // stage: 1-4
  const s = PROGRESS_STAGES[stage - 1];
  if (!s) return;
  _progressTarget = s.pct;

  const fill = document.getElementById('progress-fill');
  const title = document.getElementById('processing-title');
  const detail = document.getElementById('processing-text');
  if (fill) fill.style.width = s.pct + '%';
  if (title) title.textContent = s.title;
  if (detail) detail.textContent = s.detail;

  // Update step dots and lines
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`step-dot-${i}`);
    const lbl = document.getElementById(`step-lbl-${i}`);
    const line = document.getElementById(`step-line-${i}`);
    if (!dot) continue;
    dot.className = 'progress-step-dot' + (i < stage ? ' done' : (i === stage ? ' active' : ''));
    if (lbl) lbl.className = 'progress-step-text' + (i < stage ? ' done' : (i === stage ? ' active' : ''));
    if (line) line.className = 'progress-step-line' + (i < stage ? ' done' : '');
  }
}

function startProgressTicker() {
  // Slowly creep the bar toward 82% during the AI wait to show it's alive
  if (_progressTicker) clearInterval(_progressTicker);
  let current = 40;
  _progressTicker = setInterval(() => {
    if (current >= 82) { clearInterval(_progressTicker); return; }
    current += 0.6;
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = current + '%';
  }, 300);
}

function stopProgressTicker() {
  if (_progressTicker) { clearInterval(_progressTicker); _progressTicker = null; }
}
// ──────────────────────────────────────────────────────────────

function getStoneVisualDescription(stone) {
  if (!stone) return 'polished stone';
  const descMap = {
    'SIL-ECG': 'polished white quartz surface with elegant grey and gold veining',
    'SIL-NP': 'polished soft light grey quartz with a subtle pearlescent texture',
    'SIL-IB': 'deep solid polished glossy black quartz surface',
    'SIL-MW': 'pure polished clean solid white quartz surface',
    'DEK-KR': 'honed matte grey concrete look sintered stone surface',
    'DEK-OP': 'polished white sintered stone with light grey marble-like veining',
    'DEK-LR': 'dramatic polished black sintered stone with bold gold and brown veining',
    'DEK-CG': 'dark charcoal grey granite textured sintered stone surface',
    'CAE-SN': 'classic polished white marble-look surface with broad grey veins',
    'CAE-VN': 'polished rich black quartz with white veins and speckles',
    'CAE-CC': 'honed soft textured light grey concrete look surface',
    'CAL-GD': 'polished white marble surface with thick gold and grey veining',
    'CAL-CW': 'polished white Carrara marble surface with fine grey veining',
    'CAL-NM': 'polished deep black marble surface with striking white veining',
    'CAL-AV': 'polished white marble surface with heavy dark grey patterns and veins',
    'CAL-VI': 'polished white marble surface with dramatic deep purple and burgundy veining'
  };
  const sku = stone.sku ? stone.sku.toUpperCase() : '';
  if (descMap[sku]) return descMap[sku];

  // Dynamic fallback based on color/texture keywords
  const texture = stone.texture ? stone.texture.toLowerCase() : '';
  const name = stone.name ? stone.name.toLowerCase() : '';
  let colorDesc = 'stone';
  if (texture === 'black' || name.includes('black') || name.includes('noir') || name.includes('nero')) {
    colorDesc = 'dark black stone with detailed veining';
  } else if (texture === 'marble' || name.includes('marble') || name.includes('calacatta') || name.includes('carrara') || name.includes('statuario') || name.includes('vagli') || name.includes('viola')) {
    colorDesc = 'premium white marble with elegant grey and gold veining';
  } else if (texture === 'granite' || name.includes('granite') || name.includes('charcoal')) {
    colorDesc = 'dark grey textured granite';
  } else if (texture === 'slate' || name.includes('concrete') || name.includes('kreta')) {
    colorDesc = 'textured matte grey slate and concrete-look material';
  } else if (texture === 'quartz' || name.includes('white') || name.includes('miami')) {
    colorDesc = 'polished pure white quartz';
  }
  
  return `polished ${colorDesc} surface`;
}

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

  if (!previewImage.src || previewImage.style.display === 'none') {
    showToast('Please upload a kitchen image first.', 'error');
    return;
  }

  isRendering = true;
  simulatedHighlight.style.display = 'none';
  processingOverlay.style.display = 'flex';
  setProgress(1); // Stage 1: Preparing

  try {
    // (no processingText.textContent needed — setProgress handles it);

    // Create a 512x512 canvas (smaller = faster upload + faster AI processing)
    // OpenAI gpt-image-1 works best at 512x512 for speed vs quality balance
    const TARGET_SIZE = 512;

    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = TARGET_SIZE;
    imageCanvas.height = TARGET_SIZE;
    const imgCtx = imageCanvas.getContext('2d');
    imgCtx.drawImage(previewImage, 0, 0, TARGET_SIZE, TARGET_SIZE);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = TARGET_SIZE;
    maskCanvas.height = TARGET_SIZE;
    const maskCtx = maskCanvas.getContext('2d');

    // Black background = keep (0)
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

    // White shapes = regenerate/inpaint (255) for Fal.ai
    maskCtx.fillStyle = 'white';

    const isAutoMode = document.getElementById('mode-auto-btn')?.classList.contains('active');
    const SCALE = TARGET_SIZE / 100; // scale factor (5.12 for 512)

    if (isAutoMode) {
      // Default countertop polygon
      const countertopPoints = [
        { x: 10, y: 60 }, { x: 90, y: 60 }, { x: 95, y: 75 }, { x: 5, y: 75 }
      ];
      maskCtx.beginPath();
      maskCtx.moveTo(countertopPoints[0].x * SCALE, countertopPoints[0].y * SCALE);
      for (let i = 1; i < countertopPoints.length; i++) {
        maskCtx.lineTo(countertopPoints[i].x * SCALE, countertopPoints[i].y * SCALE);
      }
      maskCtx.closePath();
      maskCtx.fill();

      // Default splashback polygon
      const splashbackPoints = [
        { x: 60.5, y: 15 }, { x: 86.5, y: 15 }, { x: 86.5, y: 56 }, { x: 60.5, y: 56 }
      ];
      maskCtx.beginPath();
      maskCtx.moveTo(splashbackPoints[0].x * SCALE, splashbackPoints[0].y * SCALE);
      for (let i = 1; i < splashbackPoints.length; i++) {
        maskCtx.lineTo(splashbackPoints[i].x * SCALE, splashbackPoints[i].y * SCALE);
      }
      maskCtx.closePath();
      maskCtx.fill();

    } else if (points && points.length >= 3) {
      // Manual drawing points (points are 0-100 scale)
      maskCtx.beginPath();
      maskCtx.moveTo(points[0].x * SCALE, points[0].y * SCALE);
      for (let i = 1; i < points.length; i++) {
        maskCtx.lineTo(points[i].x * SCALE, points[i].y * SCALE);
      }
      maskCtx.closePath();
      maskCtx.fill();
    }

    // Both image and mask must be PNG for dall-e-2
    const imageUri = imageCanvas.toDataURL('image/png');
    const maskUri = maskCanvas.toDataURL('image/png');

    const stoneDesc = getStoneVisualDescription(selectedStone);
    const enhancedPrompt = `Replace the kitchen countertop and splashback surfaces with ${selectedStone.brandName} ${selectedStone.name}. This is a highly detailed ${stoneDesc} material. Make it photorealistic, precisely matching the color and veining texture of ${selectedStone.name}, while maintaining perfect lighting, highlights, shadows, and perspective of the kitchen scene. Keep all cabinets, walls, appliances, and kitchen items exactly as they are.`;

    setProgress(2); // Stage 2: Sending to AI

    if (!supabaseClient || !useRealSupabase) {
      throw new Error("Database is disconnected. AI render requires a live database connection.");
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Authentication session expired. Please log in again.");

    startProgressTicker(); // slowly animate bar during AI wait

    const response = await fetch(`${SUPABASE_URL}/functions/v1/openai-proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: imageUri, mask: maskUri, prompt: enhancedPrompt, strength: 0.95 })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError;
      try { parsedError = JSON.parse(errorText); } catch (e) {}
      throw new Error(parsedError?.error?.message || errorText || 'AI request failed');
    }

    const resData = await response.json();
    const imageUrl = resData.data?.[0]?.url;
    if (!imageUrl) throw new Error(resData?.error?.message || 'No image URL returned from AI.');

    stopProgressTicker();
    setProgress(3); // Stage 3: Rendering to canvas

    // Draw the AI result onto the preview
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
          simulatedHighlight.style.display = 'none';
          renderCanvas.style.display = 'block';
          window._isAIRendered = true;
        }
        resolve();
      };
      renderedImage.onerror = () => reject(new Error('Failed to load AI-generated image.'));
      renderedImage.src = imageUrl;
    });

    // Upload AI result to Supabase Storage so share buttons get a real public URL
    setProgress(4); // Stage 4: Saving
    try {
      const renderCanvas = document.getElementById('render-canvas');
      if (renderCanvas) {
        const shareBlob = await new Promise(res => renderCanvas.toBlob(res, 'image/jpeg', 0.92));
        if (shareBlob) {
          const sharePath = `shares/${currentUser.id}/${Date.now()}.jpg`;
          const shareUpload = await uploadFileToStorage('ratedworktops', sharePath, shareBlob);
          window._shareImageUrl = shareUpload.ok ? shareUpload.url : '';
          window._shareImageBlob = shareBlob;
        }
      }
    } catch (uploadErr) {
      console.warn('Share upload failed (non-critical):', uploadErr);
      window._shareImageUrl = '';
    }

    // Deduct credits
    const newCredits = isFreeMode ? currentProfile.credits : (currentProfile.credits - 1);
    const newVisualisations = (currentProfile.visualisations || 0) + 1;
    const { error } = await supabaseClient
      .from('profiles')
      .update({ credits: newCredits, visualisations: newVisualisations })
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
      showToast('AI visualisation complete!' + (isFreeMode ? '' : ' 1 credit deducted.'), 'success');
      const preRenderControls = document.getElementById('pre-render-controls');
      if (preRenderControls) preRenderControls.style.display = 'none';
      document.getElementById('post-render-actions').style.display = 'flex';
    } else {
      showToast('Failed to update credits.', 'error');
    }

  } catch (error) {
    stopProgressTicker();
    console.error('AI Render failed:', error);
    showToast('AI Render failed: ' + error.message, 'error');
  } finally {
    processingOverlay.style.display = 'none';
    isRendering = false;
    stopProgressTicker();
    // Reset progress bar for next run
    setTimeout(() => setProgress(1), 100);
  }
}



document.addEventListener('DOMContentLoaded', async () => {
  // Clear any cached API keys immediately to disconnect
  localStorage.removeItem('openai_api_key');

  // 1. Check Authentication
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html' + window.location.search;
    return;
  }
  currentUser = session.user;

  // Using custom HTML header markup for the visualiser view to prevent dropdown overlap

  // 2. Load User Profile
  await loadProfile();

  // 3. Load Materials from Supabase
  await loadFiltersAndStones();

  // 4. Setup Upload Listeners
  setupUploadListeners();

  // 5. Setup Action Listeners
  setupActionListeners();

  // 6. Setup Shape Drawing Listeners
  /* setupDrawingListeners removed */

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
    const urlParams = new URLSearchParams(window.location.search);
    const flow = urlParams.get('flow');
    if (flow === 'login') {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html?error=no_account';
      return;
    }
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
  if (searchInput) {
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
    el.className = 'stone-item';
    if (selectedStone && selectedStone.id === stone.id) el.classList.add('selected');

    const imgUrl = getStoneImage(stone.sku);

    const categoryLabel = (stone.categoryName || stone.category || 'Marble').toUpperCase();
    const finishLabel = (stone.texture === 'granite' || stone.texture === 'slate') ? 'HONED' : 'POLISHED';
    el.innerHTML = `
      <div class="stone-thumb" style="background-image: url('${imgUrl}'), ${getTexture(stone.texture || 'default')}; background-size: cover; background-position: center;"></div>
      <div class="stone-info">
        <div class="stone-name" title="${stone.name}">${stone.name}</div>
        <div class="stone-brand">${categoryLabel} · ${finishLabel}</div>
      </div>
    `;

    el.addEventListener('click', () => {
      document.querySelectorAll('.stone-item').forEach(i => i.classList.remove('selected'));
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
          <div class="material-card-thumb" style="background-image: url('${imgUrl}'), ${getTexture(stone.texture || 'default')};"></div>
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
  uploadArea.addEventListener('click', async (e) => {
    if (e.target.closest('#drawing-canvas') || e.target.closest('#drawing-toolbar') || e.target.closest('.vis-control-panel')) {
      return;
    }
    if (!previewImage.src || previewImage.style.display === 'none') {
      if (window.Capacitor && window.Capacitor.isNative) {
        try {
          const { Camera, CameraResultType, CameraSource } = capacitorExports;
          const image = await Camera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.DataUrl,
            source: CameraSource.Prompt
          });
          const res = await fetch(image.dataUrl);
          const blob = await res.blob();
          handleFile(new File([blob], "camera_capture.jpg", { type: "image/jpeg" }));
        } catch (err) {
          console.error("Camera error:", err);
          // If user cancels or fails, fallback or do nothing
        }
      } else {
        fileInput.click();
      }
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
  window._isAIRendered = false; // Reset AI rendering flag on new upload
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

  // Delete all former images in the user's directory to ensure no old files are left behind
  const storageDir = `originals/${currentUser?.id || 'guest'}`;
  await emptyStorageFolder('ratedworktops', storageDir);

  const path = `${storageDir}/current_kitchen.jpg`;
  const uploadRes = await uploadFileToStorage('ratedworktops', path, optimizedFile);

  if (uploadRes.ok) {
    // Append timestamp cache-buster so if URL is ever viewed, it breaks the cache
    originalFileUrl = uploadRes.url + `?t=${Date.now()}`;
    showToast('Image uploaded successfully!', 'success');
    
    // Log the upload in the database
    if (supabaseClient) {
      supabaseClient.from('kitchen_uploads').delete().eq('user_id', currentUser?.id || 'guest').then(() => {
        supabaseClient.from('kitchen_uploads').insert([{
          user_id: currentUser?.id || 'guest',
          image_url: uploadRes.url
        }]).then(({ error }) => {
          if (error) console.error('Failed to log kitchen upload:', error);
        });
      });
    }
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
    
  });

  drawModeBtn.addEventListener('click', () => {
    isDrawMode = !isDrawMode;
    if (isDrawMode) {
      
      
      drawModeBtn.classList.remove('btn-ghost');
      drawModeBtn.classList.add('btn-primary');
      drawModeBtn.innerHTML = `<i data-lucide="check" style="width:13px;height:13px;"></i> Done Drawing`;
      drawingTip.textContent = 'Click on countertop corners. When finished, click "Done Drawing"';
    } else {
      
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
    
  });

  clearPointsBtn.addEventListener('click', () => {
    points = [];
    clearPointsBtn.style.display = 'none';
    drawingTip.textContent = 'Click on photo to trace countertop';

    // Hide rendering overlay and return to drawing state
    simulatedHighlight.style.display = 'none';
    

    // Swap buttons back to pre-render state
    const preControls = document.getElementById('pre-render-controls');
    if (preControls) preControls.style.display = 'flex';
    const postActions = document.getElementById('post-render-actions');
    if (postActions) postActions.style.display = 'none';

    
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
    window._isAIRendered = false; // Reset AI rendering flag
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
    
    clearPointsBtn.style.display = 'none';
    drawingTip.textContent = 'Click on photo to trace countertop';

    points = [];
    isDrawMode = false;
    originalFileUrl = null;

    if (actionBar) actionBar.classList.remove('visible');
    simulatedHighlight.style.display = 'none';

    // Hide drawing components if active
    

    // Show pre-render controls
    const preRenderControls = document.getElementById('pre-render-controls');
    if (preRenderControls) preRenderControls.style.display = 'flex';

    generateBtn.disabled = false;
    generateBtn.innerHTML = `<i data-lucide="sparkles" style="width:16px;height:16px"></i> Generate AI Render`;

    document.getElementById('post-render-actions').style.display = 'none';

    // Reset selected stone display and selection state
    selectedStone = null;
    document.querySelectorAll('.stone-item').forEach(i => i.classList.remove('selected'));
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
      
      clearPointsBtn.style.display = 'none';
      drawingTip.textContent = 'Click on photo to trace countertop';

      // Hide tools and canvas
      if (actionBar) actionBar.classList.remove('visible');
      drawingToolbar.style.display = 'none';
      

      // Hide highlights
      simulatedHighlight.style.display = 'none';

      // Reset selected stone
      selectedStone = null;
      document.querySelectorAll('.stone-item').forEach(i => i.classList.remove('selected'));
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
    if (!previewImage.src) {
      showToast('Generate a render first before sharing.', 'error');
      return;
    }
    // Upload image if not already done
    if (!window._shareImageUrl) {
      showToast('Preparing your design for sharing...', 'info');
      try {
        const renderCanvas = document.getElementById('render-canvas');
        const srcCanvas = (renderCanvas && renderCanvas.style.display !== 'none') ? renderCanvas : null;
        if (srcCanvas) {
          const shareBlob = await new Promise(res => srcCanvas.toBlob(res, 'image/jpeg', 0.92));
          if (shareBlob) {
            const sharePath = `shares/${currentUser.id}/${Date.now()}.jpg`;
            const shareUpload = await uploadFileToStorage('ratedworktops', sharePath, shareBlob);
            window._shareImageUrl = shareUpload.ok ? shareUpload.url : '';
            window._shareImageBlob = shareBlob;
          }
        }
      } catch (e) {
        console.warn('Share prep failed:', e);
      }
    }

    const stoneName = selectedStone ? `${selectedStone.brandName} ${selectedStone.name}` : 'a stunning';
    const shareText = `Check out this beautiful ${stoneName} kitchen design I created on RatedWorktops!`;
    const shareUrl = window._shareImageUrl || window.location.href;

    // --- Native Share Interception ---
    if (window.Capacitor && window.Capacitor.isNative) {
      try {
        const { Share } = capacitorExports;
        await Share.share({
          title: 'My Kitchen Design - RatedWorktops',
          text: shareText,
          url: shareUrl,
          dialogTitle: 'Share your design',
        });
        trackShare(); // Track share event on success
      } catch (err) {
        console.warn('Native share failed or cancelled:', err);
      }
      return; // Skip web modal entirely
    }
    // --- End Native Share ---

    // Set href on anchor tags — guaranteed to work, never blocked
    document.getElementById('share-whatsapp').href =
      `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`;
    document.getElementById('share-facebook').href =
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    document.getElementById('share-x').href =
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    document.getElementById('share-email').href =
      `mailto:?subject=${encodeURIComponent('My Kitchen Design - RatedWorktops')}&body=${encodeURIComponent('Hi!\n\n' + shareText + '\n\nView my design: ' + shareUrl + '\n\nCreated with RatedWorktops')}`;

    // Show preview image in modal
    const previewImg = document.getElementById('share-preview-img');
    const previewText = document.getElementById('share-preview-text');
    if (previewImg && window._shareImageUrl) {
      previewImg.src = window._shareImageUrl;
      previewImg.style.display = 'block';
      if (previewText) previewText.style.display = 'none';
    }

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

  // Share anchor clicks — just track the share, href already set by share-btn handler
  ['share-whatsapp', 'share-facebook', 'share-x'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      trackShare();
      document.getElementById('share-modal').classList.remove('open');
    });
  });

  document.getElementById('share-email').addEventListener('click', () => {
    trackShare();
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('share-copy-link').addEventListener('click', () => {
    trackShare();
    const shareLink = window._shareImageUrl || window.location.href;
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

      if (!window._isAIRendered) {
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

          drawWatermarkAndTriggerDownload();
        };
        stoneImg.src = getStoneImage(selectedStone.sku);
      } else {
        ctx.drawImage(img, 0, 0);
        drawWatermarkAndTriggerDownload();
      }

      function drawWatermarkAndTriggerDownload() {
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
      }
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

      if (!window._isAIRendered) {
        const stoneImg = new Image();
        stoneImg.crossOrigin = "Anonymous";
        stoneImg.onload = () => {
          // Draw base kitchen image
          ctx.drawImage(img, 0, 0);

          // 1. Create a clipped mask path for the countertop area
          ctx.save();
          ctx.beginPath();
          if (points.length >= 3) {
            ctx.moveTo((points[0].x / 100) * img.width, (points[0].y / 100) * img.height);
            for (let i = 1; i < points.length; i++) {
              ctx.lineTo((points[i].x / 100) * img.width, (points[i].y / 100) * img.height);
            }
          } else {
            // Preset Countertop
            ctx.moveTo(img.width * 0.1, img.height * 0.6);
            ctx.lineTo(img.width * 0.9, img.height * 0.6);
            ctx.lineTo(img.width * 0.95, img.height * 0.75);
            ctx.lineTo(img.width * 0.05, img.height * 0.75);
          }
          ctx.closePath();
          ctx.clip();

          // 2. Render the stone pattern inside the countertop mask
          const pattern = ctx.createPattern(stoneImg, 'repeat');
          ctx.fillStyle = pattern;
          ctx.fill();

          // 3. Extract and apply shadows (Grayscale Multiply blend at low opacity)
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = 0.25;
          ctx.filter = 'grayscale(100%) contrast(120%)';
          ctx.drawImage(img, 0, 0);
          ctx.restore();

          // 4. Extract and apply highlights (Grayscale Screen blend at moderate opacity)
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.3;
          ctx.filter = 'grayscale(100%)';
          ctx.drawImage(img, 0, 0);
          ctx.restore();

          ctx.restore();

          // 5. Draw Splashback (Wall stone) - Always rendered
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(img.width * 0.605, img.height * 0.15);
          ctx.lineTo(img.width * 0.865, img.height * 0.15);
          ctx.lineTo(img.width * 0.865, img.height * 0.56);
          ctx.lineTo(img.width * 0.605, img.height * 0.56);
          ctx.closePath();
          ctx.clip();

          // Render stone texture
          ctx.fillStyle = pattern;
          ctx.fill();

          // Extract shadows (Grayscale Multiply)
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = 0.25;
          ctx.filter = 'grayscale(100%) contrast(120%)';
          ctx.drawImage(img, 0, 0);
          ctx.restore();

          // Extract highlights (Grayscale Screen)
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.3;
          ctx.filter = 'grayscale(100%)';
          ctx.drawImage(img, 0, 0);
          ctx.restore();

          ctx.restore();

          drawWatermarkAndResolve();
        };
        stoneImg.onerror = () => resolve(null);
        stoneImg.src = getStoneImage(selectedStone.sku);
      } else {
        ctx.drawImage(img, 0, 0);
        drawWatermarkAndResolve();
      }

      function drawWatermarkAndResolve() {
        // Draw Premium Branding & Watermark Logo Card
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        const margin = Math.max(16, Math.floor(img.width * 0.02));
        const logoHeight = Math.max(44, Math.floor(img.height * 0.065));
        const logoWidth = logoHeight * 3.8;
        const logoX = img.width - logoWidth - margin;
        const logoY = img.height - logoHeight - margin;

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
      }
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
  const tabWorkspace = document.getElementById('nav-tab-workspace');
  const tabControls = document.getElementById('nav-tab-controls');

  const visSidebar = document.getElementById('vis-sidebar');
  const visMain = document.getElementById('vis-main');
  const visControlPanel = document.getElementById('vis-control-panel');

  if (!tabCatalog || !tabWorkspace || !tabControls) return;

  function switchTab(activeTabBtn, activePanel) {
    // Remove active class from all tabs
    tabCatalog.classList.remove('active');
    tabWorkspace.classList.remove('active');
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
      
    }, 50);
  }

  tabCatalog.addEventListener('click', () => switchTab(tabCatalog, visSidebar));
  tabWorkspace.addEventListener('click', () => switchTab(tabWorkspace, visMain));
  tabControls.addEventListener('click', () => switchTab(tabControls, visControlPanel));

  // Tablet Drawer Logic
  const tabletCatalogBtn = document.getElementById('tablet-catalog-btn');
  const tabletControlsBtn = document.getElementById('tablet-controls-btn');
  const drawerOverlay = document.getElementById('drawer-overlay');

  if (tabletCatalogBtn && drawerOverlay) {
    tabletCatalogBtn.addEventListener('click', () => {
      visSidebar.classList.add('drawer-open');
      drawerOverlay.classList.add('active');
    });
  }

  if (tabletControlsBtn && drawerOverlay) {
    tabletControlsBtn.addEventListener('click', () => {
      visControlPanel.classList.add('drawer-open');
      drawerOverlay.classList.add('active');
    });
  }

  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', () => {
      visSidebar.classList.remove('drawer-open');
      visControlPanel.classList.remove('drawer-open');
      drawerOverlay.classList.remove('active');
    });
  }
}


function updateRenderInstantly() {
  if (!selectedStone) return;
  const imgUrl = getStoneImage(selectedStone.sku);
  let polygonPoints = "10,60 90,60 95,75 5,75";
  if (points.length >= 3) {
    polygonPoints = points.map(p => `${p.x},${p.y}`).join(" ");
  }

  const splashbackPoints = "60.5,15 86.5,15 86.5,56 60.5,56";
  const patternId = 'stone-pattern-' + selectedStone.sku + '-' + Date.now();

  const clipIdCountertop = 'clip-countertop-' + Date.now();
  const clipIdSplashback = 'clip-splashback-' + Date.now();

  simulatedHighlight.innerHTML = `
    <defs>
      <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="120" height="120">
        <image href="${imgUrl}" x="0" y="0" width="120" height="120" />
      </pattern>
      
      <clipPath id="${clipIdCountertop}">
        <polygon points="${polygonPoints}" />
      </clipPath>
      
      <clipPath id="${clipIdSplashback}">
        <polygon points="${splashbackPoints}" />
      </clipPath>
    </defs>
    
    <!-- === COUNTERTOP (SLAB) === -->
    <!-- 1. The Marble Stone Texture (clipped, fully opaque to replace original stone) -->
    <polygon points="${polygonPoints}" fill="url(#${patternId})" opacity="1.0" />
    <!-- 2. The Original lighting shadows (grayscale, clipped, multiply blend at low opacity) -->
    <image href="${previewImage.src}" x="0" y="0" width="100%" height="100%" clip-path="url(#${clipIdCountertop})" style="mix-blend-mode: multiply; opacity: 0.25; filter: grayscale(1) contrast(1.2); pointer-events: none;" />
    <!-- 3. The Original lighting highlights (grayscale, clipped, screen blend) -->
    <image href="${previewImage.src}" x="0" y="0" width="100%" height="100%" clip-path="url(#${clipIdCountertop})" style="mix-blend-mode: screen; opacity: 0.3; filter: grayscale(1); pointer-events: none;" />
    <!-- 4. Subtle front border shadow/reflection overlay for 3D look -->
    <polygon points="${polygonPoints}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2.5" style="pointer-events: none;" />

    <!-- === SPLASHBACK (WALL STONE) === -->
    <!-- 1. The Marble Stone Texture (clipped, fully opaque to replace original stone) -->
    <polygon points="${splashbackPoints}" fill="url(#${patternId})" opacity="1.0" />
    <!-- 2. The Original lighting shadows (grayscale, clipped, multiply blend at low opacity) -->
    <image href="${previewImage.src}" x="0" y="0" width="100%" height="100%" clip-path="url(#${clipIdSplashback})" style="mix-blend-mode: multiply; opacity: 0.25; filter: grayscale(1) contrast(1.2); pointer-events: none;" />
    <!-- 3. The Original lighting highlights (grayscale, clipped, screen blend) -->
    <image href="${previewImage.src}" x="0" y="0" width="100%" height="100%" clip-path="url(#${clipIdSplashback})" style="mix-blend-mode: screen; opacity: 0.3; filter: grayscale(1); pointer-events: none;" />
    <!-- 4. Border Outline -->
    <polygon points="${splashbackPoints}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" style="pointer-events: none;" />
  `;

  
  simulatedHighlight.style.display = 'block';
}
