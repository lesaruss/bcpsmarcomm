'use client'

// Google Tag Manager guide (Sean, 2026-11-05): "one page that's visually easy
// to understand, audio if needed... click here, next thing you want to do is,
// and this is why." A guided view (canon-sean-interface-defaults): one slide
// at a time on a dark stage, Back / N of M / Next, dots, arrow keys, the
// address bar carries the slide (?s=). Narration follows the WCM Registration
// deck: one small play button beside Next, an mp3 per slide; once playing, it
// keeps playing as you move on. Content lives in ./slides.ts. Signed-in only
// (not in middleware's public list), outside the (bcps) shell so it is full
// screen.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import './gtm-guide.css'
import { SLIDES, type Path, type Slide } from './slides'

const LOGO = 'https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png'

// The slides a viewer walks through: the shared opening, then one path, then
// the close. Before a path is picked, the department path is shown in the
// count so the numbers never jump.
function routeFor(path: Path): Slide[] {
  return SLIDES.filter(s => !s.path || s.path === path)
}

// Steps a visual through its numbered spots, one every 1.8s, so the eye is
// led to each click in order.
function useCycle(n: number, key: string) {
  const [i, setI] = useState(0)
  useEffect(() => {
    setI(0)
    if (n < 2) return
    const t = setInterval(() => setI(v => (v + 1) % n), 1800)
    return () => clearInterval(t)
  }, [n, key])
  return i
}

function Spot({ n, on, label }: { n: number; on: boolean; label?: string }) {
  return (
    <span className={`gg-spot${on ? ' gg-spot-on' : ''}`} aria-hidden="true">
      <span className="gg-spot-n">{n}</span>{label && on && <span className="gg-spot-label">{label}</span>}
    </span>
  )
}

function Window({ title, children, tone = 'gtm' }: { title: string; children: React.ReactNode; tone?: 'gtm' | 'app' | 'mail' }) {
  return (
    <div className={`gg-window gg-window-${tone}`}>
      <div className="gg-window-bar"><i /><i /><i /><span>{title}</span></div>
      <div className="gg-window-body">{children}</div>
    </div>
  )
}

function Visual({ id, onPick }: { id: string; onPick: (p: Path) => void }) {
  const steps: Record<string, number> = { invite: 4, publish: 3, close: 3, record: 2, golive: 4, what: 3 }
  const c = useCycle(steps[id] || 0, id)

  switch (id) {
    case 'cover':
      return (
        <div className="gg-cover-art">
          <div className="gg-cover-site">
            <div className="gg-site-bar"><span className="gg-dot" /><span>www.browardschools.com</span></div>
            <div className="gg-site-lines"><i /><i style={{ width: '70%' }} /><i style={{ width: '85%' }} /></div>
            <div className="gg-cover-container">
              <div className="gg-chip-blue">GTM-NTGC6X38</div>
              <div className="gg-cover-caption">The District&apos;s Tag Manager</div>
            </div>
          </div>
          <div className="gg-cover-badges">
            <span>One container</span><span>One record</span><span>Access with an end date</span>
          </div>
        </div>
      )
    case 'what':
      return (
        <div className="gg-flow">
          <div className={`gg-flow-node${c === 0 ? ' gg-lit' : ''}`}><b>Every page</b><span>browardschools.com</span></div>
          <div className="gg-flow-arrow" />
          <div className={`gg-flow-node gg-flow-box${c === 1 ? ' gg-lit' : ''}`}><b>Tag Manager</b><span>a box of tags</span>
            <div className="gg-mini-tags"><i>Tag</i><i>Tag</i><i>Tag</i></div></div>
          <div className="gg-flow-arrow" />
          <div className={`gg-flow-col${c === 2 ? ' gg-lit' : ''}`}>
            <div className="gg-flow-dest">Google Analytics</div>
            <div className="gg-flow-dest">Google Ads</div>
            <div className="gg-flow-dest">Meta</div>
          </div>
        </div>
      )
    case 'why':
      return (
        <div className="gg-cards3">
          <div className="gg-card"><div className="gg-ic">&#9776;</div><b>Runs on every page</b><span>One tag can reach all of browardschools.com.</span></div>
          <div className="gg-card"><div className="gg-ic">&#8599;</div><b>Decides what leaves our site</b><span>Tags choose what information goes to outside tools.</span></div>
          <div className="gg-card"><div className="gg-ic">&#9203;</div><b>Access lingers</b><span>Without an end date, agency access outlives the campaign.</span></div>
        </div>
      )
    case 'rule':
      return (
        <div className="gg-cards3">
          <div className="gg-card gg-card-muted"><span className="gg-tag gg-tag-pink">Not ours</span><b>GTM-P3BGC7</b><span>Finalsite&apos;s container, shared with their other clients. Can&apos;t be given out.</span></div>
          <div className="gg-card gg-card-hero"><span className="gg-tag gg-tag-green">Ours</span><b>GTM-NTGC6X38</b><span>The District&apos;s container. Every agency works here, in its own workspace.</span></div>
          <div className="gg-card gg-card-muted"><span className="gg-tag gg-tag-gray">Never</span><b>New containers</b><span>No department creates its own Tag Manager.</span></div>
        </div>
      )
    case 'choose':
      return (
        <div className="gg-choose">
          <button className="gg-choice" onClick={() => onPick('dept')}>
            <span className="gg-choice-k">A</span>
            <b>My department wants an agency to track a campaign</b>
            <span>4 short steps: request, rules, go live, wrap up.</span>
            <span className="gg-choice-go">Start this path &rarr;</span>
          </button>
          <button className="gg-choice" onClick={() => onPick('web')}>
            <span className="gg-choice-k">B</span>
            <b>I manage the District container (District Web Team)</b>
            <span>5 steps plus a quarterly check, with links to each screen.</span>
            <span className="gg-choice-go">Start this path &rarr;</span>
          </button>
        </div>
      )
    case 'request':
      return (
        <Window title="Request to the District Web Team" tone="mail">
          <div className="gg-form-group"><div className="gg-form-h">About the agency</div>
            <ul className="gg-checks"><li>Agency name and contact</li><li>Everyone who needs access</li><li>Contract or PO number</li><li>Campaign start and end dates</li></ul></div>
          <div className="gg-form-group"><div className="gg-form-h">About the tracking</div>
            <ul className="gg-checks"><li>Ad platforms and IDs</li><li>Which pages</li><li>What counts as a conversion</li><li>No personal information</li><li>Remarketing or not</li><li>Analytics access needed?</li></ul></div>
          <div className="gg-sign"><span className="gg-tag gg-tag-green">Director approved</span> plus the agency agrees to the rules</div>
        </Window>
      )
    case 'rules':
      return (
        <div className="gg-grid2">
          <div className="gg-rule"><span className="gg-rule-ok">&#10003;</span><b>Edit access</b><span>In their own workspace. The District publishes.</span></div>
          <div className="gg-rule"><span className="gg-rule-ok">&#10003;</span><b>Your pages only</b><span>e.g. /magnet-programs/ and nothing else.</span></div>
          <div className="gg-rule"><span className="gg-rule-ok">&#10003;</span><b>Named for you</b><span><code>MAGNET | Meta purchase</code></span></div>
          <div className="gg-rule gg-rule-no"><span className="gg-rule-x">&#10005;</span><b>No personal information</b><span>No names, emails or anything typed in a form.</span></div>
        </div>
      )
    case 'golive':
      return (
        <div className="gg-timeline">
          {[['Agency builds', 'in its own workspace'], ['Tests in Preview', 'nothing is live yet'], ['District reviews', 'same business day'], ['District publishes', 'live on the site']].map(([b, s], i) => (
            <div key={b} className={`gg-tl-step${c === i ? ' gg-lit' : ''}${c > i ? ' gg-done' : ''}`}><span className="gg-tl-n">{i + 1}</span><b>{b}</b><span>{s}</span></div>
          ))}
        </div>
      )
    case 'end':
      return (
        <div className="gg-end">
          <div className="gg-cal"><div className="gg-cal-top">Campaign end date</div><div className="gg-cal-day">15</div><div className="gg-cal-m">FEB</div></div>
          <div className="gg-end-list">
            <div><span className="gg-rule-x">&#10005;</span>Agency access removed</div>
            <div><span className="gg-rule-x">&#10005;</span>Their tags paused</div>
            <div><span className="gg-rule-ok">&#10003;</span>Closed date on record</div>
            <div className="gg-end-ask">Need more time? Ask before the end date.</div>
          </div>
        </div>
      )
    case 'record':
      return (
        <Window title="bcpsmarcomm.com · Tag Register" tone="app">
          <div className="gg-app-h">TAG REGISTER <small>Agency access</small></div>
          <div className="gg-app-row gg-app-row-head"><span>Agency</span><span>Status</span><span /></div>
          <div className="gg-app-row"><span><b>Brkthru</b><small>Magnet &amp; Innovative Programs</small></span><span className="gg-tag gg-tag-amber">Waiting for intake</span>
            <span className="gg-rel"><button className={`gg-fake-btn${c === 0 ? ' gg-press' : ''}`}>Open</button><Spot n={1} on={c === 0} label="Click Open" /></span></div>
          <div className="gg-app-row"><span><b>District Web Team</b><small>container owner</small></span><span className="gg-tag gg-tag-green">Open</span><span><button className="gg-fake-btn">Open</button></span></div>
          <div className={`gg-steps-pills${c === 1 ? ' gg-lit-soft' : ''}`}>
            <span>1 Agency and people</span><span>2 Access and dates</span><span>3 Tracking answers</span>
            {c === 1 && <Spot n={2} on label="Fill the 3 steps, then Save" />}
          </div>
        </Window>
      )
    case 'invite':
      return (
        <Window title="tagmanager.google.com · GTM-NTGC6X38" tone="gtm">
          <div className="gg-gtm-tabs">
            <span>Workspace</span><span>Versions</span>
            <span className={`gg-rel${c === 0 ? ' gg-tab-on' : ''}`}>Admin<Spot n={1} on={c === 0} label="Admin" /></span>
          </div>
          <div className="gg-gtm-admin">
            <div className="gg-gtm-col"><small>CONTAINER</small>
              <div className="gg-rel gg-gtm-link">Container User Management<Spot n={2} on={c === 1} label="User Management" /></div>
              <div className="gg-gtm-link gg-faint">Container Settings</div></div>
            <div className="gg-gtm-col gg-gtm-panel">
              <div className="gg-rel gg-gtm-plus">+<Spot n={3} on={c === 2} label="+ then Add users" /></div>
              <div className="gg-gtm-field">shannon@agency.com</div>
              <div className="gg-gtm-perms"><span>Read</span><span className="gg-perm-on">Edit</span><span>Approve</span><span className="gg-perm-no">Publish</span></div>
              <div className="gg-rel"><button className={`gg-gtm-btn${c === 3 ? ' gg-press' : ''}`}>Invite</button><Spot n={4} on={c === 3} label="Edit, then Invite" /></div>
            </div>
          </div>
        </Window>
      )
    case 'open':
      return <OpenAccessVisual />
    case 'publish':
      return (
        <div className="gg-publish">
          <div className={`gg-review${c === 0 ? ' gg-lit' : ''}`}>
            <div className="gg-review-h"><span className="gg-tag gg-tag-green">PASS</span> Magnet - Brkthru</div>
            <div className="gg-review-row">&#10003; Named &quot;MAGNET |&quot;</div>
            <div className="gg-review-row">&#10003; Only /magnet-programs/ pages</div>
            <div className="gg-review-row">&#10003; District tags untouched</div>
            <div className="gg-review-row">&#10003; Up to date</div>
          </div>
          <Window title="Tag Manager · Magnet - Brkthru" tone="gtm">
            <div className="gg-gtm-ws"><span>Workspace changes: 3</span>
              <span className="gg-rel"><button className={`gg-gtm-btn${c === 1 ? ' gg-press' : ''}`}>Submit</button><Spot n={1} on={c === 1} label="Submit" /></span></div>
            <div className="gg-gtm-ws gg-gtm-ws2"><span>Publish and Create Version</span>
              <span className="gg-rel"><button className={`gg-gtm-btn${c === 2 ? ' gg-press' : ''}`}>Publish</button><Spot n={2} on={c === 2} label="Publish" /></span></div>
          </Window>
        </div>
      )
    case 'close':
      return (
        <div className="gg-close3">
          <div className={`gg-card${c === 0 ? ' gg-lit' : ''}`}><span className="gg-tl-n">1</span><b>Remove users</b><span>Tag Manager &rarr; Admin &rarr; Container User Management &rarr; select &rarr; Remove</span></div>
          <div className={`gg-card${c === 1 ? ' gg-lit' : ''}`}><span className="gg-tl-n">2</span><b>Pause their tags</b><span>In the workspace, pause each MAGNET | tag, then publish</span></div>
          <div className={`gg-card${c === 2 ? ' gg-lit' : ''}`}><span className="gg-tl-n">3</span><b>Close access</b><span>Tag Register &rarr; their record &rarr; Close access</span></div>
        </div>
      )
    case 'quarterly':
      return (
        <Window title="bcpsmarcomm.com · Tag Register" tone="app">
          <div className="gg-app-h">TAG REGISTER <small>sorted by what needs you</small></div>
          <div className="gg-app-row"><span><b>Agency A</b><small>Past close date (Jan 31)</small></span><span className="gg-flag gg-flag-red">Act now</span></div>
          <div className="gg-app-row"><span><b>Agency B</b><small>No close date yet</small></span><span className="gg-flag gg-flag-amber">Add a date</span></div>
          <div className="gg-app-row"><span><b>Agency C</b><small>Closes in 9 days</small></span><span className="gg-flag gg-flag-amber">Coming up</span></div>
          <div className="gg-app-row"><span><b>District Web Team</b><small>Permanent (District)</small></span><span className="gg-flag gg-flag-ok">Fine</span></div>
        </Window>
      )
    case 'done':
      return (
        <div className="gg-cover-badges gg-done-badges">
          <span>&#10003; One container</span><span>&#10003; One record</span><span>&#10003; Access with an end date</span>
        </div>
      )
    default:
      return null
  }
}

function OpenAccessVisual() {
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setOpened(o => !o), 2200)
    return () => clearInterval(t)
  }, [])
  return (
    <Window title="bcpsmarcomm.com · Tag Register · Brkthru" tone="app">
      <div className="gg-open-h">
        <b>Brkthru</b>
        <span className={`gg-tag ${opened ? 'gg-tag-green' : 'gg-tag-amber'}`}>{opened ? 'Open' : 'Waiting for intake'}</span>
        <span className="gg-rel" style={{ marginLeft: 'auto' }}>
          <button className={`gg-fake-btn${!opened ? ' gg-press' : ''}`}>{opened ? 'Close access' : 'Open access'}</button>
          {!opened && <Spot n={1} on label="Open access" />}
        </span>
      </div>
      <div className="gg-open-dates"><span>Opens <b>{opened ? 'Today' : '-'}</b></span><span>Closes <b>Feb 15</b></span><span>Permission <b>Edit</b></span></div>
    </Window>
  )
}

function Guide() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const requested = params.get('s') || 'welcome'
  const current = SLIDES.find(s => s.id === requested) || SLIDES[0]
  const path: Path = (current.path || (params.get('path') as Path) || 'dept') === 'web' ? 'web' : 'dept'
  const route = useMemo(() => routeFor(path), [path])
  const index = Math.max(0, route.findIndex(s => s.id === current.id))
  const isChoose = current.id === 'choose'

  const audioRef = useRef<HTMLAudioElement>(null)
  const [listening, setListening] = useState(false)

  const go = useCallback((id: string, p: Path = path) => {
    router.push(`${pathname}?s=${id}&path=${p}`, { scroll: false })
  }, [router, pathname, path])

  const next = useCallback(() => {
    if (isChoose) return
    if (index < route.length - 1) go(route[index + 1].id)
  }, [index, route, go, isChoose])
  const back = useCallback(() => { if (index > 0) go(route[index - 1].id) }, [index, route, go])

  // Narration: load this slide's file; keep playing across slides once on.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.src = `/audio/gtm-guide/${current.id}.mp3`
    if (listening) a.play().catch(() => setListening(false))
  }, [current.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listening is a hands-free tour: when a slide's narration ends, move on
  // by itself, stopping at the path choice and at the end.
  const nextRef = useRef(next)
  nextRef.current = next
  const onEnded = () => {
    if (!listening) return
    if (index === route.length - 1) { setListening(false); return }
    if (isChoose) return // wait for a card; narration picks up on the path
    setTimeout(() => nextRef.current(), 1200)
  }

  const toggleAudio = () => {
    const a = audioRef.current
    if (!a) return
    if (listening) { a.pause(); setListening(false) }
    else { if (a.ended) a.currentTime = 0; a.play().then(() => setListening(true)).catch(() => setListening(false)) }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, back])

  const pad = (n: number) => (n < 10 ? '0' : '') + n
  const isCover = current.id === 'welcome'

  return (
    <div className="gg-root">
      <header className="gg-top">
        <div className="gg-progress"><div style={{ width: `${(index / (route.length - 1)) * 100}%` }} /></div>
        <div className="gg-top-row">
          <div className="gg-brand"><img src={LOGO} alt="Broward County Public Schools" /><span className="gg-divider" /><span className="gg-brand-t">Google Tag Manager Guide</span></div>
          <span className="gg-count">{pad(index + 1)} / {pad(route.length)}</span>
        </div>
      </header>

      <main className={`gg-stage${isCover ? ' gg-stage-cover' : ''}`}>
        <section key={current.id} className="gg-slide">
          <div className="gg-glass">
            <span className="gg-eyebrow">{current.eyebrow}</span>
            {isCover ? <h1>{current.title}</h1> : <h2>{current.title}</h2>}
            <p className="gg-why"><span className="gg-why-k">Why</span>{current.why}</p>
            {isCover && <p className="gg-hint">Press &#9654; to listen, or use Next and your arrow keys.</p>}
            {current.cta && (
              <a className="gg-cta" href={current.cta.href} target={current.cta.external ? '_blank' : undefined} rel={current.cta.external ? 'noreferrer' : undefined}>
                {current.cta.label}{current.cta.external ? ' ↗' : ' →'}
              </a>
            )}
            {current.id === 'done' && (
              <div className="gg-done-actions">
                <button className="gg-btn" onClick={() => go('welcome')}>Start over</button>
                <button className="gg-btn" onClick={() => go(path === 'dept' ? 'record' : 'request', path === 'dept' ? 'web' : 'dept')}>
                  See the {path === 'dept' ? 'District Web Team' : 'department'} path
                </button>
                <a className="gg-cta" href="/?page=tag-register">Open the Tag Register &rarr;</a>
              </div>
            )}
          </div>
          <div className="gg-visual"><Visual id={current.visual} onPick={p => go(p === 'dept' ? 'request' : 'record', p)} /></div>
        </section>
      </main>

      <nav className="gg-nav">
        <button className="gg-btn" onClick={back} disabled={index === 0}>Back</button>
        <div className="gg-dots">
          {route.map((s, i) => <button key={s.id} className={`gg-dot-btn${i === index ? ' gg-on' : ''}`} aria-label={`Go to ${s.title}`} onClick={() => go(s.id)} />)}
        </div>
        <div className="gg-nav-right">
          <button className={`gg-audio${listening ? ' gg-playing' : ''}`} onClick={toggleAudio} aria-label={listening ? 'Pause narration' : 'Play narration'}>
            {listening
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
          </button>
          <audio ref={audioRef} preload="metadata" onEnded={onEnded} />
          {isChoose
            ? <span className="gg-pick-hint">Pick a card</span>
            : <button className="gg-btn gg-btn-primary" onClick={() => (index === route.length - 1 ? go('welcome') : next())}>{index === route.length - 1 ? 'Start over' : 'Next'}</button>}
        </div>
      </nav>
    </div>
  )
}

export default function TagManagerGuidePage() {
  return <Suspense><Guide /></Suspense>
}
