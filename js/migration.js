/**
 * One-time automated migration helper to move any legacy localStorage entries into Supabase DB
 * and clear local storage afterwards.
 */
async function migrateLocalStorageToSupabase(currentUser) {
  if (!supabaseClient || !currentUser || !currentUser.id) return;

  const userId = currentUser.id;
  const legacyKey = 'rw_local_projects_' + userId;
  
  // 1. Migrate saved projects
  try {
    const rawProjects = localStorage.getItem(legacyKey) || localStorage.getItem('rw_projects');
    if (rawProjects) {
      const projects = JSON.parse(rawProjects);
      if (Array.isArray(projects) && projects.length > 0) {
        console.log(`[Migration] Migrating ${projects.length} legacy projects to Supabase...`);
        const payload = projects.map(p => ({
          user_id: userId,
          title: p.title || p.stone_name || 'Kitchen Render',
          stone_name: p.stone_name || p.title || 'Stone Worktop',
          stone_brand: p.brand_name || p.stone_brand || 'RatedWorktops',
          stone_category: p.category || p.stone_category || 'Quartz',
          image_url: p.rendered_image || p.image_url || '',
          rendered_image: p.rendered_image || p.image_url || '',
          finish: p.finish || 'Polished',
          created_at: p.created_at || new Date().toISOString()
        }));

        const { error } = await supabaseClient.from('projects').insert(payload);
        if (error) {
          console.warn('[Migration] Projects migration notice:', error.message);
        } else {
          console.log('[Migration] Projects successfully migrated to Supabase!');
        }
      }
    }
  } catch (e) {
    console.warn('[Migration] Projects parse exception:', e);
  }

  // 2. Wipe legacy localStorage keys to ensure 100% Supabase source of truth
  try {
    const keysToRemove = [
      legacyKey,
      'rw_projects',
      'rw_user',
      'ratedworktops_user',
      'rw_brands',
      'rw_local_brands',
      'rw_colours',
      'rw_local_colours',
      'rw_categories',
      'rw_local_categories',
      'rw_settings',
      'ratedworktops_settings'
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.log('[Migration] Legacy localStorage keys cleared successfully.');
  } catch (e) {}
}
