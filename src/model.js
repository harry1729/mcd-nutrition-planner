/**
 * 领域数据模型与约束定义
 *
 * 本文件不依赖 MCP，可独立运行与测试。
 * 字段命名与麦当劳 MCP Server 返回保持松耦合：MCP 返回对象键名可能随版本变化，
 * 因此在 src/mcp/adapter.js 中做归一化，本模块只消费归一化后的结构。
 */

/** 人数区间的默认档位（企业会议常见规模） */
export const HEADCOUNT_TIERS = [
  { min: 5, max: 12, label: '小型会议' },
  { min: 13, max: 30, label: '中型会议' },
  { min: 31, max: 80, label: '大型会议' },
  { min: 81, max: Infinity, label: '部门级/全公司' },
];

export function headcountTier(n) {
  return HEADCOUNT_TIERS.find((t) => n >= t.min && n <= t.max) ?? HEADCOUNT_TIERS[0];
}

/**
 * 订单条目：一份可下单的商品（主食 / 套餐 / 单品）
 * @typedef {Object} MenuItem
 * @property {string} code       餐品编码（MCP 的 beCode）
 * @property {string} name       中文名
 * @property {number} price      单价（元）
 * @property {number} [kcal]     每份热量（kcal）
 * @property {number} [protein]  每份蛋白质（g）
 * @property {number} [sodium]   每份钠（mg）
 * @property {string[]} [tags]   标签，如['高蛋白','辣','儿童友好']
 * @property {boolean} [isCombo] 是否为套餐（可拆换）
 * @property {string[]} [allergens] 过敏原
 * @property {number} [servings] 每份可供几人食用
 */

/**
 * 优惠券（MCP 的 query-store-coupons / available-coupons 归一化结果）
 * @typedef {Object} Coupon
 * @property {string} id
 * @property {string} name
 * @property {'fixed'|'discount'} type
 * @property {number} [amount]     fixed: 减免金额
 * @property {number} [threshold]  使用门槛金额
 * @property {number} [percent]    discount: 折扣，如 0.85 表示 85 折
 * @property {number} [maxDiscount]
 * @property {string} [expireAt]   ISO 日期
 */

/**
 * 规划输入
 * @typedef {Object} PlanInput
 * @property {number} headcount            用餐人数
 * @property {number} budgetPerPerson      人均预算（元）
 * @property {number} [maxSodiumPerPerson] 人均钠上限（mg），默认 2000
 * @property {number} [minProteinPerPerson] 人均蛋白质下限（g），默认 20
 * @property {string[]} [excludeAllergens] 需规避的过敏原
 * @property {string[]} [excludeTags]      需规避的标签
 * @property {number} [drinkCountPerPerson] 每人饮料份数，0 表示不含饮料
 * @property {boolean} [allowSplitOrder]  是否允许拆单以叠加用券
 */

/**
 * 主食分类白名单（依据麦当劳菜单分类语义）
 * 真实菜单含大量非主食商品（酱料包、杯套、餐盘、甜筒等），
 * 若不加约束，求解器会选中 ¥3 的酱料包作为"主食"，产出荒谬方案。
 */
export const MAIN_CATEGORY_PATTERNS = [
  /汉堡/, /卷/, /堡/, /套餐/, /单人餐/, /多人餐/, /拼盘/,
  /麦香鱼/, /鸡腿/, /鸡翅/, /炸鸡/, /猪柳/, /牛肉/, /虾/, /鱼/,
  /意面/, /饭/, /米/, /沙拉/, /三件套/, /四件套/, /五件套/,
];

/**
 * 明确排除的非主食分类
 * 注意："蘸酱炸鸡"是主食分类，不能因含"酱"字被误伤；
 * 因此排除词限定为"酱料/酱包"等明确的调味品包装词。
 */
export const NON_FOOD_PATTERNS = [/酱料/, /酱包/, /蘸酱包/, /杯套/, /餐盘/, /餐具/, /餐垫/, /纸巾/, /吸管/, /打包盒/];

/** 饮品分类（用于识别饮料，与标签判定互为补充） */
export const DRINK_CATEGORY_PATTERNS = [/^饮品$/, /饮品/, /饮料/, /咖啡/, /茶饮/, /可乐/, /果汁/];

/** 判断是否为饮品 */
export function isDrink(item) {
  const category = item.category ?? '';
  if (DRINK_CATEGORY_PATTERNS.some((re) => re.test(category))) return true;
  if ((item.tags ?? []).includes('饮料')) return true;
  return /可乐|雪碧|芬达|咖啡|红茶|绿茶|奶茶|果汁|豆浆|柠檬茶|椰奶|矿泉水|气泡水/.test(item.name ?? '');
}

/**
 * 判断某个餐品是否可作为主食。
 * 优先依据 category 分类判定；无分类时回落到名称与标签启发式。
 */
export function isMainCourse(item) {
  const category = item.category ?? '';
  const name = item.name ?? '';

  // 明确非主食：调味品包、餐具类。名称判定优先于分类判定，
  // 因为"蘸酱炸鸡"这类主食分类含"酱"字，不能误伤。
  if (/酱料包|酱包|蘸酱包|杯套|餐盘|餐具|餐垫|纸巾|吸管|打包盒/.test(name)) return false;
  if (NON_FOOD_PATTERNS.some((re) => re.test(category))) return false;
  if (category && MAIN_CATEGORY_PATTERNS.some((re) => re.test(category))) return true;

  // 无分类信息时的名称启发式：套餐类名称通常含"套""餐"
  if (/三件套|四件套|五件套|套餐|单人餐|多人餐/.test(name)) return true;
  if (/堡|卷|麦香鱼|鸡块|鸡翅|鸡腿|猪柳|牛肉棒|薯条|蛋挞|圣代/.test(name)) return true;

  return false;
}

/** 归一化后的规划结果 */
export class Plan {
  constructor({ items, combos, subtotal, discount, deliveryFee, total, perPerson, nutrition, warnings, coverage }) {
    this.items = items;
    this.combos = combos;
    this.subtotal = subtotal;
    this.discount = discount;
    this.deliveryFee = deliveryFee;
    this.total = total;
    this.perPerson = perPerson;
    this.nutrition = nutrition;
    this.warnings = warnings;
    this.coverage = coverage;
  }

  get savingPerPerson() {
    return Number((this.perPerson - this.total).toFixed(2));
  }
}