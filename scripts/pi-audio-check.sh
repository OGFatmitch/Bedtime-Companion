#!/usr/bin/env bash
set -euo pipefail

test_file="${1:-/usr/share/sounds/alsa/Front_Center.wav}"

echo "Playback devices"
aplay -l
echo "Capture devices"
arecord -l
echo "Playing ${test_file} at the currently configured safe mixer level"
aplay "${test_file}"
echo "Recording five seconds to /tmp/bedtime-mic-check.wav"
arecord -d 5 -c 1 -r 16000 -f S16_LE /tmp/bedtime-mic-check.wav
echo "Recorded /tmp/bedtime-mic-check.wav"
