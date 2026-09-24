/* Shared team identity used by every non-Tekken board. */
import { supabase } from './supabase-client.ts';

export const SHARED_TEAM_PROFILES_ID = 'ddam-cup-shared-team-profiles-v1';
const DEFAULT_TAGS = ['ALP', 'BRV', 'CHR', 'DLT', 'ECH', 'FOX'];

function cleanProfile(value) {
  if (!value || typeof value !== 'object') return null;
  const tag = String(value.tag || '').trim().toUpperCase();
  if (!tag) return null;
  return {
    tag,
    name: String(value.name || '').trim(),
    logo: typeof value.logo === 'string' && value.logo ? value.logo : null,
  };
}

export function normaliseProfiles(state) {
  const source = Array.isArray(state?.teams) ? state.teams : [];
  const profiles = {};
  source.map(cleanProfile).filter(Boolean).forEach(profile => { profiles[profile.tag] = profile; });
  return profiles;
}

export function applySharedProfiles(teams, profiles = {}) {
  return (teams || []).map(team => {
    const profile = profiles[String(team.tag || '').toUpperCase()];
    if (!profile) return team;
    return {
      ...team,
      name: profile.name || team.name,
      logo: Object.prototype.hasOwnProperty.call(profile, 'logo') ? profile.logo : team.logo,
    };
  });
}

export function profileForTeam(team, profiles = {}) {
  return profiles[String(team?.tag || '').toUpperCase()] || null;
}

export async function loadSharedProfiles() {
  if (!supabase) return {};
  const { data, error } = await supabase.from('tournaments').select('state').eq('id', SHARED_TEAM_PROFILES_ID).maybeSingle();
  if (error) throw error;
  return normaliseProfiles(data?.state);
}

export function subscribeSharedProfiles(onChange) {
  if (!supabase) { onChange({}); return () => {}; }
  let active = true;
  loadSharedProfiles().then(profiles => { if (active) onChange(profiles); }).catch(error => console.warn('[shared-profiles] read failed:', error));
  const channel = supabase.channel(`tournament:${SHARED_TEAM_PROFILES_ID}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${SHARED_TEAM_PROFILES_ID}` }, payload => {
      if (!active) return;
      onChange(payload.eventType === 'DELETE' ? {} : normaliseProfiles(payload.new?.state));
    })
    .subscribe();
  return () => { active = false; void supabase.removeChannel(channel); };
}

export async function saveSharedProfiles(changes) {
  if (!supabase) throw new Error('Supabase is not configured');
  const current = await loadSharedProfiles();
  const next = { ...current };
  Object.values(changes || {}).map(cleanProfile).filter(Boolean).forEach(profile => { next[profile.tag] = profile; });
  const teams = DEFAULT_TAGS.map(tag => next[tag]).filter(Boolean);
  const { error } = await supabase.from('tournaments').upsert({
    id: SHARED_TEAM_PROFILES_ID,
    state: { version: 1, teams },
    updated: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
  return next;
}

export async function saveSharedProfile(profile) {
  return saveSharedProfiles({ [profile.tag]: profile });
}
