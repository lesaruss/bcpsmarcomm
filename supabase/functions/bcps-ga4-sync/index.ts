// supabase/functions/bcps-ga4-sync/index.ts
//
// Source of the deployed bcps-ga4-sync Edge Function (Supabase project
// fwbhwfxpncrsfhttimna), checked in 2026-09-22 at version 17. It had lived
// only in Supabase until then, so there was no history for a function that
// feeds every number on the Analytics page.
//
// Deploys are still made against Supabase, not from this file. Update both
// together: this copy is the reviewable record, and a change made only here
// does not ship.
//
// This is DENO code, not Node: it imports over jsr: and uses the Deno global,
// neither of which resolves under the app's TypeScript config. "supabase" is
// excluded in tsconfig.json for exactly that reason. Do not remove that
// exclusion - it fails `next build` at the typecheck step, not at runtime.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GA4_PROPERTY_ID = '527326342';

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signingInput = `${header}.${payload}`;
  const pemContents = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signingInput}.${sigB64}`;
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function runGA4Report(accessToken: string, body: object) {
  const resp = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!resp.ok) throw new Error(`GA4 API error ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ---- Campaign tracking (added 2026-09-22) -----------------------------------
//
// Campaigns are deliberately NOT read off the shared allPagesReport below.
// That report is what the department and program aggregates are built from,
// and its metric list/index positions are load-bearing for them. Campaigns get
// their own reports so this block cannot change a single existing number.
//
// Each campaign runs TWO reports:
//   totals    - no dimension, so GA4 de-duplicates users itself.
//   breakdown - dimensioned by pagePath, for the per-path drill-down.
//
// Summing totalUsers across pagePath rows would DOUBLE COUNT anyone who hit
// more than one path in the campaign, which is exactly what a campaign with a
// vanity alias plus a canonical path looks like. Do not "optimize" the totals
// report away by summing the breakdown rows.
const CAMPAIGN_LIMIT = 25;

function campaignPathFilter(paths: string[], includeSubpages: boolean) {
  const expressions: object[] = [];
  for (const raw of paths) {
    const p = String(raw || '').trim().replace(/\/+$/, '');
    if (!p) continue;
    expressions.push({ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: p } } });
    if (includeSubpages) {
      expressions.push({ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: p + '/' } } });
    }
  }
  if (expressions.length === 0) return null;
  return { orGroup: { expressions } };
}

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: secretRows, error: secretErr } = await supabase
      .from('lesaruss_secrets').select('value').eq('key', 'GA4_SERVICE_ACCOUNT_BCPS').single();
    if (secretErr || !secretRows) throw new Error('Could not load GA4 service account key');
    const accessToken = await getAccessToken(secretRows.value);

    const { data: depts } = await supabase
      .from('bcps_departments').select('id, name, slug, website_url').not('website_url', 'is', null);

    // A department is matched to GA4 rows by FULL PATH PREFIX, not by a single
    // URL segment.
    //
    // The previous version keyed departments by the LAST segment of
    // website_url while bucketing GA4 rows by segments[1] (the first segment
    // under /bcps-departments/). Those agree only for a department that sits
    // exactly one level deep. The moment one is nested - Instructional
    // Innovation & Digital Learning at
    // /bcps-departments/academics/instructional-innovation-digital-learning -
    // the key was the last segment while the bucket was "academics", so the
    // two never met: the department dropped out of Top Departments entirely
    // and stopped receiving bcps_department_analytics rows, while its traffic
    // was silently merged into an "academics" bucket matching no department.
    // Measured live 2026-09-22: that bucket held 29,540 sessions.
    //
    // Longest path first, so a nested department wins over a shallower one
    // that shares its prefix.
    const deptPaths: { path: string; id: string; name: string; slug: string }[] = [];
    for (const d of (depts || [])) {
      try {
        const pathname = new URL(d.website_url).pathname.replace(/\/+$/, '');
        if (pathname) deptPaths.push({ path: pathname, id: d.id, name: d.name, slug: d.slug });
      } catch { /* skip bad url */ }
    }
    deptPaths.sort((a, b) => b.path.length - a.path.length);
    const deptForPath = (p: string) =>
      deptPaths.find(dp => p === dp.path || p.startsWith(dp.path + '/')) || null;

    const { data: programs } = await supabase
      .from('bcps_programs').select('name, path').eq('active', true);

    const period = new Date().toISOString().slice(0, 7);

    const [deptReport, overallReport, allPagesReport] = await Promise.all([
      runGA4Report(accessToken, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'engagementRate' }, { name: 'averageSessionDuration' }, { name: 'newUsers' }],
        dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/bcps-departments/' } } },
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 200
      }),
      runGA4Report(accessToken, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
      }),
      runGA4Report(accessToken, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'engagementRate' }, { name: 'averageSessionDuration' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10000
      })
    ]);

    // ---- Departments (aggregate sub-pages under each department path) ----
    const deptAggMap = new Map<string, any>();
    for (const row of (deptReport.rows || [])) {
      const path: string = row.dimensionValues[0].value;
      const segments = path.split('/').filter(Boolean);
      if (segments.length < 2) continue;
      const sessions = parseInt(row.metricValues[0].value);
      const activeUsers = parseInt(row.metricValues[1].value);
      const engagementRate = parseFloat(row.metricValues[2].value);
      const avgDuration = parseFloat(row.metricValues[3].value);
      const newUsers = parseInt(row.metricValues[4].value);

      const matched = deptForPath(path);
      // A page with no department row keeps the previous behavior: bucket by
      // the first segment and derive a display name from it, so district
      // pages that no department owns still appear in Top Departments.
      const key = matched ? matched.slug : segments[1];
      if (!deptAggMap.has(key)) {
        const deptPath = matched ? matched.path : '/bcps-departments/' + segments[1];
        deptAggMap.set(key, {
          dept_id: matched?.id || null,
          name: matched?.name || segments[1].replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          slug: matched?.slug || segments[1],
          // url_slug stays relative to /bcps-departments/ so the Analytics
          // table can print the real path for a nested department instead of
          // a segment that is not where the page lives.
          urlSlug: deptPath.replace(/^\/bcps-departments\//, ''),
          deptPath,
          matched: !!matched,
          sessions: 0, active_users: 0, new_users: 0, totalDuration: 0, totalEngagement: 0, pages: []
        });
      }
      const agg = deptAggMap.get(key)!;
      agg.sessions += sessions; agg.active_users += activeUsers; agg.new_users += newUsers;
      agg.totalDuration += avgDuration * sessions; agg.totalEngagement += engagementRate * sessions;
      agg.pages.push({ path, sessions, active_users: activeUsers, engagement_rate: engagementRate, avg_session_duration: avgDuration, new_users: newUsers });
    }
    const topDepts = Array.from(deptAggMap.values()).map((agg: any) => ({
      slug: agg.slug, url_slug: agg.urlSlug, name: agg.name,
      dept_id: agg.dept_id, path: agg.deptPath, matched: agg.matched,
      sessions: agg.sessions, active_users: agg.active_users, new_users: agg.new_users,
      engagement_rate: agg.sessions > 0 ? agg.totalEngagement / agg.sessions : 0,
      avg_session_duration: agg.sessions > 0 ? agg.totalDuration / agg.sessions : 0,
      pages: agg.pages.sort((a: any, b: any) => b.sessions - a.sessions).slice(0, 20)
    })).sort((a: any, b: any) => b.sessions - a.sessions).slice(0, 100);

    // ---- Programs & Services (aggregate each program page + its sub-pages) ----
    const allPages = (allPagesReport.rows || []).map((r: any) => ({
      path: r.dimensionValues[0].value as string,
      sessions: parseInt(r.metricValues[0].value),
      active_users: parseInt(r.metricValues[1].value),
      engagement_rate: parseFloat(r.metricValues[2].value),
      avg_session_duration: parseFloat(r.metricValues[3].value),
    }));

    const topPrograms = (programs || []).map((p: any) => {
      const base = (p.path as string).replace(/\/$/, '');
      const matched = allPages.filter(pg => pg.path === base || pg.path.startsWith(base + '/'));
      let sessions = 0, active = 0, totDur = 0, totEng = 0;
      for (const pg of matched) {
        sessions += pg.sessions; active += pg.active_users;
        totDur += pg.avg_session_duration * pg.sessions; totEng += pg.engagement_rate * pg.sessions;
      }
      return {
        name: p.name, path: base,
        sessions, active_users: active,
        engagement_rate: sessions > 0 ? totEng / sessions : 0,
        avg_session_duration: sessions > 0 ? totDur / sessions : 0,
        pages: matched.sort((a, b) => b.sessions - a.sessions).slice(0, 20)
      };
    }).sort((a, b) => b.sessions - a.sessions);

    const trafficSources = (overallReport.rows || []).reduce((acc: any, r: any) => {
      acc[r.dimensionValues[0].value] = parseInt(r.metricValues[0].value);
      return acc;
    }, {});

    await supabase.from('bcps_analytics_snapshots').upsert({
      period,
      top_department_pages: topDepts,
      top_program_pages: topPrograms,
      top_school_pages: [],
      top_project_pages: [],
      traffic_sources: trafficSources,
      synced_at: new Date().toISOString()
    }, { onConflict: 'period' });

    const results: string[] = [];
    for (const dept of topDepts) {
      if (!dept.dept_id) continue;
      await supabase.from('bcps_department_analytics').upsert({
        department_id: dept.dept_id, period,
        monthly_visitors: dept.active_users,
        avg_time_seconds: Math.round(dept.avg_session_duration),
        bounce_rate: Math.round((1 - dept.engagement_rate) * 100) / 100,
        mobile_pct: null, traffic_sources: trafficSources,
        synced_at: new Date().toISOString()
      }, { onConflict: 'department_id,period' });
      results.push(dept.url_slug);
    }

    // ---- Campaigns --------------------------------------------------------
    const { data: campaigns } = await supabase
      .from('bcps_campaigns')
      .select('id, name, slug, page_paths, include_subpages')
      .eq('status', 'active')
      .order('sort_order')
      .limit(CAMPAIGN_LIMIT);

    const campaignResults: any[] = [];
    for (const c of (campaigns || [])) {
      const filter = campaignPathFilter(c.page_paths || [], c.include_subpages !== false);
      if (!filter) {
        campaignResults.push({ slug: c.slug, skipped: 'no page_paths configured' });
        continue;
      }

      try {
        const [totalsReport, breakdownReport] = await Promise.all([
          runGA4Report(accessToken, {
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            metrics: [{ name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }, { name: 'userEngagementDuration' }],
            dimensionFilter: filter
          }),
          runGA4Report(accessToken, {
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }, { name: 'userEngagementDuration' }],
            dimensionFilter: filter,
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 200
          })
        ]);

        const t = totalsReport.rows?.[0]?.metricValues;
        const uniqueVisitors = t ? parseInt(t[0].value) : 0;
        const pageViews      = t ? parseInt(t[1].value) : 0;
        const sessions       = t ? parseInt(t[2].value) : 0;
        const engagementSecs = t ? parseFloat(t[3].value) : 0;

        // Average time on page = total engagement time / page views. GA4
        // retired Universal Analytics' avgTimeOnPage; engagement time per
        // view is its documented successor and is the number the GA4 UI
        // shows for a page. Components are stored alongside it so this is
        // re-derivable rather than a figure nobody can check.
        const avgTime = pageViews > 0 ? engagementSecs / pageViews : 0;

        const pages = (breakdownReport.rows || []).map((r: any) => {
          const pv = parseInt(r.metricValues[1].value);
          const eng = parseFloat(r.metricValues[3].value);
          return {
            path: r.dimensionValues[0].value,
            unique_visitors: parseInt(r.metricValues[0].value),
            page_views: pv,
            sessions: parseInt(r.metricValues[2].value),
            engagement_seconds: eng,
            avg_time_seconds: pv > 0 ? eng / pv : 0,
          };
        });

        await supabase.from('bcps_campaign_analytics').upsert({
          campaign_id: c.id,
          period,
          unique_visitors: uniqueVisitors,
          page_views: pageViews,
          avg_time_seconds: Math.round(avgTime * 100) / 100,
          sessions,
          engagement_seconds: Math.round(engagementSecs * 100) / 100,
          pages,
          synced_at: new Date().toISOString()
        }, { onConflict: 'campaign_id,period' });

        campaignResults.push({
          slug: c.slug,
          unique_visitors: uniqueVisitors,
          page_views: pageViews,
          avg_time_seconds: Math.round(avgTime * 100) / 100,
          paths_with_traffic: pages.filter((p: any) => p.page_views > 0).length,
          paths_configured: (c.page_paths || []).length,
        });
      } catch (err: any) {
        // One bad campaign must not take the whole sync down with it.
        campaignResults.push({ slug: c.slug, error: err.message });
      }
    }

    return new Response(JSON.stringify({
      success: true, period, departments_synced: results.length,
      top_departments: topDepts.length,
      departments_matched: topDepts.filter(d => d.matched).length,
      departments_unmatched: topDepts.filter(d => !d.matched).map(d => d.url_slug),
      top_programs: topPrograms.length,
      programs_with_traffic: topPrograms.filter(p => p.sessions > 0).length,
      campaigns_synced: campaignResults.filter(c => !c.error && !c.skipped).length,
      campaigns: campaignResults
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
});
