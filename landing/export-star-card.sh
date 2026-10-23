#!/bin/bash
# 单张分享图导出（含二维码生成 + 识别验证）
#
# 用法：./export-star-card.sh
# 依赖：Chrome、Python venv（qrcode + pillow + opencv）

set -e
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PY="/Users/faithchen/.workbuddy/binaries/python/envs/default/bin/python"
URL="https://github.com/harry1729/mcd-nutrition-planner"
HEIGHT=1104   # 卡片实际高度，改文案后需微调

mkdir -p png

echo "1/3 生成二维码..."
"$PY" - <<PYEOF
import qrcode
from qrcode.constants import ERROR_CORRECT_H
qr = qrcode.QRCode(
    version=None,
    error_correction=ERROR_CORRECT_H,  # 30% 容错，微信压缩后仍可识别
    box_size=16,
    border=4,
)
qr.add_data("$URL")
qr.make(fit=True)
img = qr.make_image(fill_color="#1a1a1a", back_color="white")
img.save("png/star-qr.png")
print(f"    版本={qr.version} 模块={qr.modules_count} 像素={img.size[0]}px")
PYEOF

echo "2/3 导出分享图（375宽 2x 高清）..."
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=2 --user-data-dir=/tmp/cr-starcard \
  --screenshot=png/star-card.png --window-size=375,$HEIGHT \
  "file://$(pwd)/star-card.html" 2>/dev/null | grep -i written || true

echo "3/3 验证二维码可被识别..."
"$PY" - <<PYEOF
import cv2
img = cv2.imread("png/star-card.png")
data, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
if data == "$URL":
    print("    ✓ 验证通过，二维码指向正确")
else:
    print(f"    ✗ 验证失败，解码结果：{data!r}")
    raise SystemExit(1)
PYEOF

echo ""
echo "完成 → png/star-card.png"
