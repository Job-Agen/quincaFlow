/**
 * Date utility helpers for QuincailPro.
 */

// Returns "YYYY-MM-DD" for today
export function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// Returns { start: Date (Monday 00:00), end: Date (Sunday 23:59:59) } for a given week offset
// offset 0 = current week, -1 = previous week, etc.
export function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon...
  const diffToMonday = day === 0 ? -6 : 1 - day; // days to subtract to reach Monday
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

// Returns true if dateA and dateB (Date objects or ISO strings) are the same calendar day
export function isSameDay(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Returns true if dateStr (ISO "YYYY-MM-DD" or full ISO datetime) falls within [start, end] (Date objects)
export function isSameWeek(dateStr, start, end) {
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

// Formats "YYYY-MM-DD" or ISO datetime to "JJ/MM/YYYY"
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Returns abbreviated French day label for a date string: "lun.", "mar.", etc.
export function getDayLabel(dateStr) {
  const labels = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const d = new Date(dateStr);
  return labels[d.getDay()];
}

// Returns array of the last 7 days as "YYYY-MM-DD" strings (oldest first, today last)
export function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// Formats an ISO datetime to "HH:MM"
export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
