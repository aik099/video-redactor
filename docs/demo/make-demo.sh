#!/usr/bin/env bash
# Builds docs/demo/demo.mp4: a fake support console (invented data only) for screenshots and trying the editor.
# The customer card switches from Jordan Smith to Taylor Brown at 10 s. Needs ffmpeg with drawtext; macOS fonts.
set -euo pipefail

cd "$(dirname "$0")"

regular=/System/Library/Fonts/Supplemental/Arial.ttf
bold='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
mono=/System/Library/Fonts/Menlo.ttc
filters=()

# box X Y W H COLOR [THICKNESS]  (THICKNESS default: fill)
box() {
  filters+=("drawbox=x=$1:y=$2:w=$3:h=$4:color=$5:t=${6:-fill}")
}

# text X Y SIZE COLOR FONT TEXT [ENABLE]  (no commas, colons or quotes in TEXT)
text() {
  local enable=''

  if [ -n "${7:-}" ]; then
    enable=":enable='$7'"
  fi

  filters+=("drawtext=fontfile='$5':text='$6':x=$1:y=$2:fontsize=$3:fontcolor=$4$enable")
}

before='lt(t,10)'
after='gte(t,10)'

# Sidebar
box 0 0 220 720 0x1f2937
text 24 22 20 white "$bold" 'Acme Support'
box 12 120 196 36 0x374151
y=80

for item in Dashboard Customers Tickets Billing Settings; do
  text 28 $((y + 10)) 15 0xd1d5db "$regular" "$item"
  y=$((y + 44))
done

# Header with the signed-in agent
box 220 0 1060 64 white
box 220 63 1060 1 0xd1d5db
text 244 22 18 0x111827 "$bold" 'Customers / Profile'
text 1060 14 14 0x111827 "$bold" 'Jane Doe'
text 1060 36 13 0x4b5563 "$regular" 'jane.doe@example.com'

# Customer card
box 244 88 516 352 white
box 244 88 516 352 0xd1d5db 1
text 268 108 22 0x111827 "$bold" 'Jordan Smith' "$before"
text 268 108 22 0x111827 "$bold" 'Taylor Brown' "$after"
label_y=160

for label in Email Phone Address; do
  text 268 $label_y 14 0x6b7280 "$regular" "$label"
  label_y=$((label_y + 40))
done

text 380 160 15 0x111827 "$regular" 'jordan.smith@example.com' "$before"
text 380 200 15 0x111827 "$regular" '+1 555 0142' "$before"
text 380 240 15 0x111827 "$regular" '742 Evergreen Terrace · Springfield' "$before"
text 380 160 15 0x111827 "$regular" 'taylor.brown@example.org' "$after"
text 380 200 15 0x111827 "$regular" '+44 20 7946 0958' "$after"
text 380 240 15 0x111827 "$regular" '221B Baker Street · London' "$after"
text 268 300 14 0x6b7280 "$regular" 'API key'
box 376 292 360 32 0xc7cdd6 1
text 388 300 14 0x111827 "$mono" 'sk_live_51HxQ2eZvKYlo2C9a7F3pX' "$before"
text 388 300 14 0x111827 "$mono" 'sk_live_7Rq9LmN2bVc4Xz8Pk1Wd' "$after"
text 268 360 14 0x6b7280 "$regular" 'Plan'
text 380 360 15 0x111827 "$regular" 'Business · billed yearly'

# Internal note
box 244 464 516 216 white
box 244 464 516 216 0xd1d5db 1
text 268 484 16 0x111827 "$bold" 'Internal note'
text 268 520 14 0x374151 "$regular" 'Customer verified by phone. Card ending 4242.'
text 268 548 14 0x374151 "$regular" 'Refund approved by J. Doe.'

# Recent tickets
box 784 88 472 592 white
box 784 88 472 592 0xd1d5db 1
text 808 108 16 0x111827 "$bold" 'Recent tickets'
y=150

for row in '#1042 Refund request|m.lee@example.com' '#1041 Login problem|a.khan@example.net' \
  '#1039 Invoice copy|r.costa@example.org' '#1036 Plan upgrade|s.ito@example.com' '#1031 Export data|p.novak@example.net'; do
  text 808 "$y" 14 0x111827 "$regular" "${row%%|*}"
  text 1044 "$y" 14 0x4b5563 "$regular" "${row##*|}"
  box 808 $((y + 28)) 424 1 0xe5e7eb
  y=$((y + 44))
done

IFS=,
ffmpeg -hide_banner -v error -y -f lavfi -i "color=0xeef1f5:s=1280x720:r=30:d=20" -f lavfi -i "sine=frequency=440:duration=20" \
  -vf "${filters[*]}" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 64k -shortest demo.mp4
