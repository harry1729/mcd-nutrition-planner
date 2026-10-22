/**
 * MCP 适配层与客户端测试
 * 验证归一化逻辑的鲁棒性——真实 MCP 返回的字段名可能随版本变化。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeItem,
  normalizeMenu,
  normalizeCoupon,
  normalizeCoupons,
  normalizeStore,
  normalizeStores,
  normalizeNutrition,
  enrichNutrition,
} from '../src/mcp/adapter.js';
import { parseContent } from '../src/mcp/client.js';

test('归一化餐品：兼容多种字段命名', () => {
  const variants = [
    { name: '巨无霸套餐', price: 42, kcal: 720, protein: 28 },
    { itemName: '巨无霸套餐', salePrice: 42, calorie: 720, proteinG: 28 },
    { productName: '巨无霸套餐', currentPrice: 42, energy: 720, proteinContent: 28 },
    { beName: '巨无霸套餐', bePrice: 42, energyKcal: 720, protein: 28 },
  ];
  for (const raw of variants) {
    const item = normalizeItem(raw);
    assert.equal(item.name, '巨无霸套餐', `字段名${Object.keys(raw)[0]} 应可识别`);
    assert.equal(item.price, 42);
    assert.equal(item.kcal, 720);
    assert.equal(item.protein, 28);
  }
});

test('归一化餐品：缺字段时回落安全默认值', () => {
  const item = normalizeItem({});
  assert.equal(item.name, '未命名餐品');
  assert.equal(item.price, 0);
  assert.equal(item.servings, 1);
  assert.deepEqual(item.tags, []);
  assert.deepEqual(item.allergens, []);
});

test('归一化餐品：标签与过敏原支持对象数组形态', () => {
  const item = normalizeItem({
    name: '测试',
    price: 10,
    tags: [{ name: '高蛋白' }, '辣'],
    allergens: [{ name: '小麦' }, '乳制品'],
  });
  assert.deepEqual(item.tags, ['高蛋白', '辣']);
  assert.deepEqual(item.allergens, ['小麦', '乳制品']);
});

test('归一化餐品：名称含"套餐"自动识别为组合餐', () => {
  assert.equal(normalizeItem({ name: '超值套餐', price: 30 }).isCombo, true);
  assert.equal(normalizeItem({ name: '麦香鱼', price: 26 }).isCombo, false);
});

test('归一化菜单：兼容多种容器结构', () => {
  assert.equal(normalizeMenu({ meals: [{ name: 'A', price: 1 }] }).length, 1);
  assert.equal(normalizeMenu({ items: [{ name: 'A', price: 1 }] }).length, 1);
  assert.equal(normalizeMenu({ data: [{ name: 'A', price: 1 }] }).length, 1);
  assert.equal(normalizeMenu([{ name: 'A', price: 1 }]).length, 1);
  assert.equal(normalizeMenu(null).length, 0);
  assert.equal(normalizeMenu({ meals: [] }).length, 0);
});

test('归一化优惠券：折扣率两种表述统一为0~1', () => {
  // MCP 侧常见表述：0.85 与 85 均表示 8.5 折
  assert.equal(normalizeCoupon({ name: '8.5折', percent: 0.85 }).percent, 0.85);
  assert.equal(normalizeCoupon({ name: '8.5折', discountRate: 85 }).percent, 0.85);
  assert.equal(normalizeCoupon({ name: '8.5折', discountRate: 85 }).type, 'discount');
});

test('归一化优惠券：极小折扣值防御性除以100', () => {
  // 8.5 若被服务端用作"折扣后占比 8.5%"，归一化为 0.085，避免被当成 850%
  assert.equal(normalizeCoupon({ name: '极端折扣', discount: 8.5 }).percent, 0.085);
});

test('归一化优惠券：满减型识别为 fixed', () => {
  const c = normalizeCoupon({ name: '满50减10', amount: 10, threshold: 50 });
  assert.equal(c.type, 'fixed');
  assert.equal(c.amount, 10);
  assert.equal(c.threshold, 50);
});

test('归一化门店：缺失地址不报错', () => {
  const s = normalizeStore({ storeId: '001' });
  assert.equal(s.code, '001');
  assert.equal(s.name, '未命名门店');
  assert.equal(s.address, '');
});

test('归一化营养：按名称建索引并模糊匹配补全', () => {
  const map = normalizeNutrition({
    foods: [
      { name: '巨无霸', kcal: 720, protein: 28, sodium: 1150 },
      { name: '麦香鱼', kcal: 430, protein: 19, sodium: 890 },
    ],
  });
  assert.equal(map.size, 2);
  assert.equal(map.get('巨无霸').kcal, 720);

  // 菜单项名为"巨无霸套餐"，应模糊匹配到"巨无霸"
  const menu = [{ code: 'A', name: '巨无霸套餐', price: 42, kcal: 0, protein: 0, sodium: 0 }];
  const { items, enriched } = enrichNutrition(menu, map);
  assert.equal(enriched, 1);
  assert.equal(items[0].kcal, 720);
  assert.equal(items[0].nutritionSource, 'list-nutrition-foods');
});

test('营养补全：已有营养数据时不覆盖', () => {
  const map = normalizeNutrition({ foods: [{ name: 'A', kcal: 999, protein: 99 }] });
  const menu = [{ code: 'A', name: 'A', price: 10, kcal: 111, protein: 11 }];
  const { items } = enrichNutrition(menu, map);
  assert.equal(items[0].kcal, 111);
  assert.equal(items[0].protein, 11);
});

test('营养补全：空索引时原样返回', () => {
  const menu = [{ code: 'A', name: 'A', price: 10, kcal: 111, protein: 11 }];
  const { items, enriched } = enrichNutrition(menu, new Map());
  assert.equal(items[0].kcal, 111);
  assert.equal(enriched, 0);
});

test('parseContent：优先取 structuredContent', () => {
  assert.deepEqual(parseContent({ structuredContent: { a: 1 } }), { a: 1 });
});

test('parseContent：解析 JSON 文本', () => {
  assert.deepEqual(parseContent({ content: [{ type: 'text', text: '{"b":2}' }] }), { b: 2 });
});

test('parseContent：非JSON 文本降级为 raw', () => {
  const out = parseContent({ content: [{ type: 'text', text: '查询成功' }] });
  assert.equal(out.raw, '查询成功');
});

test('parseContent：空输入返回 null', () => {
  assert.equal(parseContent(null), null);
  assert.equal(parseContent({}), null);
});