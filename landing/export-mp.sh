#!/bin/bash
# 公众号物料一键导出
#
# 用法：./export-mp.sh
# 产出：
#   png/mp-cover.png   公众号封面图（900x383，2.35:1）
#   png/mp-bugs.png    正文配图：四个踩坑（竖版）
#   png/mp-star.png    文末Star 引导图（含二维码）
#   png/star-qr.png    二维码本体
#
# 依赖：Chrome、Python venv（qrcode + pillow + opencv）

set -e
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PY="/Users/faithchen/.workbuddy/binaries/python/envs/default/bin/python"
URL="https://github.com/harry1729/mcd-nutrition-planner"

mkdir -p png

# 截一张图并裁掉底部空白
snap() {
  local html=$1 out=$2 h=$3
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=2 --user-data-dir="/tmp/cr-$$-$RANDOM" \
    --screenshot="$out" --window-size=375,$h "file://$(pwd)/$html" >/dev/null 2>&1
  "$PY" - "$out" <<'PYEOF'
import sys
from PIL import Image
p = sys.argv[1]
im = Image.open(p); w, h = im.size
bg = im.getpixel((5, h - 5))
last = h
for y in range(h - 1, 0, -1):
    row = [im.getpixel((x, y)) for x in range(0, w, 40)]
    if any(abs(q[0]-bg[0]) + abs(q[1]-bg[1]) + abs(q[2]-bg[2]) > 12 for q in row):
        last = y; break
im.crop((0, 0, w, min(h, last + 30))).save(p)
print(f"    {p}  {Image.open(p).size[0]}x{Image.open(p).size[1]}")
PYEOF
}

echo "1/4 生成二维码..."
"$PY" - <<PYEOF
import qrcode
from qrcode.constants import ERROR_CORRECT_H
qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=16, border=4)
qr.add_data("$URL")
qr.make(fit=True)
qr.make_image(fill_color="#1a1a1a", back_color="white").save("png/star-qr.png")
print(f"    版本={qr.version} 模块={qr.modules_count}")
PYEOF

echo "2/4 封面图..."
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=2 --user-data-dir="/tmp/cr-$$-cov" \
  --screenshot=png/mp-cover.png --window-size=900,383 "file://$(pwd)/mp-cover.html" >/dev/null 2>&1
echo "    png/mp-cover.png  $(file png/mp-cover.png | grep -o '[0-9]* x [0-9]*')"

echo "3/4 正文配图..."
snap mp-result.html png/mp-result.png 900
snap mp-bugs.html png/mp-bugs.png 1040
snap mp-star.html png/mp-star.png 1150

echo "4/4 验证二维码..."
"$PY" - <<PYEOF
import cv2
for f in ["png/mp-star.png", "png/star-qr.png"]:
    d, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(f))
    print(f"    {'✓' if d == '$URL' else '✗'} {f} → {d!r}")
PYEOF

echo ""
echo "完成。素材在 png/ 目录："
echo "  mp-cover.png   公众号封面（2.35:1）"
echo "  mp-result.png  正文配图：真实运行结果"
echo "  mp-bugs.png    正文配图：四个踩坑"
echo "  mp-star.png    文末 Star 引导（含二维码）"
