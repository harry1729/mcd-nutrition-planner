#!/bin/bash
# 分享图导出脚本
#
# 依赖：本机安装 Google Chrome
# 用法：./export-png.sh
#
# 原理：Chrome headless 按窗口尺寸截图，故先注入 JS 实测卡片高度，
#       再按精确高度导出 2x 高清 PNG（微信里发不糊）。

set -e
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCALE=2

if [ ! -x "$CHROME" ]; then
  echo "✗ 未找到 Chrome，请检查路径：$CHROME"
  exit 1
fi

mkdir -p png

# 各卡片标识与固定宽度
CARDS="a b c d"

echo "测量各卡片实际高度..."
declare -a HEIGHTS
for k in $CARDS; do
  # 注入脚本把 offsetHeight 写入 title
  python3 -c "
import pathlib
s = pathlib.Path('shot-$k.html').read_text(encoding='utf-8')
s = s.replace('</body>', '<script>document.title=document.querySelector(\".card\").offsetHeight;</script></body>')
pathlib.Path('_probe_$k.html').write_text(s, encoding='utf-8')
"
  h=$("$CHROME" --headless --disable-gpu --window-size=400,3000 --dump-dom \
      "file://$(pwd)/_probe_$k.html" 2>/dev/null \
      | grep -o '<title>[0-9]*</title>' | grep -o '[0-9]*' | head -1)
  rm -f "_probe_$k.html"
  # JS 在受限视口内可能低估，按经验补足余量并取大值
  [ -z "$h" ] && h=800
  HEIGHTS+=("$h")
  echo "  卡 $k → ${h}px"
done

echo ""
echo "导出 PNG（${SCALE}x 高清）..."
i=0
for k in $CARDS; do
  h=${HEIGHTS[$i]}
  # Chrome 截图高度即为窗口高度，为避免底部留白，统一 +4
  out=$(( h + 4 ))
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=$SCALE \
    --window-size=375,$out \
    --screenshot="png/shot-$k.png" "file://$(pwd)/shot-$k.html" >/dev/null 2>&1
  echo "  ✓ png/shot-$k.png (375×${out})"
  i=$((i + 1))
done

echo ""
echo "完成。图片在 png/ 目录，可直接发微信。"
echo ""
echo "发送顺序建议："
echo "  shot-a.png  主图（痛点 + Star 指引 + 地址）"
echo "  shot-b.png  差异化对比"
echo "  shot-c.png  踩坑复盘"
echo "  shot-d.png  收尾CTA（二次 Star 引导）"