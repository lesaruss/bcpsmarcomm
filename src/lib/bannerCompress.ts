// In-browser video compression for New Upload (Sean, 2026-10-23): a video
// over the 50 MB limit is shrunk on the WCM's own computer the moment it is
// chosen, instead of an error and a trip to Clipchamp. Like Handbrake, it
// re-encodes to H.264 at a quality the eye cannot tell apart on a homepage
// banner; it is not mathematically lossless (that would make files bigger).
//
// Runs on WebCodecs (Edge/Chrome encode with the graphics hardware), so the
// video never leaves the machine and there is no server cost - Vercel's
// 4.5 MB function body cap rules out doing it server-side anyway. Loaded with
// a dynamic import so the library only downloads when a WCM needs it.
// Anything the browser cannot decode or encode throws CompressUnsupported,
// and the widget falls back to the Clipchamp steps.
import {
  ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality,
  canEncodeAudio, canEncodeVideo,
} from 'mediabunny'

export class CompressUnsupported extends Error {}

// Fit inside 1080p HD (the banner spec), landscape or portrait.
const BOX_LONG = 1920
const BOX_SHORT = 1080
// 1080p at 10 Mbps is well above what a banner needs; the cap keeps a short
// clip from being encoded at a needlessly large budget.
const VIDEO_MAX_BPS = 10_000_000
const AUDIO_BPS = 128_000
// Budget held back for copied audio, whose bitrate is whatever the source used.
const COPIED_AUDIO_BPS = 256_000
// Aim under the limit: hardware encoders overshoot a target bitrate a little.
const BUDGET_SHARE = 0.85

export async function probeVideoSeconds(file: File): Promise<number> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    return await input.computeDuration()
  } finally {
    input.dispose()
  }
}

export interface CompressHandle {
  done: Promise<File>
  cancel: () => void
}

export function compressBannerVideo(
  file: File,
  opts: { maxBytes: number; trimSeconds?: number; onProgress?: (p: number) => void },
): CompressHandle {
  let current: Conversion | null = null
  let canceled = false

  async function attempt(bitrateScale: number): Promise<File> {
    if (typeof VideoEncoder === 'undefined') throw new CompressUnsupported('This browser cannot compress video.')
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    try {
      const track = await input.getPrimaryVideoTrack()
      if (!track) throw new CompressUnsupported('No video track found in this file.')
      const audioTrack = await input.getPrimaryAudioTrack()
      // AAC sound (phones, Clipchamp, most cameras) is copied as-is; only other
      // codecs are re-encoded, which needs the browser's AAC encoder.
      const copyAudio = audioTrack?.codec === 'aac'
      const full = await input.computeDuration()
      const seconds = opts.trimSeconds ? Math.min(full, opts.trimSeconds) : full

      const w = track.displayWidth
      const h = track.displayHeight
      const landscape = w >= h
      const scale = Math.min(1, (landscape ? BOX_LONG : BOX_SHORT) / w, (landscape ? BOX_SHORT : BOX_LONG) / h)
      // H.264 needs even dimensions.
      const outW = Math.max(2, Math.round(w * scale / 2) * 2)
      const outH = Math.max(2, Math.round(h * scale / 2) * 2)

      const budget = (opts.maxBytes * 8 * BUDGET_SHARE) / Math.max(seconds, 1)
      const audioBps = !audioTrack ? 0 : copyAudio ? COPIED_AUDIO_BPS : AUDIO_BPS
      const videoBps = Math.round(Math.min(VIDEO_MAX_BPS, budget - audioBps) * bitrateScale)
      if (!(await canEncodeVideo('avc', { width: outW, height: outH, bitrate: videoBps }))) {
        throw new CompressUnsupported('This browser cannot encode H.264 video.')
      }
      if (audioTrack && !copyAudio && !(await canEncodeAudio('aac', { bitrate: AUDIO_BPS }))) {
        throw new CompressUnsupported('This browser cannot encode AAC audio.')
      }

      const target = new BufferTarget()
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
      const conversion = await Conversion.init({
        input, output, tracks: 'primary', showWarnings: false,
        video: { width: outW, height: outH, fit: 'contain', codec: 'avc', quality: new Quality({ bitrate: videoBps }), forceTranscode: true },
        audio: copyAudio ? { codec: 'aac' } : { codec: 'aac', quality: new Quality({ bitrate: AUDIO_BPS }) },
        trim: opts.trimSeconds ? { start: 0, end: seconds } : undefined,
      })
      // Never drop the picture or the sound without saying so.
      if (!conversion.isValid || conversion.discardedTracks.length > 0) {
        throw new CompressUnsupported('This browser cannot read this video format.')
      }
      if (canceled) throw new DOMException('Canceled', 'AbortError')
      current = conversion
      conversion.onProgress = p => opts.onProgress?.(p)
      await conversion.execute()
      if (!target.buffer) throw new Error('Compression produced no file.')
      const base = file.name.replace(/\.[^.]+$/, '')
      return new File([target.buffer], `${base}-compressed.mp4`, { type: 'video/mp4' })
    } finally {
      current = null
      input.dispose()
    }
  }

  const done = (async () => {
    let out = await attempt(1)
    // One retry at a lower bitrate if the encoder overshot the limit.
    if (out.size > opts.maxBytes && !canceled) out = await attempt(0.7)
    if (out.size > opts.maxBytes) throw new CompressUnsupported('The compressed file is still over the limit.')
    return out
  })()

  return {
    done,
    cancel: () => { canceled = true; current?.cancel() },
  }
}
