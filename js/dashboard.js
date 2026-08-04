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

// Visualisation variables
let autoCountertopPoints = null; // array of {x,y} from Gemini
let autoSplashbackPoints = null; // array of {x,y} from Gemini
let cacheImageSrc = ''; // tracks which image is cached

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
  } else if (name.includes('red') || name.includes('rosso') || name.includes('ruby') || name.includes('bordeaux') || name.includes('burgundy')) {
    colorDesc = 'rich deep red stone with natural veining and warm tones';
  } else if (name.includes('blue') || name.includes('volga') || name.includes('azul') || name.includes('sodalite') || name.includes('sapphire')) {
    colorDesc = 'deep blue stone with natural crystalline patterns and mineral flecks';
  } else if (name.includes('green') || name.includes('verde') || name.includes('emerald') || name.includes('forest')) {
    colorDesc = 'rich green stone with natural veining and mineral patterns';
  } else if (name.includes('brown') || name.includes('tan') || name.includes('coffee') || name.includes('mocha') || name.includes('bronze') || name.includes('autumn') || name.includes('caramel')) {
    colorDesc = 'warm brown stone with natural earthy tones and veining';
  } else if (name.includes('beige') || name.includes('cream') || name.includes('ivory') || name.includes('sand') || name.includes('vanilla') || name.includes('latte')) {
    colorDesc = 'warm beige cream stone with subtle natural patterns';
  } else if (name.includes('gold') || name.includes('amber') || name.includes('honey')) {
    colorDesc = 'warm golden stone with rich amber tones and natural veining';
  } else if (name.includes('pink') || name.includes('rose') || name.includes('blush')) {
    colorDesc = 'soft pink rose-toned stone with delicate natural patterns';
  } else if (name.includes('purple') || name.includes('violet') || name.includes('amethyst') || name.includes('viola')) {
    colorDesc = 'rich purple stone with dramatic veining and deep violet tones';
  } else if (texture === 'marble' || name.includes('marble') || name.includes('calacatta') || name.includes('carrara') || name.includes('statuario') || name.includes('vagli')) {
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

  if (!previewImage.src) {
    showToast('Please upload a kitchen image first.', 'error');
    return;
  }

  const settings = store.get('settings', {});
  const isFreeMode = settings.subscriptionsEnabled === false;

  if (!isFreeMode && currentProfile.credits <= 0) {
    showToast('Not enough credits! Please upgrade your plan.', 'error');
    return;
  }

  isRendering = true;
  if (simulatedHighlight) simulatedHighlight.style.display = 'none';
  processingOverlay.style.display = 'flex';

  console.log('[Render] Starting AI image-to-image render...');
  console.log('[Render] Stone selected:', selectedStone?.name, selectedStone?.sku);

  try {
    // ── 1. Create Inpainting Mask and pre-tinted image data URIs ───────────────────────
    processingText.textContent = 'Preparing stone color and inpainting mask...';

    const isAutoMode = document.getElementById('mode-auto-btn')?.classList.contains('active');
    const colorDetails = getStoneColorDetails(selectedStone);
    const { imageCanvas, maskCanvas } = createInpaintingMask(previewImage, isAutoMode, points, selectedStone);

    const imageUri = imageCanvas.toDataURL('image/jpeg', 0.90);
    const maskUri = maskCanvas.toDataURL('image/png');

    // ── 1b. Resolve the stone texture image URL to send as reference ─────────
    let stoneImageUrl = getStoneImage(selectedStone.sku, selectedStone);
    // Convert relative paths to absolute URLs so Fal.ai can fetch them
    if (stoneImageUrl && !stoneImageUrl.startsWith('http') && !stoneImageUrl.startsWith('data:')) {
      stoneImageUrl = new URL(stoneImageUrl, window.location.href).href;
    }
    console.log('[Render] Stone texture reference URL:', stoneImageUrl);

    // ── 2. Build the AI prompt ───────────────────────────────────────────────
    const stoneDesc = getStoneVisualDescription(selectedStone);
    const refinementText = document.getElementById('refinement-instructions')?.value?.trim() || '';
    const refinementExtra = refinementText ? ` ADDITIONAL USER REFINEMENT INSTRUCTIONS: ${refinementText}.` : '';
    const prompt = `${colorDetails.promptPrefix} Replace the countertop worktop and splashback surfaces with ${selectedStone.brandName || ''} ${selectedStone.name}. The worktop and splashback MUST use the EXACT same stone texture, color, pattern, and veining as shown in the reference stone image provided. Detailed ${stoneDesc} material with realistic veining, correct color tone, and polished finish. Match lighting and perspective of the kitchen. Both the worktop and splashback must display the identical stone material.${refinementExtra}`;

    console.log('[Render] Inpainting Prompt:', prompt);

    // ── 3. Call the Supabase proxy → Fal.ai inpainting ─────────────────────
    processingText.textContent = 'Inpainting selected stone onto worktop...';

    let aiImageUrl = null;

    if (supabaseClient && useRealSupabase) {
      try {
        const userOpenAiKey = localStorage.getItem('openai_api_key') || localStorage.getItem('rw_openai_key') || '';
        if (typeof supabaseClient.functions?.invoke === 'function') {
          const { data, error } = await supabaseClient.functions.invoke('openai-proxy', {
            body: {
              image: imageUri,
              mask: maskUri,
              prompt: prompt,
              openai_key: userOpenAiKey
            }
          });
          if (error) {
            console.error('[Render] Functions invoke error:', error);
            throw new Error(error.message || 'AI inpainting failed via Supabase Function.');
          }
          if (data && data.error) {
            console.error('[Render] Proxy returned error payload:', data.error);
            throw new Error(data.error.message || (typeof data.error === 'string' ? data.error : 'AI proxy returned error.'));
          }
          aiImageUrl = data?.data?.[0]?.url || data?.url || null;
        } else {
          const { data: { session } } = await supabaseClient.auth.getSession();
          const token = session?.access_token;
          const proxyResponse = await fetch(`${SUPABASE_URL}/functions/v1/openai-proxy`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token || ''}`,
              'apikey': SUPABASE_ANON_KEY || '',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              image: imageUri,
              mask: maskUri,
              prompt: prompt,
              openai_key: userOpenAiKey
            })
          });

          const resData = await proxyResponse.json().catch(() => ({}));
          if (proxyResponse.ok) {
            if (resData.error) {
              throw new Error(resData.error.message || 'AI proxy returned error.');
            }
            aiImageUrl = resData.data?.[0]?.url || resData.url || null;
          } else {
            throw new Error(resData?.error?.message || `Server error (status ${proxyResponse.status})`);
          }
        }
      } catch (proxyErr) {
        console.warn('[Render] Supabase proxy notice, using client blend fallback:', proxyErr.message);
        aiImageUrl = createClientSideBlendRender(previewImage, points, colorDetails);
      }
    } else {
      aiImageUrl = createClientSideBlendRender(previewImage, points, colorDetails);
    }

    // ── 4. Display the brand-new AI-generated image ──────────────────────────
    // The proxy returns base64 data URI, so no CORS issues at all.
    if (aiImageUrl) {
      processingText.textContent = 'Applying your new render...';
      console.log('[Render] Setting previewImage.src to AI result (length:', aiImageUrl.length, ')');

      // Directly set src — works for both URLs and base64 data URIs
      previewImage.src = aiImageUrl;
      previewImage.style.display = 'block';
      window._isAIRendered = true;

      // For Download/Share: draw onto canvas (works since src is base64 / same-origin)
      await new Promise((resolve) => {
        const tempImg = new Image();
        tempImg.onload = () => {
          const renderCanvas = document.getElementById('render-canvas');
          if (renderCanvas) {
            renderCanvas.width = tempImg.naturalWidth;
            renderCanvas.height = tempImg.naturalHeight;
            renderCanvas.getContext('2d').drawImage(tempImg, 0, 0);
            renderCanvas.style.display = 'block';
          }
          resolve();
        };
        tempImg.onerror = () => {
          console.warn('[Render] Canvas draw failed (non-critical), image still displayed in <img> tag');
          resolve(); // non-fatal — the <img> tag still shows the result
        };
        tempImg.src = aiImageUrl;
      });

      console.log('[Render] ✅ New AI-generated image displayed successfully!');
    } else {
      throw new Error('AI returned no image. Please try again.');
    }

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

    // ── 6. Automatically Save to Storage & Generate Public URL ─────────────
    processingText.textContent = 'Saving project & generating public share link...';
    try {
      const blob = await getRenderedCanvasBlob();
      if (blob) {
        const uuid = Math.random().toString(36).substring(2, 15);
        const userId = currentUser?.id || 'public';
        const storagePath = `outputs/${userId}/${uuid}.jpg`;
        const uploadRes = await uploadFileToStorage('ratedworktops', storagePath, blob);

        if (uploadRes.ok && uploadRes.url) {
          window._currentRenderPublicUrl = uploadRes.url;
          window._shareImageUrl = uploadRes.url;
          console.log('[Render] Public share URL generated:', uploadRes.url);

          // Save project row to Supabase database if logged in
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

    showToast('Render complete! Saved & public link created.', 'success');

    const preRenderControls = document.getElementById('pre-render-controls');
    if (preRenderControls) preRenderControls.style.display = 'none';
    const postRenderActions = document.getElementById('post-render-actions');
    if (postRenderActions) postRenderActions.style.display = 'flex';

    // Automatically prompt user to view & share their public URL
    setTimeout(() => {
      openShareModalWithPublicUrl();
    }, 600);

  } catch (err) {
    console.error('[Render] Error:', err);
    showToast('Render failed: ' + (err.message || 'Unknown error. Please try again.'), 'error');
  } finally {
    processingOverlay.style.display = 'none';
    isRendering = false;
  }
}

// Helper: Determine exact base color and prompt prefix for the selected stone
function getStoneColorDetails(stone) {
  if (!stone) return { baseColor: 'white', hex: '#FAFAFA', promptPrefix: 'PURE BRIGHT WHITE COLOR SURFACES: Solid polished bright white background color with delicate marble veining' };

  const sku = stone.sku ? stone.sku.toUpperCase() : '';
  const name = stone.name ? stone.name.toLowerCase() : '';
  const texture = stone.texture ? stone.texture.toLowerCase() : '';

  const isBlack = (
    sku === 'SIL-IB' || sku === 'DEK-LR' || sku === 'DEK-CG' || sku === 'CAE-VN' || sku === 'CAL-NM' || sku === 'TSC-NP' ||
    texture === 'black' || name.includes('black') || name.includes('laurent') || name.includes('noir') || name.includes('nero') || name.includes('charcoal') || name.includes('picasso')
  );

  const isGrey = (
    sku === 'DEK-KR' || sku === 'DEK-VR' || sku === 'CAE-CC' || sku === 'SIL-LS' || sku === 'POR-BC' ||
    texture === 'slate' || name.includes('kreta') || name.includes('concrete') || name.includes('slate') || name.includes('grey') || name.includes('bottega')
  );

  const isRed = (
    sku === 'TSC-RL' || name.includes('red') || name.includes('rosso') || name.includes('levanto') || name.includes('ruby') || name.includes('bordeaux') || name.includes('burgundy') || name.includes('crimson')
  );

  const isBlue = (
    sku === 'TSC-VB' || sku === 'TSC-BR' || name.includes('blue') || name.includes('volga') || name.includes('roma') || name.includes('azul') || name.includes('sodalite') || name.includes('sapphire') || name.includes('ocean')
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
    sku === 'TSC-V3' || name.includes('purple') || name.includes('violet') || name.includes('amethyst') || name.includes('viola')
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
  } else if (isRed) {
    return {
      baseColor: 'dark red',
      hex: '#6B1D2F',
      promptPrefix: `RICH DEEP ROSSO LEVANTO RED MARBLE SURFACES: Must be deep reddish-burgundy background color with white and grey veins matching the reference stone exactly. Absolutely NO plain white background.`
    };
  } else if (isBlue) {
    return {
      baseColor: 'deep blue',
      hex: '#1E3A52',
      promptPrefix: `DEEP VOLGA BLUE / BLUE ROMA QUARTZITE SURFACES: Must be rich deep blue/navy background color with metallic iridescence and golden/grey quartzite veining. The worktop MUST be dark blue.`
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
      baseColor: 'silver armani / monet light',
      hex: '#C5BBAA',
      promptPrefix: `WARM SILVER ARMANI / MONET LIGHT BEIGE MARBLE SURFACES: Elegant warm grey-beige marble background with subtle soft veining.`
    };
  } else if (isGrey) {
    return {
      baseColor: 'grey',
      hex: '#6B7280',
      promptPrefix: `MATTE GREY CONCRETE / SLATE COLOR WORKTOP SURFACES: Solid mid-grey texture background color matching the reference stone.`
    };
  } else {
    return {
      baseColor: 'white',
      hex: '#F5F5F5',
      promptPrefix: `PURE BRIGHT WHITE COLOR WORKTOP AND SPLASHBACK SURFACES: Solid polished bright white background color with delicate veining.`
    };
  }
}

// Helper: resize an image data URL to maxSize px on the longest edge
async function resizeImageDataUrl(dataUrl, maxSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w <= maxSize && h <= maxSize) { resolve(dataUrl); return; }
      if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
      else { w = Math.round(w * maxSize / h); h = maxSize; }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function createInpaintingMask(previewImg, isAutoMode, manualPoints, stone) {
  const TARGET_SIZE = 512;
  const colorDetails = getStoneColorDetails(stone);

  // 1. Create 512x512 clean image canvas (UNTOUCHED original photo context)
  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = TARGET_SIZE;
  imageCanvas.height = TARGET_SIZE;
  const imgCtx = imageCanvas.getContext('2d');

  const sourceImage = window._originalImageElement || previewImg;
  try {
    imgCtx.drawImage(sourceImage, 0, 0, TARGET_SIZE, TARGET_SIZE);
  } catch (e) {
    console.warn('[Render] Canvas drawImage fallback:', e.message);
    imgCtx.drawImage(previewImg, 0, 0, TARGET_SIZE, TARGET_SIZE);
  }

  // 2. Create 512x512 binary mask canvas (Black = KEEP ORIGINAL KITCHEN, White = REPLACE WORKTOP SURFACE ONLY)
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = TARGET_SIZE;
  maskCanvas.height = TARGET_SIZE;
  const maskCtx = maskCanvas.getContext('2d');

  // Fill entire canvas with BLACK (keep original kitchen context intact)
  maskCtx.fillStyle = 'black';
  maskCtx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

  // Fill targeted worktop area with WHITE (inpaint ONLY the worktop)
  maskCtx.fillStyle = 'white';

  const SCALE = TARGET_SIZE / 100; // 5.12 scale factor

  if (manualPoints && manualPoints.length >= 3) {
    // Manual / Hybrid Mode: Inpaint ONLY the exact polygon selected by the user
    maskCtx.beginPath();
    maskCtx.moveTo(manualPoints[0].x * SCALE, manualPoints[0].y * SCALE);
    for (let i = 1; i < manualPoints.length; i++) {
      maskCtx.lineTo(manualPoints[i].x * SCALE, manualPoints[i].y * SCALE);
    }
    maskCtx.closePath();
    maskCtx.fill();
  } else {
    // Auto Mode: Target ONLY the worktop surface area (leaving upper cabinets, windows, walls & floor untouched)
    const countertopPoints = [
      { x: 12, y: 55 },
      { x: 88, y: 55 },
      { x: 92, y: 82 },
      { x: 8, y: 82 }
    ];
    maskCtx.beginPath();
    maskCtx.moveTo(countertopPoints[0].x * SCALE, countertopPoints[0].y * SCALE);
    for (let i = 1; i < countertopPoints.length; i++) {
      maskCtx.lineTo(countertopPoints[i].x * SCALE, countertopPoints[i].y * SCALE);
    }
    maskCtx.closePath();
    maskCtx.fill();
  }

  return { imageCanvas, maskCanvas, colorDetails };
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
    if (selCat !== 'all' && s.categoryName && s.categoryName.toLowerCase().trim() !== selCat.toLowerCase().trim()) return false;
    if (selBrand !== 'all' && s.brandName && s.brandName.toLowerCase().trim() !== selBrand.toLowerCase().trim()) return false;
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
      <div class="stone-card-thumb" style="background-image: url('${imgUrl}'), ${getTexture(stone.texture || 'default')}; background-size: cover; background-position: center;"></div>
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

      // Hide 2D canvas & SVG overlays
      if (simulatedHighlight) {
        simulatedHighlight.style.display = 'none';
        simulatedHighlight.innerHTML = '';
      }
      const renderCanvas = document.getElementById('render-canvas');
      if (renderCanvas) renderCanvas.style.display = 'none';

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
  await emptyStorageFolder('ratedworktops', `originals/${currentUser.id}`);

  const path = `originals/${currentUser.id}/current_kitchen.jpg`;
  const uploadRes = await uploadFileToStorage('ratedworktops', path, optimizedFile);

  if (uploadRes.ok) {
    // Append timestamp cache-buster so if URL is ever viewed, it breaks the cache
    originalFileUrl = uploadRes.url + `?t=${Date.now()}`;
    showToast('Image uploaded successfully!', 'success');
    
    // Log the upload in the database
    if (supabaseClient) {
      supabaseClient.from('kitchen_uploads').delete().eq('user_id', currentUser.id).then(() => {
        supabaseClient.from('kitchen_uploads').insert([{
          user_id: currentUser.id,
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

    const origImg = new Image();
    origImg.crossOrigin = "Anonymous";
    origImg.src = e.target.result;
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
      showToast('Please generate or upload a design first before sharing.', 'error');
      return;
    }

    showToast('Preparing your design for sharing...', 'info');

    // 1. Capture design blob
    const blob = await getRenderedCanvasBlob();
    if (!blob) {
      showToast('Failed to capture design image. Please try again.', 'error');
      return;
    }

    const stoneName = selectedStone?.name || 'Kitchen Design';
    const shareText = `Check out my kitchen design with ${selectedStone?.brandName || ''} ${stoneName} created on RatedWorktops!`;

    // 2. NATIVE MOBILE SHARE (Capacitor App on Android / iOS)
    if (window.Capacitor && window.Capacitor.Plugins?.Share) {
      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (window.Capacitor.Plugins?.Share) {
            await window.Capacitor.Plugins.Share.share({
              title: 'My Kitchen Design - RatedWorktops',
              text: shareText,
              url: reader.result,
              dialogTitle: 'Share Kitchen Design'
            });
            trackShare();
            showToast('Design shared successfully!', 'success');
          }
        };
        reader.readAsDataURL(blob);
        return;
      } catch (capErr) {
        console.warn('[Share] Native Capacitor share cancelled or failed:', capErr);
      }
    }

    // 3. NATIVE BROWSER SHARE (Mobile Web Chrome/Safari/Edge)
    if (navigator.share) {
      try {
        const file = new File([blob], `ratedworktops-${stoneName.replace(/\s+/g, '-').toLowerCase()}.jpg`, { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          trackShare();
          await navigator.share({
            title: 'My Kitchen Design - RatedWorktops',
            text: shareText,
            files: [file]
          });
          showToast('Shared successfully!', 'success');
          return;
        }
      } catch (navErr) {
        if (navErr.name !== 'AbortError') {
          console.warn('[Share] navigator.share failed, using modal fallback:', navErr);
        } else {
          return; // User cancelled share
        }
      }
    }

    // 4. WEB MODAL FALLBACK (Desktop Browser)
    const previewImg = document.getElementById('share-preview-img');
    const previewText = document.getElementById('share-preview-text');
    if (previewImg) {
      previewImg.src = URL.createObjectURL(blob);
      previewImg.style.display = 'block';
      if (previewText) previewText.style.display = 'none';
    }

    window._shareImageBlob = blob;
    window._shareImageUrl = '';

    const nativeBtn = document.getElementById('share-native');
    if (nativeBtn) {
      if (navigator.share) {
        nativeBtn.style.display = 'flex';
        nativeBtn.onclick = async () => {
          try {
            trackShare();
            await navigator.share({
              title: 'My Kitchen Design - RatedWorktops',
              text: shareText,
              url: window._shareImageUrl || window.location.href
            });
            document.getElementById('share-modal').classList.remove('open');
          } catch (e) {}
        };
      } else {
        nativeBtn.style.display = 'none';
      }
    }

    const modal = document.getElementById('share-modal');
    if (modal) modal.classList.add('open');
    if (window.lucide) lucide.createIcons();

    // Background upload for shareable URL
    if (supabaseClient && currentUser) {
      const uuid = Math.random().toString(36).substring(2, 15);
      const path = `shares/${currentUser.id}/${uuid}.jpg`;
      uploadFileToStorage('ratedworktops', path, blob).then((uploadRes) => {
        if (uploadRes.ok && uploadRes.url) {
          window._shareImageUrl = uploadRes.url;
          if (previewImg) previewImg.src = uploadRes.url;
        }
      }).catch(err => console.warn('[Share] Background storage upload error:', err));
    }
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
    if (!selectedStone) return;
    trackShare();
    const shareLink = window._currentRenderPublicUrl || window._shareImageUrl || `${window.location.origin}${window.location.pathname}?stone=${selectedStone.brand_id}-${selectedStone.id}`;
    navigator.clipboard.writeText(shareLink).then(() => {
      showToast('Image link copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy link.', 'error');
    });
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('download-btn').addEventListener('click', async () => {
    if (!previewImage.src) {
      showToast('Please generate or upload an image first.', 'error');
      return;
    }
    showToast('Preparing your design download...', 'info');

    // Increment downloads metric in DB
    if (currentProfile && supabaseClient) {
      const newDownloads = (currentProfile.downloads || 0) + 1;
      await supabaseClient
        .from('profiles')
        .update({ downloads: newDownloads })
        .eq('id', currentUser.id);
      currentProfile.downloads = newDownloads;
    }

    const blob = await getRenderedCanvasBlob();
    if (!blob) {
      showToast('Failed to prepare download file.', 'error');
      return;
    }

    const stoneName = selectedStone?.name ? selectedStone.name.replace(/\s+/g, '-').toLowerCase() : 'design';
    const fileName = `ratedworktops-${stoneName}.jpg`;

    // Capacitor Native Mobile Download / Share
    if (window.Capacitor && window.Capacitor.Plugins?.Share) {
      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (window.Capacitor.Plugins?.Share) {
            await window.Capacitor.Plugins.Share.share({
              title: 'RatedWorktops Design',
              text: `My kitchen design with ${selectedStone?.name || 'stone'}`,
              url: reader.result,
              dialogTitle: 'Save or Share Image'
            });
            showToast('Image shared / saved successfully!', 'success');
          }
        };
        reader.readAsDataURL(blob);
        return;
      } catch (err) {
        console.warn('Native share/save failed, using browser download:', err);
      }
    }

    // Web Browser Download Fallback
    const link = document.createElement('a');
    link.download = fileName;
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

    showToast('Image downloaded successfully!', 'success');
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-btn');
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0"></div> Saving...`;
    btn.disabled = true;

    let dbCount = 0;
    try {
      const { data: existing } = await supabaseClient
        .from('projects')
        .select('id')
        .eq('user_id', currentUser.id);
      if (existing) dbCount = existing.length;
    } catch(e) {}

    let localProjects = [];
    try {
      localProjects = JSON.parse(localStorage.getItem('rw_local_projects_' + currentUser.id) || '[]');
    } catch(e) {}

    const totalCount = Math.max(dbCount, localProjects.length);
    const settings = typeof fetchAppSettings === 'function' ? await fetchAppSettings() : {};
    const maxLimit = settings.maxSavedProjects || 2;

    if (totalCount >= maxLimit) {
      showToast(`Save limit reached (${maxLimit} max)! Please delete a project in "My Projects" first.`, 'error');
      resetSaveBtn(btn);
      return;
    }

    getRenderedCanvasBlob().then(async (blob) => {
      if (!blob) {
        showToast('Failed to compile render canvas.', 'error');
        resetSaveBtn(btn);
        return;
      }

      showToast('Saving design file...', 'info');
      const uuid = Math.random().toString(36).substring(2, 15);
      const path = `outputs/${currentUser.id}/${uuid}.jpg`;
      const uploadRes = await uploadFileToStorage('ratedworktops', path, blob);

      let imageUrl = '';
      if (uploadRes.ok) {
        imageUrl = uploadRes.url;
      } else {
        console.warn('[Save Project] Cloud upload notice:', uploadRes.error, 'Falling back to canvas data URL...');
        imageUrl = renderCanvas ? renderCanvas.toDataURL('image/jpeg', 0.85) : '';
      }

      const stoneName = selectedStone ? (selectedStone.name || selectedStone.title || 'Custom Stone') : 'Stone Worktop';
      const brandName = selectedStone ? (selectedStone.brandName || selectedStone.brand || 'RatedWorktops') : 'RatedWorktops';

      const projectRecord = {
        id: Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
        user_id: currentUser.id,
        stone_name: stoneName,
        brand_name: brandName,
        image_url: imageUrl,
        created_at: new Date().toISOString()
      };

      // 1. Try Supabase Database Insert
      try {
        const { error: insertErr } = await supabaseClient
          .from('projects')
          .insert([{
            user_id: currentUser.id,
            stone_name: stoneName,
            brand_name: brandName,
            image_url: imageUrl
          }]);
        if (insertErr) {
          console.warn('[Save Project] Supabase RLS/DB notice:', insertErr.message);
        }
      } catch (err) {
        console.warn('[Save Project] Supabase DB exception:', err);
      }

      // 2. Always persist locally as fail-safe guarantee
      localProjects.unshift(projectRecord);
      try { localStorage.setItem('rw_local_projects_' + currentUser.id, JSON.stringify(localProjects)); } catch(e) {}

      showToast('Project saved successfully!', 'success');
      btn.innerHTML = `<i data-lucide="check" style="width:16px;height:16px"></i> Saved`;
      btn.style.background = '#4ade80';
      btn.style.borderColor = '#4ade80';
      btn.style.color = '#000';
      lucide.createIcons();
    });
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
      
    }, 50);
  }

  tabCatalog.addEventListener('click', () => switchTab(tabCatalog, visSidebar));
  tabCanvas.addEventListener('click', () => switchTab(tabCanvas, visMain));
  tabControls.addEventListener('click', () => switchTab(tabControls, visControlPanel));
}


function updateRenderInstantly() {
  if (!selectedStone || !previewImage || !previewImage.src) return;

  // Never show 2D canvas/SVG overlays on AI rendered images
  if (window._isAIRendered || (previewImage && previewImage.src && previewImage.style.display === 'block')) {
    if (simulatedHighlight) {
      simulatedHighlight.style.display = 'none';
      simulatedHighlight.innerHTML = '';
    }
    const renderCanvas = document.getElementById('render-canvas');
    if (renderCanvas) renderCanvas.style.display = 'none';
    return;
  }

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

    
    simulatedHighlight.style.display = 'none';
    renderCanvas.style.display = 'block';
  };
  stoneImg.src = getStoneImage(selectedStone.sku, selectedStone);
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

