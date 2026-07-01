import { getNutrition } from './data';
import type { PlanNoteItem } from './types';

// ==================== TYPES ====================

export interface ShoppingItem {
  name: string;
  totalGrams: number;
  category: string;
  occurrences: number; // how many plan notes contributed
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
    const kg = item.totalGrams >= 1000 ? (item.totalGrams / 1000).toFixed(2) + 'kg' : '';
    const display = kg || item.totalGrams + 'g';
    text += '• ' + item.name + ' — ' + display + '\n';
  }

  return text;
}
