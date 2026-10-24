import { MOODS, UNSAID, moodById, todayInTokyo } from "../shared/vocab.js";

const TEXT_FIELDS = [
  ["wantToDo", "やりたいこと"],
  ["interests", "興味"],
  ["delegate", "任せたい仕事"],
  ["goal", "目標"],
];

const LIMIT = 500;

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function readScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function keepWords(value) {
  const text = String(value ?? "").trim();
  return text || UNSAID;
}

export function normalizeEntry(body, { today } = {}) {
  const source = body ?? {};
  const errors = {};
  const mood = String(source.mood ?? "");
  if (!MOODS.some((item) => item.id === mood)) {
    errors.mood = "今朝のテンポを一つ選んでください";
  }

  let moodText = String(source.moodText ?? "").trim();
  if (!moodText && moodById(mood)) moodText = moodById(mood).label;
  if (!moodText) errors.moodText = "今朝の気分を、一言で残してください";
  if (moodText.length > LIMIT) errors.moodText = `気分の言葉は${LIMIT}字までです`;

  const social = readScale(source.social ?? 50);
  const stimulus = readScale(source.stimulus ?? 50);
  if (social === null) errors.social = "人との距離を選び直してください";
  if (stimulus === null) errors.stimulus = "刺激の位置を選び直してください";

  const texts = {};
  for (const [key, label] of TEXT_FIELDS) {
    const text = keepWords(source[key]);
    if (text.length > LIMIT) errors[key] = `${label}は${LIMIT}字までです`;
    texts[key] = text;
  }

  const date = source.date ? String(source.date) : todayInTokyo(today ?? new Date());
  if (!isIsoDate(date)) errors.date = "日付が不正です";

  if (Object.keys(errors).length > 0) {
    const error = new Error("入力を確認してください");
    error.code = "VALIDATION";
    error.fields = errors;
    throw error;
  }

  return {
    date,
    mood,
    moodText,
    social,
    stimulus,
    ...texts,
  };
}
