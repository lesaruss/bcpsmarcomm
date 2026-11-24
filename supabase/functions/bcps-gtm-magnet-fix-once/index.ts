// One-time fix, 2026-11-24 (Logan, Sean approved): Brkthru built the Magnet School Choice
// Floodlight tags in the Default Workspace of GTM-NTGC6X38. Applies the two District rules:
//   1. every tag they added is named "MAGNET | ..."
//   2. the Floodlight base tag (was on Initialization - All Pages) fires only on magnet-programs pages.
// POST {} = plan (no changes). POST {"apply":true} = apply. POST {"publish":true} = version and publish the
// workspace (Sean, 2026-11-24: "I give you permission"). Safe to rerun.
// Apply also fixes the Apply Now trigger: the live link is /bcps-departments/school-choice123 on
// www.browardschools.com, not the finalsite.com staging address Brkthru matched.
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL_ = Deno.env.get('SUPABASE_URL')!, KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API = 'https://tagmanager.googleapis.com/tagmanager/v2';
const PREFIX = 'MAGNET | ';
const MAGNET_PATH_RE = '^/bcps-departments/academics/magnet-programs(/|$)';
const b64 = (s: string) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
async function token(saJson: string) {
  const sa = JSON.parse(saJson), now = Math.floor(Date.now() / 1000);
  const input = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/tagmanager.readonly https://www.googleapis.com/auth/tagmanager.edit.containers https://www.googleapis.com/auth/tagmanager.edit.containerversions https://www.googleapis.com/auth/tagmanager.publish',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now }))}`;
  const pem = sa.private_key.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\n/g, '');
  const k = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k, new TextEncoder().encode(input));
  const jwt = `${input}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const d = await r.json(); if (!d.access_token) throw new Error('token error'); return d.access_token;
}
Deno.serve(async (req: Request) => {
  const out = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const sb = createClient(URL_, KEY);
    const sent = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const { data: k2 } = await sb.from('lesaruss_secrets').select('value').eq('key', 'SUPABASE_SERVICE_ROLE_KEY').maybeSingle();
    if (!sent || (sent !== KEY && sent !== k2?.value)) return out({ success: false, error: 'unauthorized' }, 401);
    const body: any = await req.json().catch(() => ({}));
    const apply = body.apply === true;
    const publish = body.publish === true;
    const { data: secret } = await sb.from('lesaruss_secrets').select('value').eq('key', 'GA4_SERVICE_ACCOUNT_BCPS').single();
    const tk = await token(secret!.value);
    const gtm = async (m: string, p: string, b?: unknown) => {
      for (let i = 0; ; i++) {
        const r = await fetch(p.startsWith('http') ? p : `${API}/${p}`, { method: m, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
        if (r.status === 429 && i < 5) { await r.body?.cancel(); await new Promise(x => setTimeout(x, 12000)); continue; }
        const t = await r.text(); if (!r.ok) throw new Error(`GTM ${m} ${p} -> ${r.status}: ${t.slice(0, 500)}`); return t ? JSON.parse(t) : {};
      }
    };
    const { account: accts = [] } = await gtm('GET', 'accounts');
    let container: any;
    for (const a of accts) { const { container: cs = [] } = await gtm('GET', `${a.path}/containers`); container = cs.find((c: any) => c.publicId === 'GTM-NTGC6X38') || container; }
    if (!container) return out({ success: false, error: 'container not visible' }, 404);
    const { workspace: wss = [] } = await gtm('GET', `${container.path}/workspaces`);
    const ws = wss.find((w: any) => w.name === 'Default Workspace');
    const live = await gtm('GET', `${container.path}/versions:live`);
    const liveTagIds = new Set((live.tag || []).map((t: any) => t.tagId));
    const { tag: tags = [] } = await gtm('GET', `${ws.path}/tags`);
    const { trigger: trigs = [] } = await gtm('GET', `${ws.path}/triggers`);
    // Only tags Brkthru added: Floodlight types, not live, not already prefixed.
    const mine = tags.filter((t: any) => ['dest_dc', 'flc'].includes(t.type) && !liveTagIds.has(t.tagId));
    const plan: string[] = [];
    let trig = trigs.find((t: any) => t.name === `${PREFIX}Initialization - magnet-programs pages`);
    const base = mine.find((t: any) => t.type === 'dest_dc');
    if (base && !trig) plan.push('create trigger "MAGNET | Initialization - magnet-programs pages"');
    if (base) plan.push(`base tag "${base.name}" -> fires only on that trigger (was ${JSON.stringify(base.firingTriggerId)})`);
    for (const t of mine) if (!t.name.startsWith(PREFIX)) plan.push(`rename "${t.name}" -> "${PREFIX}${t.name}"`);
    const applyNow = trigs.find((t: any) => t.name === 'Floodlights - Apply Now Links - Trigger');
    const clickCond = (applyNow?.filter || []).find((c: any) => (c.parameter || []).some((p: any) => p.key === 'arg0' && p.value === '{{Click URL}}'));
    const clickArg1 = clickCond?.parameter.find((p: any) => p.key === 'arg1');
    const needsClickFix = !!clickArg1 && clickArg1.value.includes('finalsite.com');
    if (needsClickFix) plan.push(`Apply Now trigger: Click URL contains "${clickArg1.value}" -> "/bcps-departments/school-choice123"`);
    if (publish) {
      const created = await gtm('POST', `${ws.path}:create_version`, {
        name: 'Magnet School Choice Floodlights (Brkthru)',
        notes: 'Brkthru Digital Floodlight tags DC-18130941 for the Magnet School Choice campaign. Reviewed by BCPS MarComm: tags named MAGNET |, fire only on magnet-programs pages, no existing tags changed. Published by Logan with Sean approval 2026-11-24.' });
      if (created.compilerError || !created.containerVersion) return out({ success: false, created }, 422);
      const pub = await gtm('POST', `${created.containerVersion.path}:publish`);
      return out({ success: true, published: true, version: pub.containerVersion?.containerVersionId, tags: (pub.containerVersion?.tag || []).map((t: any) => t.name) });
    }
    if (!apply) return out({ success: true, applied: false, workspace: ws.name, plan });
    if (needsClickFix) { clickArg1.value = '/bcps-departments/school-choice123'; await gtm('PUT', applyNow.path, applyNow); }
    if (base && !trig) {
      trig = await gtm('POST', `${ws.path}/triggers`, { name: `${PREFIX}Initialization - magnet-programs pages`, type: 'init',
        filter: [{ type: 'matchRegex', parameter: [{ type: 'template', key: 'arg0', value: '{{Page Path}}' }, { type: 'template', key: 'arg1', value: MAGNET_PATH_RE }] }] });
    }
    const done: string[] = [];
    for (const t of mine) {
      const upd: any = { ...t };
      if (!t.name.startsWith(PREFIX)) upd.name = `${PREFIX}${t.name}`;
      if (t.type === 'dest_dc' && trig) upd.firingTriggerId = [trig.triggerId];
      await gtm('PUT', t.path, upd); done.push(`${t.name} -> ${upd.name}`);
    }
    return out({ success: true, applied: true, done, trigger: trig?.triggerId });
  } catch (e: any) { return out({ success: false, error: e.message }, 500); }
});
