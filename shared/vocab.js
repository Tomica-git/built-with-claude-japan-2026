export const MOODS = [
  { id: "heavy", label: "重い" },
  { id: "hazy", label: "ぼんやり" },
  { id: "steady", label: "いつもの朝" },
  { id: "light", label: "軽い" },
  { id: "bright", label: "高まる" },
];

export const UNSAID = "今日は言葉にならない";

export function moodById(id) {
  return MOODS.find((mood) => mood.id === id) ?? null;
}

export function todayInTokyo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatJapaneseDate(isoDate) {
  const instant = new Date(`${isoDate}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(instant);
}

export function leanLabel(value, kind) {
  const n = Number(value);
  if (kind === "social") {
    if (n <= 33) return "内向寄り";
    if (n >= 67) return "外向寄り";
    return "行き来の途中";
  }
  if (n <= 33) return "静けさ寄り";
  if (n >= 67) return "新しい刺激寄り";
  return "どちらも少し";
}
