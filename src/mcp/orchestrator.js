/**
 * 团餐规划编排层
 *
 * 完整调用链路（基于麦当劳 MCP Server 真实接口行为）：
 *   1. query-nearby-stores      定位门店，取 storeCode
 *   2. query-meal-assistance    确认门店团餐助餐能力（beType=6 专属接口）
 *   3. query-meals              拉取门店菜单分类与餐品编码
 *   4. calculate-price          批量计价，获得每个餐品的真实实付价
 *   5. list-nutrition-foods     拉取营养数据，按名称匹配补全
 *   6. query-store-coupons      门店可用券
 *   7. available-coupons        麦麦省可领券（合并去重）
 *   8. auto-bind-coupons        可选：一键领券
 *   9. campaign-calendar        营销活动校验
 *  10. calculate-price          最终方案权威计价复核
 *  11. create-order             用户确认后下单（默认 dry-run）
 *
 * 重要发现（来自真实接口验证）：
 *   query-meal-detail 不返回价格；价格必须经 calculate-price 计算获得。
 *   因此"取价"是一次批量计价，而非逐个商品详情查询。
 *
 * 安全默认值：dryRun=true 时仅生成方案，不创建订单；支付始终由用户本人完成。
 */

import { McdMcpClient } from './client.js';
import {
  normalizeCoupons,
  normalizeNutrition,
  enrichNutrition,
} from './adapter.js';
import { solveCateringPlan } from '../solver.js';
import { renderPlan } from '../report/render.js';

export const BE_TYPE = { DINE_IN: 1, DELIVERY: 2, DRIVE_THRU: 5, CATERING: 6 };
const PRICE_BATCH = 12; // 单次计价请求的最大商品数

/**
 * @param {object} req
 * @param {number} req.headcount
 * @param {number} req.budgetPerPerson
 * @param {string} [req.address]   门店定位关键词（城市+地点）
 * @param {string} [req.city]
 * @param {string} [req.storeCode]  直接指定门店编码
 * @param {number} [req.beType]     场景：1-到店取餐（默认），6-企业团餐
 * @param {boolean} [req.allowSplitOrder]
 * @param {boolean} [req.autoBindCoupons]
 * @param {boolean} [req.dryRun]
 * @param {string}  [req.token]
 */
export async function planCatering(req) {
  const {
    headcount,
    budgetPerPerson,
    address,
    city,
    storeCode,
    beType = BE_TYPE.DINE_IN,
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

  // ---- 1. 门店定位 ----
  let store = null;
  if (storeCode) {
    store = { code: storeCode, name: '指定门店', address: '' };
    step('query-nearby-stores', '用户指定 storeCode，跳过搜索');
  } else {
    const payload = await client.callTool('query-nearby-stores', {
      beType: BE_TYPE.DINE_IN,
      searchType: 2, // 2 = 按位置搜索
      city: city ?? '',
      keyword: address ?? '',
    });
    const list = payload?.data ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      return {
        ok: false,
        reason: 'no_store_found',
        message: `未找到「${city ?? ''}${address ?? ''}」附近的可选门店，请更换关键词或直接指定 storeCode`,
        trace,
      };
    }
    store = {
      code: list[0].storeCode,
      name: list[0].storeName,
      address: list[0].address,
      distance: list[0].distance,
      businessHours: `${list[0].businessStartTime}-${list[0].businessEndTime}`,
    };
    step('query-nearby-stores', `定位到 ${list.length} 家门店，采用「${store.name}」（${store.distance}m）`);
  }

  const baseArgs = { storeCode: store.code, beType, orderType: beType === BE_TYPE.DINE_IN ? 1 : 2 };

  // ---- 2. 团餐助餐能力校验 ----
  let assistance = null;
  try {
    assistance = await client.callTool('query-meal-assistance', {
      storeCode: store.code,
      beType: BE_TYPE.CATERING,
    });
    step('query-meal-assistance', '已查询门店团餐助餐能力');
  } catch (err) {
    step('query-meal-assistance', `该门店暂无团餐助餐权限：${String(err.message).slice(0, 60)}`);
  }

  // ---- 3. 菜单 ----
  const menuPayload = await client.callTool('query-meals', baseArgs);
  const categories = menuPayload?.data?.categories ?? [];
  const codeMap = new Map();
  for (const cat of categories) {
    const catName = (cat.name ?? '').replace(/\n/g, '');
    for (const m of cat.meals ?? []) {
      if (!codeMap.has(m.code)) {
        codeMap.set(m.code, { code: m.code, tags: m.tags ?? [], category: catName });
      }
    }
  }
  step('query-meals', `获取 ${categories.length} 个分类、${codeMap.size} 个餐品编码`);

  if (codeMap.size === 0) {
    return {
      ok: false,
      reason: 'empty_menu',
      message: '该门店当前未返回可售餐品，请更换门店或稍后再试',
      trace,
    };
  }

  // ---- 4. 批量计价取真实价格 ----
  const codes = [...codeMap.keys()];
  const priced = [];
  for (let i = 0; i < codes.length; i += PRICE_BATCH) {
    const batch = codes.slice(i, i + PRICE_BATCH);
    try {
      const res = await client.callTool('calculate-price', {
        ...baseArgs,
        items: batch.map((code) => ({ productCode: code, quantity: 1 })),
      });
      for (const p of res?.data?.productList ?? []) {
        const meta = codeMap.get(p.productCode);
        priced.push({
          code: p.productCode,
          name: p.productName,
          price: (p.subtotal ?? 0) / 100,
          originalPrice: (p.originalSubtotal ?? 0) / 100,
          tags: meta?.tags ?? [],
          category: meta?.category ?? '',
          allergens: [],
          servings: /多人|拼盘|分享/.test(p.productName ?? '') ? 2 : 1,
          isCombo: /套|餐/.test(p.productName ?? ''),
        });
      }
    } catch (err) {
      step('calculate-price', `第 ${i / PRICE_BATCH + 1} 批计价失败：${String(err.message).slice(0, 50)}`);
    }
    await new Promise((r) => setTimeout(r, 80)); // 避免触发限流
  }
  step('calculate-price', `批量计价完成，${priced.length} 个餐品取得实时价格`);

  let menu = priced;

  // ---- 5. 营养补全 ----
  let enrichedCount = 0;
  try {
    const nutritionPayload = await client.callTool('list-nutrition-foods', {});
    const nutritionMap = normalizeNutrition(nutritionPayload);
    const res = enrichNutrition(menu, nutritionMap);
    menu = res.items;
    enrichedCount = res.enriched;
    step('list-nutrition-foods', `营养数据补全 ${enrichedCount} 项`);
  } catch (err) {
    step('list-nutrition-foods', `营养数据获取失败：${String(err.message).slice(0, 50)}`);
  }

  // ---- 6/7. 优惠券 ----
  let coupons = [];
  try {
    const payload = await client.callTool('query-store-coupons', { storeCode: store.code, beType });
    coupons = normalizeCoupons(payload);
    step('query-store-coupons', `门店可用券 ${coupons.length} 张`);
  } catch (err) {
    step('query-store-coupons', `门店券获取失败：${String(err.message).slice(0, 50)}`);
  }

  try {
    const payload = await client.callTool('available-coupons', {});
    const available = normalizeCoupons(payload);
    const seen = new Set(coupons.map((c) => c.id));
    coupons = [...coupons, ...available.filter((c) => !seen.has(c.id))];
    step('available-coupons', `补充可领券，累计 ${coupons.length} 张`);

    if (autoBindCoupons && available.length > 0) {
      try {
        await client.callTool('auto-bind-coupons', {});
        step('auto-bind-coupons', '已自动领取全部可用券');
      } catch (err) {
        step('auto-bind-coupons', `自动领券失败：${String(err.message).slice(0, 50)}`);
      }
    }
  } catch (err) {
    step('available-coupons', `麦麦省券查询失败：${String(err.message).slice(0, 50)}`);
  }

  // ---- 8. 营销活动 ----
  try {
    const cal = await client.callTool('campaign-calendar', {});
    const list = cal?.data?.campaigns ?? cal?.data ?? cal?.campaigns ?? [];
    step('campaign-calendar', `已校验当前营销活动（${Array.isArray(list) ? list.length : 0} 项）`);
  } catch (err) {
    step('campaign-calendar', `活动日历查询失败：${String(err.message).slice(0, 50)}`);
  }

  // ---- 9. 求解 ----
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

  // ---- 10. MCP 权威计价复核 ----
  let priceCheck = null;
  try {
    const res = await client.callTool('calculate-price', {
      ...baseArgs,
      items: best.items.map((i) => ({ productCode: i.code, quantity: i.quantity })),
    });
    const official = (res?.data?.price ?? 0) / 100;
    const diff = Math.abs(official - best.total);
    priceCheck = {
      official,
      local: best.total,
      matched: diff < 0.02,
      note: diff < 0.02 ? '与 MCP 计价一致' : `存在 ¥${diff.toFixed(2)} 差异，以 MCP 实时结果为准`,
    };
    step('calculate-price', `MCP 复核总价 ¥${official}`);
  } catch (err) {
    step('calculate-price', `计价复核失败：${String(err.message).slice(0, 50)}`);
  }

  // ---- 11. 下单 ----
  let order = null;
  if (!dryRun && priceCheck?.matched) {
    try {
      order = await client.callTool('create-order', {
        ...baseArgs,
        items: best.items.map((i) => ({ productCode: i.code, quantity: i.quantity })),
      });
      step('create-order', '订单已创建，等待用户本人完成支付');
    } catch (err) {
      step('create-order', `下单失败：${String(err.message).slice(0, 60)}`);
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