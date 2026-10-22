/**
 * 离线演示样例数据
 *
 * 说明：以下结构与 MCP Server 返回归一化后的形态一致（字段结构示意，非麦当劳官方定价数据）。
 * 用途：让评委在无 Token 环境下也能验证求解器与报告渲染的完整链路。
 */

export const DEMO_STORE = {
  code: 'DEMO001',
  name: '示例门店（演示数据）',
  address: '示例路 1 号',
  distance: 0,
};

export const DEMO_MENU = [
  { code: 'C1', name: '巨无霸套餐', price: 42, kcal: 720, protein: 28, sodium: 1150, tags: ['高蛋白'], allergens: ['小麦', '乳制品'], servings: 1, isCombo: true },
  { code: 'C2', name: '麦辣鸡腿堡套餐', price: 36, kcal: 610, protein: 24, sodium: 1080, tags: [], allergens: ['小麦', '乳制品'], servings: 1, isCombo: true },
  { code: 'C3', name: '香辣鸡腿堡', price: 22, kcal: 480, protein: 22, sodium: 1020, tags: ['辣'], allergens: ['小麦'], servings: 1 },
  { code: 'C4', name: '麦香鱼', price: 26, kcal: 430, protein: 19, sodium: 890, tags: [], allergens: ['小麦', '鱼'], servings: 1 },
  { code: 'C5', name: '上校鸡块（5 块）', price: 24, kcal: 520, protein: 26, sodium: 980, tags: ['高蛋白'], allergens: ['小麦'], servings: 1 },
  { code: 'C6', name: '牛肉棒', price: 18, kcal: 260, protein: 16, sodium: 640, tags: ['高蛋白'], allergens: ['小麦'], servings: 1 },
  { code: 'C7', name: '板烧鸡腿堡', price: 23, kcal: 490, protein: 23, sodium: 1010, tags: [], allergens: ['小麦', '乳制品'], servings: 1 },
  { code: 'D1', name: '中可乐', price: 9, kcal: 140, protein: 0, sodium: 30, tags: ['饮料'], allergens: [], servings: 1 },
  { code: 'D2', name: '无糖可乐', price: 9, kcal: 0, protein: 0, sodium: 5, tags: ['饮料', '无糖'], allergens: [], servings: 1 },
  { code: 'D3', name: '鲜煮咖啡', price: 12, kcal: 5, protein: 1, sodium: 10, tags: ['饮料'], allergens: [], servings: 1 },
];

export const DEMO_COUPONS = [
  { id: 'K1', name: '满 50 减 10', type: 'fixed', amount: 10, threshold: 50 },
  { id: 'K2', name: '满 100 减 25', type: 'fixed', amount: 25, threshold: 100 },
  { id: 'K3', name: '满 200 减 60', type: 'fixed', amount: 60, threshold: 200 },
  { id: 'K4', name: '满 300 减 100', type: 'fixed', amount: 100, threshold: 300 },
  { id: 'K5', name: '8.5 折（封顶 20）', type: 'discount', percent: 0.85, threshold: 0, maxDiscount: 20 },
  { id: 'K6', name: '已过期示例券', type: 'fixed', amount: 50, threshold: 100, expireAt: '2020-01-01' },
];