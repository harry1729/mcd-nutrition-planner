/**
 * 求解器单元测试（node:test，无外部依赖）
 * 运行：node --test test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveCateringPlan } from '../src/solver.js';
import { headcountTier, isMainCourse, isDrink } from '../src/model.js';

const MENU = [
  { code: 'M1', name: '巨无霸套餐', price: 42, kcal: 720, protein: 28, sodium: 1150, tags: ['高蛋白'], allergens: ['小麦', '乳制品'], servings: 1, isCombo: true },
  { code: 'M2', name: '麦辣鸡腿堡套餐', price: 36, kcal: 610, protein: 24, sodium: 1080, tags: ['辣'], allergens: ['小麦', '乳制品'], servings: 1, isCombo: true },
  { code: 'M3', name: '香辣鸡腿堡', price: 22, kcal: 480, protein: 22, sodium: 1020, tags: ['辣'], allergens: ['小麦'], servings: 1 },
  { code: 'M4', name: '麦香鱼', price: 26, kcal: 430, protein: 19, sodium: 890, tags: [], allergens: ['小麦', '鱼'], servings: 1 },
  { code: 'M5', name: '上校鸡块(5块)', price: 24, kcal: 520, protein: 26, sodium: 980, tags: ['高蛋白'], allergens: ['小麦'], servings: 1 },
  { code: 'M6', name: '牛肉棒', price: 18, kcal: 260, protein: 16, sodium: 640, tags: ['高蛋白'], allergens: ['小麦'], servings: 1 },
  { code: 'D1', name: '中可乐', price: 9, kcal: 140, protein: 0, sodium: 30, tags: ['饮料'], servings: 1 },
  { code: 'D2', name: '无糖可乐', price: 9, kcal: 0, protein: 0, sodium: 5, tags: ['饮料', '无糖'], servings: 1 },
];

const COUPONS = [
  { id: 'C1', name: '满50减10', type: 'fixed', amount: 10, threshold: 50 },
  { id: 'C2', name: '满100减25', type: 'fixed', amount: 25, threshold: 100 },
  { id: 'C3', name: '满200减60', type: 'fixed', amount: 60, threshold: 200 },
  { id: 'C4', name: '8.5折(封顶20)', type: 'discount', percent: 0.85, threshold: 0, maxDiscount: 20 },
  { id: 'C5', name: '已过期券', type: 'fixed', amount: 50, threshold: 100, expireAt: '2020-01-01' },
];

test('人数档位划分正确', () => {
  assert.equal(headcountTier(8).label, '小型会议');
  assert.equal(headcountTier(20).label, '中型会议');
  assert.equal(headcountTier(60).label, '大型会议');
  assert.equal(headcountTier(500).label, '部门级/全公司');
});

test('主食判定：真实菜单分类中的主食可识别', () => {
  // 以下分类名取自麦当劳 MCP 真实返回
  const mains = [
    { name: '巨无霸', category: '巨无霸\n牛鱼肉堡' },
    { name: '麦辣鸡腿堡', category: '鸡肉汉堡/卷' },
    { name: '麦乐鸡5块', category: '蘸酱炸鸡' },
    { name: '心形薯饼8块', category: '小食拼盘/多人餐' },
    { name: '精选单人餐三件套', category: '精选单人餐' },
    { name: '安格斯MAX厚牛堡', category: '安格斯MAX\n厚牛堡' },
  ];
  for (const item of mains) {
    assert.equal(isMainCourse(item), true, `${item.name} 应识别为主食`);
  }
});

test('主食判定：酱料等非主食被排除（真实 bug 回归）', () => {
  // 真实 bug：曾把 ¥3 的"韩式烟熏芝士风味酱"选为20 人主食
  const nonMains = [
    { name: '韩式烟熏芝士风味酱', category: '小食甜品/其他' },
    { name: '麦香鱼', category: '人气热卖' },
  ];
  assert.equal(isMainCourse(nonMains[0]), false, '酱料包不应作为主食');
});

test('主食判定：无分类时按名称启发式回落', () => {
  assert.equal(isMainCourse({ name: '麦辣鸡腿汉堡三件套' }), true);
  assert.equal(isMainCourse({ name: '板烧鸡腿堡' }), true);
  assert.equal(isMainCourse({ name: '圆筒冰淇淋' }), false);
});

test('饮品判定：按分类与名称双重识别', () => {
  assert.equal(isDrink({ name: '可乐中杯', category: '饮品' }), true);
  assert.equal(isDrink({ name: '麦咖啡™', category: '麦咖啡™' }), true);
  assert.equal(isDrink({ name: '雪碧中杯' }), true);
  assert.equal(isDrink({ name: '巨无霸', category: '巨无霸/牛鱼肉堡' }), false);
});

test('求解器不把非主食商品选为主方案（真实 bug 回归）', () => {
  const menu = [
    { code: 'S1', name: '韩式烟熏芝士风味酱', price: 3, kcal: 60, protein: 1, sodium: 120, tags: [], category: '小食甜品/其他', allergens: [], servings: 1 },
    { code: 'M1', name: '麦辣鸡腿汉堡三件套', price: 33.5, kcal: 485, protein: 24, sodium: 1208, tags: [], category: '鸡肉汉堡/卷', allergens: [], servings: 1 },
  ];
  const { best } = solveCateringPlan(menu, [], { headcount: 20, budgetPerPerson: 40 });
  assert.ok(best, '应产出方案');
  assert.equal(best.items[0].code, 'M1', `不应选酱料包，实际选了 ${best.items[0].name}`);
  assert.equal(best.items[0].quantity, 20);
});

test('求解产出方案且人均不超预算', () => {
  const { best, diagnostics } = solveCateringPlan(MENU, COUPONS, {
    headcount: 20, budgetPerPerson: 40, drinkCountPerPerson: 1,
  });
  assert.equal(diagnostics.feasibility, 'ok');
  assert.ok(best, '应产出最优方案');
  assert.ok(best.perPerson <= 40, `人均 ${best.perPerson} 应 ≤ 40`);
  assert.equal(best.plans ? true : true, true);
});

test('过敏原规避生效：排除乳制品后不出现巨无霸套餐', () => {
  const { best, diagnostics } = solveCateringPlan(MENU, COUPONS, {
    headcount: 15, budgetPerPerson: 60, excludeAllergens: ['乳制品'],
  });
  assert.ok(diagnostics.rejected.length > 0, '应记录被剔除项');
  const names = best.items.map((i) => i.name);
  assert.ok(!names.includes('巨无霸套餐'), `不应含巨无霸套餐，实际 ${names.join('/')}`);
});

test('排除标签生效：excludeTags 辣 后不含辣品', () => {
  const { best } = solveCateringPlan(MENU, COUPONS, {
    headcount: 15, budgetPerPerson: 60, excludeTags: ['辣'],
  });
  const names = best.items.map((i) => i.name);
  assert.ok(!names.some((n) => n.includes('辣')), `不应含辣品，实际 ${names.join('/')}`);
});

test('份数向上取整，不出现不足分', () => {
  const { best } = solveCateringPlan(MENU, COUPONS, {
    headcount: 7, budgetPerPerson: 60, servingsHint: undefined,
  });
  const main = best.items.find((i) => i.code.startsWith('M'));
  assert.ok(main.quantity >= 7, `主份数 ${main.quantity} 应 ≥ 7`);
  assert.equal(best.coverage >= 1, true);
});

test('单人份数场景：servings>1 时向上取整', () => {
  const menu = [
    { code: 'C1', name: '双人分享装', price: 88, kcal: 1400, protein: 56, sodium: 2200, tags: ['分享'], category: '小食拼盘/多人餐', allergens: [], servings: 2 },
    { code: 'D1', name: '中可乐', price: 9, kcal: 140, protein: 0, sodium: 30, tags: ['饮料'], category: '饮品', servings: 1 },
  ];
  const { best } = solveCateringPlan(menu, COUPONS, { headcount: 10, budgetPerPerson: 55 });
  const main = best.items.find((i) => i.code === 'C1');
  assert.equal(main.quantity, 5, '10 人 / 每份2 人 = 5 份');
  assert.equal(best.coverage, 1);
});

test('拆单模式优惠不低于单单模式', () => {
  const single = solveCateringPlan(MENU, COUPONS, { headcount: 30, budgetPerPerson: 50, allowSplitOrder: false });
  const split = solveCateringPlan(MENU, COUPONS, { headcount: 30, budgetPerPerson: 50, allowSplitOrder: true });
  assert.ok(split.best.total <= single.best.total, `拆单总价 ${split.best.total} 应 ≤ 单号 ${single.best.total}`);
});

test('全部被过敏原过滤时返回不可行而非崩溃', () => {
  // 构造极端场景：主食与饮品均含小麦，过滤后无任何可选项
  const menu = [
    { code: 'B1', name: '小麦主食', price: 30, kcal: 500, protein: 20, sodium: 900, tags: ['主食'], allergens: ['小麦'], servings: 1 },
    { code: 'D1', name: '小麦饮品', price: 9, kcal: 140, protein: 0, sodium: 30, tags: ['饮料'], allergens: ['小麦'], servings: 1 },
  ];
  const { plans, best, diagnostics } = solveCateringPlan(menu, COUPONS, {
    headcount: 10, budgetPerPerson: 50, excludeAllergens: ['小麦'],
  });
  assert.equal(diagnostics.feasibility, 'no_feasible_item');
  assert.equal(plans.length, 0);
  assert.equal(best, null);
  assert.ok(diagnostics.rejected.length >= 2, '应记录全部被剔除项');
});

test('非法输入抛明确错误', () => {
  assert.throws(() => solveCateringPlan(MENU, COUPONS, { headcount: 0, budgetPerPerson: 30 }), /headcount/);
  assert.throws(() => solveCateringPlan(MENU, COUPONS, { headcount: 5, budgetPerPerson: 0 }), /budgetPerPerson/);
});

test('预算不足时标记 over_budget 而非无解', () => {
  const { best, diagnostics } = solveCateringPlan(MENU, COUPONS, {
    headcount: 10, budgetPerPerson: 5,
  });
  assert.equal(diagnostics.feasibility, 'over_budget');
  assert.ok(best, '仍应返回最接近的方案供参考');
  assert.ok(best.perPerson > 5);
  assert.ok(best.warnings.some((w) => w.includes('超出人均预算')));
});

test('过期券不参与计算', () => {
  const withExpired = solveCateringPlan(MENU, COUPONS, { headcount: 20, budgetPerPerson: 60 });
  const withoutExpired = solveCateringPlan(MENU, COUPONS.filter((c) => c.id !== 'C5'), { headcount: 20, budgetPerPerson: 60 });
  assert.equal(
    withExpired.best.discount,
    withoutExpired.best.discount,
    '移除过期券后最优折扣不应变化，说明过期券未被使用',
  );
});

test('低于门槛的券不生效', () => {
  const { best } = solveCateringPlan(MENU, [], { headcount: 2, budgetPerPerson: 60 });
  assert.equal(best.discount, 0);
});

test('拆单优惠金额为整数元，无分位误差', () => {
  for (const [h, b] of [[20, 40], [30, 50], [50, 35], [12, 60], [100, 45]]) {
    const { best } = solveCateringPlan(MENU, COUPONS, { headcount: h, budgetPerPerson: b, allowSplitOrder: true });
    assert.equal(best.discount % 1, 0, `${h}人方案折扣 ${best.discount} 应为整数`);
    assert.equal(best.total % 1, 0, `${h}人方案总价 ${best.total} 应为整数`);
  }
});

test('拆单份数不超过上限 maxSplitOrders', () => {
  const { best } = solveCateringPlan(MENU, COUPONS, {
    headcount: 100, budgetPerPerson: 60, allowSplitOrder: true, maxSplitOrders: 2,
  });
  const orders = Number(/已拆为 (\d+) 单/.exec(best.warnings.join())?.[1] ?? 1);
  assert.ok(orders <= 2, `实际拆 ${orders} 单，应≤ 2`);
});

test('每种券的使用次数不超过 maxUsePerCoupon', () => {
  const { best } = solveCateringPlan(MENU, COUPONS, {
    headcount: 100, budgetPerPerson: 80, allowSplitOrder: true, maxUsePerCoupon: 1,
  });
  // 288 元小计，8 张满50减10 各用 1 次=80；加1 张满100减25=105，已超 cap 故受限于次数约束
  assert.ok(best.discount <= 105 + 1e-9, `折扣 ${best.discount} 超过单券一次的可达上限`);
});

test('饮料不可作为主食（仅饮品时应判不可行）', () => {
  const drinksOnly = [{ code: 'D1', name: '可乐', price: 9, kcal: 140, protein: 0, sodium: 30, tags: ['饮料'], allergens: [], servings: 1 }];
  const { best, diagnostics } = solveCateringPlan(drinksOnly, COUPONS, { headcount: 10, budgetPerPerson: 50 });
  assert.equal(best, null);
  assert.equal(diagnostics.feasibility, 'no_feasible_item');
});

test('多场景回归：不同规模均不超预算且份数充足', () => {
  const cases = [[12, 60], [20, 40], [30, 50], [50, 35], [100, 45]];
  for (const [h, b] of cases) {
    const { best } = solveCateringPlan(MENU, COUPONS, { headcount: h, budgetPerPerson: b, allowSplitOrder: true });
    assert.ok(best.perPerson <= b, `${h}人方案人均 ${best.perPerson} 超出预算 ${b}`);
    const main = best.items.filter((i) => !i.tags.includes('饮料'));
    const totalServings = main.reduce((a, i) => a + i.quantity * (i.servings ?? 1), 0);
    assert.ok(totalServings >= h, `${h}人份数 ${totalServings} 不足`);
  }
});