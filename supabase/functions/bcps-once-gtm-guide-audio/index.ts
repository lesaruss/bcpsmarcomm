// Kept in the repo so the narration can be regenerated; the deployed copy is
// stubbed (410) between uses. Redeploy this file, POST the slide texts from
// src/app/tag-manager-guide/slides.ts, copy the mp3s into public/audio/gtm-guide,
// then stub it again.
// One-time function: narration for the Google Tag Manager guide
// (bcpsmarcomm /tag-manager-guide, 2026-11-05). Lists ElevenLabs voices, or
// renders each slide's text with ElevenLabs and stores it in the public
// bcps-public bucket at audio/gtm-guide/<id>.mp3. Stub it once the files are
// in the repo. Caller must send the project service key.
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  const sent = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const sb = createClient(URL_, KEY);
  const { data: svc } = await sb.from('lesaruss_secrets').select('value').eq('key', 'SUPABASE_SERVICE_ROLE_KEY').maybeSingle();
  if (!sent || (sent !== KEY && sent !== svc?.value)) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { data: k } = await sb.from('lesaruss_secrets').select('value').eq('key', 'ELEVENLABS_API_KEY').single();
  const xi = k?.value;
  if (!xi) return json({ error: 'no ElevenLabs key' }, 500);

  if (body.action === 'voices') {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': xi } });
    const j = await r.json();
    return json((j.voices || []).map((v: any) => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels })));
  }

  const out = [];
  for (const it of body.items || []) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${body.voice_id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': xi, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: it.text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15 } }),
    });
    if (!r.ok) { out.push({ id: it.id, error: `${r.status} ${(await r.text()).slice(0, 200)}` }); continue; }
    const buf = new Uint8Array(await r.arrayBuffer());
    const { error } = await sb.storage.from('bcps-public').upload(`audio/gtm-guide/${it.id}.mp3`, buf, { contentType: 'audio/mpeg', upsert: true });
    out.push({ id: it.id, bytes: buf.length, error: error?.message });
  }
  return json({ ok: true, out });
});
