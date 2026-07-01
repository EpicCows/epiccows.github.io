import { getNutrition, getFoodById } from './data';
import { foods } from './state';
import type { PlanNoteItem, MealEntry } from './types';

// ==================== TYPES ====================

export interface ShoppingItem {
  name: string;
  totalGrams: number;
  category: string;
  occurrences: number; // how many plan notes contributed
}

// ==================== SMART UNITS ====================

const FOOD_UNITS: Record<string, { gramsPer: number; unit: string }> = {
  'bread': { gramsPer: 50, unit: 'slice' },
  'wholemeal bread': { gramsPer: 50, unit: 'slice' },
  'bagel': { gramsPer: 100, unit: 'bagel' },
  'tortilla': { gramsPer: 40, unit: 'wrap' },
  'whole eggs': { gramsPer: 50, unit: 'egg' },
  'egg': { gramsPer: 50, unit: 'egg' },
  'egg whites': { gramsPer: 30, unit: 'egg white' },
  'banana': { gramsPer: 120, unit: 'banana' },
  'apple': { gramsPer: 180, unit: 'apple' },
  'orange': { gramsPer: 150, unit: 'orange' },
  'whey': { gramsPer: 30, unit: 'scoop' },
  'avocado': { gramsPer: 150, unit: 'avocado' },
  'potato': { gramsPer: 200, unit: 'potato' },
  'sweet potato': { gramsPer: 200, unit: 'potato' },
};

export function formatAmount(name: string, grams: number): string {
  const lower = name.toLowerCase();
  // Check exact matches and partial matches
  for (const key in FOOD_UNITS) {
    if (Object.prototype.hasOwnProperty.call(FOOD_UNITS, key)) {
      if (lower.indexOf(key) >= 0 || key.indexOf(lower) >= 0) {
        const u = FOOD_UNITS[key];
        const count = Math.round(grams / u.gramsPer);
        if (count === 1) return '1 ' + u.unit;
        if (count > 0 && Math.abs(count * u.gramsPer - grams) < u.gramsPer * 0.5) {
          return count + ' ' + u.unit + (u.unit.endsWith('s') || count === 1 ? '' : 's');
        }
      }
    }
  }
  // Fallback: grams or kg
  if (grams >= 1000) return (grams / 1000).toFixed(2) + 'kg';
  return grams + 'g';
}

// ==================== CATEGORIZATION ====================

const CATEGORY_RULES: { category: string; keys: string[] }[] = [
  {
    category: 'Meat & Fish',
    keys: ['chicken', 'turkey', 'beef', 'steak', 'sirloin', 'pork', 'salmon', 'cod', 'tilapia', 'tuna', 'shrimp', 'bacon', 'sausage', 'lamb', 'ham'],
  },
  {
    category: 'Eggs & Dairy',
    keys: ['egg', 'yogurt', 'cottage cheese', 'milk', 'cheese', 'whey', 'butter', 'cream'],
  },
  {
    category: 'Grains & Bread',
    keys: ['rice', 'oats', 'oatmeal', 'pasta', 'bread', 'toast', 'bagel', 'tortilla', 'quinoa', 'cereal', 'noodle', 'cracker'],
  },
  {
    category: 'Vegetables',
    keys: ['broccoli', 'spinach', 'asparagus', 'pepper', 'bell pepper', 'carrot', 'onion', 'tomato', 'cucumber', 'lettuce', 'kale', 'zucchini', 'mushroom', 'celery', 'cabbage', 'cauliflower', 'green bean'],
  },
  {
    category: 'Fruits',
    keys: ['banana', 'apple', 'blueberr', 'strawberr', 'orange', 'grape', 'mango', 'pineapple', 'peach', 'pear', 'watermelon', 'melon', 'cherry', 'kiwi', 'avocado'],
  },
  {
    category: 'Fats & Oils',
    keys: ['olive oil', 'avocado oil', 'coconut oil', 'butter', 'peanut butter', 'almond', 'walnut', 'cashew', 'seed', 'mayo', 'mayonnaise'],
  },
  {
    category: 'Potatoes & Roots',
    keys: ['potato', 'sweet potato', 'yam', 'carrot', 'parsnip'],
  },
  {
    category: 'Other',
    keys: ['honey', 'sauce', 'spice', 'herb', 'salt', 'pepper', 'vinegar', 'soy sauce', 'mustard', 'ketchup', 'dressing', 'syrup', 'jam', 'jelly', 'protein bar', 'scoop'],
  },
];

function categorize(name: string): string {
  const lower = name.toLowerCase();
  for (let i = 0; i < CATEGORY_RULES.length; i++) {
    const rule = CATEGORY_RULES[i];
    for (let j = 0; j < rule.keys.length; j++) {
      if (lower.indexOf(rule.keys[j]) >= 0) return rule.category;
    }
  }
  return 'Other';
}

// ==================== PARSING ====================

function parsePlanDesc(desc: string): { name: string; grams: number } | null {
  // Strip parenthetical notes like "(grilled, no oil)"
  let cleaned = desc.replace(/\([^)]*\)/g, '').trim();

  // Try to extract gram amount
  const gMatch = cleaned.match(/(\d+)\s*g\b/i);
  let grams = 0;
  if (gMatch) {
    grams = parseInt(gMatch[1]);
    cleaned = cleaned.replace(gMatch[0], '').trim();
  } else {
    // Try oz
    const ozMatch = cleaned.match(/(\d+)\s*oz\b/i);
    if (ozMatch) {
      grams = Math.round(parseInt(ozMatch[1]) * 28.35);
      cleaned = cleaned.replace(ozMatch[0], '').trim();
    }
  }

  if (grams <= 0) {
    // Try implicit amounts: "1 scoop", "2 eggs", etc.
    if (/\bscoop\b/i.test(cleaned)) grams = 30;
    else if (/\blarge egg/i.test(cleaned)) grams = 50;
    else if (/\bmedium egg/i.test(cleaned)) grams = 44;
    else if (/\btbsp\b/i.test(cleaned)) { const m = cleaned.match(/(\d+)\s*tbsp\b/i); grams = m ? parseInt(m[1]) * 14 : 14; }
    else if (/\btsp\b/i.test(cleaned)) { const m = cleaned.match(/(\d+)\s*tsp\b/i); grams = m ? parseInt(m[1]) * 5 : 5; }
    else if (/\bcup\b/i.test(cleaned)) { const m = cleaned.match(/(\d+)\s*cup\b/i); grams = m ? parseInt(m[1]) * 240 : 120; }
    else if (/\bslice\b/i.test(cleaned)) grams = 30;
    else return null; // Can't determine amount
  }

  // Clean remaining: remove leading/trailing punctuation, commas, etc.
  cleaned = cleaned.replace(/^[,.\s]+|[,.\s]+$/g, '').trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return { name: cleaned || 'Food', grams };
}

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/s$/, '') // singularize simple plurals
    .replace(/grilled|steamed|baked|roasted|fried|boiled|raw|fresh|frozen|cooked|chopped|sliced|diced|minced|whole\s/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ==================== MAIN ENTRY POINT ====================

export function generateShoppingList(dateStr?: string): ShoppingItem[] {
  // Collect planNotes from all meals for the given date
  const nut = getNutrition(dateStr || '');
  const allItems: PlanNoteItem[] = [];

  for (let i = 0; i < nut.meals.length; i++) {
    const meal = nut.meals[i];
    if (meal.planNotes && meal.planNotes.length > 0) {
      for (let j = 0; j < meal.planNotes.length; j++) {
        allItems.push(meal.planNotes[j]);
      }
    }
  }

  if (allItems.length === 0) return [];

  // Parse and aggregate
  const aggregated = new Map<string, ShoppingItem>();

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const parsed = parsePlanDesc(item.desc);
    if (!parsed) continue;

    const normName = normalizeName(parsed.name);
    const existing = aggregated.get(normName);

    if (existing) {
      existing.totalGrams += parsed.grams;
      existing.occurrences++;
    } else {
      aggregated.set(normName, {
        name: parsed.name,
        totalGrams: parsed.grams,
        category: categorize(parsed.name),
        occurrences: 1,
      });
    }
  }

  // Convert to array, sort by category then name
  const result: ShoppingItem[] = [];
  aggregated.forEach(function(item) { result.push(item); });

  const catOrder = ['Meat & Fish', 'Eggs & Dairy', 'Grains & Bread', 'Potatoes & Roots', 'Vegetables', 'Fruits', 'Fats & Oils', 'Other'];
  result.sort(function(a, b) {
    const ca = catOrder.indexOf(a.category);
    const cb = catOrder.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  return result;
}

export function generateShoppingListFromMeals(dateStr: string): ShoppingItem[] {
  const nut = getNutrition(dateStr || '');
  const aggregated = new Map<string, ShoppingItem>();

  for (let i = 0; i < nut.meals.length; i++) {
    const meal = nut.meals[i];
    if (!meal.items || meal.items.length === 0) continue;

    for (let j = 0; j < meal.items.length; j++) {
      const entry = meal.items[j];
      const f = getFoodById(entry.foodId);
      if (!f) continue;

      let amount = 100;
      if (entry.amount && entry.unit && entry.unit === 'g') {
        amount = entry.amount;
      } else if (entry.servings) {
        amount = entry.servings * 100; // rough estimate
      }

      const normName = normalizeName(f.name);
      const existing = aggregated.get(normName);

      if (existing) {
        existing.totalGrams += amount;
        existing.occurrences++;
      } else {
        aggregated.set(normName, {
          name: f.name,
          totalGrams: amount,
          category: categorize(f.name),
          occurrences: 1,
        });
      }
    }
  }

  const result: ShoppingItem[] = [];
  aggregated.forEach(function(item) { result.push(item); });

  const catOrder = ['Meat & Fish', 'Eggs & Dairy', 'Grains & Bread', 'Potatoes & Roots', 'Vegetables', 'Fruits', 'Fats & Oils', 'Other'];
  result.sort(function(a, b) {
    const ca = catOrder.indexOf(a.category);
    const cb = catOrder.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  return result;
}

export function mergeShoppingLists(a: ShoppingItem[], b: ShoppingItem[]): ShoppingItem[] {
  const map = new Map<string, ShoppingItem>();

  function add(items: ShoppingItem[]): void {
    for (let i = 0; i < items.length; i++) {
      const key = normalizeName(items[i].name);
      const existing = map.get(key);
      if (existing) {
        existing.totalGrams += items[i].totalGrams;
        existing.occurrences += items[i].occurrences;
      } else {
        map.set(key, { ...items[i] });
      }
    }
  }

  add(a);
  add(b);

  const result: ShoppingItem[] = [];
  map.forEach(function(item) { result.push(item); });

  const catOrder = ['Meat & Fish', 'Eggs & Dairy', 'Grains & Bread', 'Potatoes & Roots', 'Vegetables', 'Fruits', 'Fats & Oils', 'Other'];
  result.sort(function(x, y) {
    const ca = catOrder.indexOf(x.category);
    const cb = catOrder.indexOf(y.category);
    if (ca !== cb) return ca - cb;
    return x.name.localeCompare(y.name);
  });

  return result;
}

export function formatShoppingList(items: ShoppingItem[]): string {
  if (items.length === 0) return 'No items in shopping list.';

  let text = '🛒 SHOPPING LIST\n\n';
  let currentCat = '';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.category !== currentCat) {
      currentCat = item.category;
      text += '── ' + currentCat + ' ──\n';
    }
    const display = formatAmount(item.name, item.totalGrams);
    text += '• ' + item.name + ' — ' + display + '\n';
  }

  return text;
}

export function generateShoppingListFromPrepItems(items: PlanNoteItem[], portions: number): ShoppingItem[] {
  const aggregated = new Map<string, ShoppingItem>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const parsed = parsePlanDesc(item.desc);
    if (!parsed) continue;

    const normName = normalizeName(parsed.name);
    const existing = aggregated.get(normName);
    const scaledGrams = parsed.grams * portions;

    if (existing) {
      existing.totalGrams += scaledGrams;
      existing.occurrences++;
    } else {
      aggregated.set(normName, {
        name: parsed.name,
        totalGrams: scaledGrams,
        category: categorize(parsed.name),
        occurrences: 1,
      });
    }
  }

  const result: ShoppingItem[] = [];
  aggregated.forEach(function(item) { result.push(item); });

  const catOrder = ['Meat & Fish', 'Eggs & Dairy', 'Grains & Bread', 'Potatoes & Roots', 'Vegetables', 'Fruits', 'Fats & Oils', 'Other'];
  result.sort(function(a, b) {
    const ca = catOrder.indexOf(a.category);
    const cb = catOrder.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  return result;
}
