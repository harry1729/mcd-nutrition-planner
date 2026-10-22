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

  return {
    id: String(pick(raw, ['id', 'couponId', 'couponCode', 'code']) ?? name),
    name,
    type: String(type).includes('discount') || rawPercent > 0 ? 'discount' : 'fixed',
    amount,
    threshold,
    // 支持 0.85 或 85 两种表述，统一归一化为 0~1
    percent: rawPercent > 1 ? rawPercent / 100 : rawPercent,
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

/** 归一化营养数据并按名称建索引 */
export function normalizeNutrition(payload) {
  const list = toArray(
    pick(payload ?? {}, ['foods', 'nutritions', 'list', 'items', 'data', 'result']) ?? payload,
  );
  const map = new Map();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(pick(raw, ['name', 'foodName', 'itemName', 'title']) ?? '');
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