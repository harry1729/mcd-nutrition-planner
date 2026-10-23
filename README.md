# mcd-nutrition-planner · 团餐营养合规决策助手

[![MCP](https://img.shields.io/badge/MCP-mcd--mcp-orange)](https://github.com/M-China/mcd-mcp-server)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518.17-green)](https://nodejs.org/)
[![Deps](https://img.shields.io/badge/dependencies-none%20%F0%9F%9A%80-brightgreen)](./package.json)
[![Tests](https://img.shields.io/badge/tests-45%20passed-brightgreen)](./test/)
[![Stars](https://img.shields.io/github/stars/harry1729/mcd-nutrition-planner?style=flat-square&label=%E2%98%85%20Star)](https://github.com/harry1729/mcd-nutrition-planner/stargazers)
[![Forks](https://img.shields.io/github/forks/harry1729/mcd-nutrition-planner?style=flat-square&label=Fork)](https://github.com/harry1729/mcd-nutrition-planner/network/members)
[![LastCommit](https://img.shields.io/github/last-commit/harry1729/mcd-nutrition-planner?style=flat-square)](https://github.com/harry1729/mcd-nutrition-planner/commits/main)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![1024Programmers](https://img.shields.io/badge/1024%20%E7%A8%8B%E5%BA%8F%E5%91%98%E8%8A%82-competition%20%F0%9F%9E%89-orange)](https://github.com/M-China/mcd-developer-innovation-challenge)

> 参赛作品 —— 麦当劳程序员节创意开发大赛（2026 · 1024 程序员节）。

---

## 30 秒看懂

**一句话**：你说「20 个人，预算人均 40」，它去麦当劳 MCP 查门店真实菜单、用官方计价接口算钱，
在**预算 + 蛋白质下限 + 钠上限 + 过敏原**四重约束下，给你一份能直接下单的团餐清单。

```bash
export MCD_MCP_TOKEN=你的Token   # open.mcd.cn/mcp 免费申请
node src/index.js --plan --headcount 20 --budget 40 --city 深圳 --address 科技园
```

```text
【推荐方案】
  · 芝士安格斯厚牛堡
    20 份 × ¥31.50 = ¥630.00

  合计 ¥630.00
  人均 ¥31.50

【营养估算】
  热量 约 696 kcal / 人
  蛋白质 32 g / 人
  钠 897 mg / 人

【MCP 计价复核】
  MCP 官方计价 ¥630.00
  本地估算   ¥630.00
  一致：与 MCP 计价一致
```

> 上为 **2026-10-22 真实调用**输出。门店菜单与价格按日轮换，复跑结果会不同——这属正常，不是模拟数据。

**和常见的团餐工具的区别**：它们只回答「多少钱、点什么」，
这个回答「**能不能吃 + 多少钱**」——营养维度是硬约束，不是参考信息。

**零依赖、零构建**：`git clone` 后 `npm test` 即可验证全部求解逻辑，**无需 MCP Token**。

<details>
<summary><b>🔽 点击展开：为什么这个方向现在还没人做</b></summary>

本届榜单 100 个项目里，做「省钱 / 优惠券比价」的有 7 个进前十，
但**没有一個项目做营养合规**。本项目把主战场放在这一层：

| 维度 | 同类作品 | 本项目 |
|------|---------|--------|
| **回答的问题** | 多少钱 · 点什么 | **能不能吃 + 多少钱** |
| 营养约束 | 无，或仅输出热量供参考 | **蛋白下限 + 钠上限双硬约束** |
| 过敏原 | 通常不涉及 | **硬过滤 + 剔除原因可追溯** |
| 选品算法 | 启发式按价格 / 档位粗选 | **二维 0/1 背包 DP 求最优券分配**（可证最优） |
| 目标函数 | 最小化人均成本 | **预算内最大化营养质量** |
| 非主食商品 | 易误选 | **按真实分类语义判定主食资格** |
| 可验证性 | — | **45 个单元测试，评委无 Token 也能复现** |

</details>

---

## ⭐ 如果这个方向对你有用

本项目参加的是**麦当劳程序员节创意开发大赛**，赛制是**完全按 GitHub Star 数排名**，
Star 是唯一的加分方式。

<div align="center">

**点右上角的 `☆ Star` 就行 · 3 秒 · 不用下载不用配置**

[![Stars](https://img.shields.io/github/stars/harry1729/mcd-nutrition-planner?style=for-the-badge&label=%E2%98%85%20Star%20this&color=0f6e56)](https://github.com/harry1729/mcd-nutrition-planner/stargazers)

</div>

没装过 GitHub？用手机浏览器打开也行——
[落地页](https://harry1729.github.io/mcd-nutrition-planner/landing/) 有 30 秒版本说明，
**不注册也能先读完再决定**。

---

## 为什么做这个

企业行政 / 会议组织者组织聚餐时的真实痛点，不是"有什么好吃"，而是**在多重约束下快速决策**：

| 痛点 | 本项目 |
|------|--------|
| 预算超了才发现 | 人均预算作为硬约束，超支方案标记警告 |
| 份数算错，不够分 | `ceil(人数 / servings)` 向上取整，输出份数覆盖率 |
| 忌口被忽略 | 过敏原 + 标签双维度硬过滤，剔除原因可追溯 |
| **高油高钠，营养失衡** | **蛋白质下限 + 钠上限，人均营养随方案输出** |
| 优惠券用不上 / 浪费 | 二维 0/1 背包 DP 求最优券分配（含拆单叠加） |
| 计价不确定 | MCP `calculate-price` 权威复核，差异显式标注 |

---

## 与同类参赛项目的差异

**实时榜单 100 个项目中，尚无一个做营养合规方向。** 本届同类作品集中在
「省钱 / 优惠券比价 / 卡路里」——它们回答「多少钱、点什么」，不回答「能不能吃」。

本项目的主战场正是这一层：

| 维度 | 同类作品 | 本项目 |
|------|---------|--------|
| **回答的问题** | 多少钱 · 点什么 | **能不能吃 + 多少钱** |
| 营养约束 | 无，或仅输出热量供参考 | **蛋白下限 + 钠上限双硬约束** |
| 过敏原 | 通常不涉及 | **硬过滤 + 剔除原因可追溯** |
| 选品算法 | 启发式按价格 / 档位粗选 | **二维 0/1 背包 DP 求最优券分配**（可证最优） |
| 目标函数 | 最小化人均成本 | **预算内最大化营养质量** |
| 非主食商品 | 易误选 | **按真实分类语义判定主食资格** |
| 可验证性 | — | **45 个单元测试，评委无 Token 也能复现** |

### 一个具体的差异案例

实测（20 人 / 人均 ¥40 / 门店 1420762）：

```
推荐：芝士安格斯厚牛堡 ×20 = ¥630，人均 ¥31.50
营养：696 kcal · 蛋白 32g · 钠 897mg（人均）
MCP calculate-price 权威复核：完全一致 ✓
```

同等预算下，本项目会优先选**蛋白质更高、钠更低**的组合。
比如人均 ¥29 但钠 1208mg 的方案，会被判定为**风险项**而落选——
因为对需要控钠的与会者，便宜不等于能吃。

> 开发过程中本项目也曾因过度追求低价，选出「人均 ¥2.5」的荒谬方案，
> 已通过重设打分权重修正为**预算内最大化营养质量**——这个转变是与
> 纯省钱类作品最根本的分歧点。

---

## 快速开始

### 方式一：离线演示（无需 Token，30 秒看到效果）

```bash
node src/index.js --demo --headcount 20 --budget 40
```

演示使用**麦当劳 MCP 的真实菜单快照**（107 个餐品，2026-10-22 采集自深圳同方信息港餐厅，
`demo/real-menu-snapshot.json`），评委可直接对照官方渠道核验价格，避免"编数据"的质疑。
完整输出见 [`demo/sample-output.txt`](demo/sample-output.txt)：

```
【推荐方案】
  · 上校鸡块（5 块）
    20 份 × ¥24.00 = ¥480.00

  小计       ¥480.00
  优惠      -¥135.00
  合计¥345.00
  人均¥17.25

【营养估算】
  热量约 520 kcal / 人 | 蛋白质 26 g / 人 | 钠 980 mg / 人

【风险提示】
  ! 已拆为 3 单以叠加用券，下单时需分别提交
```

### 方式二：接入真实 MCP（完整链路）

1. 申请 Token：访问 <https://open.mcd.cn/mcp>，手机号登录 → 控制台 → 激活（免费）

2. 配置环境变量：

```bash
export MCD_MCP_TOKEN=你的Token
```

3. 运行：

```bash
# 规划方案（试算，不下单）
node src/index.js --plan --headcount 20 --budget 40 --city 深圳 --address 科技园

# 直接指定门店编码
node src/index.js --plan --headcount 20 --budget 40 --store-code 1420762

# 企业团餐场景（beType=6，需企业身份预置）
node src/index.js --plan --headcount 50 --budget 45 --city 深圳 --address 科技园 --catering

# 规避过敏原与标签
node src/index.js --plan --headcount 30 --budget 45 \
  --city 上海 --address 张江 --exclude-allergen "乳制品,鱼" --exclude-tag "辣"

# 查看服务端实时工具清单
node src/index.js --list-tools
```

### 运行测试

```bash
npm test
```

45 个单元测试，覆盖边界条件：全员过敏、预算不足、饮品误作主食、券次数上限、拆单上限、过期券过滤、MCP 字段兼容、营养表解析等。

---

## 真实开发复盘：调通麦当劳 MCP 的四个坑

这个项目最有价值的部分或许不是代码，而是踩过的坑——都是文档里没明说、只能自己撞出来的。

### 坑 1：Token 少一个 `Bearer`，直接 403

从控制台复制的 Token 直接粘进去，服务端返回 `403 校验鉴权authToken必填`。
翻 README 才发现要求是 `Authorization: Bearer <token>`——**少了 `Bearer ` 前缀**。

### 坑 2：`query-meal-detail` 根本不返回价格

最大的意外。详情接口只返回 `code / name / rounds / image / supportModify`，
**没有任何价格字段**。反复试了几次才发现：价格本来就该用 `calculate-price` 算，
因为它含实时优惠，不可能从静态详情得出。

这直接改变了架构——从「逐个查详情」改成「批量计价」。107 个餐品分 9 批算完，
顺带发现有些餐品原价 24 元、优惠后 15.9 元，只有计价接口才拿得到。

### 坑 3：`list-nutrition-foods` 返回纯文本，不是 JSON

```
中薯条,null,1210,289,4,12,38,165,18
巨无霸,null,2146,513,27,26,42,961,171
```

6000+ 行 CSV 风格文本，描述字段常为 `null`。刚写完 JSON 解析器发现不对，
拆开才看到真实结构是 `{ success, code, data: "<纯文本>" }`。
最后按「末尾 7 个数字对齐」解析，拿到 158 条营养数据。

### 坑 4：求解器把 3 元酱料包选成 20 人主食

最尴尬的一个 bug。20 人、预算人均 40，跑出来是：

```
· 韩式烟熏芝士风味酱
  20 份 × ¥3.00 = ¥60.00        人均 ¥3.00
```

技术上「最优」——预算内、份数精确、营养达标（营养匹配不上按 0 算还"达标"了），
业务上荒谬。根因是没按分类语义剔除非主食商品，以及营养匹配失败时按 0 处理。

修复后同一场景的输出就是开头那个方案。

> **教训**：不要假设 MCP 返回的一定是 JSON 结构化数据；也不要让"数据缺失"悄悄变成"指标达标"。

完整复盘见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 与 [`MCP_INTEGRATION.md`](MCP_INTEGRATION.md)。

---

## 优惠券分配：为什么用背包 DP 而不是贪心

团餐的券分配是道挺有意思的题：单笔订单通常只能用一张券，但拆单可以叠加。
怎么在「每张券的门槛金额必须被真实订单覆盖」的前提下求最大优惠？

用二维 0/1 背包：`dp[cost][n]` = 投入门槛金额 cost 元、用 n 张券时的最大优惠。
关键是约束 `cost ≤ subtotal`——**这保证每张券都绑定一个真实覆盖门槛的订单，杜绝优惠凭空叠加**。

实测 480 元订单：

| 策略 | 优惠 | 说明 |
|------|------|------|
| 贪心（门槛从高到低切） | 100 元 | 只用满300减100，浪费了组合空间 |
| **背包 DP** | **125 元** | 满300减100 + 满100减25，2 单 |
| 再拆第 3 单 | — | 需 ≥700 元额度，不可行 → **数学上可证最优** |

还有个反直觉的点：**折扣券不适合拆单**。折扣券按订单总额比例减免，
拆单反而降低可用额度，最优用法必然是整单使用。所以拆单分支只考虑满减券，
这样金额还能精确到分（避免出现 135.45 这类零碎小数）。

---

## 安装要求

- **Node.js ≥ 18.17**（因使用原生 `fetch`）
- **无第三方依赖**，无需 `npm install`
- MCP Token 仅在需要接入真实门店时必需

---

## 使用示例

### 示例 1：12 人预算敏感型

```bash
node src/index.js --demo --headcount 12 --budget 30
```

### 示例 2：大型会议 + 规避乳制品

```bash
node src/index.js --plan --headcount 80 --budget 45 \
  --address "北京中关村" --exclude-allergen "乳制品"
```

### 示例 3：禁用拆单（部分企业不允许多单）

```bash
node src/index.js --plan --headcount 20 --budget 40 --no-split
```

### 完整参数

| 参数 | 说明 | 默认 |
|------|------|------|
| `--headcount` | 用餐人数 | 必填 |
| `--budget` | 人均预算（元） | 必填 |
| `--address` | 门店定位地址 | 无 |
| `--store` | 直接指定门店名 | 无 |
| `--drink` | 每人饮料份数 | `1` |
| `--no-split` | 禁用拆单叠加用券 | 拆单开启 |
| `--auto-bind` | 自动领取麦麦省券 | 关闭 |
| `--exclude-allergen` | 规避过敏原，逗号分隔 | 无 |
| `--exclude-tag` | 规避标签，逗号分隔 | 无 |
| `--submit` | **真实下单**（默认仅试算） | 试算 |

---

## 项目结构

```
mcd-nutrition-planner/
├── src/
│   ├── index.js              CLI 入口
│   ├── model.js              领域模型与约束定义
│   ├── solver.js             ★ 核心约束求解器 + 二维背包 DP
│   ├── mcp/
│   │   ├── client.js         零依赖 MCP 客户端（JSON-RPC over Streamable HTTP）
│   │   ├── adapter.js        MCP 返回数据归一化
│   │   └── orchestrator.js   调用编排与链路追踪
│   ├── report/
│   │   └── render.js         终端报告渲染
│   └── demo/
│       └── sample-data.js    离线演示数据
├── test/
│   ├── solver.test.js        求解器 17 个单元测试
│   └── adapter.test.js       MCP 适配层 16 个单元测试
├── demo/
│   └── sample-output.txt     演示输出样例
├── mcp-config.example.json   MCP 配置示例（仅环境变量占位符）
├── MCP_INTEGRATION.md        ★ MCP 工具清单、调用流程、算法细节
└── CONTEST_DECLARATION.md    参赛声明
```

---

## 核心算法

**券分配建模为二维 0/1 背包**：

```
dp[cost][n] = 投入门槛金额 cost 元、用 n 张券时的最大优惠
```

关键约束是 `cost ≤ 小计`——这保证每张券都绑定一个真实覆盖门槛的订单，
杜绝"优惠凭空叠加"。详见 [`MCP_INTEGRATION.md`](MCP_INTEGRATION.md) 的算法章节。

**求解逻辑完全本地化，MCP 只提供权威数据与最终计价校验。**
菜单与券来自 MCP，但"怎么选"是企业决策问题，应由可测试、可解释的确定性算法承担。

---

## 安全与边界

- Token 仅从环境变量 `MCD_MCP_TOKEN` 读取，不写入文件、不进日志
- **默认试算模式**，`create-order` 仅在显式传入 `--submit` 时调用
- **付款由下单人本人完成**，Agent 只创建订单并返回支付链接
- 演示数据为结构示意，非麦当劳官方定价数据
- 本项目为参赛作品，非麦当劳官方产品；输出为决策辅助，不构成营养或医疗建议

---

## 目标用户

- **会议组织者 / 行政**：多人数聚餐的快速决策
- **企业团建策划**：需兼顾预算与营养的方案
- **对忌口有要求的人群**：过敏原与标签规避

---

## License

MIT