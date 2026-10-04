export const HISTORY_STORAGE_KEY = 'plank-hold-history-v1';

export type PlankHistory = Record<string, number>;

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function readHistory(): PlankHistory {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key, count]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isInteger(count) && Number(count) >= 0,
      ),
    ) as PlankHistory;
  } catch {
    return {};
  }
}

export function getTodayCount() {
  return readHistory()[localDateKey()] ?? 0;
}

export function addSeconds(seconds: number) {
  const history = readHistory();
  const key = localDateKey();
  const next = (history[key] ?? 0) + Math.max(0, Math.round(seconds));
  history[key] = next;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Keep counting for this session even when storage is unavailable.
  }
  return next;
}

export function recentDays(history: SquatHistory, length: number) {
  return Array.from({ length }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (length - 1 - index));
    const key = localDateKey(date);
    return {
      key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      weekday: new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(date),
      count: history[key] ?? 0,
    };
  });
}

export function currentStreak(history: SquatHistory) {
  let streak = 0;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  if ((history[localDateKey(date)] ?? 0) === 0) date.setDate(date.getDate() - 1);
  while ((history[localDateKey(date)] ?? 0) > 0) {
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}
