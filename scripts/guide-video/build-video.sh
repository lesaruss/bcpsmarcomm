#!/usr/bin/env bash
# Build a guide walkthrough video (Sean, 2026-11-10: "shots of the website ...
# a slow zoom off of it. Nothing high tech"). One screenshot per line; each
# line's screen slowly zooms in for as long as its cleaned audio runs, with a
# short fade between screens. 1920x1080, H.264 + AAC, ready for the Depot's
# final slot.
#   build-video.sh <out.mp4> <shot1.png> <line1.wav> [<shot2.png> <line2.wav> ...]
set -euo pipefail
out="$1"; shift
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
i=0; list="$tmp/list.txt"; : > "$list"
while [ "$#" -ge 2 ]; do
  shot="$1"; line="$2"; shift 2; i=$((i+1))
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$line")
  # a half second of air after each line
  secs=$(python3 -c "print(round(float('$dur') + 0.5, 2))")
  frames=$(python3 -c "print(int(float('$secs') * 30) + 1)")
  ffmpeg -hide_banner -loglevel error -y -loop 1 -i "$shot" -i "$line" \
    -filter_complex "[0:v]scale=3840:-2,crop=3840:2160:0:0,zoompan=z='1+0.0006*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=30,fade=t=in:st=0:d=0.4,fade=t=out:st=$(python3 -c "print(round(float('$secs')-0.4,2))"):d=0.4,format=yuv420p[v];[1:a]apad=pad_dur=0.5[a]" \
    -map "[v]" -map "[a]" -t "$secs" -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k -ar 48000 "$tmp/part$i.mp4"
  echo "file '$tmp/part$i.mp4'" >> "$list"
done
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" -c copy -movflags +faststart "$out"
