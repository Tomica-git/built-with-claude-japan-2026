import { normalizeEntry } from "./validate.js";

export function publicEntry(entry) {
  if (!entry) return null;
  const { priorManual, ...rest } = entry;
  return rest;
}

function resolvePrior(existing, currentManual, date) {
  if (existing?.priorManual) return existing.priorManual;
  if (currentManual && currentManual.sourceDate !== date) {
    return {
      draft: currentManual.draft,
      tendency: currentManual.tendency,
    };
  }
  return null;
}

function reasonOf(error) {
  switch (error?.code) {
    case "NO_API_KEY":
      return "no_api_key";
    case "BAD_API_KEY":
      return "bad_api_key";
    default:
      return "claude_error";
  }
}

export function summaryMessage(reason) {
  switch (reason) {
    case "no_api_key":
      return "言葉は保存しました。傾向と説明書の更新には、サーバの ANTHROPIC_API_KEY が必要です。";
    case "bad_api_key":
      return "言葉は保存しました。APIキーが拒否されたため、傾向と説明書は更新していません。";
    default:
      return "言葉は保存しました。傾向と説明書の更新だけ失敗しました。もう一度試せます。";
  }
}

async function pastEntries(store, date) {
  const entries = await store.list();
  return entries
    .filter((entry) => entry.date !== date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(publicEntry);
}

async function applyReflection({ store, reflect, entry, priorManual }) {
  const past = await pastEntries(store, entry.date);
  try {
    const result = await reflect({
      entry: publicEntry(entry),
      past,
      manual: priorManual,
    });
    const saved = {
      ...entry,
      reflection: result.reflection,
      summaryError: null,
      updatedAt: new Date().toISOString(),
    };
    await store.saveEntry(saved);
    const manual = {
      draft: result.manual,
      tendency: result.tendency,
      updatedAt: saved.updatedAt,
      sourceDate: saved.date,
    };
    await store.saveManual(manual);
    return {
      saved: true,
      summarized: true,
      entry: publicEntry(saved),
      manual,
    };
  } catch (error) {
    console.error(`summary failed: ${error.code || "error"} ${error.message}`);
    const failed = {
      ...entry,
      reflection: entry.reflection ?? null,
      summaryError: entry.reflection ? null : reasonOf(error),
      updatedAt: new Date().toISOString(),
    };
    await store.saveEntry(failed);
    return {
      saved: true,
      summarized: false,
      reason: failed.summaryError,
      message: summaryMessage(failed.summaryError),
      entry: publicEntry(failed),
      manual: await store.getManual(),
    };
  }
}

export async function submitMorning({ store, reflect, input, today }) {
  const normalized = normalizeEntry(input, { today });
  const existing = await store.getEntry(normalized.date);
  const currentManual = await store.getManual();
  const priorManual = resolvePrior(existing, currentManual, normalized.date);
  const entry = {
    ...normalized,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reflection: null,
    summaryError: null,
    priorManual,
  };
  await store.saveEntry(entry);
  return applyReflection({ store, reflect, entry, priorManual });
}

export async function refreshSummary({ store, reflect, date }) {
  const existing = await store.getEntry(date);
  if (!existing) {
    const error = new Error("その日の記録がありません");
    error.code = "NOT_FOUND";
    throw error;
  }
  const currentManual = await store.getManual();
  const priorManual = resolvePrior(existing, currentManual, date);
  const entry = { ...existing, priorManual };
  return applyReflection({ store, reflect, entry, priorManual });
}
