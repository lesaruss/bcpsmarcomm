#!/usr/bin/env bash
# Clean a voice take for a guide walkthrough (Sean, 2026-11-10: "run it through
# some sort of processor"). Mono 48 kHz, low rumble cut, light noise reduction,
# gentle compression, then leveled to -16 LUFS with a two-pass loudnorm (the
# single pass misses on short clips), the same loudness as the other narration
# on the platform (canon-sean-higgsfield-voice).
#   clean-audio.sh <take.(webm|m4a|wav|mp3)> <out.wav>
set -euo pipefail
in="$1"; out="$2"
pre="highpass=f=80,lowpass=f=14000,afftdn=nr=12:nf=-30,acompressor=threshold=-21dB:ratio=3:attack=8:release=120:makeup=2"
target="I=-16:TP=-1.5:LRA=11"
m=$(ffmpeg -hide_banner -nostats -i "$in" -ac 1 -ar 48000 -af "$pre,loudnorm=$target:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { python3 -c "import json,sys; print(json.loads(sys.stdin.read())['$1'])" <<<"$m"; }
if [ -z "$m" ] || [ "$(get input_i)" = "-inf" ]; then
  echo "clean-audio: no voice found in $in (silent or empty take); record it again." >&2; exit 2
fi
ffmpeg -hide_banner -loglevel error -y -i "$in" -ac 1 -ar 48000 \
  -af "$pre,loudnorm=$target:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
  "$out"
