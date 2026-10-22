/**
 * 团餐决策求解器
 *
 * 目标：在「人均预算 + 营养下限 + 过敏原规避 + 份数准确」四重约束下，
 * 从门店真实菜单中选出一份可下单的最优组合。
 *
 * 设计要点：
 * 1. 纯函数，不依赖 MCP 与网络，便于单测与离线演示。
 * 2. 先做硬约束过滤（可行性优先），再做多目标打分排序（帕累托式）。
 * 3. 拆单策略显式建模：麦当劳优惠券多为「每单限用一张」，允许拆单时可显著提升优惠率。
 */

import { Plan } from './model.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** 硬约束过滤：剔除不可用商品 */
function filterItems(menu, input) {
  const excludeAllergens = new Set(input.excludeAllergens ?? []);
  const excludeTags = new Set(input.excludeTags ?? []);
  const reasons = [];

  const passed = menu.filter((item) => {
    const hitAllergen = (item.allergens ?? []).find((a) => excludeAllergens.has(a));
    if (hitAllergen) {
      reasons.push({ code: item.code, name: item.name, reason: `含过敏原：${hitAllergen}` });
      return false;
    }
    const hitTag = (item.tags ?? []).find((t) => excludeTags.has(t));
    if (hitTag) {
      reasons.push({ code: item.code, name: item.name, reason: `命中排除标签：${hitTag}` });
      return false;
    }
    if (!(item.price > 0)) return false;
    return true;
  });

  return { passed, rejected: reasons };
}

/**
 * 组合枚举：主食 1~2 种 + 饮料可选
 * 规模受控（菜单通常 10~40 项），故采用两层笛卡尔积后剪枝。
 */
function enumerateCombos(mainItems, drinkItem, input) {
  const combos = [];
  const drinkPerPerson = input.drinkCountPerPerson ?? 0;

  for (const main of mainItems) {
    const servings = main.servings ?? 1;
    const mainQty = Math.ceil(input.headcount / servings);
    const mainCost = mainQty * main.price;

    const variants = [{ drinkQty: 0, addCost: 0, drink: null }];
    if (drinkItem && drinkPerPerson > 0) {
      variants.push({ drinkQty: drinkPerPerson * input.headcount, addCost: drinkPerPerson * input.headcount * drinkItem.price, drink: drinkItem });
    }

    for (const v of variants) {
      const subtotal = round2(mainCost + v.addCost);
      const items = [{ ...main, quantity: mainQty }];
      if (v.drink) items.push({ ...v.drink, quantity: v.drinkQty });

      combos.push({
        id: `${main.code}${v.drink ? '+' + v.drink.code : ''}`,
        items,
        subtotal,
        headcount: input.headcount,
        // 份数覆盖率：实际份数是否足够每人一份
        coverage: Number(((mainQty * servings) / input.headcount).toFixed(3)),
        nutrition: {
          kcal: round2(mainQty * (main.kcal ?? 0) + v.drinkQty * (v.drink?.kcal ?? 0)),
          protein: round2(mainQty * (main.protein ?? 0) + v.drinkQty * (v.drink?.protein ?? 0)),
          sodium: round2(mainQty * (main.sodium ?? 0) + v.drinkQty * (v.drink?.sodium ?? 0)),
        },
      });
    }
  }
  return combos;
}

/**
 * 用券优化：单单模式下取「当前可用且门槛已满足」的最优券；
 * 拆单模式下二分/贪心估算拆单份数带来的额外优惠。
 */
function optimizeCoupons(combo, coupons, input, options = {}) {
  const deliveryFee = options.deliveryFee ?? 0;
  const usable = coupons.filter((c) => !c.expireAt || new Date(c.expireAt) >= new Date());

  const valueOf = (c, base) => {
    if (base < (c.threshold ?? 0)) return 0;
    //折扣券金额统一按分取整，避免出现 135.15 这类零碎小数
    const raw = c.type === 'fixed' ? c.amount : base * (1 - (c.percent ?? 1));
    const capped = c.type === 'discount' ? Math.min(raw, c.maxDiscount ?? raw) : raw;
    return Math.floor(capped * 100) / 100;
  };

  if (!input.allowSplitOrder) {
    let best = { discount: 0, coupon: null };
    for (const c of usable) {
      const v = valueOf(c, combo.subtotal);
      if (v > best.discount) best = { discount: round2(v), coupon: c };
    }
    const total = round2(combo.subtotal + deliveryFee - best.discount);
    return { ...best, deliveryFee, total, orders: 1, splitDetail: null };
  }

  // 拆单：动态规划求最优券分配
  // 定义 dp[j] = 恰好花费 j 元门槛金额时能获得的最大优惠。
  // 转移：dp[j] = max(dp[j], dp[j - threshold] + value(coupon, threshold))
  // 约束：j + 剩余需覆盖 <= subtotal，故 dp 的有效范围为[0, subtotal]
  // 该写法保证每张券都绑定一个真实覆盖门槛的订单，杜绝优惠凭空叠加。
  // 拆单：二维 0/1 背包，求「门槛金额投入最小化约束下」的最大优惠
  //
  // 建模说明：
  //   状态 dp[cost][n] = 投入门槛金额 cost 元、使用 n 张券时的最大优惠（元）
  //   转移：对每种满减券，尝试使用 k 张（k ≤ maxUsePerCoupon）
  //   约束：cost ≤ subtotal（订单总额覆盖所有门槛），n ≤ maxSplitOrders（可执行性）
  //
  // 为何拆单只考虑满减券（fixed）：
  //   折扣券按订单总额比例减免，拆单反而会降低可用额度，其最优用法必然是整单使用，
  //   已在 allowSplitOrder=false 分支中处理。排除后可保证拆单金额精确到分。
  const candidates = usable.filter((c) => c.type === 'fixed' && Math.round(c.threshold ?? 0) > 0);
  const maxOrders = Math.max(1, input.maxSplitOrders ?? 4);
  const maxUsePerCoupon = Math.max(1, input.maxUsePerCoupon ?? 2);

  const maxCost = Math.floor(combo.subtotal);
  if (candidates.length === 0 || maxCost < 1) {
    const total = round2(combo.subtotal + deliveryFee);
    return { discount: 0, coupon: null, couponsUsed: [], deliveryFee, total, orders: 1, splitDetail: null };
  }

  // dp[cost][n]：优惠金额（元），NEG 表示不可达
  const NEG = -1;
  const dp = Array.from({ length: maxCost + 1 }, () => new Int32Array(maxOrders + 1).fill(NEG));
  dp[0][0] = 0;
  const trace = Array.from({ length: maxCost + 1 }, () => new Array(maxOrders + 1).fill(null));

  for (const c of candidates) {
    const th = Math.round(c.threshold);
    const gain = Math.round(c.amount ?? 0);
    if (th <= 0 || gain <= 0) continue;

    for (let k = 1; k <= maxUsePerCoupon; k++) {
      const addCost = k * th;
      const addGain = k * gain;
      if (addCost > maxCost) break;
      for (let cost = maxCost; cost >= addCost; cost--) {
        for (let n = maxOrders; n >= k; n--) {
          const prev = dp[cost - addCost][n - k];
          if (prev < 0) continue;
          const cand = prev + addGain;
          if (cand > dp[cost][n]) {
            dp[cost][n] = cand;
            trace[cost][n] = {
              prevCost: cost - addCost,
              prevN: n - k,
              coupon: { couponId: c.id, couponName: c.name, base: th, count: k },
            };
          }
        }
      }
    }
  }

  // 取所有 (cost, n) 组合中的最大优惠
  let bestCost = 0;
  let bestN = 0;
  for (let cost = 0; cost <= maxCost; cost++) {
    for (let n = 0; n <= maxOrders; n++) {
      if (dp[cost][n] > dp[bestCost][bestN]) {
        bestCost = cost;
        bestN = n;
      }
    }
  }

  // 回溯得到券清单
  const used = [];
  {
    let cost = bestCost;
    let n = bestN;
    while (trace[cost][n]) {
      const step = trace[cost][n];
      used.push(step.coupon);
      cost = step.prevCost;
      n = step.prevN;
    }
  }

  const capped = Math.min(dp[bestCost][bestN], combo.subtotal);
  const orders = used.reduce((a, u) => a + u.count, 0);

  return {
    discount: capped,
    coupon: used[0]?.couponId ?? null,
    couponsUsed: used,
    deliveryFee,
    total: round2(combo.subtotal + deliveryFee - capped),
    orders: Math.max(orders, 1),
    splitDetail: used.length ? used : null,
  };
}

/** 多目标打分：份数与营养为硬性门槛，预算内则优先选择质量更高者 */
function scoreCombo(combo, billing, input) {
  const perPerson = round2(billing.total / input.headcount);
  const budget = input.budgetPerPerson;

  const budgetScore = perPerson <= budget
    ? 1 - (perPerson / budget) * 0.3          // 越省钱越好，但不过度激励
    : Math.max(0, 1 - (perPerson - budget) / budget * 2);

  const minProtein = input.minProteinPerPerson ?? 20;
  const maxSodium = input.maxSodiumPerPerson ?? 2000;
  const proteinPer = combo.nutrition.protein / input.headcount;
  const sodiumPer = combo.nutrition.sodium / input.headcount;

  const proteinScore = Math.min(1, proteinPer / minProtein);
  const sodiumScore = Math.min(1, maxSodium / Math.max(sodiumPer, 1));
  const coverageScore = Math.min(1, combo.coverage);

  //质量分：同等预算下，用更高蛋白、更低钠的方案（避免"便宜但难吃"）
  const qualityScore = Math.min(1, proteinPer / (minProtein * 1.6));

  const total = 0.25 * budgetScore + 0.2 * proteinScore + 0.15 * sodiumScore
    + 0.15 * coverageScore + 0.25 * qualityScore;

  return {
    perPerson,
    proteinPer: round2(proteinPer),
    sodiumPer: round2(sodiumPer),
    withinBudget: perPerson <= budget,
    score: Number(total.toFixed(4)),
  };
}

/**
 * 主入口：生成团餐方案
 * @param {MenuItem[]} menu 归一化后的菜单
 * @param {Coupon[]} coupons 可用优惠券
 * @param {PlanInput} input 规划输入
 * @returns {{plans: Plan[], best: Plan, diagnostics: object}}
 */
export function solveCateringPlan(menu, coupons, input) {
  const diagnostics = { menuSize: menu.length, couponSize: coupons.length, rejected: [], feasibility: 'ok' };

  if (!input.headcount || input.headcount < 1) {
    throw new Error('headcount 必须为正整数');
  }
  if (!(input.budgetPerPerson > 0)) {
    throw new Error('budgetPerPerson 必须大于 0');
  }

  const { passed, rejected } = filterItems(menu, input);
  diagnostics.rejected = rejected;
  if (passed.length === 0) {
    diagnostics.feasibility = 'no_feasible_item';
    return { plans: [], best: null, diagnostics };
  }

  const drinkItem = passed.find((i) => (i.tags ?? []).includes('饮料')) ?? null;
  const mainItems = passed.filter((i) => i !== drinkItem);

  // 边界：饮料不可作为主食。若剔除饮料后无可选，说明整体不可行。
  if (mainItems.length === 0) {
    diagnostics.feasibility = 'no_feasible_item';
    diagnostics.rejected.push({
      code: drinkItem?.code ?? 'N/A',
      name: drinkItem?.name ?? 'N/A',
      reason: '仅有饮品，无可作为主食的餐品',
    });
    return { plans: [], best: null, alternatives: [], diagnostics };
  }

  const combos = enumerateCombos(mainItems, drinkItem, input);
  if (combos.length === 0) {
    diagnostics.feasibility = 'no_combo';
    return { plans: [], best: null, alternatives: [], diagnostics };
  }

  const scored = combos
    .map((combo) => {
      const billing = optimizeCoupons(combo, coupons, input, { deliveryFee: input.deliveryFee ?? 0 });
      const metrics = scoreCombo(combo, billing, input);
      const warnings = [];
      if (!metrics.withinBudget) warnings.push(`超出人均预算 ¥${round2(metrics.perPerson - input.budgetPerPerson)}`);
      if (metrics.sodiumPer > (input.maxSodiumPerPerson ?? 2000)) warnings.push('钠含量高于建议上限，建议搭配低钠饮品或减半分食');
      if (metrics.proteinPer < (input.minProteinPerPerson ?? 20)) warnings.push('蛋白质低于建议下限，建议加配高蛋白单品');
      if (combo.coverage < 1) warnings.push(`份数余量${Math.round((combo.coverage - 1) * 100)}%，可能存在不够分的情况`);
      if (billing.orders > 1) warnings.push(`已拆为 ${billing.orders} 单以叠加用券，下单时需分别提交`);

      return {
        combo, billing, metrics, warnings,
        plan: new Plan({
          items: combo.items,
          combos: combo.id,
          subtotal: combo.subtotal,
          discount: billing.discount,
          deliveryFee: billing.deliveryFee,
          total: billing.total,
          perPerson: metrics.perPerson,
          nutrition: {
            kcalPerPerson: round2(combo.nutrition.kcal / input.headcount),
            proteinPerPerson: metrics.proteinPer,
            sodiumPerPerson: metrics.sodiumPer,
          },
          warnings,
          coverage: combo.coverage,
        }),
      };
    })
    .sort((a, b) => b.metrics.score - a.metrics.score);

  const plans = scored.map((s) => s.plan);
  const feasible = scored.filter((s) => s.metrics.withinBudget);
  const winner = (feasible.length ? feasible : scored)[0];

  diagnostics.feasibility = feasible.length ? 'ok' : 'over_budget';
  diagnostics.candidates = scored.length;
  diagnostics.withinBudget = feasible.length;

  // winner 是 scored 包装项，需取 .plan 才是可交付的 Plan 实例
  return { plans, best: winner ? winner.plan : null, alternatives: scored.slice(1, 4).map((s) => s.plan), diagnostics };
}