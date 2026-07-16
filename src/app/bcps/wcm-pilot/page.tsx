'use client'

import { useEffect } from 'react'
import './wcm-pilot.css'
import WcmPilotHeader from './WcmPilotHeader'

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

    // Single shared narration player: just a small round play/pause icon
    // button sitting in the nav next to Next, no waveform or label. Its
    // source swaps to match whichever slide is active.
    const audioEl = document.getElementById('wp-audio-el') as HTMLAudioElement
    const audioBtn = document.getElementById('wp-audio-btn') as HTMLButtonElement

    function stopAllAudio() {
      audioEl.pause()
      audioBtn.classList.remove('wp-playing')
    }

    function loadAudioForStep(idx: number) {
      audioEl.src = '/audio/' + DECK_SLUG + '/' + pad(idx + 1) + '.mp3'
    }

    audioEl.addEventListener('ended', () => {
      audioBtn.classList.remove('wp-playing')
    })
    audioBtn.addEventListener('click', () => {
      const willPlay = !audioBtn.classList.contains('wp-playing')
      stopAllAudio()
      if (willPlay) {
        if (audioEl.ended || audioEl.currentTime >= (audioEl.duration || 1)) audioEl.currentTime = 0
        audioBtn.classList.add('wp-playing')
        audioEl.play()
      }
    })

    function render() {
      stopAllAudio()
      steps.forEach((s, idx) => s.classList.toggle('wp-active', idx === i))
      dots.forEach((dot, idx) => dot.classList.toggle('wp-on', idx === i))
      fill.style.width = (total === 1 ? 100 : (i / (total - 1)) * 100) + '%'
      count.textContent = pad(i + 1) + ' / ' + pad(total)
      back.disabled = i === 0
      next.textContent = i === total - 1 ? 'Start Over' : 'Next'
      loadAudioForStep(i)
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
        <WcmPilotHeader right={<span className="wp-count" id="wp-count">01 / 03</span>} />
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
          <div className="wp-nav-right">
            <button className="wp-mini-audio-btn" id="wp-audio-btn" aria-label="Play narration">
              <svg className="wp-ic-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              <svg className="wp-ic-pause" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            </button>
            <audio id="wp-audio-el" preload="metadata" />
            <button className="wp-btn wp-btn-primary" id="wp-next" aria-label="Next step">Next</button>
          </div>
        </div>
      </nav>
    </div>
  )
}
