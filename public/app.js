import { renderManual, escapeHtml } from "/shared/render.js";
import { MOODS, formatJapaneseDate, leanLabel, moodById } from "/shared/vocab.js";

const DRAFT_KEY = "kibun-tempo-draft";
const STEPS = [
  {
    title: "気分",
    prompt: "今朝のテンポを、評価せずに置いてください。",
  },
  {
    field: "wantToDo",
    title: "やりたいこと",
    prompt: "今日、やってみたいことはありますか。一つで足ります。",
    placeholder: "例: 角を二つだけ曲がって歩く",
  },
  {
    field: "interests",
    title: "興味",
    prompt: "いま、興味が向いているものはありますか。",
    placeholder: "例: 店先の手書き",
  },
  {
    field: "delegate",
    title: "任せたいこと",
    prompt: "今日、自分で抱えたくないことや、誰かに渡したいことはありますか。",
    placeholder: "例: 午後の連絡の返事",
  },
  {
    field: "goal",
    title: "目標",
    prompt: "目標を一つだけ置くなら、何にしますか。",
    placeholder: "例: 歩くことだけを目標にする",
  },
];

const SUMMARY_MESSAGES = {
  no_api_key:
    "言葉は保存しました。傾向と説明書の更新には、サーバの ANTHROPIC_API_KEY が必要です。",
  bad_api_key: "言葉は保存しました。APIキーが拒否されたため、傾向と説明書は更新していません。",
  claude_error: "言葉は保存しました。傾向と説明書の更新だけ失敗しました。もう一度試せます。",
};

const main = document.querySelector("#main");
const state = {
  today: "",
  entries: [],
  manual: null,
  hasApiKey: true,
  view: "today",
  writing: false,
  wizard: null,
  openDate: "",
  busy: false,
  fieldError: "",
};

let bound = false;
let lock = false;

function blankWizard() {
  return {
    step: 0,
    mood: "",
    moodText: "",
    social: 50,
    stimulus: 50,
    wantToDo: "",
    interests: "",
    delegate: "",
    goal: "",
  };
}

function todayEntry() {
  return state.entries.find((entry) => entry.date === state.today) ?? null;
}

function tempoLine(entry) {
  const mood = moodById(entry.mood)?.label ?? "";
  return [mood, leanLabel(entry.social, "social"), leanLabel(entry.stimulus, "stimulus")]
    .filter(Boolean)
    .join(" · ");
}

function persist() {
  if (!state.wizard) return;
  try {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ date: state.today, wizard: state.wizard }),
    );
  } catch {
    // プライベートモードでは下書きを残さない。送信までは画面上に残る。
  }
}

function restoreWizard() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.date !== state.today || !data.wizard) return null;
    const wizard = { ...blankWizard(), ...data.wizard };
    wizard.step = Math.min(STEPS.length - 1, Math.max(0, Number(wizard.step) || 0));
    return wizard;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // 消せなくても、成功後の表示はサーバの記録を使う。
  }
}

function bind() {
  if (bound) return;
  bound = true;
  document.body.addEventListener("click", onClick);
  main.addEventListener("input", onInput);
  main.addEventListener("keydown", onKey);
}

function onInput(event) {
  if (!state.wizard) return;
  const el = event.target;
  if (!el.dataset.field) return;
  state.wizard[el.dataset.field] = el.type === "range" ? Number(el.value) : el.value;
  if (el.dataset.field === "social" || el.dataset.field === "stimulus") {
    const label = leanLabel(el.value, el.dataset.field);
    const out = main.querySelector(`[data-lean="${el.dataset.field}"]`);
    if (out) out.textContent = label;
    el.setAttribute("aria-valuetext", label);
  }
  persist();
}

function onKey(event) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && state.writing && !state.busy) {
    event.preventDefault();
    nextStep();
  }
}

function onClick(event) {
  const viewBtn = event.target.closest("nav [data-view]");
  if (viewBtn) {
    state.view = viewBtn.dataset.view;
    state.fieldError = "";
    render();
    return;
  }
  const btn = event.target.closest("[data-action]");
  if (!btn || btn.disabled || state.busy) return;
  const action = btn.dataset.action;
  if (action === "mood") {
    state.wizard.mood = btn.dataset.mood;
    state.fieldError = "";
    persist();
    render();
  } else if (action === "next") {
    nextStep();
  } else if (action === "back") {
    state.wizard.step = Math.max(0, state.wizard.step - 1);
    state.fieldError = "";
    persist();
    render();
  } else if (action === "unsay") {
    const step = STEPS[state.wizard.step];
    if (!step.field) return;
    state.wizard[step.field] = "今日は言葉にならない";
    persist();
    render();
  } else if (action === "rewrite") {
    beginRewrite();
  } else if (action === "retry") {
    retry();
  } else if (action === "open") {
    state.openDate = state.openDate === btn.dataset.date ? "" : btn.dataset.date;
    render();
  }
}

function nextStep() {
  const wizard = state.wizard;
  if (wizard.step === 0) {
    if (!wizard.mood) {
      state.fieldError = "今朝のテンポを一つ選んでください";
      render();
      return;
    }
    if (!wizard.moodText.trim()) wizard.moodText = moodById(wizard.mood).label;
    wizard.step = 1;
    state.fieldError = "";
    persist();
    render();
    return;
  }
  const step = STEPS[wizard.step];
  if (!String(wizard[step.field] ?? "").trim()) wizard[step.field] = "今日は言葉にならない";
  if (wizard.step < STEPS.length - 1) {
    wizard.step += 1;
    state.fieldError = "";
    persist();
    render();
    return;
  }
  submit();
}

function beginRewrite() {
  const entry = todayEntry();
  state.view = "today";
  state.writing = true;
  state.fieldError = "";
  state.wizard = entry
    ? {
        step: 0,
        mood: entry.mood,
        moodText: entry.moodText,
        social: entry.social,
        stimulus: entry.stimulus,
        wantToDo: entry.wantToDo,
        interests: entry.interests,
        delegate: entry.delegate,
        goal: entry.goal,
      }
    : blankWizard();
  persist();
  render();
}

async function reload() {
  const response = await fetch("/api/bootstrap");
  if (!response.ok) throw new Error("bootstrap failed");
  const data = await response.json();
  state.today = data.today;
  state.entries = data.entries;
  state.manual = data.manual;
  state.hasApiKey = data.hasApiKey;
}

async function submit() {
  if (lock) return;
  lock = true;
  state.busy = true;
  state.fieldError = "";
  render();
  const wizard = state.wizard;
  try {
    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: state.today,
        mood: wizard.mood,
        moodText: wizard.moodText,
        social: wizard.social,
        stimulus: wizard.stimulus,
        wantToDo: wizard.wantToDo,
        interests: wizard.interests,
        delegate: wizard.delegate,
        goal: wizard.goal,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      state.busy = false;
      state.fieldError = body.message || "保存できませんでした";
      render();
      return;
    }
    state.writing = false;
    state.wizard = null;
    clearDraft();
    try {
      await reload();
    } catch {
      state.fieldError = "保存しましたが、画面の読み込みに失敗しました。再読み込みしてください。";
    }
    state.busy = false;
    state.view = "today";
    render();
    window.scrollTo(0, 0);
  } catch {
    state.busy = false;
    state.fieldError = "サーバに届きませんでした。入力はこの画面に残しています。";
    render();
  } finally {
    lock = false;
  }
}

async function retry() {
  const entry = todayEntry();
  if (!entry || lock) return;
  lock = true;
  state.busy = true;
  state.fieldError = "";
  render();
  try {
    const response = await fetch(`/api/entries/${entry.date}/reflect`, { method: "POST" });
    const body = await response.json();
    await reload();
    state.busy = false;
    if (!response.ok) state.fieldError = body.message || "更新できませんでした";
    render();
  } catch {
    state.busy = false;
    state.fieldError = "サーバに届きませんでした。";
    render();
  } finally {
    lock = false;
  }
}

function renderScale(field, left, right) {
  const value = state.wizard[field];
  const label = leanLabel(value, field);
  return `<div class="scale">
    <div class="scale-ends"><span>${left}</span><span>${right}</span></div>
    <input type="range" min="0" max="100" value="${value}" data-field="${field}" aria-valuetext="${escapeHtml(label)}" aria-label="${left}から${right}" />
    <p class="lean" data-lean="${field}">${escapeHtml(label)}</p>
  </div>`;
}

function renderWizard() {
  const wizard = state.wizard;
  const step = STEPS[wizard.step];
  const chips = MOODS.map(
    (mood) =>
      `<button type="button" data-action="mood" data-mood="${mood.id}" aria-pressed="${wizard.mood === mood.id}">${mood.label}</button>`,
  ).join("");
  const body =
    wizard.step === 0
      ? `<div class="chips" role="group" aria-label="今朝のテンポ">${chips}</div>
        <label class="field" for="moodText">気分を、自分の言葉で</label>
        <textarea id="moodText" data-field="moodText" placeholder="一文で足ります">${escapeHtml(wizard.moodText)}</textarea>
        ${renderScale("social", "ひとりでいたい", "誰かといたい")}
        ${renderScale("stimulus", "静かにしていたい", "新しいものが欲しい")}
        <p class="hint">内向か外向かを決める欄ではありません。今朝の位置です。</p>`
      : `<label class="field" for="${step.field}">${step.title}</label>
        <textarea id="${step.field}" data-field="${step.field}" placeholder="${escapeHtml(step.placeholder)}">${escapeHtml(wizard[step.field])}</textarea>
        <button type="button" class="unsay" data-action="unsay">今日は言葉にならない</button>`;
  const nextLabel = wizard.step === STEPS.length - 1 ? "記録して、説明書を更新する" : "次へ";
  const back =
    wizard.step > 0 ? `<button type="button" class="ghost" data-action="back">戻る</button>` : "";
  const error = state.fieldError ? `<p class="error">${escapeHtml(state.fieldError)}</p>` : "";
  return `<p class="step">${wizard.step + 1} / ${STEPS.length}　${step.title}</p>
    <h2>${escapeHtml(step.prompt)}</h2>
    ${body}
    ${error}
    <div class="actions">${back}<button type="button" class="primary" id="save-morning" data-action="next">${nextLabel}</button></div>
    <p class="hint">Ctrl または ⌘ + Enter でも進めます。質問の途中では Claude を呼びません。</p>`;
}

function renderWords(entry) {
  const rows = [
    ["気分の言葉", entry.moodText],
    ["やりたいこと", entry.wantToDo],
    ["興味", entry.interests],
    ["任せたい仕事", entry.delegate],
    ["目標", entry.goal],
  ];
  const body = rows
    .map(
      ([label, value]) =>
        `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join("");
  return `<details class="card" open>
    <summary>今朝入力した言葉</summary>
    <dl>${body}</dl>
  </details>`;
}

function renderResult(entry) {
  const parts = [
    `<p class="step">${escapeHtml(formatJapaneseDate(entry.date))}の記録</p>`,
    `<p class="tempo">${escapeHtml(tempoLine(entry))}</p>`,
  ];
  if (entry.reflection) {
    parts.push(
      `<section class="card" id="reflection"><h2>今日の受け取り</h2><p>${escapeHtml(entry.reflection)}</p></section>`,
    );
  } else {
    parts.push(
      `<section class="card warn"><p>${escapeHtml(SUMMARY_MESSAGES[entry.summaryError] || SUMMARY_MESSAGES.claude_error)}</p>
        <button type="button" class="primary" id="retry-summary" data-action="retry">傾向と説明書を更新する</button></section>`,
    );
  }
  const manualIsToday = state.manual?.sourceDate === entry.date && entry.reflection;
  if (manualIsToday) {
    parts.push(
      `<section class="card" id="tendency"><h2>傾向</h2><p>${escapeHtml(state.manual.tendency)}</p></section>`,
    );
    parts.push(
      `<section class="card" id="manual-draft"><h2>自分の説明書</h2><div class="prose">${renderManual(state.manual.draft)}</div></section>`,
    );
  } else if (state.manual?.draft) {
    parts.push(
      `<section class="card" id="manual-draft"><h2>残っている説明書</h2><p class="muted">今朝の更新では置き換わっていません。</p><div class="prose">${renderManual(state.manual.draft)}</div></section>`,
    );
  }
  if (state.fieldError) parts.push(`<p class="error">${escapeHtml(state.fieldError)}</p>`);
  parts.push(renderWords(entry));
  parts.push(`<button type="button" class="ghost" data-action="rewrite">書き直す</button>`);
  return parts.join("");
}

function renderLog() {
  if (state.entries.length === 0) {
    return `<h2>記録</h2><p>まだ記録がありません。今朝の入力が最初の一日になります。</p>`;
  }
  const items = state.entries
    .map((entry) => {
      const open = state.openDate === entry.date;
      const detail = open ? `<div class="card">${renderWords(entry)}${entry.reflection ? `<p>${escapeHtml(entry.reflection)}</p>` : ""}</div>` : "";
      return `<button type="button" class="log-item" data-action="open" data-date="${entry.date}">
        <span>${escapeHtml(formatJapaneseDate(entry.date))}</span>
        <span>${escapeHtml(tempoLine(entry))}</span>
        <span class="goal">${escapeHtml(entry.goal)}</span>
      </button>${detail}`;
    })
    .join("");
  return `<h2>記録</h2>${items}`;
}

function renderManualView() {
  if (!state.manual?.draft) {
    return `<h2>自分の説明書</h2><p>まだ説明書はありません。今朝の入力が最初の下書きになります。</p>`;
  }
  const when = state.manual.sourceDate
    ? `${formatJapaneseDate(state.manual.sourceDate)}の記録から`
    : "";
  return `<p class="step">${escapeHtml(when)}</p>
    <section class="card" id="tendency"><h2>傾向</h2><p>${escapeHtml(state.manual.tendency || "")}</p></section>
    <section class="card" id="manual-draft"><h2>自分の説明書</h2><div class="prose">${renderManual(state.manual.draft)}</div></section>`;
}

function render() {
  const label = document.querySelector("#today-label");
  label.textContent = state.today ? `${formatJapaneseDate(state.today)}の朝` : "今朝";
  const banner = document.querySelector("#key-banner");
  if (state.hasApiKey) {
    banner.hidden = true;
    banner.textContent = "";
  } else {
    banner.hidden = false;
    banner.textContent =
      "APIキーが未設定です。言葉は保存されますが、傾向と説明書は更新されません。";
  }
  for (const button of document.querySelectorAll("nav [data-view]")) {
    if (button.dataset.view === state.view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }

  if (state.busy) {
    main.innerHTML = `<section class="wait card">
      <p class="step">一回だけ待っています</p>
      <h2>今朝の言葉と、これまでの記録を照らしています。</h2>
      <p>質問の途中では待ちません。届かなかったときは、入力をこの画面に戻します。</p>
    </section>`;
    return;
  }

  if (state.view === "log") {
    main.innerHTML = renderLog();
    return;
  }
  if (state.view === "manual") {
    main.innerHTML = renderManualView();
    return;
  }
  if (state.writing || !todayEntry()) {
    if (!state.wizard) state.wizard = blankWizard();
    state.writing = true;
    main.innerHTML = renderWizard();
    const field = main.querySelector("textarea");
    field?.focus();
    return;
  }
  main.innerHTML = renderResult(todayEntry());
}

async function boot() {
  bind();
  try {
    await reload();
  } catch {
    main.innerHTML = `<p class="error">読み込めませんでした。npm start が動いているか確認してください。</p>`;
    return;
  }
  if (!todayEntry()) {
    state.writing = true;
    state.wizard = restoreWizard() ?? blankWizard();
  }
  render();
}

boot();
