#!/bin/bash
# 一键推送 + 设置 Topics 检查
#
# 用法：./push.sh
# 前提：本地已配置好 GitHub 凭据（钥匙串或 PAT）

set -e
cd "$(dirname "$0")/.."

echo "=== 推送前自检 ==="
echo "分支: $(git branch --show-current)"
echo "待推送提交数: $(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
echo "文件数: $(git ls-files | wc -l | tr -d ' ')"

# Token 泄露检查
if git ls-files -z | xargs -0 grep -l "1yPT2kYRM6S2OtBWMfGrC1WTIkqCmvpJ" 2>/dev/null; then
  echo "✗ 检测到 Token 泄露，终止推送"
  exit 1
fi
echo "✓ 无 Token 泄露"

echo ""
echo "=== 运行测试 ==="
node --test "test/*.test.js" 2>&1 | grep -E "# (tests|pass|fail)"

echo ""
echo "=== 推送 ==="
git push origin main

echo ""
echo "✓ 推送完成"
echo ""
echo "接下来请在网页端完成两件事（各1-2分钟）："
echo ""
echo "1. 设置 Topics（GitHub 搜不到你的项目 = 白做）"
echo "   https://github.com/harry1729/mcd-nutrition-planner"
echo "   右侧栏 Topics 齿轮 → 逐个添加并回车："
echo "   mcdonalds  mcp  mcp-server  ai-agent  nutrition"
echo "   meal-planning  constraint-solver  catering  skill"
echo ""
echo "2. 启用 GitHub Pages（解决国内访问慢）"
echo "   同一页面 → Settings → Pages → Source 选 main 分支 / (root)"
echo "   启用后访问：https://harry1729.github.io/mcd-nutrition-planner/landing/"
echo ""
echo "3. 可选：把仓库 Description 改成含关键词的版本（利于搜索）"
echo "   当前描述已含关键词，若要强化可加：'
echo "   团餐营养合规决策助手 | MCP | 过敏原 | 蛋白质 | 钠 | 背包DP"
