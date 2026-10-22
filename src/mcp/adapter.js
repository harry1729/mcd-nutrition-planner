/**
 * MCP 返回数据归一化适配器
 *
 * 麦当劳 MCP Server 的字段名可能随版本调整。求解器不应感知这些差异，
 * 因此所有 MCP 返回统一在此转换为 src/model.js 定义的稳定结构。
 *
 * 真实接入时通过启发式规则推断字段（名称别名 + 类型探测），
 * 若推断失败则回落到保守默认值，并在 diagnostics 中标记数据质量。
 */

const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** 归一化餐品 */
export function normalizeItem(raw) {
  const name = String(pick(raw, ['name', 'itemName', 'productName', 'beName', 'title']) ?? '未命名餐品');
  const code = String(pick(raw, ['code', 'itemCode', 'productCode', 'beCode', 'beCodeId', 'id']) ?? name);

  const price = toNumber(
    pick(raw, ['price', 'salePrice', 'unitPrice', 'currentPrice', 'priceValue', 'amount', 'money', 'bePrice']),
    0,
  );

  const kcal = toNumber(pick(raw, ['kcal', 'calorie', 'energy', 'energyKcal', 'heat']), 0);
  const protein = toNumber(pick(raw, ['protein', 'proteinG', 'proteinContent']), 0);
  const sodium = toNumber(pick(raw, ['sodium', 'sodiumMg', 'salt', 'saltMg', 'sodiumContent']), 0);

  const tags = toArray(pick(raw, ['tags', 'labels', 'tagList', 'categoryName', 'categories']))
    .map((t) => (typeof t === 'string' ? t : (t?.name ?? '')))
    .filter(Boolean);

  const allergens = toArray(pick(raw, ['allergens', 'allergenList', 'allergenInfo']))
    .map((a) => (typeof a === 'string' ? a : (a?.name ?? '')))
    .filter(Boolean);

  const isCombo = Boolean(
    pick(raw, ['isCombo', 'isPackage', 'isSet']) ??
    /套餐|组合|超值/.test(name),
  );

  return {
    code,
    name,
    price,
    kcal,
    protein,
    sodium,
    tags,
    allergens,
    isCombo,
    servings: toNumber(pick(raw, ['servings', 'serveCount', 'personCount']), 1) || 1,
    raw,
  };
}

/** 归一化菜单：支持多种容器结构 */
export function normalizeMenu(payload) {
  const list = toArray(
    pick(payload ?? {}, ['meals', 'items', 'products', 'menuItems', 'list', 'data', 'result']) ?? payload,
  );
  return list.filter((x) => x && typeof x === 'object').map(normalizeItem);
}

/** 归一化优惠券 */
export function normalizeCoupon(raw) {
  const name = String(pick(raw, ['name', 'couponName', 'title', 'ruleName']) ?? '未命名券');
  const amount = toNumber(pick(raw, ['amount', 'discountAmount', 'reduce', 'value', 'couponAmount']), 0);
  const threshold = toNumber(pick(raw, ['threshold', 'minAmount', 'useThreshold', 'fullAmount', 'limitAmount']), 0);
  const percent = pick(raw, ['percent', 'discountRate', 'discount', 'zhe']);

  const type = pick(raw, ['type', 'couponType']) ?? (amount > 0 ? 'fixed' : 'discount');
  const rawPercent = toNumber(percent, 0);

  // 折扣率归一化到 0~1：
  //   0.85 / 85 均表示 8.5 折（付 85%）→ 0.85
  //   8.5 / 8.5 表示"折后价占比 8.5%" 或 "打 8.5 折" 的另一种记法，
  //   统一按"数值>1 时除以 100"处理，故8.5 视为 8.5% → 0.085。
  //   注意：MCP 侧通常返回 0.85 或 85，此处主要防御异常值。
  const normalizedPercent = rawPercent > 1 ? rawPercent / 100 : rawPercent;

  return {
    id: String(pick(raw, ['id', 'couponId', 'couponCode', 'code']) ?? name),
    name,
    type: String(type).includes('discount') || rawPercent > 0 ? 'discount' : 'fixed',
    amount,
    threshold,
    // 支持 0.85 或 85 两种表述，统一归一化为 0~1
    percent: normalizedPercent,
    maxDiscount: toNumber(pick(raw, ['maxDiscount', 'maxReduce', 'discountLimit']), 0),
    expireAt: pick(raw, ['expireAt', 'endTime', 'validUntil', 'expireDate', 'endDate']),
    raw,
  };
}

export function normalizeCoupons(payload) {
  const list = toArray(
    pick(payload ?? {}, ['coupons', 'list', 'items', 'data', 'result', 'availableCoupons']) ?? payload,
  );
  return list.filter((x) => x && typeof x === 'object').map(normalizeCoupon);
}

/** 归一化门店 */
export function normalizeStore(raw) {
  return {
    code: String(pick(raw, ['code', 'storeCode', 'storeId', 'id']) ?? ''),
    name: String(pick(raw, ['name', 'storeName', 'restaurantName', 'title']) ?? '未命名门店'),
    address: String(pick(raw, ['address', 'storeAddress', 'detailAddress', 'location']) ?? ''),
    distance: toNumber(pick(raw, ['distance', 'distanceMeters', 'distanceValue']), 0),
    raw,
  };
}

export function normalizeStores(payload) {
  const list = toArray(
    pick(payload ?? {}, ['stores', 'list', 'items', 'data', 'result', 'storeList']) ?? payload,
  );
  return list.filter((x) => x && typeof x === 'object').map(normalizeStore);
}

/**
 * 解析 list-nutrition-foods 返回的纯文本格式。
 *
 * 实测真实返回为字符串，格式：
 *   名称,描述,能量kJ,能量kcal,蛋白质g,脂肪g,碳水g,钠mg,钙mg
 * 每行一条，共约 6000+ 行。描述字段常为 null，故按"末尾8 个数字"对齐解析。
 *
 * 例：
 *   中薯条,null,1210,289,4,12,38,165,18
 *   巨无霸,null,2146,513,27,26,42,961,171
 */
export function parseNutritionText(text) {
  if (typeof text !== 'string') return [];

  const rows = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(',');
    if (parts.length < 9) continue;

    const name = parts[0].trim();
    if (!name) continue;

    // 末 8 个字段为数值：kJ, kcal, 蛋白, 脂肪, 碳水, 钠, 钙（实际为 7 个）
    // 稳妥做法：从右往左取 7 个数字，剩余部分为名称与描述
    const nums = [];
    let idx = parts.length - 1;
    while (idx >= 0 && nums.length < 7) {
      const v = Number(parts[idx]);
      if (Number.isFinite(v)) {
        nums.unshift(v);
        idx--;
      } else {
        break;
      }
    }
    if (nums.length < 7) continue;

    const [kj, kcal, protein, fat, carbs, sodium, calcium] = nums;
    rows.push({
      name,
      kcal: kcal || 0,
      protein: protein || 0,
      fat: fat || 0,
      carbs: carbs || 0,
      sodium: sodium || 0,
      calcium: calcium || 0,
      energyKj: kj || 0,
    });
  }
  return rows;
}

/** 归一化营养数据并按名称建索引 */
export function normalizeNutrition(payload) {
  // 真实返回结构：{ success, code, message, data: "<纯文本表格>" }
  // 需逐层剥壳，直到拿到字符串或对象数组
  let p = payload;
  for (let i = 0; i < 4; i++) {
    if (p === null || p === undefined) break;
    if (typeof p === 'string') break;
    if (Array.isArray(p)) break;
    if (!('data' in p) && !('foods' in p) && !('nutritions' in p) && !('list' in p)
      && !('items' in p) && !('result' in p)) break;
    p = p.data ?? p.foods ?? p.nutritions ?? p.list ?? p.items ?? p.result;
  }

  // 真实返回为纯文本
  if (typeof p === 'string') {
    const map = new Map();
    for (const row of parseNutritionText(p)) {
      map.set(row.name, row);
    }
    return map;
  }

  // 兼容对象数组形态
  const list = toArray(
    pick(p ?? {}, ['foods', 'nutritions', 'list', 'items', 'data', 'result']) ?? p,
  );
  const map = new Map();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(pick(raw, ['name', 'foodName', 'itemName', 'title', 'productName']) ?? '');
    if (!name) continue;
    map.set(name, {
      kcal: toNumber(pick(raw, ['kcal', 'calorie', 'energy', 'energyKcal']), 0),
      protein: toNumber(pick(raw, ['protein', 'proteinG']), 0),
      fat: toNumber(pick(raw, ['fat', 'fatG']), 0),
      carbs: toNumber(pick(raw, ['carbs', 'carbohydrate', 'carb']), 0),
      sodium: toNumber(pick(raw, ['sodium', 'salt']), 0),
      calcium: toNumber(pick(raw, ['calcium', 'ca']), 0),
    });
  }
  return map;
}

/**
 * 用 MCP 营养数据补全菜单营养字段。
 * 菜单接口常不返回营养值，此处按名称模糊匹配补全。
 * @returns {{items: Array, enriched: number}}
 */
export function enrichNutrition(items, nutritionMap) {
  if (!nutritionMap || nutritionMap.size === 0) return { items, enriched: 0 };
  let enriched = 0;

  const enrichedItems = items.map((item) => {
    if (item.kcal && item.protein) return item;
    let hit = nutritionMap.get(item.name);
    if (!hit) {
      for (const [name, data] of nutritionMap) {
        if (item.name.includes(name) || name.includes(item.name)) {
          hit = data;
          break;
        }
      }
    }
    if (!hit) return item;
    enriched += 1;
    return {
      ...item,
      kcal: item.kcal || hit.kcal,
      protein: item.protein || hit.protein,
      sodium: item.sodium || hit.sodium,
      nutritionSource: 'list-nutrition-foods',
    };
  });

  return { items: enrichedItems, enriched };
}