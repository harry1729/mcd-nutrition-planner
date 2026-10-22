# mcd-catering-planner · 企业团餐决策助手

> 20 人会议餐该点什么？预算 ¥800，人均 ¥40，还要避开过敏原、别超钠、券要用满。
> —— 这个项目给出可下单的答案，而不是一堆菜单让你自己看。

基于**麦当劳 MCP Server** 的企业会议 / 团建聚餐决策助手。在**预算、营养、过敏原、份数**四重约束下，
用可测试的确定性算法输出可直接下单的团餐方案，而不是让模型黑盒决策。

**零依赖、零构建**：`git clone` 后 `npm test` 即可验证全部求解逻辑，无需 MCP Token。

---

## 为什么做这个

企业行政 / 会议组织者组织聚餐时的真实痛点，不是"有什么好吃"，而是**在多重约束下快速决策**：

| 痛点 | 本项目 |
|------|--------|
| 预算超了才发现 | 人均预算作为硬约束，超支方案标记警告 |
| 份数算错，不够分 | `ceil(人数 / servings)` 向上取整，输出份数覆盖率 |
| 忌口被忽略 | 过敏原 + 标签双维度硬过滤，剔除原因可追溯 |
| 高油高钠，营养失衡 | 蛋白质下限 + 钠上限，人均营养随方案输出 |
| 优惠券用不上 / 浪费 | 二维 0/1 背包 DP 求最优券分配（含拆单叠加） |
| 计价不确定 | MCP `calculate-price` 权威复核，差异显式标注 |

**与榜单上同类项目的差异**：现有参赛作品多集中在个人用户的省钱 / 卡路里场景。本项目面向 **B 端组织者**，
且**不以"最便宜"为目标**——开发过程中曾出现"人均 ¥2.5"的荒谬结果（过度追求低价），
已通过重设打分权重修正为**预算内最大化营养质量**。

---

## 快速开始

### 方式一：离线演示（无需 Token，30 秒看到效果）

```bash
node src/index.js --demo --headcount 20 --budget 40
```

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
node src/index.js --plan --headcount 20 --budget 40 --address "深圳南山科技园"

# 规避过敏原与标签
node src/index.js --plan --headcount 30 --budget 45 \
  --address "上海张江" --exclude-allergen "乳制品,鱼" --exclude-tag "辣"

# 查看服务端实时工具清单
node src/index.js --list-tools
```

### 运行测试

```bash
npm test
```

33 个单元测试，覆盖边界条件：全员过敏、预算不足、饮品误作主食、券次数上限、拆单上限、过期券过滤、MCP 字段兼容等。

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
mcd-catering-planner/
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