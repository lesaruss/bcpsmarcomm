'use client'

import { useCallback, useEffect, useState } from 'react'
import '../wcm-registration/wcm-registration.css'
import MarcommHeader, { MARCOMM_LOGIN } from './MarcommHeader'

// MarComm Meeting onboarding (Sean, 2026-10-16): the page Sean shares with
// everyone in the Marcomm Meeting so they create an account and can update
// their own items on MarComm Assignments. Modeled on the WCM Department
// Registration welcome deck (/wcm-registration), same stylesheet, without the
// narration audio. Public in middleware.ts: visitors have no account yet.
const TOTAL = 5

export default function MarcommRegistrationWelcomePage() {
  const [i, setI] = useState(0)
  const go = useCallback((n: number) => setI(Math.max(0, Math.min(TOTAL - 1, n))), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setI(n => Math.min(TOTAL - 1, n + 1))
      else if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  const step = (n: number, extra = '') => `wp-step${i === n ? ' wp-active' : ''}${extra ? ' ' + extra : ''}`

  return (
    <div className="wp-root">
      <div className="wp-topbar">
        <div className="wp-progress-track">
          <div className="wp-progress-fill" style={{ width: (i / (TOTAL - 1)) * 100 + '%' }} />
        </div>
        <MarcommHeader right={<span className="wp-count">{pad(i + 1)} / {pad(TOTAL)}</span>} />
      </div>

      <div className="wp-stage">
        <section className={step(0, 'wp-center')}>
          <div className="wp-cover-band">
            <img
              className="wp-cover-logo"
              src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
              alt="Broward County Public Schools"
            />
            <span className="wp-eyebrow">MarComm Meeting</span>
            <h1>Welcome to MarComm Assignments</h1>
            <p className="wp-lead" style={{ maxWidth: '52ch', margin: '18px auto 0' }}>
              Create your account so you can update your own items before each Marcomm Meeting.
            </p>
            <p className="wp-hint">Use Next, or your arrow keys, to move through.</p>
          </div>
        </section>

        <section className={step(1)}>
          <span className="wp-eyebrow">What&apos;s Changing</span>
          <h2>The MarComm Spreadsheet is now MarComm Assignments.</h2>
          <p className="wp-lead" style={{ marginTop: 14 }}>
            Every request from the spreadsheet is already in it, with its lead, support, date needed and
            the full history of meeting notes.
          </p>
          <ul className="wp-need">
            <li>
              <span className="wp-mk">1</span>
              <div>
                <div className="wp-nt">One shared list</div>
                <div className="wp-nd">Everyone sees the same requests, so there are no copies to reconcile.</div>
              </div>
            </li>
            <li>
              <span className="wp-mk">2</span>
              <div>
                <div className="wp-nt">You update your own items</div>
                <div className="wp-nd">Post your status and notes any time, not only during the meeting.</div>
              </div>
            </li>
            <li>
              <span className="wp-mk">3</span>
              <div>
                <div className="wp-nt">New requests arrive on their own</div>
                <div className="wp-nd">MarComm Request Form submissions appear in the list with a job number.</div>
              </div>
            </li>
            <li>
              <span className="wp-mk">4</span>
              <div>
                <div className="wp-nt">Every week is saved</div>
                <div className="wp-nd">A saved version after each meeting shows what changed week to week.</div>
              </div>
            </li>
          </ul>
        </section>

        <section className={step(2)}>
          <span className="wp-eyebrow">Getting Access</span>
          <h2>Three steps, about two minutes.</h2>
          <ul className="wp-need" style={{ gridTemplateColumns: '1fr' }}>
            <li>
              <span className="wp-mk">1</span>
              <div>
                <div className="wp-nt">Create your account</div>
                <div className="wp-nd">
                  Use your name-based @browardschools.com email, the same one on the Marcomm Meeting
                  invitation, not your P-number. Choose a password of at least 8 characters.
                </div>
              </div>
            </li>
            <li>
              <span className="wp-mk">2</span>
              <div>
                <div className="wp-nt">Access is added for you</div>
                <div className="wp-nd">
                  If your email is on the Marcomm Meeting list, MarComm Assignments opens to you right away.
                  No approval to wait for.
                </div>
              </div>
            </li>
            <li>
              <span className="wp-mk">3</span>
              <div>
                <div className="wp-nt">Open MarComm Assignments</div>
                <div className="wp-nd">
                  Sign in at bcpsmarcomm.com any time. MarComm Assignments is on your home page and in the menu.
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section className={step(3)}>
          <span className="wp-eyebrow">Updating Your Items</span>
          <h2>How to update what you own.</h2>
          <ul className="wp-need">
            <li>
              <span className="wp-mk">1</span>
              <div>
                <div className="wp-nt">Click My items</div>
                <div className="wp-nd">Shows only the requests where you are the lead or support.</div>
              </div>
            </li>
            <li>
              <span className="wp-mk">2</span>
              <div>
                <div className="wp-nt">Open a request</div>
                <div className="wp-nd">Click any row to see its details, contact and notes.</div>
              </div>
            </li>
            <li>
              <span className="wp-mk">3</span>
              <div>
                <div className="wp-nt">Set the status</div>
                <div className="wp-nd">In Progress, Needs Info, Scheduled, On Hold, Completed and more.</div>
              </div>
            </li>
            <li>
              <span className="wp-mk">4</span>
              <div>
                <div className="wp-nt">Add a note</div>
                <div className="wp-nd">Type it, or use Record to speak it. Each note is dated and shows your name.</div>
              </div>
            </li>
          </ul>
          <p className="wp-hint">Updates save as you make them, and the team sees them right away.</p>
        </section>

        <section className={step(4, 'wp-center')}>
          <span className="wp-eyebrow">Ready</span>
          <h2>Ready to get started?</h2>
          <p className="wp-lead" style={{ margin: '14px auto 0', maxWidth: '48ch' }}>
            Create your MarComm Assignments account. Access restricted to @browardschools.com addresses.
          </p>
          <a href="/marcomm-registration/register" className="wp-cta-btn">Create Your Account</a>
          <p className="wp-hint" style={{ marginTop: 16 }}>
            Already have a bcpsmarcomm.com account?{' '}
            <a href={MARCOMM_LOGIN} style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>Log in</a>{' '}
            and your MarComm access is added.
          </p>
        </section>
      </div>

      <nav className="wp-nav">
        <div className="wp-nav-row">
          <button className="wp-btn" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous step">Back</button>
          <div className="wp-dots">
            {Array.from({ length: TOTAL }, (_, d) => (
              <button key={d} className={`wp-dot-btn${d === i ? ' wp-on' : ''}`} aria-label={'Go to step ' + (d + 1)} onClick={() => go(d)} />
            ))}
          </div>
          <div className="wp-nav-right">
            <button className="wp-btn wp-btn-primary" onClick={() => go(i === TOTAL - 1 ? 0 : i + 1)} aria-label="Next step">
              {i === TOTAL - 1 ? 'Start Over' : 'Next'}
            </button>
          </div>
        </div>
      </nav>
    </div>
  )
}
