const https = require('https');

const SUPABASE_URL = 'https://cvzeelapjwdvpotuvbrz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2emVlbGFwandkdnBvdHV2YnJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxODI0NzAsImV4cCI6MjA5Nzc1ODQ3MH0.1zhb3W30NmK8wwW5q6_eJ_ExHd0zoyWhYvCG7w5T3S4';

let passed = 0;
let failed = 0;

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const options = {
      method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function run() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  RATEDWORKTOPS COMPREHENSIVE SUPABASE TEST SUITE ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const testBrandId = Date.now() + Math.floor(Math.random() * 1000);
  const testColourId = testBrandId + 1;
  const testCatId = testBrandId + 2;

  // ═══════════════════════════════════════════════
  // TEST GROUP 1: BRANDS CRUD
  // ═══════════════════════════════════════════════
  console.log('── TEST GROUP 1: BRANDS CRUD ──');

  // 1a. CREATE brand
  const createBrand = await request('/rest/v1/brands', 'POST', [{
    id: testBrandId,
    name: 'AutoTest Brand ' + testBrandId,
    category: 'Marble',
    description: 'Automated test',
    enabled: true
  }]);
  assert(createBrand.status === 201, `Create brand (status=${createBrand.status})`);
  assert(createBrand.data && createBrand.data[0] && createBrand.data[0].id === testBrandId, 'Brand ID matches numeric bigint');

  // 1b. READ brand
  const readBrand = await request(`/rest/v1/brands?id=eq.${testBrandId}&select=*`);
  assert(readBrand.status === 200, `Read brand (status=${readBrand.status})`);
  assert(readBrand.data && readBrand.data.length === 1, 'Found exactly 1 brand');
  assert(readBrand.data[0].name === 'AutoTest Brand ' + testBrandId, 'Brand name matches');
  assert(readBrand.data[0].category === 'Marble', 'Brand category matches');

  // 1c. UPDATE brand
  const updateBrand = await request(`/rest/v1/brands?id=eq.${testBrandId}`, 'PATCH', {
    description: 'Updated description',
    enabled: false
  });
  assert(updateBrand.status === 200, `Update brand (status=${updateBrand.status})`);
  const verifyUpdate = await request(`/rest/v1/brands?id=eq.${testBrandId}&select=*`);
  assert(verifyUpdate.data[0].description === 'Updated description', 'Brand description updated');
  assert(verifyUpdate.data[0].enabled === false, 'Brand enabled toggled to false');

  // ═══════════════════════════════════════════════
  // TEST GROUP 2: COLOURS CRUD (ALL COLUMNS)
  // ═══════════════════════════════════════════════
  console.log('\n── TEST GROUP 2: COLOURS CRUD ──');

  // 2a. CREATE colour with ALL columns
  const createColour = await request('/rest/v1/colours', 'POST', [{
    id: testColourId,
    brand_id: testBrandId,
    brand_name: 'AutoTest Brand ' + testBrandId,
    name: 'Test Statuario',
    sku: 'TEST-STAT-01',
    finish: 'Honed',
    texture: 'marble',
    image_url: 'https://example.com/test.jpg',
    enabled: true
  }]);
  assert(createColour.status === 201, `Create colour (status=${createColour.status})`);
  if (createColour.status !== 201) {
    console.log('    Response:', JSON.stringify(createColour.data));
  }
  assert(createColour.data && createColour.data[0] && createColour.data[0].id === testColourId, 'Colour ID matches numeric bigint');

  // 2b. READ colour and verify ALL columns
  const readColour = await request(`/rest/v1/colours?id=eq.${testColourId}&select=*`);
  assert(readColour.status === 200, `Read colour (status=${readColour.status})`);
  assert(readColour.data && readColour.data.length === 1, 'Found exactly 1 colour');
  const col = readColour.data[0];
  assert(col.brand_id === testBrandId, 'Colour brand_id FK matches brand');
  assert(col.brand_name === 'AutoTest Brand ' + testBrandId, 'Colour brand_name column works');
  assert(col.name === 'Test Statuario', 'Colour name matches');
  assert(col.sku === 'TEST-STAT-01', 'Colour SKU matches');
  assert(col.finish === 'Honed', 'Colour finish column works');
  assert(col.texture === 'marble', 'Colour texture matches');
  assert(col.image_url === 'https://example.com/test.jpg', 'Colour image_url column works');
  assert(col.enabled === true, 'Colour enabled matches');

  // 2c. UPDATE colour
  const updateColour = await request(`/rest/v1/colours?id=eq.${testColourId}`, 'PATCH', {
    finish: 'Polished',
    enabled: false,
    image_url: 'https://example.com/updated.jpg'
  });
  assert(updateColour.status === 200, `Update colour (status=${updateColour.status})`);
  const verifyColUpdate = await request(`/rest/v1/colours?id=eq.${testColourId}&select=*`);
  assert(verifyColUpdate.data[0].finish === 'Polished', 'Colour finish updated');
  assert(verifyColUpdate.data[0].enabled === false, 'Colour enabled toggled');
  assert(verifyColUpdate.data[0].image_url === 'https://example.com/updated.jpg', 'Colour image_url updated');

  // ═══════════════════════════════════════════════
  // TEST GROUP 3: CATEGORIES CRUD
  // ═══════════════════════════════════════════════
  console.log('\n── TEST GROUP 3: CATEGORIES CRUD ──');

  const readCats = await request('/rest/v1/categories?select=*&order=display_order');
  assert(readCats.status === 200, `Read categories (status=${readCats.status})`);
  assert(readCats.data && readCats.data.length > 0, `Categories seeded (found ${readCats.data ? readCats.data.length : 0})`);
  if (readCats.data && readCats.data.length > 0) {
    assert(readCats.data[0].name === 'Marble', 'First category is Marble');
  }

  // ═══════════════════════════════════════════════
  // TEST GROUP 4: FETCH BRANDS + COLOURS JOIN
  // ═══════════════════════════════════════════════
  console.log('\n── TEST GROUP 4: BRANDS + COLOURS JOIN ──');

  const allBrands = await request('/rest/v1/brands?select=*');
  const allColours = await request('/rest/v1/colours?select=*');
  assert(allBrands.status === 200, 'Fetch all brands OK');
  assert(allColours.status === 200, 'Fetch all colours OK');

  // Simulate what fetchBrands() does in admin.js
  const brandMap = new Map();
  (allBrands.data || []).forEach(b => {
    brandMap.set(String(b.id), { ...b, colours: [] });
  });
  (allColours.data || []).forEach(c => {
    const brand = brandMap.get(String(c.brand_id));
    if (brand) brand.colours.push(c);
  });
  const testBrand = brandMap.get(String(testBrandId));
  assert(testBrand !== undefined, 'Test brand found in join');
  assert(testBrand && testBrand.colours.length === 1, 'Test brand has 1 colour attached');

  // ═══════════════════════════════════════════════
  // TEST GROUP 5: RLS PERMISSIONS (anon can read/write)
  // ═══════════════════════════════════════════════
  console.log('\n── TEST GROUP 5: RLS PERMISSIONS ──');
  assert(allBrands.status === 200, 'Anon can SELECT brands');
  assert(createBrand.status === 201, 'Anon can INSERT brands');
  assert(updateBrand.status === 200, 'Anon can UPDATE brands');
  assert(createColour.status === 201, 'Anon can INSERT colours');
  assert(updateColour.status === 200, 'Anon can UPDATE colours');

  // ═══════════════════════════════════════════════
  // CLEANUP: Delete test data
  // ═══════════════════════════════════════════════
  console.log('\n── CLEANUP ──');
  const delCol = await request(`/rest/v1/colours?id=eq.${testColourId}`, 'DELETE');
  assert(delCol.status === 200 || delCol.status === 204, `Delete test colour (status=${delCol.status})`);
  const delBrand = await request(`/rest/v1/brands?id=eq.${testBrandId}`, 'DELETE');
  assert(delBrand.status === 200 || delBrand.status === 204, `Delete test brand (status=${delBrand.status})`);

  // Also clean up the test brand created earlier that wasn't deleted
  await request(`/rest/v1/brands?name=like.Test Brand*`, 'DELETE');
  await request(`/rest/v1/brands?name=like.AutoTest*`, 'DELETE');

  // ═══════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} PASSED, ${failed} FAILED                    ║`);
  if (failed === 0) {
    console.log('║  🎉 ALL TESTS PASSED PERFECTLY!                  ║');
  } else {
    console.log('║  ⚠️  SOME TESTS FAILED — SEE ABOVE               ║');
  }
  console.log('╚══════════════════════════════════════════════════╝');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('❌ TEST SUITE CRASHED:', err);
  process.exit(1);
});
