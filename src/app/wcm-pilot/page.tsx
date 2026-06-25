'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fwbhwfxpncrsfhttimna.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3YmhmZnhwbmNyc2ZodHRpbW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY0OTcxNDQsImV4cCI6MjAzMjA3MzE0NH0.FP8EI_sQSwGV3N5gGADZkCdVBm6RqHXlPtL9dh5GKf4';

interface Department {
  id: string;
  name: string;
}

export default function WCMPilotIntake() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase
        .from('k12_departments')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      setDepartments(data || []);
    } catch (error) {
      console.error('Error loading departments:', error);
      setMessage({ type: 'error', text: 'Failed to load departments. Please refresh the page.' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDept || !agreeTerms) {
      setMessage({ type: 'error', text: 'Please complete all required fields.' });
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      const { error } = await supabase.from('wcm_pilot_enrollments').insert([
        {
          department_id: selectedDept,
          agreed_to_terms: agreeTerms,
          status: 'pending_activation',
          enrolled_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Enrollment complete! Check your email for access details.' });
      setSelectedDept('');
      setAgreeTerms(false);

      setTimeout(() => {
        window.location.href = '/wcm-pilot/confirmation';
      }, 2000);
    } catch (error) {
      console.error('Enrollment error:', error);
      setMessage({ type: 'error', text: 'Enrollment failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

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
        <nav className="space-y-2">
          <a href="#" className="block px-5 py-3 bg-[#3D7CA5] rounded font-medium text-sm">
            WCM Pilot
          </a>
          <a href="#" className="block px-5 py-3 text-white/80 hover:bg-[#3D7CA5] rounded text-sm">
            Resources
          </a>
          <a href="#" className="block px-5 py-3 text-white/80 hover:bg-[#3D7CA5] rounded text-sm">
            Support
          </a>
        </nav>
      </aside>

      <main className="flex-1 ml-60 bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-10 py-5 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">WCM Pilot Program Intake</h1>
            <p className="text-sm text-gray-600 mt-1">Broward County Public Schools</p>
          </div>
          <button
            onClick={() => {
              if (confirm('Sign out of the WCM Pilot program?')) {
                console.log('Logging out...');
              }
            }}
            className="px-7 py-2 border border-[#2B5F8F] text-[#2B5F8F] rounded hover:bg-[#2B5F8F] hover:text-white font-semibold text-sm transition"
          >
            Sign Out
          </button>
        </header>

        <div className="p-10 max-w-3xl">
          <div className="bg-white rounded-lg p-10 shadow-sm">
            <div className="grid grid-cols-[120px_1fr] gap-8 mb-10">
              <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-[#2B5F8F] to-[#3D7CA5] flex items-center justify-center text-white text-5xl flex-shrink-0">
                👋
              </div>
              <div className="p-6 bg-gray-50 border-l-4 border-[#F4A300] rounded">
                <h2 className="text-xl font-bold text-[#2B5F8F] mb-3">Welcome to the K12 Unlocked WCM Pilot</h2>
                <p className="text-gray-700 leading-relaxed">
                  We are excited to have you join the pilot program. This onboarding process takes just a few minutes. Select your department, review the pilot terms, and you will be set up to start exploring K12 Unlocked with your team.
                </p>
              </div>
            </div>

            {message && (
              <div
                className={`p-4 rounded mb-6 ${
                  message.type === 'success'
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}
              >
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-10">
                <h3 className="text-base font-semibold text-[#2B5F8F] mb-4">Step 1: Select Your Department</h3>
                <div>
                  <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-2">
                    Which department do you represent?
                  </label>
                  <select
                    id="department"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-[#2B5F8F] focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Choose your department...</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-base font-semibold text-[#2B5F8F] mb-4">Step 2: Pilot Program Agreement</h3>
                <div className="flex gap-3 p-4 bg-gray-50 rounded">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    required
                    className="w-4 h-4 mt-1 flex-shrink-0"
                  />
                  <label htmlFor="terms" className="text-sm text-gray-700">
                    I understand and agree to the K12 Unlocked Pilot Program Terms. I commit to providing feedback and participating actively in the pilot phase.
                  </label>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-7 py-3 bg-[#2B5F8F] text-white rounded font-semibold hover:bg-[#3D7CA5] disabled:bg-gray-400 transition flex items-center gap-2"
                >
                  {loading && <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>}
                  {loading ? 'Processing...' : 'Complete Enrollment'}
                </button>
                <button
                  type="reset"
                  className="px-7 py-3 border border-[#2B5F8F] text-[#2B5F8F] rounded font-semibold hover:bg-[#2B5F8F] hover:text-white transition"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}