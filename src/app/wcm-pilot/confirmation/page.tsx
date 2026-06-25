'use client';

import { useEffect, useState } from 'react';

export default function WCMPilotConfirmation() {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.location.href = '/';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="fixed h-screen w-60 bg-[#2B5F8F] text-white p-6 overflow-y-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-[#F4A300] text-[#2B5F8F] rounded font-black text-lg flex items-center justify-center">
              K
            </div>
            <div>
              <div className="font-bold text-sm">BCPS</div>
              <div className="text-xs opacity-80">K-12 UNLOCKED</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 ml-60 bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-10 py-5">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Enrollment Confirmed</h1>
            <p className="text-sm text-gray-600 mt-1">Broward County Public Schools</p>
          </div>
        </header>

        <div className="p-10 max-w-3xl">
          <div className="bg-white rounded-lg p-10 shadow-sm text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-[#2B5F8F] mb-3">Pilot Enrollment Complete</h2>
            <p className="text-gray-700 text-lg mb-6">
              Your enrollment in the K12 Unlocked WCM Pilot has been confirmed.
            </p>

            <div className="text-left bg-gray-50 p-6 rounded-lg mb-8 border-l-4 border-[#F4A300]">
              <h3 className="font-semibold text-[#2B5F8F] mb-4">What happens next:</h3>
              <ol className="space-y-3 text-gray-700">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#2B5F8F] text-white text-center text-sm font-semibold">1</span>
                  <span>You will receive a confirmation email at your BCPS email address</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#2B5F8F] text-white text-center text-sm font-semibold">2</span>
                  <span>Access credentials will be sent within 2 business days</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#2B5F8F] text-white text-center text-sm font-semibold">3</span>
                  <span>Log in and explore K12 Unlocked features with your team</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#2B5F8F] text-white text-center text-sm font-semibold">4</span>
                  <span>Share feedback via the pilot feedback form</span>
                </li>
              </ol>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Redirecting to home in {countdown} second{countdown !== 1 ? 's' : ''}...
            </p>
            <a href="/" className="inline-block px-6 py-2 border border-[#2B5F8F] text-[#2B5F8F] rounded font-semibold hover:bg-[#2B5F8F] hover:text-white transition">
              Go Home Now
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}