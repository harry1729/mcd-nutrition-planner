/**
 * 团餐规划编排层
 *
 * 完整调用链路：
 *   1. query-nearby-stores      定位可配送/可用门店
 *   2. query-meal-assistance    确认该门店是否支持企业团餐助餐（团餐场景关键前置校验）
 *   3. query-meals              拉取该门店在售菜单
 *   4. list-nutrition-foods     补全营养数据
 *   5. query-store-coupons      拉取该门店可用券
 *   6. available-coupons + auto-bind-coupons  补充并自动领取麦麦省券（可选）
 *   7. campaign-calendar        校验是否与当前营销活动冲突
 *   8. calculate-price          用 MCP 权威口径复核总价
 *   9. create-order             用户确认后下单（默认 dry-run，不自动支付）
 *
 * 安全默认值：neverAutoOrder=true 时仅生成方案，调用方显式传 false 才真正下单。
 */

import { McdMcpClient } from './client.js';
import {
  normalizeMenu,
  normalizeCoupons,
  normalizeStores,
  normalizeNutrition,
  enrichNutrition,
} from './adapter.js';
import { solveCateringPlan } from '../solver.js';
import { renderPlan } from '../report/render.js';

/**
 * @param {object} req
 * @param {number} req.headcount
 * @param {string} [req.address]        门店定位地址
 * @param {string} [req.storeName]      直接指定门店名（跳过门店搜索）
 * @param {number} req.budgetPerPerson
 * @param {boolean} [req.allowSplitOrder]
 * @param {boolean} [req.autoBindCoupons] 是否自动领取麦麦省券
 * @param {boolean} [req.dryRun]        true=只算价不下单（默认）
 * @param {string}  [req.token]
 */
export async function planCatering(req) {
  const {
    headcount,
    budgetPerPerson,
    address,
    storeName,
    allowSplitOrder = true,
    autoBindCoupons = false,
    dryRun = true,
    token,
  } = req;

  const trace = [];
  const client = new McdMcpClient({ token });
  const step = (name, detail) => {
    trace.push({ step: trace.length + 1, tool: name, detail });
    console.error(`  [${trace.length}] ${name}${detail ? ' — ' + detail : ''}`);
  };

  await client.init();
  console.error('✓ MCP 会话已建立');

  // 1. 门店定位
  let stores = [];
  if (storeName) {
    stores = [{ code: '', name: storeName, address: address ?? '', distance: 0 }];
    step('query-nearby-stores', '用户指定门店，跳过搜索');
  } else {
    const storePayload = await client.callTool('query-nearby-stores', { address: address ?? '' });
    stores = normalizeStores(storePayload);
    step('query-nearby-stores', `定位到 ${stores.length} 家门店`);
  }

  if (stores.length === 0) {
    return {
      ok: false,
      reason: 'no_store_found',
      message: `未找到「${address}」附近的可选门店，请更换地址或直接指定门店名`,
      trace,
    };
  }

  const store = stores[0];
  const storeKey = store.code || store.name;

  // 2. 团餐助餐能力校验（企业团餐场景核心）
  let assistance = null;
  try {
    assistance = await client.callTool('query-meal-assistance', { storeCode: storeKey, storeName: store.name });
    step('query-meal-assistance', '已确认该门店团餐助餐能力');
  } catch (err) {
    step('query-meal-assistance', `该门店未返回助餐信息：${err.message}`);
  }

  // 3. 菜单
  const menuPayload = await client.callTool('query-meals', { storeCode: storeKey, storeName: store.name });
  let menu = normalizeMenu(menuPayload);
  step('query-meals', `获取 ${menu.length} 项在售餐品`);

  // 4. 营养补全
  let enrichedCount = 0;
  try {
    const nutritionPayload = await client.callTool('list-nutrition-foods', {});
    const nutritionMap = normalizeNutrition(nutritionPayload);
    const res = enrichNutrition(menu, nutritionMap);
    menu = res.items;
    enrichedCount = res.enriched;
    step('list-nutrition-foods', `营养数据补全 ${enrichedCount} 项`);
  } catch (err) {
    step('list-nutrition-foods', `营养数据获取失败：${err.message}`);
  }

  // 5. 门店券
  let coupons = [];
  try {
    const couponPayload = await client.callTool('query-store-coupons', { storeCode: storeKey, storeName: store.name });
    coupons = normalizeCoupons(couponPayload);
    step('query-store-coupons', `门店可用券 ${coupons.length} 张`);
  } catch (err) {
    step('query-store-coupons', `门店券获取失败：${err.message}`);
  }

  // 6. 麦麦省券补充 + 可选自动领取
  try {
    const availablePayload = await client.callTool('available-coupons', {});
    const available = normalizeCoupons(availablePayload);
    const seen = new Set(coupons.map((c) => c.id));
    coupons = [...coupons, ...available.filter((c) => !seen.has(c.id))];
    step('available-coupons', `补充可领券，累计 ${coupons.length} 张`);

    if (autoBindCoupons && available.length > 0) {
      try {
        await client.callTool('auto-bind-coupons', {});
        step('auto-bind-coupons', '已自动领取全部可用券');
      } catch (err) {
        step('auto-bind-coupons', `自动领券失败：${err.message}`);
      }
    }
  } catch (err) {
    step('available-coupons', `麦麦省券查询失败：${err.message}`);
  }

  // 7. 营销活动校验
  try {
    const cal = await client.callTool('campaign-calendar', {});
    const active = cal?.campaigns ?? cal?.list ?? cal;
    step('campaign-calendar', `已校验当前营销活动（${Array.isArray(active) ? active.length : 0} 项）`);
  } catch (err) {
    step('campaign-calendar', `活动日历查询失败：${err.message}`);
  }

  // 8. 求解
  const { best, alternatives, diagnostics } = solveCateringPlan(menu, coupons, {
    headcount,
    budgetPerPerson,
    allowSplitOrder,
  });

  if (!best) {
    return {
      ok: false,
      reason: diagnostics.feasibility,
      message: '当前约束下无可行方案，请放宽预算或调整忌口条件',
      diagnostics,
      trace,
      usedTools: client.usedTools(),
    };
  }

  // 9. MCP 权威口径复核
  let priceCheck = null;
  try {
    const calcPayload = await client.callTool('calculate-price', {
      items: best.items.map((i) => ({ beCode: i.code, beQuantity: i.quantity, beName: i.name })),
    });
    const officialTotal = toNumber(
      calcPayload?.totalPrice ?? calcPayload?.payAmount ?? calcPayload?.total,
      NaN,
    );
    if (Number.isFinite(officialTotal)) {
      const diff = Math.abs(officialTotal - best.total);
      priceCheck = {
        official: officialTotal,
        local: best.total,
        matched: diff < 0.01,
        note: diff < 0.01 ? '与 MCP 计价一致' : `存在 ¥${diff.toFixed(2)} 差异，以 MCP 为准`,
      };
      step('calculate-price', `MCP 复核总价 ¥${officialTotal}`);
    }
  } catch (err) {
    step('calculate-price', `计价复核失败：${err.message}`);
  }

  // 10. 下单
  let order = null;
  if (!dryRun && priceCheck?.matched) {
    try {
      const orderPayload = await client.callTool('create-order', {
        storeCode: storeKey,
        storeName: store.name,
        beType: 1,
        items: best.items.map((i) => ({ beCode: i.code, beQuantity: i.quantity, beName: i.name })),
      });
      order = orderPayload;
      step('create-order', '订单已创建，等待用户自行完成支付');
    } catch (err) {
      step('create-order', `下单失败：${err.message}`);
    }
  }

  return {
    ok: true,
    store,
    assistance,
    best,
    alternatives,
    diagnostics: { ...diagnostics, enrichedNutrition: enrichedCount, menuItems: menu.length },
    priceCheck,
    order,
    dryRun,
    report: renderPlan({
      store,
      best,
      alternatives,
      input: { headcount, budgetPerPerson, allowSplitOrder },
      priceCheck,
      nutritionEnriched: enrichedCount,
    }),
    trace,
    usedTools: client.usedTools(),
  };
}

function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}