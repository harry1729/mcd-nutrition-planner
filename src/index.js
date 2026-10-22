#!/usr/bin/env node
/**
 * mcd-catering-planner CLI
 *
 * 用法：
 *   npm run demo                    离线演示（无需 Token，用内置样例数据）
 *   npm start -- --plan --headcount 20 --budget 40 --address "深圳南山科技园"
 *   npm start -- --list-tools       查看 MCP Server 可用工具
 *
 * 安全：Token 仅从环境变量读取，不出现在任何日志或文件中。
 */

import { planCatering } from './mcp/orchestrator.js';
import { McdMcpClient } from './mcp/client.js';
import { solveCateringPlan } from './solver.js';
import { renderPlan, renderTrace } from './report/render.js';
import { DEMO_COUPONS, DEMO_STORE, loadRealMenu } from './demo/sample-data.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

function printHelp() {
  console.log(`
mcd-catering-planner — 企业团餐决策助手

用法:
  node src/index.js --demo
      离线演示，使用麦当劳 MCP 真实菜单快照，无需 MCP Token

  node src/index.js --plan --headcount <人数> --budget <人均预算> --city <城市> --address <地点关键词>
      实时规划，需先配置环境变量 MCD_MCP_TOKEN

  node src/index.js --plan --headcount 20 --budget 40 --store-code 1420762
      指定门店编码，跳过门店搜索

  node src/index.js --list-tools
      列出麦当劳 MCP Server 当前可用工具

通用参数:
  --city <城市>        门店搜索城市，如深圳
  --address <关键词>    门店搜索地点关键词，如"科技园"
  --store-code <编码>   直接指定门店编码
  --catering           使用企业团餐场景（beType=6，需企业身份预置）
  --no-split          禁用拆单叠加用券
  --auto-bind         自动领取麦麦省券
  --exclude-allergen  规避过敏原，逗号分隔，如 小麦,乳制品
  --exclude-tag       规避标签，逗号分隔
  --drink <份数>      每人饮料份数，默认 1
  --submit            真实下单（默认仅试算，不下单、不支付）

安全提示:
  Token 仅从环境变量 MCD_MCP_TOKEN 读取。付款需由下单人本人完成。
`);
}

async function main() {
  if (args.help || (!args.demo && !args.plan && !args['list-tools'])) {
    printHelp();
    return;
  }

  // 离线演示
  if (args.demo) {
    const headcount = Number(args.headcount ?? 20);
    const budgetPerPerson = Number(args.budget ?? 40);

    console.log('\n【离线演示模式】使用麦当劳 MCP 真实菜单快照（2026-10-22 采集）\n');
    console.log(`门店：${DEMO_STORE.name}`);
    console.log(`规模：${headcount} 人，人均预算 ¥${budgetPerPerson}\n`);

    const menu = await loadRealMenu();
    const { best, alternatives, diagnostics } = solveCateringPlan(menu, DEMO_COUPONS, {
      headcount,
      budgetPerPerson,
      drinkCountPerPerson: Number(args.drink ?? 1),
      allowSplitOrder: args['no-split'] ? false : true,
      excludeAllergens: args['exclude-allergen']
        ? String(args['exclude-allergen']).split(',').map((s) => s.trim())
        : undefined,
      excludeTags: args['exclude-tag']
        ? String(args['exclude-tag']).split(',').map((s) => s.trim())
        : undefined,
    });

    if (!best) {
      console.log(`当前约束下无可行方案（${diagnostics.feasibility}）`);
      return;
    }

    console.log(renderPlan({
      store: DEMO_STORE,
      best,
      alternatives,
      input: { headcount, budgetPerPerson, allowSplitOrder: !args['no-split'] },
      priceCheck: null,
      nutritionEnriched: menu.filter((m) => m.kcal > 0).length,
    }));
    console.log(`\n提示：配置 MCD_MCP_TOKEN 后运行 --plan 可接入真实门店菜单与实时价格。\n`);
    return;
  }

  // 工具清单
  if (args['list-tools']) {
    const client = new McdMcpClient();
    try {
      const tools = await client.listTools();
      console.log(`\n麦当劳 MCP Server 当前提供 ${tools.length} 个工具：\n`);
      for (const t of tools) {
        console.log(`  ${t.name}`);
        console.log(`    ${(t.description ?? '').split('\n')[0]}\n`);
      }
      const relevant = ['query-meal-assistance', 'query-nearby-stores', 'query-meals', 'list-nutrition-foods',
        'query-store-coupons', 'available-coupons', 'auto-bind-coupons', 'campaign-calendar',
        'calculate-price', 'create-order'];
      console.log(`本项目使用其中 ${relevant.filter((r) => tools.some((t) => t.name === r)).length} 个：`);
      console.log('  ' + relevant.join('\n  ') + '\n');
    } catch (err) {
      console.error(`\n错误：${err.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  // 实时规划
  if (args.plan) {
    const headcount = Number(args.headcount);
    const budgetPerPerson = Number(args.budget);

    if (!headcount || !budgetPerPerson) {
      console.error('错误：--plan 需要同时提供 --headcount 与 --budget');
      process.exitCode = 1;
      return;
    }

    console.log(`\n正在规划 ${headcount} 人团餐，人均预算 ¥${budgetPerPerson}...\n`);

    try {
      const result = await planCatering({
        headcount,
        budgetPerPerson,
        address: args.address,
        city: args.city,
        storeCode: args['store-code'],
        beType: args['catering'] ? 6 : 1,
        allowSplitOrder: args['no-split'] ? false : true,
        autoBindCoupons: Boolean(args['auto-bind']),
        excludeAllergens: args['exclude-allergen']
          ? String(args['exclude-allergen']).split(',').map((s) => s.trim())
          : undefined,
        excludeTags: args['exclude-tag']
          ? String(args['exclude-tag']).split(',').map((s) => s.trim())
          : undefined,
        drinkCountPerPerson: args.drink === undefined ? 1 : Number(args.drink),
        dryRun: !args.submit,
      });

      if (!result.ok) {
        console.error(`\n未生成方案：${result.message}`);
        console.error(renderTrace(result.trace));
        process.exitCode = 1;
        return;
      }

      console.log('\n' + result.report);
      console.log(renderTrace(result.trace));
      console.log(`\n实际调用 MCP 工具（${result.usedTools.length} 个）：`);
      console.log('  ' + result.usedTools.join('\n  '));
      if (result.dryRun) {
        console.log('\n当前为试算模式，未创建订单。确认方案后可加 --submit 提交订单，付款需本人完成。\n');
      }
    } catch (err) {
      console.error(`\n规划失败：${err.message}`);
      console.error('提示：如提示 Token 缺失，请先执行 export MCD_MCP_TOKEN=你的Token');
      process.exitCode = 1;
    }
  }
}

main();