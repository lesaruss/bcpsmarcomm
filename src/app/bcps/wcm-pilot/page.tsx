'use client'

import { useEffect } from 'react'

const DECK_SLUG = 'wcm-pilot'

export default function WCMPilotWelcomePage() {
  useEffect(() => {
    const steps = Array.prototype.slice.call(document.querySelectorAll('.wp .step')) as HTMLElement[]
    const total = steps.length
    let i = 0
    const fill = document.getElementById('wp-fill') as HTMLElement
    const count = document.getElementById('wp-count') as HTMLElement
    const back = document.getElementById('wp-back') as HTMLButtonElement
    const next = document.getElementById('wp-next') as HTMLButtonElement
    const dotsWrap = document.getElementById('wp-dots') as HTMLElement

    dotsWrap.innerHTML = ''
    const dots: HTMLButtonElement[] = []
    for (let d = 0; d < total; d++) {
      const b = document.createElement('button')
      b.setAttribute('aria-label', 'Go to step ' + (d + 1))
      b.addEventListener('click', () => go(d))
      dotsWrap.appendChild(b)
      dots.push(b)
    }

    function pad(n: number) {
      return n < 10 ? '0' + n : '' + n
    }

    function stopAllAudio() {
      document.querySelectorAll('.wp audio').forEach(a => (a as HTMLAudioElement).pause())
      document.querySelectorAll('.wp .audio.playing').forEach(el => el.classList.remove('playing'))
    }

    function render() {
      stopAllAudio()
      steps.forEach((s, idx) => s.classList.toggle('active', idx === i))
      dots.forEach((dot, idx) => dot.classList.toggle('on', idx === i))
      fill.style.width = (total === 1 ? 100 : (i / (total - 1)) * 100) + '%'
      count.textContent = pad(i + 1) + ' / ' + pad(total)
      back.disabled = i === 0
      next.textContent = i === total - 1 ? 'Start Over' : 'Next'
    }

    function go(n: number) {
      i = Math.max(0, Math.min(total - 1, n))
      render()
    }

    function onNext() {
      if (i === total - 1) go(0)
      else go(i + 1)
    }
    function onBack() {
      go(i - 1)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') go(i + 1)
      else if (e.key === 'ArrowLeft') go(i - 1)
    }

    next.addEventListener('click', onNext)
    back.addEventListener('click', onBack)
    document.addEventListener('keydown', onKey)

    // Narration audio player, one per slide, sourced from /audio/wcm-pilot/NN.mp3
    steps.forEach((sec, idx) => {
      const ap = document.createElement('div')
      ap.className = 'audio'
      ap.innerHTML =
        '<button class="audio-btn" aria-label="Play narration">' +
        '<svg class="ic-play" width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
        '<svg class="ic-pause" width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' +
        '</button>' +
        '<div class="wave"><span class="handle"></span></div>' +
        '<div class="audio-meta"><span class="audio-label">Prefer to listen?</span><span class="audio-tag">Narration</span></div>' +
        '<audio preload="metadata" src="/audio/' + DECK_SLUG + '/' + pad(idx + 1) + '.mp3"></audio>'

      const wv = ap.querySelector('.wave') as HTMLElement
      const handle = ap.querySelector('.handle') as HTMLElement
      const bars: HTMLElement[] = []
      for (let w = 0; w < 34; w++) {
        const s = document.createElement('span')
        s.className = 'bar'
        s.style.height = 35 + Math.round(55 * Math.abs(Math.sin(w * 0.9))) + '%'
        wv.appendChild(s)
        bars.push(s)
      }
      const btn = ap.querySelector('.audio-btn') as HTMLButtonElement
      const au = ap.querySelector('audio') as HTMLAudioElement

      function paint(frac: number) {
        if (frac < 0) frac = 0
        if (frac > 1) frac = 1
        bars.forEach((b, idx2) => b.classList.toggle('on', (idx2 + 1) / bars.length <= frac))
        handle.style.left = frac * 100 + '%'
      }
      au.addEventListener('timeupdate', () => {
        if (au.duration) paint(au.currentTime / au.duration)
      })
      au.addEventListener('ended', () => {
        ap.classList.remove('playing')
        paint(1)
      })
      btn.addEventListener('click', () => {
        const willPlay = !ap.classList.contains('playing')
        stopAllAudio()
        if (willPlay) {
          if (au.ended || au.currentTime >= (au.duration || 1)) au.currentTime = 0
          ap.classList.add('playing')
          au.play()
        }
      })
      function seekAt(clientX: number) {
        const r = wv.getBoundingClientRect()
        let frac = (clientX - r.left) / r.width
        if (frac < 0) frac = 0
        if (frac > 1) frac = 1
        if (au.duration) au.currentTime = frac * au.duration
        paint(frac)
      }
      let dragging = false
      wv.addEventListener('pointerdown', e => {
        dragging = true
        seekAt(e.clientX)
        e.preventDefault()
      })
      window.addEventListener('pointermove', e => {
        if (dragging) seekAt(e.clientX)
      })
      window.addEventListener('pointerup', () => {
        dragging = false
      })
      sec.appendChild(ap)
    })

    render()

    return () => {
      next.removeEventListener('click', onNext)
      back.removeEventListener('click', onBack)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="wp">
      <style>{`
        .wp{
          --bg:#ffffff;--surface:#ffffff;--panel:#f4f7fb;
          --ink:#1a1a1a;--ink-75:#3d3d3d;--ink-55:#555555;--ink-muted:#767676;
          --border:rgba(0,0,0,0.10);--accent:#1672A7;--accent-text:#0e4e73;--ink-deep:#0e4e73;
          --radius:18px;--maxw:820px;
          font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
          background:var(--bg);color:var(--ink);line-height:1.55;
        }
        .wp *{box-sizing:border-box;}
        .wp h1,.wp h2,.wp h3{margin:0;font-weight:900;line-height:1.15;letter-spacing:-0.01em;}
        .wp h1{font-size:clamp(30px,5vw,46px);}
        .wp h2{font-size:clamp(24px,3.6vw,34px);}
        .wp p{margin:0 0 14px;color:var(--ink-75);font-size:clamp(15px,1.8vw,17px);}
        .wp .lead{font-size:clamp(16px,2.1vw,19px);color:var(--ink-75);}
        .wp .eyebrow{display:inline-block;font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:var(--accent-text);margin-bottom:16px;}

        .wp .topbar{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid var(--border);}
        .wp .progress{height:4px;background:var(--panel);}
        .wp .progress .fill{height:100%;background:var(--accent);width:0;transition:width .35s ease;}
        .wp .topbar .row{display:flex;align-items:center;justify-content:space-between;padding:12px 22px;}
        .wp .topbar .brand{display:flex;align-items:center;gap:10px;font-weight:900;font-size:14px;letter-spacing:0.02em;color:var(--accent-text);}
        .wp .topbar .brand .dot{width:11px;height:11px;border-radius:50%;background:var(--accent);}
        .wp .topbar .count{font-size:12.5px;font-weight:800;color:var(--ink-55);letter-spacing:0.08em;}

        .wp .stage{max-width:var(--maxw);margin:0 auto;padding:40px 24px 130px;min-height:70vh;display:flex;align-items:center;}
        .wp .step{display:none;width:100%;animation:wp-fade .45s ease;}
        .wp .step.active{display:block;}
        @keyframes wp-fade{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}

        .wp .cover-band{background:linear-gradient(135deg,#1D7BB5,#0e4e73);color:#fff;border-radius:24px;padding:52px 44px;text-align:center;}
        .wp .cover-band .eyebrow{color:#cfe6f5;}
        .wp .cover-band h1{color:#fff;}
        .wp .cover-band .lead{color:rgba(255,255,255,0.9);}
        .wp .cover-band .hint{color:rgba(255,255,255,0.65);}
        .wp .cover-logo{height:44px;margin-bottom:22px;filter:brightness(0) invert(1);}

        .wp .need{list-style:none;margin:24px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:13px;}
        @media(max-width:700px){.wp .need{grid-template-columns:1fr;}}
        .wp .need li{display:flex;gap:13px;align-items:flex-start;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px;}
        .wp .need .mk{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;margin-top:2px;}
        .wp .need .nt{font-weight:800;font-size:15px;color:var(--ink);}
        .wp .need .nd{font-size:13.5px;color:var(--ink-55);}

        .wp .center{text-align:center;}
        .wp .hint{font-size:13px;color:var(--ink-muted);margin-top:20px;}

        .wp .cta-btn{display:inline-block;margin-top:24px;padding:15px 30px;background:var(--accent);color:#fff;border-radius:999px;font-weight:800;font-size:15px;text-decoration:none;}
        .wp .cta-btn:hover{background:var(--accent-text);}

        .wp .audio{display:flex;align-items:center;gap:14px;max-width:440px;margin:26px auto 0;background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:9px 16px 9px 9px;text-align:left;}
        .wp .audio-btn{flex:0 0 auto;width:44px;height:44px;border-radius:50%;border:none;background:var(--ink-deep);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;}
        .wp .audio-btn:hover{background:#092e44;}
        .wp .audio-btn .ic-pause{display:none;}
        .wp .audio.playing .audio-btn .ic-play{display:none;}
        .wp .audio.playing .audio-btn .ic-pause{display:block;}
        .wp .wave{flex:1;position:relative;display:flex;align-items:center;gap:2px;height:32px;cursor:pointer;touch-action:none;}
        .wp .wave span.bar{flex:1;min-width:2px;background:#d8dde3;border-radius:2px;transition:background .12s;}
        .wp .wave span.bar.on{background:var(--accent);}
        .wp .wave .handle{position:absolute;top:-3px;bottom:-3px;width:3px;border-radius:2px;background:var(--ink-deep);left:0;transform:translateX(-1px);pointer-events:none;}
        .wp .audio-meta{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:3px;}
        .wp .audio-label{font-size:11.5px;font-weight:800;color:var(--ink);}
        .wp .audio-tag{font-size:9px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent-text);background:rgba(22,114,167,0.12);padding:2px 7px;border-radius:999px;}

        .wp .nav{position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(255,255,255,0.95);backdrop-filter:blur(8px);border-top:1px solid var(--border);}
        .wp .nav .row{max-width:var(--maxw);margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 24px;}
        .wp .btn{display:inline-flex;align-items:center;gap:9px;font-family:inherit;font-weight:800;font-size:14.5px;padding:12px 22px;border-radius:999px;border:1px solid var(--border);background:#fff;color:var(--ink);cursor:pointer;}
        .wp .btn:hover{border-color:var(--ink);}
        .wp .btn:disabled{opacity:.4;cursor:not-allowed;}
        .wp .btn-primary{background:var(--ink-deep);color:#fff;border-color:transparent;}
        .wp .btn-primary:hover{background:#092e44;}
        .wp .dots{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;}
        .wp .dots button{width:9px;height:9px;border-radius:50%;border:none;background:#d6d6d6;cursor:pointer;padding:0;}
        .wp .dots button.on{background:var(--accent);transform:scale(1.25);}
        @media(max-width:620px){.wp .dots{display:none;}}
        @media(min-width:769px){
          .wp{overflow-x:hidden;}
          html:has(.wp), body:has(.wp){overflow:hidden;height:100dvh;}
          .wp .stage{min-height:0;height:calc(100dvh - 57px - 73px);overflow-y:auto;}
        }
      `}</style>

      <div className="topbar">
        <div className="progress"><div className="fill" id="wp-fill" /></div>
        <div className="row">
          <div className="brand"><span className="dot" /> WCM Pilot Program</div>
          <div className="count" id="wp-count">01 / 03</div>
        </div>
      </div>

      <div className="stage">
        <section className="step active center">
          <div className="cover-band">
            <img
              className="cover-logo"
              src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
              alt="Broward County Public Schools"
            />
            <span className="eyebrow">WCM Pilot Program</span>
            <h1>Welcome to the Web Content Manager Pilot</h1>
            <p className="lead" style={{ maxWidth: '52ch', margin: '18px auto 0' }}>
              This is your starting point as a Department Web Content Manager for Broward County Public Schools.
            </p>
            <p className="hint">Use Next, or your arrow keys, to move through.</p>
          </div>
        </section>

        <section className="step">
          <span className="eyebrow">What Happens Next</span>
          <h2>Here&apos;s what happens.</h2>
          <p className="lead" style={{ marginTop: 14 }}>
            Creating your account enrolls you as a Department Web Content Manager in the WCM Pilot Program, this
            comes before, and is separate from, the certification course.
          </p>
          <ul className="need">
            <li>
              <span className="mk">1</span>
              <div>
                <div className="nt">Create your account</div>
                <div className="nd">With your BCPS email address and a password.</div>
              </div>
            </li>
            <li>
              <span className="mk">2</span>
              <div>
                <div className="nt">Complete certification</div>
                <div className="nd">The Department WCM Certification course, at your own pace.</div>
              </div>
            </li>
            <li>
              <span className="mk">3</span>
              <div>
                <div className="nt">Get access</div>
                <div className="nd">To your department&apos;s WCM audit portal and checklist.</div>
              </div>
            </li>
          </ul>
        </section>

        <section className="step center">
          <span className="eyebrow">Ready</span>
          <h2>Ready to get started?</h2>
          <p className="lead" style={{ margin: '14px auto 0', maxWidth: '48ch' }}>
            Create your account to enroll in the WCM Pilot Program. Access restricted to @browardschools.com
            addresses.
          </p>
          <a href="/wcm-pilot/register" className="cta-btn">Create Your Account</a>
        </section>
      </div>

      <nav className="nav">
        <div className="row">
          <button className="btn" id="wp-back" aria-label="Previous step">Back</button>
          <div className="dots" id="wp-dots" />
          <button className="btn btn-primary" id="wp-next" aria-label="Next step">Next</button>
        </div>
      </nav>
    </div>
  )
}
