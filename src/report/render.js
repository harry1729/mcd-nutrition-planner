/**
 * 终端报告渲染
 *
 * 输出面向「会议组织者」的可读方案，而非面向开发者的调试日志。
 */

const money = (n) => `¥${Number(n).toFixed(2)}`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

export function renderPlan({ store, best, alternatives = [], input, priceCheck, nutritionEnriched = 0 }) {
  const L = [];
  const rule = '─'.repeat(64);

  L.push(rule);
  L.push('企业团餐决策方案');
  L.push(rule);
  L.push(`门店：${store?.name ?? '未指定'}${store?.address ? ' · ' + store.address : ''}`);
  L.push(`规模：${input.headcount} 人（人均预算 ${money(input.budgetPerPerson)}）`);
  L.push('');

  L.push('【推荐方案】');
  for (const item of best.items) {
    L.push(`  · ${item.name}`);
    L.push(`    ${item.quantity} 份 × ${money(item.price)} = ${money(item.quantity * item.price)}`);
  }
  L.push('');
  L.push(`  小计${' '.repeat(46)}${money(best.subtotal)}`);
  if (best.discount > 0) {
    L.push(`  优惠${' '.repeat(46)}-${money(best.discount)}`);
  }
  if (best.deliveryFee > 0) {
    L.push(`  配送费${' '.repeat(44)}${money(best.deliveryFee)}`);
  }
  L.push(`  ${'─'.repeat(56)}`);
  L.push(`  合计${' '.repeat(46)}${money(best.total)}`);
  L.push(`  人均${' '.repeat(46)}${money(best.perPerson)}`);
  if (best.savingPerPerson > 0) {
    L.push(`  较预算节省${' '.repeat(40)}${money(best.savingPerPerson)}/人（预算余量 ${pct(best.savingPerPerson / input.budgetPerPerson)}）`);
  }
  L.push('');

  L.push('【营养估算】');
  const n = best.nutrition;
  L.push(`  热量  约 ${Math.round(n.kcalPerPerson)} kcal / 人`);
  L.push(`  蛋白质 ${n.proteinPerPerson} g / 人`);
  L.push(`  钠${' '}${n.sodiumPerPerson} mg / 人`);
  if (nutritionEnriched > 0) {
    L.push(`  （数据来源：MCP list-nutrition-foods，补全 ${nutritionEnriched} 项）`);
  } else {
    L.push('  （数据来源：菜单自带字段，MCP 未返回营养数据）');
  }
  L.push('');

  if (best.warnings?.length) {
    L.push('【风险提示】');
    for (const w of best.warnings) L.push(`  ! ${w}`);
    L.push('');
  }

  if (alternatives.length) {
    L.push('【备选方案】');
    alternatives.forEach((p, i) => {
      L.push(`  ${i + 1}. ${p.items.map((x) => x.name).join(' + ')}`);
      L.push(`     合计 ${money(p.total)} · 人均 ${money(p.perPerson)}`);
    });
    L.push('');
  }

  if (priceCheck) {
    L.push('【MCP 计价复核】');
    L.push(`  MCP 官方计价 ${money(priceCheck.official)}`);
    L.push(`  本地估算 ${money(priceCheck.local)}`);
    L.push(`  ${priceCheck.matched ? '一致' : '存在差异'}：${priceCheck.note}`);
    L.push('');
  }

  L.push(rule);
  L.push('说明：本方案为决策辅助，非营养医疗建议。');
  L.push('餐品价格、库存与供应状态以麦当劳官方渠道实时结果为准。');
  L.push('支付环节需由下单人本人完成。');
  L.push(rule);

  return L.join('\n');
}

/** 渲染 MCP 调用链路追踪，用于自检与文档生成 */
export function renderTrace(trace) {
  const L = ['', 'MCP 调用链路：'];
  for (const t of trace) {
    L.push(`  ${String(t.step).padStart(2)}. ${t.tool.padEnd(24)} ${t.detail ?? ''}`);
  }
  return L.join('\n');
}