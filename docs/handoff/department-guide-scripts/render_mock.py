import html as H
import json

BASE = '/tmp/claude-0/-home-user-bcpsmarcomm/9cd69df2-9574-5317-a1e6-9dedb578c0ca/scratchpad/ece-guide/'
g = json.load(open(BASE + 'def-v3.json'))
SHOT = 'https://fwbhwfxpncrsfhttimna.supabase.co/storage/v1/object/public/bcps-audit-shots/e07f7eda-fb6d-4a45-ac78-91e2c20272ab/41071562-1c8c-44dd-bc6c-2d1dda342609/2026-10-29T20-55-01-487Z-desktop.jpg'
AUDIT = {'pages': 37, 'avg': 91, 'fix': 64, 'review': 64, 'date': 'Oct 29'}


def allowed(f, viewer):
    return viewer == 'all' or not f or any(a in viewer for a in f)


def render(name, viewer):
    over = [s for s in g['overview'] if allowed(s.get('for'), viewer)]
    tabs = [t for t in g['tabs'] if allowed(t.get('for'), viewer)]
    hero = next(s for s in over if s['layout'] == 'hero')
    tiles = [s for s in over if s['layout'] == 'tile']
    rest = [s for s in over if s['layout'] not in ('hero', 'tile')]
    show_audit = viewer == 'all' or 'wcm' in viewer

    audit = f'''<div class="guide-audit" role="group" aria-label="Audit snapshot"><div class="guide-audit-score ok"><b>{AUDIT['avg']}</b><span>average page score</span></div><dl class="guide-audit-facts"><div><dt>Pages audited</dt><dd>{AUDIT['pages']}</dd></div><div><dt>To fix</dt><dd>{AUDIT['fix']}</dd></div><div><dt>To review</dt><dd>{AUDIT['review']}</dd></div></dl><p class="guide-audit-note">The latest audit of each page, {AUDIT['date']}.</p></div>'''

    parts = [f'''<section class="home-dept guide-sec guide-hero"><div class="guide-hero-text"><h2 class="guide-h2">{H.escape(hero['title'])}</h2><div class="guide-body">{hero['html']}</div></div><a class="guide-hero-shot" href="#"><img src="{SHOT}" alt="The top of the Early Childhood Education page"><span class="guide-hero-cap">Your page, as of Oct 29</span></a></section>''']
    parts.append('<div class="guide-tiles">' + ''.join(
        f'''<section class="home-dept guide-sec guide-tile"><h3 class="home-card-title">{H.escape(s['title'])}</h3>{audit if (s['id'] == 'wcm-tools' and show_audit) else ''}<div class="guide-body">{s['html']}</div></section>''' for s in tiles) + '</div>')
    parts += [f'''<section class="home-dept guide-sec"><h3 class="home-card-title">{H.escape(s['title'])}</h3><div class="guide-body">{s['html']}</div></section>''' for s in rest]

    steps = 0
    rail = '<li><button class="guide-tab on">Overview</button></li>'
    for t in tabs:
        badge = ''
        if t.get('step'):
            steps += 1
            badge = f'<span class="guide-step">Step {steps}</span>'
        rail += f'<li><button class="guide-tab">{badge}{H.escape(t["label"])}</button></li>'
    rail += '<li><button class="guide-tab">What’s New</button></li>'

    page = f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="file:///home/user/bcpsmarcomm/src/app/globals.css"></head><body>
<div class="home" style="padding:24px"><div class="guide"><div class="guide-head"><div class="guide-head-text"><div class="home-hero-label">BCPS MarComm</div><h1 class="guide-title">{H.escape(g['title'])}</h1><p class="guide-meta">For {H.escape(g['audience'])}. Updated November 3, 2026, {H.escape(g['cadence'])}.</p></div><div class="guide-head-tools"><input type="search" class="guide-search" placeholder="Search the guide"></div></div>
<div class="guide-cols"><nav class="guide-rail"><ul class="guide-tabs">{rail}</ul></nav><div class="guide-main">{''.join(parts)}</div></div></div></div></body></html>'''
    open(BASE + f'mock-{name}.html', 'w').write(page)


render('admin', 'all')
render('wcm', {'wcm'})
render('director', {'director'})
render('staff', set())
print('ok')
