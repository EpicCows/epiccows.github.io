import { state } from './state';
import { FATSECRET_WORKER } from './core';
import { getNutrition, calcSlotTotals, loadGoals, getFoodById } from './data';
import { showToast } from './ui';
import type { MealSlot, PlanNoteItem } from './types';

export interface ShoppingListItem {
  name: string;
  colesProduct: string;
  category: string;
  quantity: string;
  portionSize: string;
  aisle: string;
}

interface CachedShoppingList {
  generatedAt: number;
  dateStr: string;
  items: ShoppingListItem[];
}

function getCacheKey(dateStr: string): string {
  const profile = localStorage.getItem('tallTenderProfile') || 'default';
  return 'tallTenderShoppingList_' + profile + '_' + dateStr;
}

function loadCachedList(dateStr: string): CachedShoppingList | null {
  try {
    const raw = localStorage.getItem(getCacheKey(dateStr));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedShoppingList;
    if (cached.dateStr !== dateStr) return null;
    return cached;
  } catch {
    return null;
  }
}

function saveCachedList(dateStr: string, items: ShoppingListItem[]): void {
  const cached: CachedShoppingList = {
    generatedAt: Date.now(),
    dateStr: dateStr,
    items: items,
  };
  localStorage.setItem(getCacheKey(dateStr), JSON.stringify(cached));
}

function invalidateCache(dateStr: string): void {
  localStorage.removeItem(getCacheKey(dateStr));
}

// Called when meal plan regenerates or foods change
export { invalidateCache as invalidateShoppingCache };

function gatherDayItems(dateStr: string): { desc: string; grams: number; cal: number; pro: number }[] {
  const nut = getNutrition(dateStr);
  const items: { desc: string; grams: number; cal: number; pro: number }[] = [];
  const seen = new Set<string>();

  for (let mi = 0; mi < nut.meals.length; mi++) {
    const meal = nut.meals[mi];

    // Collect plan notes (AI-generated suggestions)
    if (meal.planNotes) {
      for (let pi = 0; pi < meal.planNotes.length; pi++) {
        const note = meal.planNotes[pi];
        const desc = typeof note === 'string' ? note : note.desc;
        // Extract grams from description
        const gMatch = desc.match(/(\d+)\s*g\b/i);
        const grams = gMatch ? parseInt(gMatch[1]) : 0;
        const key = desc.toLowerCase().replace(/\d+\s*g\b/gi, '').replace(/[^a-z]/g, '').trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          items.push({
            desc: desc,
            grams: grams,
            cal: typeof note === 'object' ? note.cal : 0,
            pro: typeof note === 'object' ? note.pro : 0,
          });
        }
      }
    }

    // Collect logged foods from food library
    if (meal.items && meal.items.length > 0) {
      const totals = calcSlotTotals(meal.items);
      for (let ii = 0; ii < meal.items.length; ii++) {
        const item = meal.items[ii];
        const f = getFoodById(item.foodId);
        if (!f) continue;
        const name = f.name.toLowerCase();
        if (!seen.has(name)) {
          seen.add(name);
          let grams = 0;
          if (item.amount && item.unit === 'g') {
            grams = item.amount;
          } else if (item.amount && item.unit) {
            grams = Math.round(item.amount);
          } else if (item.servings) {
            grams = item.servings * 100; // rough estimate
          }
          items.push({
            desc: (grams > 0 ? grams + 'g ' : '') + f.name,
            grams: grams,
            cal: f.calories || 0,
            pro: f.protein || 0,
          });
        }
      }
    }
  }

  return items;
}

export function generateShoppingList(dateStr?: string, bypassCache?: boolean): void {
  const d = dateStr || state.nutritionDate;

  // Check cache first
  if (!bypassCache) {
    const cached = loadCachedList(d);
    if (cached && cached.items.length > 0) {
      showShoppingListModal(cached.items, d, true);
      return;
    }
  }

  const goals = loadGoals();
  const items = gatherDayItems(d);

  if (items.length === 0) {
    showToast('No foods in meal plan or logged today. Generate a meal plan or log some foods first!');
    return;
  }

  showToast('Generating Coles shopping list...');

  // Build item descriptions for the AI
  const itemLines = items.map(function(it) {
    return it.desc + (it.cal > 0 ? ' (' + it.cal + 'cal, P' + it.pro + 'g)' : '');
  });

  const prompt = [
    'Create a shopping list for these meals, tailored to Coles Australia supermarket:',
    '',
    itemLines.join('\n'),
    '',
    'Daily macro goals: ' + goals.calories + 'cal, P' + goals.protein + 'g, F' + (goals.fat || 70) + 'g, C' + (goals.carbs || 250) + 'g.',
    '',
    'CRITICAL: Map each food to a specific Coles Australia product/brand where possible (e.g., "Coles RSPCA Approved Chicken Breast", "SunRice Medium Grain White Rice", "Coles Australian Baby Spinach").',
    'For each item include: product name, category (Meat & Seafood, Dairy & Eggs, Bakery, Produce, Pantry, Frozen, Other), quantity needed (with unit), portion/package size available at Coles, and supermarket aisle.',
    'Group items by supermarket aisle/category.',
    'Return ONLY valid JSON: {"items":[{"name":"original food","colesProduct":"Coles product name","category":"Produce","quantity":"1 bunch","portionSize":"250g","aisle":"Fruit & Veg"}]}.',
    'No markdown, just JSON.',
  ].join('\n');

  fetch(FATSECRET_WORKER + '/deepseek', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a shopping assistant who knows Coles Australia supermarkets intimately. You map meal plan foods to specific Coles products, including brand names, typical package sizes, and aisle locations. You know which products are available at Coles and their approximate prices. Be specific — say "Coles RSPCA Approved Chicken Breast Fillets 500g" not just "chicken breast." Organize by supermarket aisle for efficient shopping. Return ONLY valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  })
    .then(function(res) {
      if (!res.ok) throw new Error('API error: ' + res.status);
      return res.json();
    })
    .then(function(data) {
      let content = data.choices[0].message.content;
      content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(content);
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Invalid shopping list response');
      }
      const list: ShoppingListItem[] = parsed.items;
      saveCachedList(d, list);
      showShoppingListModal(list, d, false);
      showToast('Shopping list ready!');
    })
    .catch(function(err) {
      showToast('Shopping list failed: ' + err.message);
    });
}

function showShoppingListModal(items: ShoppingListItem[], dateStr: string, fromCache: boolean): void {
  // Group by category
  const byCategory: Record<string, ShoppingListItem[]> = {};
  items.forEach(function(item) {
    const cat = item.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });

  const categoryOrder = ['Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Produce', 'Pantry', 'Frozen', 'Other'];

  let listHtml = '';
  categoryOrder.forEach(function(cat) {
    const catItems = byCategory[cat];
    if (!catItems || catItems.length === 0) return;
    listHtml += '<div style="margin-bottom:12px;">';
    listHtml += '<div style="font-size:13px;font-weight:700;color:#cc0000;margin-bottom:4px;">' + cat + '</div>';
    catItems.forEach(function(item) {
      listHtml += '<div style="font-size:11px;padding:3px 0;border-bottom:1px solid #1a1a1a;display:flex;justify-content:space-between;">';
      listHtml += '<span><strong>' + item.colesProduct + '</strong><br><span style="color:#888;">Aisle: ' + (item.aisle || '—') + ' · ' + (item.portionSize || '') + '</span></span>';
      listHtml += '<span style="color:#cc0000;white-space:nowrap;">' + item.quantity + '</span>';
      listHtml += '</div>';
    });
    listHtml += '</div>';
  });

  // Count total unique items
  const totalCount = items.length;

  // Format for clipboard
  let clipboardText = 'Coles Shopping List — ' + dateStr + '\n';
  clipboardText += (fromCache ? '(cached)\n' : '') + '═'.repeat(40) + '\n\n';
  categoryOrder.forEach(function(cat) {
    const catItems = byCategory[cat];
    if (!catItems || catItems.length === 0) return;
    clipboardText += '[' + cat + ']\n';
    catItems.forEach(function(item) {
      clipboardText += '  • ' + item.colesProduct;
      clipboardText += ' — ' + item.quantity;
      if (item.portionSize) clipboardText += ' (' + item.portionSize + ')';
      clipboardText += '\n';
    });
    clipboardText += '\n';
  });

  const cacheNote = fromCache
    ? '<div style="font-size:10px;color:#888;margin-top:4px;">📋 Loaded from cache · <button id="btnRegenShopList" style="background:none;border:none;color:#cc0000;cursor:pointer;font-size:10px;text-decoration:underline;">Regenerate with AI</button></div>'
    : '<div style="font-size:10px;color:#5a8a5a;margin-top:4px;">🤖 AI-generated Coles Australia shopping list</div>';

  const html =
    '<div style="padding:16px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
    '<h3 style="margin:0;color:#cc0000;">🛒 Coles Shopping List</h3>' +
    '<span style="font-size:10px;color:#888;">' + dateStr + ' · ' + totalCount + ' items</span>' +
    '</div>' +
    listHtml +
    cacheNote +
    '<div style="display:flex;gap:8px;margin-top:12px;">' +
    '<button id="btnCopyShopList" style="flex:1;padding:10px;background:#1a1010;border:1px solid #4a1010;color:#cc0000;border-radius:8px;font-weight:600;cursor:pointer;">📋 Copy to Clipboard</button>' +
    '<button id="btnCloseShopList" style="flex:1;padding:10px;background:#141414;border:1px solid #2a2a2a;color:#a0b3c9;border-radius:8px;font-weight:600;cursor:pointer;">Close</button>' +
    '</div>' +
    '</div>';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;z-index:100;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  sheet.style.cssText = 'background:#0b0d10;border-radius:16px 16px 0 0;max-width:480px;width:100%;max-height:85vh;overflow-y:auto;color:#e8edf2;';
  sheet.innerHTML = html;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  // Event handlers
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  const copyBtn = document.getElementById('btnCopyShopList');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(clipboardText).then(function() {
        showToast('Shopping list copied!');
      }).catch(function() {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = clipboardText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Shopping list copied!');
      });
    });
  }

  const closeBtn = document.getElementById('btnCloseShopList');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      overlay.remove();
    });
  }

  const regenBtn = document.getElementById('btnRegenShopList');
  if (regenBtn) {
    regenBtn.addEventListener('click', function() {
      overlay.remove();
      generateShoppingList(dateStr, true);
    });
  }
}
