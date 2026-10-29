// supabase/functions/bcps-gtm-setup/index.ts
//
// Builds and publishes the District's own Google Tag Manager container for
// browardschools.com through the Tag Manager API (added 2026-10-29).
//
// Why a District container at all: GTM-P3BGC7, the container on every
// browardschools.com page, is Finalsite's, shared across its clients
// (finalsite.com loads it too), so the District can never own it. Sean,
// 2026-10-29: the District runs its own, owned by bcps.pio@gmail.com, next to
// Finalsite's, the way mnps.org, detroitk12.org and ccsd.net already do.
// bcps.pio created GTM-NTGC6X38 and gave the BCPS analytics service account
// access, so this function can build it without anyone sharing a login.
//
// What the container does, and nothing else:
//   - Counts clicks on Finalsite document-library links
//     (/fs/resource-manager/view/...) as GA4 file_download. Finalsite redirects
//     those on the server, so GA4's own download tracking never sees them.
//   - Counts plays of the Finalsite video player as GA4 video_start /
//     video_progress / video_complete. GA4 only tracks YouTube on its own.
// It sends NO page_view: Finalsite's container already does, and a second one
// would double every page view in the District's reports.
//
// Every tag is limited to www.browardschools.com, so if Finalsite adds the
// container to school sites too, their events never land in the District
// property. bcps-ga4-sync (v41) reads these events with no code change.
//
// POST {"action": "inspect"}  - what the service account can see. Read only.
// POST {"action": "build"}    - creates or updates the variables, triggers and
//                               tags in the Default Workspace. Safe to rerun.
// POST {"action": "publish"}  - versions the workspace and publishes it.
//
// Same caller check as bcps-ga4-sync: the bearer must be the project service
// key. Deploys are made against Supabase; keep this file identical to the
// deployed copy, and keep backslash-u sequences out of it (the deploy
// connector rewrites them, see SUPABASE-DEPLOY-JSR-TIMEOUT-USE-NPM-IMPORT).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CONTAINER_PUBLIC_ID = 'GTM-NTGC6X38';
// GA4 property 527326342 (browardschools.com), the property BCPS MarComm reads.
const MEASUREMENT_ID = 'G-B601R4LMEG';
const HOSTNAME = 'www.browardschools.com';
const API = 'https://tagmanager.googleapis.com/tagmanager/v2';

const SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.publish',
  'https://www.googleapis.com/auth/analytics.readonly',
].join(' ');

// The listener tested 2026-10-29 in Chromium against the Finalsite player from
// the Referendum 2026 page, and published in the guide
// bcps-ga4-download-video-tracking. String.raw keeps the regex backslash.
const VIDEO_LISTENER = String.raw`<script>
(function () {
  if (window.__bcpsVideoTracking) return;
  window.__bcpsVideoTracking = true;
  window.dataLayer = window.dataLayer || [];

  function videoTitle(v) {
    var t = v.getAttribute('data-resource-title') || v.getAttribute('title') || v.getAttribute('aria-label') || '';
    return t.replace(/\.(mp4|mov|m4v|webm)$/i, '') || document.title;
  }

  function send(eventName, v, percent) {
    window.dataLayer.push({
      event: eventName,
      video_title: videoTitle(v),
      video_url: location.origin + location.pathname,
      video_provider: 'finalsite',
      video_percent: percent
    });
  }

  document.addEventListener('play', function (e) {
    var v = e.target;
    if (!(v instanceof HTMLVideoElement) || v.__bcpsStarted) return;
    v.__bcpsStarted = true;
    v.__bcpsMarks = {};
    send('video_start', v, 0);
  }, true);

  document.addEventListener('timeupdate', function (e) {
    var v = e.target;
    if (!(v instanceof HTMLVideoElement) || !v.__bcpsStarted || !v.duration) return;
    var pct = (v.currentTime / v.duration) * 100;
    [10, 25, 50, 75].forEach(function (mark) {
      if (pct >= mark && !v.__bcpsMarks[mark]) {
        v.__bcpsMarks[mark] = true;
        send('video_progress', v, mark);
      }
    });
  }, true);

  document.addEventListener('ended', function (e) {
    var v = e.target;
    if (!(v instanceof HTMLVideoElement) || v.__bcpsEnded) return;
    v.__bcpsEnded = true;
    send('video_complete', v, 100);
  }, true);
})();
</script>`;

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (s: string) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signingInput = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({
    iss: sa.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  }))}`;
  const pem = sa.private_key.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\n/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function callerAllowed(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const sent = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!sent) return false;
  if (SUPABASE_SERVICE_KEY && sent === SUPABASE_SERVICE_KEY) return true;
  const { data } = await supabase.from('lesaruss_secrets').select('value').eq('key', 'SUPABASE_SERVICE_ROLE_KEY').maybeSingle();
  return !!data?.value && sent === data.value;
}

// ---- GTM entity helpers ----------------------------------------------------
const tpl = (key: string, value: string) => ({ type: 'template', key, value });
const bool = (key: string, value: boolean) => ({ type: 'boolean', key, value: String(value) });
const cond = (type: string, arg0: string, arg1: string) => ({ type, parameter: [tpl('arg0', arg0), tpl('arg1', arg1)] });
const onSite = cond('equals', '{{Page Hostname}}', HOSTNAME);
const paramTable = (rows: [string, string][]) => ({
  type: 'list', key: 'eventSettingsTable',
  list: rows.map(([k, v]) => ({ type: 'map', map: [tpl('parameter', k), tpl('parameterValue', v)] })),
});

function ga4Event(name: string, eventName: string, params: [string, string][], triggerId: string) {
  return {
    name, type: 'gaawe', firingTriggerId: [triggerId],
    parameter: [
      tpl('eventName', eventName),
      tpl('measurementIdOverride', MEASUREMENT_ID),
      paramTable(params),
    ],
  };
}

// TEMPORARY test relay (2026-10-29), removed once the pre-publish test passes.
// The sandbox that tests the container cannot reach googletagmanager.com, so
// GET ?relay=<url> returns these public Google scripts and nothing else.
function relayAllowed(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.hostname !== 'www.googletagmanager.com') return false;
    const id = u.searchParams.get('id');
    if (u.pathname === '/gtm.js') return id === CONTAINER_PUBLIC_ID || id === 'GTM-P3BGC7';
    if (u.pathname === '/gtag/js') return id === MEASUREMENT_ID;
    return false;
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 1), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method === 'GET') {
    const target = new URL(req.url).searchParams.get('relay') || '';
    if (!relayAllowed(target)) return json({ success: false, error: 'not allowed' }, 403);
    const r = await fetch(target);
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/javascript' } });
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    if (!(await callerAllowed(req, supabase))) return json({ success: false, error: 'unauthorized' }, 401);

    let action = 'inspect';
    try { action = (await req.json())?.action || 'inspect'; } catch { /* default */ }

    const { data: secret } = await supabase.from('lesaruss_secrets').select('value').eq('key', 'GA4_SERVICE_ACCOUNT_BCPS').single();
    if (!secret) throw new Error('Could not load the service account key');
    const token = await getAccessToken(secret.value);

    const gtm = async (method: string, path: string, body?: unknown) => {
      const r = await fetch(path.startsWith('http') ? path : `${API}/${path}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`GTM ${method} ${path} -> ${r.status}: ${text.slice(0, 600)}`);
      return text ? JSON.parse(text) : {};
    };

    // Which GA4 properties the service account can see, which measurement IDs
    // feed the District property, and whether Finalsite's own events
    // (file_downloads_by_extension, resource_video_played, ...) ever reached
    // it. Read only. Added after the pre-publish test showed Finalsite's
    // container sending those events to G-B601R4LMEG while property 527326342
    // has never reported them.
    if (action === 'ga4') {
      const get = async (url: string) => {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { status: r.status, body: await r.json().catch(() => null) };
      };
      const summaries = await get('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
      const streams = await get('https://analyticsadmin.googleapis.com/v1beta/properties/527326342/dataStreams');
      const report = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/527326342:runReport', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: '2024-01-01', endDate: 'today' }],
          dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
          dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: [
            'file_downloads_by_extension', 'resource_video_played', 'resource_video_complete', 'click_accordion', 'internal_link_click', 'external_link_click',
          ] } } },
        }),
      });
      return json({
        success: true,
        account_summaries: summaries.status === 200
          ? (summaries.body.accountSummaries || []).map((a: any) => ({ account: a.account, name: a.displayName, properties: (a.propertySummaries || []).map((p: any) => `${p.property} ${p.displayName}`) }))
          : summaries,
        district_streams: streams.status === 200
          ? (streams.body.dataStreams || []).map((s: any) => ({ name: s.displayName, measurementId: s.webStreamData?.measurementId, uri: s.webStreamData?.defaultUri }))
          : streams,
        finalsite_events_in_527326342: await report.json(),
      });
    }

    // Find the container by its public ID across every account the service
    // account can see.
    const { account: accounts = [] } = await gtm('GET', 'accounts');
    let container: any = null;
    for (const a of accounts) {
      const { container: cs = [] } = await gtm('GET', `${a.path}/containers`);
      container = cs.find((c: any) => c.publicId === CONTAINER_PUBLIC_ID) || container;
    }
    if (!container) {
      return json({ success: false, error: `${CONTAINER_PUBLIC_ID} is not visible to this service account`, accounts_visible: accounts.map((a: any) => a.name) }, 404);
    }
    const { workspace: workspaces = [] } = await gtm('GET', `${container.path}/workspaces`);
    const ws = workspaces.find((w: any) => w.name === 'Default Workspace') || workspaces[0];

    const list = async () => {
      const [tags, triggers, variables, builtins] = await Promise.all([
        gtm('GET', `${ws.path}/tags`), gtm('GET', `${ws.path}/triggers`),
        gtm('GET', `${ws.path}/variables`), gtm('GET', `${ws.path}/built_in_variables`),
      ]);
      return { tags: tags.tag || [], triggers: triggers.trigger || [], variables: variables.variable || [], builtins: builtins.builtInVariable || [] };
    };

    if (action === 'inspect') {
      const cur = await list();
      return json({
        success: true, container: { publicId: container.publicId, name: container.name, usageContext: container.usageContext, path: container.path },
        workspace: ws.name,
        tags: cur.tags.map((t: any) => `${t.name} (${t.type})`),
        triggers: cur.triggers.map((t: any) => `${t.name} (${t.type})`),
        variables: cur.variables.map((v: any) => v.name),
        builtins: cur.builtins.map((b: any) => b.type),
      });
    }

    if (action === 'build') {
      let cur = await list();
      const needBuiltins = ['pageHostname', 'pageUrl', 'clickUrl', 'clickText', 'event'].filter(t => !cur.builtins.some((b: any) => b.type === t));
      if (needBuiltins.length) {
        await gtm('POST', `${ws.path}/built_in_variables?${needBuiltins.map(t => `type=${t}`).join('&')}`);
      }

      // Create, or update in place when an entity of that name exists, so a
      // rerun converges instead of duplicating.
      const upsert = async (kind: 'tags' | 'triggers' | 'variables', body: any) => {
        const existing = (cur as any)[kind].find((e: any) => e.name === body.name);
        return existing ? gtm('PUT', existing.path, body) : gtm('POST', `${ws.path}/${kind}`, body);
      };

      for (const field of ['video_title', 'video_url', 'video_provider', 'video_percent']) {
        await upsert('variables', {
          name: `DLV - ${field}`, type: 'v',
          parameter: [{ type: 'integer', key: 'dataLayerVersion', value: '2' }, bool('setDefaultValue', false), tpl('name', field)],
        });
      }

      const docTrigger = await upsert('triggers', {
        name: 'Click - Finalsite document link', type: 'linkClick',
        waitForTags: { type: 'boolean', value: 'true' },
        waitForTagsTimeout: { type: 'template', value: '2000' },
        checkValidation: { type: 'boolean', value: 'false' },
        autoEventFilter: [onSite],
        filter: [cond('contains', '{{Click URL}}', '/fs/resource-manager/view/'), onSite],
      });
      const pageTrigger = await upsert('triggers', {
        name: 'Page View - browardschools.com', type: 'pageview', filter: [onSite],
      });
      const videoTrigger = await upsert('triggers', {
        name: 'Event - Finalsite video', type: 'customEvent',
        customEventFilter: [cond('matchRegex', '{{_event}}', '^video_(start|progress|complete)$')],
        filter: [onSite],
      });

      cur = await list();
      await upsert('tags', ga4Event('GA4 - Finalsite document download', 'file_download',
        [['link_url', '{{Click URL}}'], ['link_text', '{{Click Text}}']], docTrigger.triggerId));
      await upsert('tags', {
        name: 'Finalsite video listener', type: 'html', firingTriggerId: [pageTrigger.triggerId],
        parameter: [tpl('html', VIDEO_LISTENER), bool('supportDocumentWrite', false)],
      });
      await upsert('tags', ga4Event('GA4 - Finalsite video', '{{Event}}', [
        ['video_title', '{{DLV - video_title}}'], ['video_url', '{{DLV - video_url}}'],
        ['video_provider', '{{DLV - video_provider}}'], ['video_percent', '{{DLV - video_percent}}'],
      ], videoTrigger.triggerId));

      const after = await list();
      return json({
        success: true, workspace: ws.name,
        tags: after.tags.map((t: any) => ({ name: t.name, type: t.type, triggers: t.firingTriggerId, parameter: t.parameter })),
        triggers: after.triggers.map((t: any) => ({ name: t.name, type: t.type, id: t.triggerId })),
        variables: after.variables.map((v: any) => v.name),
        builtins: after.builtins.map((b: any) => b.type),
      });
    }

    // Saves the workspace as a version WITHOUT publishing, and returns the
    // "Latest" environment's preview parameters, so the exact build can be
    // loaded and tested before it reaches a single visitor.
    if (action === 'version') {
      const created = await gtm('POST', `${ws.path}:create_version`, {
        name: 'Finalsite document and video tracking (pre-publish test)',
        notes: 'Built by bcps-gtm-setup (BCPS MarComm). Not published.',
      });
      if (created.compilerError || !created.containerVersion) return json({ success: false, created }, 422);
      const { environment: envs = [] } = await gtm('GET', `${container.path}/environments`);
      const latest = envs.find((e: any) => e.type === 'latest');
      return json({
        success: true,
        version: created.containerVersion.containerVersionId,
        tags: (created.containerVersion.tag || []).map((t: any) => ({ name: t.name, type: t.type, parameter: t.parameter, firingTriggerId: t.firingTriggerId })),
        preview: latest ? { gtm_auth: latest.authorizationCode, gtm_preview: `env-${latest.environmentId}` } : null,
      });
    }

    if (action === 'publish') {
      const created = await gtm('POST', `${ws.path}:create_version`, {
        name: 'Finalsite document and video tracking',
        notes: 'Built by bcps-gtm-setup (BCPS MarComm). Document-library downloads and Finalsite video plays to G-B601R4LMEG, www.browardschools.com only, no page_view.',
      });
      if (created.compilerError || !created.containerVersion) return json({ success: false, created }, 422);
      const published = await gtm('POST', `${created.containerVersion.path}:publish`);
      return json({
        success: true,
        version: published.containerVersion?.containerVersionId,
        tags: (published.containerVersion?.tag || []).map((t: any) => t.name),
      });
    }

    return json({ success: false, error: `unknown action ${action}` }, 400);
  } catch (err: any) {
    return json({ success: false, error: err.message }, 500);
  }
});
