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
let manualPoints = [];
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
  { pct: 15, title: 'Preparing your photo...', detail: 'Encoding image and mask' },
  { pct: 40, title: 'Sending to AI...', detail: 'Uploading to OpenAI' },
  { pct: 85, title: 'Rendering stone surface...', detail: 'AI is painting your worktop' },
  { pct: 100, title: 'Saving your design...', detail: 'Almost there!' }
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
  // Slowly creep the bar during the AI wait to show it's alive
  if (_progressTicker) clearInterval(_progressTicker);
  let current = 40;
  _progressTicker = setInterval(() => {
    if (current >= 97) { clearInterval(_progressTicker); return; }
    const increment = current < 70 ? 0.6 : current < 85 ? 0.3 : 0.08;
    current += increment;
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = current + '%';
  }, 300);
}

function stopProgressTicker() {
  if (_progressTicker) { clearInterval(_progressTicker); _progressTicker = null; }
}
// ──────────────────────────────────────────────────────────────

function getStoneVisualDescription(stone) {
  if (!stone) return 'polished natural stone';
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

  const texture = (stone.texture || '').toLowerCase();
  const name = (stone.name || '').toLowerCase();
  const finish = (stone.finish || 'Polished').toLowerCase();

  // Specific Stone Pattern Matching
  if (name.includes('rosso viola') || name.includes('breccia') || name.includes('8263') || (name.includes('viola') && !name.includes('calacatta'))) {
    return `${finish} breccia stone featuring large white and cream angular rock fragments set in a warm reddish-brown matrix with fine veining`;
  } else if (name.includes('rosso levanto') || name.includes('trs-106') || (name.includes('rosso') && !name.includes('viola'))) {
    return `${finish} deep reddish-burgundy marble with natural white, grey, and rose veining`;
  } else if (name.includes('nero picasso') || name.includes('cosmin') || (name.includes('picasso') || (name.includes('black') && (name.includes('gold') || name.includes('amber'))))) {
    return `${finish} deep black marble with dramatic flowing gold, amber, and cream veining`;
  } else if (name.includes('blue roma') || name.includes('roma') || sku.includes('GRA-BLG')) {
    return `${finish} light blue-grey quartzite with dramatic flowing copper, bronze, and brown veins`;
  } else if (name.includes('volga blue') || (name.includes('volga') && name.includes('blue'))) {
    return `${finish} deep black granite with iridescent blue labradorite crystalline flecks and mineral shimmer`;
  } else if (name.includes('patagonia')) {
    return `${finish} translucent cream-white quartzite with dramatic dark mineral patches and golden accents`;
  } else if (name.includes('amazonia')) {
    return `${finish} deep teal-green quartzite with intricate webbed golden-beige veining`;
  } else if (texture === 'black' || name.includes('black') || name.includes('noir') || name.includes('nero') || name.includes('charcoal')) {
    return `${finish} deep black stone with fine veining and mineral accents`;
  } else if (name.includes('blue') || name.includes('azul') || name.includes('sodalite') || name.includes('sapphire')) {
    return `${finish} deep blue stone with natural crystalline patterns and mineral flecks`;
  } else if (name.includes('green') || name.includes('verde') || name.includes('emerald') || name.includes('forest') || name.includes('jade')) {
    return `${finish} rich green stone with natural veining and mineral patterns`;
  } else if (name.includes('brown') || name.includes('tan') || name.includes('coffee') || name.includes('mocha') || name.includes('bronze') || name.includes('autumn') || name.includes('caramel')) {
    return `${finish} warm brown stone with natural earthy tones and veining`;
  } else if (name.includes('beige') || name.includes('cream') || name.includes('ivory') || name.includes('sand') || name.includes('vanilla') || name.includes('latte')) {
    return `${finish} warm beige cream stone with subtle natural patterns`;
  } else if (name.includes('gold') || name.includes('amber') || name.includes('honey')) {
    return `${finish} warm golden stone with rich amber tones and natural veining`;
  } else if (name.includes('pink') || name.includes('rose') || name.includes('blush') || name.includes('onyx')) {
    return `${finish} soft pink rose-toned stone with delicate natural patterns`;
  } else if (name.includes('purple') || name.includes('violet') || name.includes('amethyst') || name.includes('viola')) {
    return `${finish} rich purple stone with dramatic veining and deep violet tones`;
  } else if (texture === 'granite' || name.includes('granite')) {
    return `${finish} natural granite with rich mineral speckles, crystalline depth and fine flecks`;
  } else if (texture === 'slate' || name.includes('concrete') || name.includes('kreta') || name.includes('slate')) {
    return `${finish} textured slate and concrete-look architectural stone`;
  } else if (texture === 'quartz' || name.includes('quartz') || name.includes('white') || name.includes('miami')) {
    return `${finish} pure engineered quartz with subtle crystal shimmer`;
  } else if (texture === 'marble' || name.includes('marble') || name.includes('calacatta') || name.includes('carrara') || name.includes('statuario') || name.includes('vagli')) {
    return `${finish} premium luxury marble with flowing elegant veining`;
  } else {
    return `${finish} ${stone.name || 'custom stone'} with authentic stone texture and natural veining`;
  }
}

// Helper: Determine exact base color and prompt prefix for the selected stone
function getStoneColorDetails(stone) {
  if (!stone) return { baseColor: 'white', hex: '#FAFAFA', promptPrefix: 'PURE BRIGHT WHITE COLOR SURFACES: Solid polished bright white background color with delicate marble veining' };

  const sku = stone.sku ? stone.sku.toUpperCase() : '';
  const name = stone.name ? stone.name.toLowerCase() : '';
  const texture = stone.texture ? stone.texture.toLowerCase() : '';

  // 1. Specific Unique Pattern Checks
  if (name.includes('rosso viola') || name.includes('breccia') || name.includes('8263') || (name.includes('viola') && !name.includes('calacatta'))) {
    return {
      baseColor: 'rosso viola breccia',
      hex: '#C8A29A',
      promptPrefix: `DISTINCTIVE ROSSO VIOLA BRECCIA SURFACES: Must feature large white and cream angular rock fragments, broken stone clasts, and a rich reddish-brown matrix with fine veining. Preserve the large fragment breccia pattern.`
    };
  }

  if (name.includes('nero picasso') || name.includes('cosmin') || (name.includes('picasso') || (name.includes('black') && (name.includes('gold') || name.includes('amber'))))) {
    return {
      baseColor: 'black and gold marble',
      hex: '#1C1D21',
      promptPrefix: `LUXURY POLISHED BLACK AND GOLD VEINED SURFACES: Solid deep black background with dramatic flowing gold, amber, and cream veins.`
    };
  }

  if (name.includes('blue roma') || name.includes('roma') || sku.includes('GRA-BLG')) {
    return {
      baseColor: 'blue roma quartzite',
      hex: '#B8C4CC',
      promptPrefix: `BLUE ROMA QUARTZITE SURFACES: Light blue-grey quartzite background with dramatic flowing copper, bronze, and brown veining.`
    };
  }

  if (name.includes('volga blue') || (name.includes('volga') && name.includes('blue'))) {
    return {
      baseColor: 'volga blue granite',
      hex: '#161922',
      promptPrefix: `VOLGA BLUE GRANITE SURFACES: Solid deep black-charcoal granite background with iridescent shimmering blue labradorite crystalline flecks.`
    };
  }

  if (name.includes('patagonia')) {
    return {
      baseColor: 'patagonia quartzite',
      hex: '#DDD6C8',
      promptPrefix: `PATAGONIA GOLD QUARTZITE SURFACES: Translucent cream and white quartzite with bold dark mineral patches and golden accents.`
    };
  }

  if (name.includes('amazonia')) {
    return {
      baseColor: 'amazonia green quartzite',
      hex: '#2F483E',
      promptPrefix: `AMAZONIA GREEN QUARTZITE SURFACES: Deep teal and emerald green background with intricate golden-beige webbed veins.`
    };
  }

  if (name.includes('rosso levanto') || sku === 'TSC-RL' || sku === 'TRS-106' || (name.includes('rosso') && !name.includes('viola'))) {
    return {
      baseColor: 'rosso levanto red',
      hex: '#6B1D2F',
      promptPrefix: `RICH DEEP ROSSO LEVANTO RED MARBLE SURFACES: Must be deep reddish-burgundy background color with white and grey veins matching the reference stone.`
    };
  }

  const isBlack = (
    sku === 'SIL-IB' || sku === 'DEK-LR' || sku === 'DEK-CG' || sku === 'CAE-VN' || sku === 'CAL-NM' || sku === 'TSC-NP' ||
    texture === 'black' || name.includes('black') || name.includes('laurent') || name.includes('noir') || name.includes('nero') || name.includes('charcoal')
  );

  const isGrey = (
    sku === 'DEK-KR' || sku === 'DEK-VR' || sku === 'CAE-CC' || sku === 'SIL-LS' || sku === 'POR-BC' ||
    texture === 'slate' || name.includes('kreta') || name.includes('concrete') || name.includes('slate') || name.includes('grey') || name.includes('bottega')
  );

  const isBlue = (
    name.includes('blue') || name.includes('azul') || name.includes('sodalite') || name.includes('sapphire') || name.includes('ocean')
  );

  const isGreen = (
    sku === 'POR-CG' || name.includes('green') || name.includes('verde') || name.includes('emerald') || name.includes('forest') || name.includes('jade')
  );

  const isBrown = (
    name.includes('brown') || name.includes('tan') || name.includes('coffee') || name.includes('mocha') || name.includes('bronze') ||
    name.includes('autumn') || name.includes('caramel') || name.includes('walnut') || name.includes('chocolate')
  );

  const isBeige = (
    sku === 'TSC-SA' || sku === 'TSC-ML' || name.includes('armani') || name.includes('monet') || name.includes('beige') || name.includes('cream') || name.includes('ivory') || name.includes('sand') || name.includes('vanilla') || name.includes('latte')
  );

  const isPurple = (
    sku === 'TSC-V3' || name.includes('purple') || name.includes('violet') || name.includes('amethyst')
  );

  const isGold = (
    name.includes('gold') || name.includes('amber') || name.includes('honey')
  );

  const isPink = (
    sku === 'TSC-PO' || name.includes('pink') || name.includes('rose') || name.includes('onyx') || name.includes('blush')
  );

  if (isBlack) {
    return {
      baseColor: 'black',
      hex: '#1C1D21',
      promptPrefix: `DEEP POLISHED BLACK COLOR WORKTOP AND SPLASHBACK SURFACES: Must be solid deep black background color with dramatic gold and white veining. Absolutely NO white or light background.`
    };
  } else if (isBlue) {
    return {
      baseColor: 'deep blue',
      hex: '#1E3A52',
      promptPrefix: `DEEP BLUE COLOR WORKTOP SURFACES: Must be rich deep blue/navy background color with crystalline patterns and mineral accents.`
    };
  } else if (isGreen) {
    return {
      baseColor: 'green',
      hex: '#2A4D38',
      promptPrefix: `RICH GREEN MARBLE / PORCELAIN SURFACES: Must be deep emerald green background color matching the reference stone image exactly. Absolutely NO white background.`
    };
  } else if (isBrown) {
    return {
      baseColor: 'brown',
      hex: '#5C3A1A',
      promptPrefix: `WARM BROWN COLOR WORKTOP AND SPLASHBACK SURFACES: Must be warm brown/earthy background color matching the reference stone image exactly.`
    };
  } else if (isPurple) {
    return {
      baseColor: 'purple viola',
      hex: '#4A2545',
      promptPrefix: `RICH CALACATTA VIOLA PURPLE MARBLE SURFACES: Must have deep cabernet purple and violet veining on a light background matching Calacatta Viola.`
    };
  } else if (isPink) {
    return {
      baseColor: 'pink onyx',
      hex: '#D89A9E',
      promptPrefix: `TRANSLUCENT PINK ONYX MARBLE SURFACES: Soft translucent pink and rose onyx background with creamy white swirls.`
    };
  } else if (isGold) {
    return {
      baseColor: 'gold',
      hex: '#C49A45',
      promptPrefix: `WARM GOLDEN COLOR WORKTOP AND SPLASHBACK SURFACES: Must be warm golden/amber background color matching the reference stone image.`
    };
  } else if (isBeige) {
    return {
      baseColor: 'beige marble',
      hex: '#C5BBAA',
      promptPrefix: `WARM BEIGE MARBLE SURFACES: Elegant warm grey-beige marble background with subtle soft veining.`
    };
  } else if (isGrey || texture === 'granite' || texture === 'slate') {
    return {
      baseColor: texture === 'granite' ? 'dark granite grey' : 'grey',
      hex: texture === 'granite' ? '#2E3033' : '#6B7280',
      promptPrefix: texture === 'granite'
        ? `POLISHED DARK GRANITE STONE WORKTOP AND SPLASHBACK SURFACES: Solid dark charcoal granite texture with natural mineral crystalline depth and flecks.`
        : `MATTE GREY CONCRETE / SLATE COLOR WORKTOP SURFACES: Solid mid-grey texture background color matching the reference stone.`
    };
  } else if (texture === 'quartz') {
    return {
      baseColor: 'engineered quartz',
      hex: '#F0E8D8',
      promptPrefix: `POLISHED ENGINEERED QUARTZ WORKTOP AND SPLASHBACK SURFACES: Pure elegant quartz with fine crystalline depth and shimmer.`
    };
  } else {
    return {
      baseColor: stone.name || 'custom stone',
      hex: '#F5F5F5',
      promptPrefix: `POLISHED ${((stone.name || 'NATURAL STONE')).toUpperCase()} WORKTOP AND SPLASHBACK SURFACES: Authentic ${(stone.texture || 'marble')} stone surface with natural veining and polished finish matching the reference.`
    };
  }
}

// Direct Fal.ai Gemini 2.5 Flash Image Edit & Inpainting Engine
const DEFAULT_FAL_KEY = '815924c7-606f-49a0-a1aa-b4d823819435:ad52dd06b6273e1f1d2431807e603d15';

// Wrapper: fetch with a timeout so AI calls never hang indefinitely
async function fetchWithTimeout(url, options, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callFalAiInpaint(imageUri, maskUri, promptText, stoneImageUrl) {
  let falKey = localStorage.getItem('rw_fal_key') || localStorage.getItem('FAL_KEY') || DEFAULT_FAL_KEY;
  if (!falKey && typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data: settings } = await supabaseClient.from('settings').select('*').eq('id', 1).maybeSingle();
      if (settings && (settings.fal_key || settings.data?.fal_key || settings.data?.falKey)) {
        falKey = settings.fal_key || settings.data?.fal_key || settings.data?.falKey;
      }
    } catch (e) {}
  }

  falKey = falKey || DEFAULT_FAL_KEY;

  // 1. Primary: fal-ai/gemini-25-flash-image/edit (Multi-Image Reference Engine)
  console.log('[Fal.ai] Calling Gemini 2.5 Flash Image Edit (multi-image reference)...');
  try {
    const imageUrls = [imageUri];
    if (stoneImageUrl && !stoneImageUrl.startsWith('linear-gradient')) {
      imageUrls.push(stoneImageUrl);
    }

    const editPrompt = promptText;

    const res = await fetchWithTimeout('https://fal.run/fal-ai/gemini-25-flash-image/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: editPrompt,
        image_urls: imageUrls
      })
    }, 90000);

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const url = data.images?.[0]?.url || data.image?.url;
      if (url) {
        console.log('[Fal.ai] ✅ Gemini 2.5 Flash Image Edit succeeded!');
        return url;
      }
    }
    console.warn('[Fal.ai] Gemini 2.5 Flash response notice:', data);
  } catch (e) {
    console.warn('[Fal.ai] Gemini 2.5 Flash exception:', e);
  }

  // 2. Secondary: fal-ai/flux-general/in-painting
  console.log('[Fal.ai] Calling Flux General inpainting...');
  try {
    const res = await fetchWithTimeout('https://fal.run/fal-ai/flux-general/in-painting', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_url: imageUri,
        mask_url: maskUri,
        prompt: promptText,
        strength: 0.95,
        num_inference_steps: 28,
        guidance_scale: 7.5,
        enable_safety_checker: false
      })
    }, 90000);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const url = data.images?.[0]?.url || data.image?.url;
      if (url) return url;
    }
  } catch (e) {}

  // 3. Fallback to fast-sdxl inpainting
  console.log('[Fal.ai] Fallback calling Fast SDXL inpainting...');
  const sdxlRes = await fetchWithTimeout('https://fal.run/fal-ai/fast-sdxl/inpaint', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_url: imageUri,
      mask_url: maskUri,
      prompt: promptText,
      strength: 0.92,
      num_inference_steps: 30
    })
  }, 90000);
  const sdxlData = await sdxlRes.json().catch(() => ({}));
  if (sdxlRes.ok) {
    const url = sdxlData.images?.[0]?.url || sdxlData.image?.url;
    if (url) return url;
  }

  throw new Error(sdxlData?.detail || sdxlData?.message || 'Fal.ai generation failed. Please verify your Fal.ai API key.');
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
  if (simulatedHighlight) simulatedHighlight.style.display = 'none';
  processingOverlay.style.display = 'flex';
  setProgress(1); // Stage 1: Preparing

  // Safety net: if overlay is still visible after 60s, force close it and show error
  const _renderSafetyTimer = setTimeout(() => {
    if (processingOverlay && processingOverlay.style.display !== 'none') {
      stopProgressTicker();
      processingOverlay.style.display = 'none';
      isRendering = false;
      showToast('Render timed out. Please try again or check your connection.', 'error');
    }
  }, 60000);

  console.log('[Render] Starting image-to-image generateRender in visualiser.js...');
  console.log('[Render] Selected stone:', selectedStone?.name, selectedStone?.sku);

  try {
    // ── 1. Create Inpainting Mask and pre-tinted image data URIs ───────────────────────
    processingText.textContent = 'Preparing stone color and inpainting mask...';

    const isAutoMode = document.getElementById('mode-auto-btn')?.classList.contains('active');
    const colorDetails = getStoneColorDetails(selectedStone);
    const { imageCanvas, maskCanvas } = createInpaintingMask(previewImage, isAutoMode, points, selectedStone);

    const imageUri = imageCanvas.toDataURL('image/png');
    const maskUri = maskCanvas.toDataURL('image/png');

    // ── 1b. Resolve the stone texture image URL to send as reference ─────────
    let stoneImageUrl = getStoneImage(selectedStone.sku, selectedStone);
    // Convert relative paths to absolute URLs so Fal.ai can fetch them
    // Skip conversion for CSS gradients (which aren't real image URLs)
    const isGradientRef = stoneImageUrl && (stoneImageUrl.startsWith('linear-gradient') || stoneImageUrl.startsWith('radial-gradient'));
    if (stoneImageUrl && !isGradientRef && !stoneImageUrl.startsWith('http') && !stoneImageUrl.startsWith('data:')) {
      stoneImageUrl = new URL(stoneImageUrl, window.location.href).href;
    }
    console.log('[Render] Stone texture reference URL:', stoneImageUrl);

    // ── 2. Build the AI prompt adhering to all core visualizer rules ───────────
    const stoneDesc = getStoneVisualDescription(selectedStone);
    const stoneBrand = selectedStone.brandName || selectedStone.brand_name || selectedStone.brand || '';
    const stoneName = selectedStone.name || 'natural stone';
    const refinementText = document.getElementById('refinement-instructions')?.value?.trim() || '';
    const refinementExtra = refinementText ? ` ${refinementText}.` : '';
    const hasRealImage = stoneImageUrl && !stoneImageUrl.startsWith('linear-gradient') && !stoneImageUrl.startsWith('radial-gradient');
    const promptPrefix = colorDetails?.promptPrefix ? `${colorDetails.promptPrefix} ` : '';

    let prompt;
    if (hasRealImage) {
      prompt = `Change ONLY the stone surfaces to match EXACTLY the attached reference stone image (${stoneBrand} ${stoneName}). ${promptPrefix}Copy its pattern faithfully — do not invent, simplify, or change it.
MANDATORY REQUIREMENTS:
1. FULL COVERAGE: Repaint EVERY stone surface in the kitchen edge-to-edge — including the full vertical backsplash wall panel AND every horizontal countertop slab, worktop, and kitchen island surface. Zero patches of the old stone must remain.
2. EXACT STONE PATTERN: Faithfully reproduce the exact color, fragments, veining, and texture of the reference stone image with realistic polished reflections.
3. KITCHEN UNTOUCHED: Keep everything else in the photo unchanged: all cabinets, handles, appliances, oven, gas hob, sink, kettle, toaster, floor, walls, lighting, and objects must stay in their exact original positions.${refinementExtra}`;
    } else {
      prompt = `Change ONLY the stone surfaces to match ${stoneBrand} ${stoneName} stone (${stoneDesc}). ${promptPrefix}
MANDATORY REQUIREMENTS:
1. FULL COVERAGE: Repaint EVERY stone surface in the kitchen edge-to-edge — including the full vertical backsplash wall AND every horizontal countertop slab, worktop, and island.
2. KITCHEN UNTOUCHED: Keep all cabinets, handles, appliances, oven, stove, floor, walls, and lighting exactly as they are in the original photo.${refinementExtra}`;
    }

    console.log('[Render] Inpainting Prompt:', prompt);
    setProgress(2); // Stage 2: Sending to AI

    // ── 3. Call Fal.ai Gemini 2.5 Flash with Self-Check and Auto-Retry (up to 3 attempts)
    processingText.textContent = 'Inpainting selected stone onto all surfaces...';

    let aiImageUrl = null;
    let attempts = 0;
    const maxAttempts = 3;

    if (supabaseClient && useRealSupabase) {
      startProgressTicker();
      try {
        while (attempts < maxAttempts && !aiImageUrl) {
          attempts++;
          if (attempts > 1) {
            processingText.textContent = `Optimizing render quality (attempt ${attempts}/${maxAttempts})...`;
            console.log(`[Render] Auto-retry attempt ${attempts}/${maxAttempts}...`);
          }
          console.log(`[Render] Generating render with Fal.ai Gemini 2.5 Flash (attempt ${attempts})...`);
          const candidateUrl = await callFalAiInpaint(imageUri, maskUri, prompt, stoneImageUrl);
          if (candidateUrl) {
            const isValid = await verifyImageLoadable(candidateUrl);
            if (isValid) {
              aiImageUrl = candidateUrl;
              console.log('[Render] ✅ Self-check passed on attempt', attempts);
            } else {
              console.warn('[Render] Self-check failed for candidate image. Retrying...');
            }
          }
        }
      } finally {
        stopProgressTicker();
      }
    } else {
      throw new Error('Not connected to the server. Please check your connection.');
    }

    if (!aiImageUrl) {
      throw new Error('AI was unable to generate a valid render after 3 attempts. Please try again or upload another photo.');
    }

    setProgress(3); // Stage 3: Rendering

    // ── 4. Display the clean, seamless AI-generated render ──────────────────────────
    processingText.textContent = 'Applying your new render...';
    console.log('[Render] Compositing AI render with original photo for 100% fidelity...');

    const activeManualPoints = (typeof points !== 'undefined' && Array.isArray(points) && points.length >= 3)
      ? points
      : (typeof manualPoints !== 'undefined' && Array.isArray(manualPoints) && manualPoints.length >= 3 ? manualPoints : []);

    const finalDisplayUrl = (!isAutoMode && activeManualPoints.length >= 3)
      ? await applyMaskedComposite(previewImage, aiImageUrl, maskCanvas)
      : aiImageUrl;

    previewImage.src = finalDisplayUrl;
    previewImage.style.display = 'block';
    window._isAIRendered = true;

    // Keep renderCanvas updated for download
    const renderCanvas = document.getElementById('render-canvas');
    if (renderCanvas) {
      renderCanvas.style.display = 'none';
      const tempImg = new Image();
      tempImg.crossOrigin = 'anonymous';
      tempImg.onload = () => {
        renderCanvas.width = tempImg.naturalWidth;
        renderCanvas.height = tempImg.naturalHeight;
        renderCanvas.getContext('2d').drawImage(tempImg, 0, 0);
      };
      tempImg.src = finalDisplayUrl;
    }

    console.log('[Render] ✅ Seamless AI render displayed successfully!');

    setProgress(4); // Stage 4: Saving

    // ── 5. Deduct credits & update UI ────────────────────────────────────────
    const currentCreds = currentProfile?.credits ?? 999;
    const currentVis = currentProfile?.visualisations ?? 0;
    const newCredits = isFreeMode ? currentCreds : Math.max(0, currentCreds - 1);
    const newVisualisations = currentVis + 1;
    if (supabaseClient && currentUser) {
      await supabaseClient
        .from('profiles')
        .update({ credits: newCredits, visualisations: newVisualisations })
        .eq('id', currentUser.id);
    }
    if (currentProfile) {
      currentProfile.credits = newCredits;
      currentProfile.visualisations = newVisualisations;
    }

    const navCredits = document.getElementById('credits-count');
    if (navCredits) navCredits.textContent = newCredits;
    const sidebarCredits = document.getElementById('credits-count-sidebar');
    if (sidebarCredits) sidebarCredits.textContent = newCredits;
    const headerCredits = document.getElementById('credits-count-header');
    if (headerCredits) headerCredits.textContent = newCredits;

    // ── 6. Automatically Save to Storage & Generate Public Share URL ─────────
    processingText.textContent = 'Saving project & generating public share link...';
    try {
      const renderCanvas = document.getElementById('render-canvas');
      const srcCanvas = (renderCanvas && renderCanvas.style.display !== 'none') ? renderCanvas : null;
      let blob = null;
      if (srcCanvas) {
        blob = await new Promise(res => srcCanvas.toBlob(res, 'image/jpeg', 0.90));
      }
      if (blob) {
        const uuid = Math.random().toString(36).substring(2, 15);
        const userId = currentUser?.id || 'public';
        const storagePath = `outputs/${userId}/${uuid}.jpg`;
        const uploadRes = await uploadFileToStorage('ratedworktops', storagePath, blob);

        if (uploadRes.ok && uploadRes.url) {
          window._currentRenderPublicUrl = uploadRes.url;
          window._shareImageUrl = uploadRes.url;
          console.log('[Render] Public share URL generated:', uploadRes.url);

          if (supabaseClient && currentUser && selectedStone) {
            await supabaseClient
              .from('projects')
              .insert([{
                user_id: currentUser.id,
                stone_name: selectedStone.name,
                brand_name: selectedStone.brandName,
                image_url: uploadRes.url
              }]).catch(e => console.warn('Auto project DB save notice:', e));
          }

          const shareUrlInput = document.getElementById('share-public-url-input');
          if (shareUrlInput) shareUrlInput.value = uploadRes.url;
        }
      }
    } catch (saveErr) {
      console.warn('[Render] Auto cloud save notice:', saveErr);
    }

    showToast('AI render complete! Saved & public link created.', 'success');

    const preRenderControls = document.getElementById('pre-render-controls');
    if (preRenderControls) preRenderControls.style.display = 'none';
    const postRenderActions = document.getElementById('post-render-actions');
    if (postRenderActions) postRenderActions.style.display = 'flex';

    setTimeout(() => {
      openShareModalWithPublicUrl();
    }, 600);

  } catch (error) {
    stopProgressTicker();
    console.error('AI Render failed:', error);
    showToast('AI Render failed: ' + (error.message || 'Unknown error'), 'error');
  } finally {
    clearTimeout(_renderSafetyTimer);
    processingOverlay.style.display = 'none';
    isRendering = false;
    stopProgressTicker();
    setTimeout(() => setProgress(1), 100);
  }
}

function verifyImageLoadable(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 50 && img.naturalHeight > 50) {
        resolve(true);
      } else {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function createInpaintingMask(previewImg, isAutoMode, manualPoints, stone) {
  const sourceImage = window._originalImageElement || previewImg;
  const W = sourceImage.naturalWidth || sourceImage.width || 1024;
  const H = sourceImage.naturalHeight || sourceImage.height || 768;
  const colorDetails = getStoneColorDetails(stone);

  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = W;
  imageCanvas.height = H;
  const imgCtx = imageCanvas.getContext('2d');

  try {
    imgCtx.drawImage(sourceImage, 0, 0, W, H);
  } catch (e) {
    console.warn('[Render] Canvas drawImage fallback:', e.message);
    imgCtx.drawImage(previewImg, 0, 0, W, H);
  }

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W;
  maskCanvas.height = H;
  const maskCtx = maskCanvas.getContext('2d');

  // Fill entire canvas with OPAQUE BLACK (unmasked areas)
  maskCtx.fillStyle = 'rgba(0, 0, 0, 1)';
  maskCtx.fillRect(0, 0, W, H);

  // Clear targeted worktop area to TRANSPARENT (inpaint ONLY the worktop for AI)
  maskCtx.globalCompositeOperation = 'destination-out';

  if (manualPoints && manualPoints.length >= 3) {
    maskCtx.beginPath();
    maskCtx.moveTo((manualPoints[0].x / 100) * W, (manualPoints[0].y / 100) * H);
    for (let i = 1; i < manualPoints.length; i++) {
      maskCtx.lineTo((manualPoints[i].x / 100) * W, (manualPoints[i].y / 100) * H);
    }
    maskCtx.closePath();
    maskCtx.fill();
  } else {
    // Auto Mode: Complete, seamless coverage of all kitchen stone surfaces
    // Zone 1: Complete Backsplash panel behind hob (under hood)
    maskCtx.beginPath();
    maskCtx.moveTo(W * 0.40, H * 0.10);
    maskCtx.lineTo(W * 0.96, H * 0.10);
    maskCtx.lineTo(W * 0.96, H * 0.65);
    maskCtx.lineTo(W * 0.40, H * 0.65);
    maskCtx.closePath();
    maskCtx.fill();

    // Zone 2: Complete Countertop worktop slab (full edge-to-edge kitchen coverage)
    maskCtx.beginPath();
    maskCtx.moveTo(0, H * 0.40);
    maskCtx.lineTo(W, H * 0.40);
    maskCtx.lineTo(W, H);
    maskCtx.lineTo(0, H);
    maskCtx.closePath();
    maskCtx.fill();
  }

  maskCtx.globalCompositeOperation = 'source-over';

  return { imageCanvas, maskCanvas, colorDetails };
}

// Composite AI rendered stone with original image using the stone mask to guarantee 100% preservation of non-stone pixels
function applyMaskedComposite(originalImg, aiResultUrl, maskCanvas) {
  return new Promise((resolve) => {
    const orig = window._originalImageElement || originalImg;
    const W = orig.naturalWidth || orig.width || 1024;
    const H = orig.naturalHeight || orig.height || 768;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(orig, 0, 0, W, H);

    const aiImg = new Image();
    aiImg.crossOrigin = 'anonymous';
    aiImg.onload = () => {
      const aiCanvas = document.createElement('canvas');
      aiCanvas.width = W;
      aiCanvas.height = H;
      const aiCtx = aiCanvas.getContext('2d');
      aiCtx.drawImage(aiImg, 0, 0, W, H);

      const alphaMaskCanvas = document.createElement('canvas');
      alphaMaskCanvas.width = W;
      alphaMaskCanvas.height = H;
      const aCtx = alphaMaskCanvas.getContext('2d');

      aCtx.drawImage(maskCanvas, 0, 0, W, H);
      aCtx.globalCompositeOperation = 'difference';
      aCtx.fillStyle = 'rgba(255, 255, 255, 1)';
      aCtx.fillRect(0, 0, W, H);

      aiCtx.globalCompositeOperation = 'destination-in';
      aiCtx.drawImage(alphaMaskCanvas, 0, 0, W, H);

      ctx.drawImage(aiCanvas, 0, 0, W, H);

      resolve(canvas.toDataURL('image/jpeg', 0.94));
    };
    aiImg.onerror = () => resolve(aiResultUrl);
    aiImg.src = aiResultUrl;
  });
}

function createClientSideBlendRender(previewImg, points, colorDetails) {
  const canvas = document.createElement('canvas');
  const sourceImage = window._originalImageElement || previewImg;
  const W = sourceImage.naturalWidth || sourceImage.width || 1024;
  const H = sourceImage.naturalHeight || sourceImage.height || 1024;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(sourceImage, 0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  const isAutoMode = document.getElementById('mode-auto-btn')?.classList.contains('active');

  if (points && points.length >= 3 && !isAutoMode) {
    ctx.moveTo((points[0].x / 100) * W, (points[0].y / 100) * H);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo((points[i].x / 100) * W, (points[i].y / 100) * H);
    }
  } else {
    ctx.moveTo(W * 0.10, H * 0.55);
    ctx.lineTo(W * 0.90, H * 0.55);
    ctx.lineTo(W * 0.94, H * 0.82);
    ctx.lineTo(W * 0.06, H * 0.82);
  }
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = colorDetails?.hex || '#d8ccb8';
  ctx.fill();

  const grad = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.82);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.92);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Clear any cached API keys immediately to disconnect
  localStorage.removeItem('openai_api_key');

  // 1. Check Authentication
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'login.html' + window.location.search;
    return;
  }
  currentUser = user;

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
    const settings = (typeof fetchAppSettings === 'function') ? await fetchAppSettings() : null;
    const starterCredits = (settings && settings.freeCreditsEnabled !== false) ? Number(settings.freeCreditsCount ?? 0) : 0;
    const defaultName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || 'Google User';
    const { data: newProfile, error: insertErr } = await supabaseClient
      .from('profiles')
      .insert([{
        id: currentUser.id,
        name: defaultName,
        email: currentUser.email,
        plan: 'Free',
        credits: starterCredits,
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
  if (filterCategory) {
    filterCategory.innerHTML = '<option value="all">All Categories</option>';
    if (cats && cats.length) {
      allCategories = cats;
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        filterCategory.appendChild(opt);
      });
    }
  }

  const brands = await getBrands();
  allStones = [];
  if (filterBrand) {
    filterBrand.innerHTML = '<option value="all">All Brands</option>';
    if (brands && brands.length) {
      allBrands = brands;
      brands.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name;
        filterBrand.appendChild(opt);

        if (b.colours && b.colours.length) {
          b.colours.forEach(c => {
            allStones.push({
              ...c,
              brandName: b.name,
              brand_name: b.name,
              brand: b.name,
              categoryName: b.category,
              category: b.category
            });
          });
        }
      });
    }
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
  if (!stoneListEl) return;
  stoneListEl.innerHTML = '';
  const selCat = filterCategory ? filterCategory.value : 'all';
  const selBrand = filterBrand ? filterBrand.value : 'all';
  const searchInput = document.getElementById('search-stone');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const isCatAll = !selCat || selCat.toLowerCase().trim() === 'all';
  const isBrandAll = !selBrand || selBrand.toLowerCase().trim() === 'all';

  const filtered = allStones.filter(s => {
    if (!isCatAll) {
      const sCat = (s.categoryName || s.category || '').toLowerCase().trim();
      if (sCat !== selCat.toLowerCase().trim()) return false;
    }
    if (!isBrandAll) {
      const sBrand = (s.brandName || s.brand || s.brand_name || '').toLowerCase().trim();
      if (sBrand !== selBrand.toLowerCase().trim()) return false;
    }
    if (query) {
      const sName = (s.name || '').toLowerCase();
      const sSku = (s.sku || '').toLowerCase();
      if (!sName.includes(query) && !sSku.includes(query)) return false;
    }
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

    const imgUrl = getStoneImage(stone.sku, stone);

    const categoryLabel = (stone.categoryName || stone.category || 'Marble').toUpperCase();
    const finishLabel = (stone.texture === 'granite' || stone.texture === 'slate') ? 'HONED' : 'POLISHED';
    const isGrad = imgUrl.startsWith('linear-gradient') || imgUrl.startsWith('radial-gradient');
    const thumbBg = isGrad ? `background: ${imgUrl};` : `background-image: url('${imgUrl}'), ${getTexture(stone.texture || 'default')}; background-size: cover; background-position: center;`;
    el.innerHTML = `
      <div class="stone-thumb" style="${thumbBg}"></div>
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

      // Hide 2D SVG texture overlay
      if (simulatedHighlight) {
        simulatedHighlight.style.display = 'none';
        simulatedHighlight.innerHTML = '';
      }

      // ONLY auto-generate after the user has clicked "Generate AI Render" at least once!
      if (window._isAIRendered && !isRendering) {
        generateRender();
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
    const imgUrl = getStoneImage(stone.sku, stone);
    const isGrad = imgUrl.startsWith('linear-gradient') || imgUrl.startsWith('radial-gradient');
    const thumbStyle = isGrad ? `background: ${imgUrl};` : `background-image: url('${imgUrl}'), ${getTexture(stone.texture || 'default')};`;
    container.innerHTML = `
      <div id="selected-material-card" class="material-card-selected fade-up" style="animation-duration: 0.3s;">
        <div class="material-card-header">
          <div class="material-card-thumb" style="${thumbStyle}"></div>
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

  showToast('Optimizing image...', 'info');
  const optimizedFile = await compressImage(file);

  // 1. Instantly display local image preview on screen for fast visual feedback (works on all devices including mobile)
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUri = e.target.result;
    previewImage.src = dataUri;
    previewImage.style.display = 'block';

    const origImg = new Image();
    origImg.crossOrigin = "Anonymous";
    origImg.src = dataUri;
    window._originalImageElement = origImg;
    window._isAIRendered = false;

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

    if (drawingToolbar) drawingToolbar.style.display = 'flex';

    if (actionBar) actionBar.classList.add('visible');
    if (simulatedHighlight) simulatedHighlight.style.display = 'none';
  };
  reader.readAsDataURL(optimizedFile);

  // 2. Perform background cloud storage upload without blocking preview/rendering
  (async () => {
    try {
      const userId = currentUser?.id || 'guest';
      const storageDir = `originals/${userId}`;
      await emptyStorageFolder('ratedworktops', storageDir);

      const path = `${storageDir}/current_kitchen.jpg`;
      const uploadRes = await uploadFileToStorage('ratedworktops', path, optimizedFile);

      if (uploadRes.ok) {
        originalFileUrl = uploadRes.url + `?t=${Date.now()}`;
        if (supabaseClient) {
          await supabaseClient.from('kitchen_uploads').delete().eq('user_id', userId).catch(() => {});
          await supabaseClient.from('kitchen_uploads').insert([{ user_id: userId, image_url: uploadRes.url }]).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[Visualiser] Cloud storage background sync notice:', e);
    }
  })();
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
    window.location.reload();
  });

  const clearWorkspaceBtn = document.getElementById('clear-workspace-btn');
  if (clearWorkspaceBtn) {
    clearWorkspaceBtn.addEventListener('click', () => {
      window.location.reload();
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

  const copyPublicBtn = document.getElementById('share-copy-public-url-btn');
  if (copyPublicBtn) {
    copyPublicBtn.addEventListener('click', () => {
      const url = window._currentRenderPublicUrl || window._shareImageUrl || document.getElementById('share-public-url-input')?.value;
      if (!url) {
        showToast('No public link generated yet.', 'error');
        return;
      }
      navigator.clipboard.writeText(url).then(() => {
        showToast('Public viewable link copied to clipboard! Anyone anywhere can view your kitchen render.', 'success');
      }).catch(() => {
        showToast('Failed to copy public link.', 'error');
      });
    });
  }

  document.getElementById('share-copy-link').addEventListener('click', () => {
    trackShare();
    const shareLink = window._currentRenderPublicUrl || window._shareImageUrl || window.location.href;
    navigator.clipboard.writeText(shareLink).then(() => {
      showToast('Image link copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy link.', 'error');
    });
    document.getElementById('share-modal').classList.remove('open');
  });

  // ── Unified Action Bar Capabilities (Download, Save to My Space, Share) ──
  async function handleDownload() {
    if (!previewImage.src || previewImage.style.display === 'none') {
      showToast('Please generate or upload an image first.', 'error');
      return;
    }
    showToast('Preparing your design download...', 'info');

    if (currentProfile && supabaseClient && currentUser) {
      const newDownloads = (currentProfile.downloads || 0) + 1;
      await supabaseClient
        .from('profiles')
        .update({ downloads: newDownloads })
        .eq('id', currentUser.id)
        .catch(e => console.warn('Downloads count update notice:', e));
      currentProfile.downloads = newDownloads;
    }

    const blob = await getRenderedCanvasBlob();
    let downloadUrl = '';
    if (blob) {
      downloadUrl = URL.createObjectURL(blob);
    } else {
      downloadUrl = previewImage.src;
    }

    const stoneClean = selectedStone?.name ? selectedStone.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() : 'stone-render';
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `stone-visualiser-${stoneClean}-${dateStr}.png`;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      if (blob) URL.revokeObjectURL(downloadUrl);
    }, 3000);

    showToast('Image downloaded to device!', 'success');
  }

  async function handleSaveToUserSpace() {
    if (!currentUser || !currentUser.id) {
      showToast('Please sign in to save renders to your account space.', 'warning');
      if (typeof openAuthModal === 'function') {
        openAuthModal('login');
      } else {
        window.location.href = 'index.html?auth=login';
      }
      return;
    }

    const saveBtns = [
      document.getElementById('save-btn'),
      document.getElementById('main-save-btn')
    ].filter(Boolean);

    saveBtns.forEach(btn => {
      btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0"></div> Saving...`;
      btn.disabled = true;
    });

    let dbCount = 0;
    if (supabaseClient) {
      try {
        const { count, data: existing, error: fetchErr } = await supabaseClient
          .from('projects')
          .select('id', { count: 'exact' })
          .eq('user_id', currentUser.id);
        if (!fetchErr && typeof count === 'number') {
          dbCount = count;
        } else if (existing) {
          dbCount = existing.length;
        }
      } catch(e) {}
    }

    const settings = typeof fetchAppSettings === 'function' ? await fetchAppSettings() : {};
    const maxLimit = settings.maxSavedProjects || 2;

    if (dbCount >= maxLimit) {
      showToast(`Save limit reached (${maxLimit} max)! Please delete a project in "My Renders" first.`, 'error');
      saveBtns.forEach(btn => resetSaveBtn(btn));
      return;
    }

    try {
      const blob = await getRenderedCanvasBlob();
      showToast('Saving design file to cloud...', 'info');

      let imageUrl = '';
      if (blob && typeof uploadFileToStorage === 'function') {
        const uuid = Math.random().toString(36).substring(2, 15);
        const path = `outputs/${currentUser.id}/${uuid}.jpg`;
        const uploadRes = await uploadFileToStorage('ratedworktops', path, blob);
        if (uploadRes.ok && uploadRes.url) imageUrl = uploadRes.url;
      }
      if (!imageUrl && previewImage.src) {
        imageUrl = previewImage.src;
      }

      const stoneName = selectedStone ? (selectedStone.name || selectedStone.title || 'Custom Stone') : 'Stone Worktop';
      const brandName = selectedStone ? (selectedStone.brandName || selectedStone.brand || 'RatedWorktops') : 'RatedWorktops';

      const { data: inserted, error: insertErr } = await supabaseClient
        .from('projects')
        .insert([{
          user_id: currentUser.id,
          stone_name: stoneName,
          brand_name: brandName,
          image_url: imageUrl,
          title: `${stoneName} Render`,
          rendered_image: imageUrl,
          created_at: new Date().toISOString()
        }])
        .select();

      if (insertErr) throw insertErr;

      showToast('Project saved successfully to "My Renders"!', 'success');
      saveBtns.forEach(btn => {
        btn.disabled = false;
        btn.style.background = '#22c55e';
        btn.style.borderColor = '#22c55e';
        btn.style.color = '#ffffff';
        btn.innerHTML = `<i data-lucide="check" style="width:16px;height:16px"></i> Saved ✓`;
      });
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('[Save Project] Error:', err);
      showToast('Failed to save project: ' + (err.message || 'Unknown error'), 'error');
      saveBtns.forEach(btn => resetSaveBtn(btn));
    }
  }

  function handleShare() {
    let shareUrl = window._shareImageUrl || window._currentRenderPublicUrl || previewImage.src;
    if (!shareUrl) {
      showToast('Please generate an image first.', 'error');
      return;
    }

    const stoneName = selectedStone?.name || 'Natural Stone';
    const shareTitle = `Kitchen Visualisation — ${stoneName}`;
    const shareText = `Check out my kitchen visualisation with ${stoneName} worktop on RatedWorktops!`;

    const shareModal = document.getElementById('share-modal');
    const sharePreviewImg = document.getElementById('share-preview-img');
    const sharePreviewText = document.getElementById('share-preview-text');
    const shareUrlInput = document.getElementById('share-public-url-input');

    if (sharePreviewImg) {
      sharePreviewImg.src = shareUrl;
      sharePreviewImg.style.display = 'block';
    }
    if (sharePreviewText) sharePreviewText.style.display = 'none';
    if (shareUrlInput) shareUrlInput.value = shareUrl;

    const wa = document.getElementById('share-whatsapp');
    if (wa) wa.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;

    const fb = document.getElementById('share-facebook');
    if (fb) fb.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

    const tw = document.getElementById('share-x') || document.getElementById('share-twitter');
    if (tw) tw.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

    const em = document.getElementById('share-email');
    if (em) em.href = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`;

    const copyBtn = document.getElementById('share-copy-public-url-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToast('Link copied to clipboard!', 'success');
          copyBtn.textContent = 'Copied! ✓';
          setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 2500);
        }).catch(() => {
          showToast('Link copied!', 'success');
        });
      };
    }

    if (shareModal) shareModal.classList.add('open');
  }

  // Attach Action Bar Listeners
  ['download-btn', 'main-download-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handleDownload);
  });

  ['save-btn', 'main-save-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handleSaveToUserSpace);
  });

  ['share-btn', 'main-share-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handleShare);
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

function openShareModalWithPublicUrl() {
  const modal = document.getElementById('share-modal');
  const previewImg = document.getElementById('share-preview-img');
  const previewText = document.getElementById('share-preview-text');
  const shareUrlInput = document.getElementById('share-public-url-input');

  const url = window._currentRenderPublicUrl || window._shareImageUrl || '';
  if (url) {
    if (shareUrlInput) shareUrlInput.value = url;
    if (previewImg) {
      previewImg.src = url;
      previewImg.style.display = 'block';
    }
    if (previewText) previewText.style.display = 'none';
  }

  if (modal) modal.classList.add('open');
  if (window.lucide) lucide.createIcons();
}

function getRenderedCanvasBlob() {
  return new Promise((resolve) => {
    if (!previewImage.src) {
      resolve(null);
      return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth || img.width || 800;
      canvas.height = img.naturalHeight || img.height || 600;
      ctx.drawImage(img, 0, 0);
      drawWatermarkAndResolve();
    };
    img.onerror = () => {
      const renderCanvas = document.getElementById('render-canvas');
      if (renderCanvas && renderCanvas.width > 0) {
        canvas.width = renderCanvas.width;
        canvas.height = renderCanvas.height;
        ctx.drawImage(renderCanvas, 0, 0);
        drawWatermarkAndResolve();
      } else {
        resolve(null);
      }
    };
    img.src = previewImage.src;

    function drawWatermarkAndResolve() {
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
    }
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

  // Never show 2D SVG overlay boxes on AI rendered images
  if (window._isAIRendered || (previewImage && previewImage.src && previewImage.style.display === 'block')) {
    if (simulatedHighlight) {
      simulatedHighlight.style.display = 'none';
      simulatedHighlight.innerHTML = '';
    }
    return;
  }
  const imgUrl = getStoneImage(selectedStone.sku, selectedStone);
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
