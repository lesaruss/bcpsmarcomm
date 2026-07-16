'use client'

import { useEffect } from 'react'
import './wcm-pilot.css'

const DECK_SLUG = 'wcm-pilot'

export default function WCMPilotWelcomePage() {
  useEffect(() => {
    const steps = Array.prototype.slice.call(document.querySelectorAll('.wp-step')) as HTMLElement[]
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
      b.className = 'wp-dot-btn'
      b.setAttribute('aria-label', 'Go to step ' + (d + 1))
      b.addEventListener('click', () => go(d))
      dotsWrap.appendChild(b)
      dots.push(b)
    }

    function pad(n: number) {
      return n < 10 ? '0' + n : '' + n
    }

    function stopAllAudio() {
      document.querySelectorAll('.wp-audio audio').forEach(a => (a as HTMLAudioElement).pause())
      document.querySelectorAll('.wp-audio.wp-playing').forEach(el => el.classList.remove('wp-playing'))
    }

    function render() {
      stopAllAudio()
      steps.forEach((s, idx) => s.classList.toggle('wp-active', idx === i))
      dots.forEach((dot, idx) => dot.classList.toggle('wp-on', idx === i))
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
      ap.className = 'wp-audio'
      ap.innerHTML =
        '<button class="wp-audio-btn" aria-label="Play narration">' +
        '<svg class="wp-ic-play" width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
        '<svg class="wp-ic-pause" width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' +
        '</button>' +
        '<div class="wp-wave"><span class="wp-handle"></span></div>' +
        '<div class="wp-audio-meta"><span class="wp-audio-label">Prefer to listen?</span><span class="wp-audio-tag">Narration</span></div>' +
        '<audio preload="metadata" src="/audio/' + DECK_SLUG + '/' + pad(idx + 1) + '.mp3"></audio>'

      const wv = ap.querySelector('.wp-wave') as HTMLElement
      const handle = ap.querySelector('.wp-handle') as HTMLElement
      const bars: HTMLElement[] = []
      for (let w = 0; w < 34; w++) {
        const s = document.createElement('span')
        s.className = 'wp-bar'
        s.style.height = 35 + Math.round(55 * Math.abs(Math.sin(w * 0.9))) + '%'
        wv.appendChild(s)
        bars.push(s)
      }
      const btn = ap.querySelector('.wp-audio-btn') as HTMLButtonElement
      const au = ap.querySelector('audio') as HTMLAudioElement

      function paint(frac: number) {
        if (frac < 0) frac = 0
        if (frac > 1) frac = 1
        bars.forEach((b, idx2) => b.classList.toggle('wp-on', (idx2 + 1) / bars.length <= frac))
        handle.style.left = frac * 100 + '%'
      }
      au.addEventListener('timeupdate', () => {
        if (au.duration) paint(au.currentTime / au.duration)
      })
      au.addEventListener('ended', () => {
        ap.classList.remove('wp-playing')
        paint(1)
      })
      btn.addEventListener('click', () => {
        const willPlay = !ap.classList.contains('wp-playing')
        stopAllAudio()
        if (willPlay) {
          if (au.ended || au.currentTime >= (au.duration || 1)) au.currentTime = 0
          ap.classList.add('wp-playing')
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
    <div className="wp-root">
      <div className="wp-topbar">
        <div className="wp-progress-track"><div className="wp-progress-fill" id="wp-fill" /></div>
        <div className="wp-topbar-row">
          <div className="wp-brand"><span className="wp-brand-dot" /> WCM Pilot Program</div>
          <div className="wp-count" id="wp-count">01 / 03</div>
        </div>
      </div>

      <div className="wp-stage">
        <section className="wp-step wp-active wp-center">
          <div className="wp-cover-band">
            <img
              className="wp-cover-logo"
              src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
              alt="Broward County Public Schools"
            />
            <span className="wp-eyebrow">WCM Pilot Program</span>
            <h1>Welcome to the Web Content Manager Pilot</h1>
            <p className="wp-lead" style={{ maxWidth: '52ch', margin: '18px auto 0' }}>
              This is your starting point as a Department Web Content Manager for Broward County Public Schools.
            </p>
            <p className="wp-hint">Use Next, or your arrow keys, to move through.</p>
          </div>
        </section>

        <section className="wp-step">
          <span className="wp-eyebrow">What Happens Next</span>
          <h2>Here&apos;s what happens.</h2>
          <p className="wp-lead" style={{ marginTop: 14 }}>
            Creating your account enrolls you as a Department Web Content Manager in the WCM Pilot Program, this
            comes before, and is separate from, the certification course.
          </p>
          <ul className="wp-need">
            <li>
              <span className="wp-mk">1</span>
              <div>
                <div className="wp-nt">Create your account</div>
                <div className="wp-nd">With your BCPS email address and a password.</div>
              </div>
            </li>
            <li>
              <span className="wp-mk">2</span>
              <div>
                <div className="wp-nt">Complete certification</div>
                <div className="wp-nd">The Department WCM Certification course, at your own pace.</div>
              </div>
            </li>
            <li>
              <span className="wp-mk">3</span>
              <div>
                <div className="wp-nt">Get access</div>
                <div className="wp-nd">To your department&apos;s WCM audit portal and checklist.</div>
              </div>
            </li>
          </ul>
        </section>

        <section className="wp-step wp-center">
          <span className="wp-eyebrow">Ready</span>
          <h2>Ready to get started?</h2>
          <p className="wp-lead" style={{ margin: '14px auto 0', maxWidth: '48ch' }}>
            Create your account to enroll in the WCM Pilot Program. Access restricted to @browardschools.com
            addresses.
          </p>
          <a href="/wcm-pilot/register" className="wp-cta-btn">Create Your Account</a>
        </section>
      </div>

      <nav className="wp-nav">
        <div className="wp-nav-row">
          <button className="wp-btn" id="wp-back" aria-label="Previous step">Back</button>
          <div className="wp-dots" id="wp-dots" />
          <button className="wp-btn wp-btn-primary" id="wp-next" aria-label="Next step">Next</button>
        </div>
      </nav>
    </div>
  )
}
