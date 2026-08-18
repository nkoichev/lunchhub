import menuData from './menuData.json';

// Bulgarian weekday names, indexed 1=Mon ... 7=Sun. 0 = every day.
export const DAY_NAMES = {
  0: 'Всеки ден',
  1: 'Понеделник',
  2: 'Вторник',
  3: 'Сряда',
  4: 'Четвъртък',
  5: 'Петък',
  6: 'Събота',
  7: 'Неделя',
};

export const WEEKDAYS = [1, 2, 3, 4, 5];

// For the dish form: "Всеки ден" (0) plus the weekdays.
export const FORM_DAYS = [0, 1, 2, 3, 4, 5];

// JS getDay(): 0=Sun..6=Sat  ->  our 1=Mon..7=Sun
export function todayIndex() {
  const js = new Date().getDay();
  return js === 0 ? 7 : js;
}

export function dayName(index) {
  return DAY_NAMES[index] ?? '';
}

// Local fallback menu (used if Supabase is unreachable / not configured).
export const LOCAL_MENU = menuData;

export function localMenuForDay(dayIndex) {
  return (LOCAL_MENU.days?.[String(dayIndex)] ?? []).map((it, i) => ({
    id: `local-${dayIndex}-${i}`,
    name: it.name,
    price: it.price,
    category: it.category ?? 'main',
    day_index: dayIndex,
  }));
}

export const RESTAURANT = { id: LOCAL_MENU.id, name: LOCAL_MENU.name };

export const CATEGORY_LABELS = {
  soup: 'Супи',
  salad: 'Салати',
  main: 'Основни',
  dessert: 'Десерти',
};

export const CATEGORY_ORDER = ['soup', 'salad', 'main', 'dessert'];
