import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/app.js";
import { submitMorning } from "../server/journal.js";
import { createStore } from "../server/store.js";
import { normalizeEntry } from "../server/validate.js";
import { sampleEntry } from "../scripts/sample-entry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const morning = new Date("2026-10-23T15:30:00Z");

function manualOf(n) {
  return {
    reflection: `受け取り${n}`,
    tendency: `傾向${n}`,
    manual: `# 自分の説明書\n\n下書き${n}`,
  };
}

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "kibun-"));
}

test("空欄の問いは、言葉にならない、として残す", () => {
  const entry = normalizeEntry(
    {
      mood: "hazy",
      moodText: "  ",
      social: 10,
      stimulus: 80,
      wantToDo: "   ",
      interests: "",
      delegate: "",
      goal: "",
    },
    { today: morning },
  );
  assert.equal(entry.date, "2026-10-24");
  assert.equal(entry.moodText, "ぼんやり");
  assert.equal(entry.wantToDo, "今日は言葉にならない");
  assert.equal(entry.social, 10);
});

test("同じ日の書き直しは、今日の説明書ではなく直前の下書きを渡す", async () => {
  const store = createStore(await tempDir());
  await store.saveManual({
    draft: "きのうの説明書",
    tendency: "きのうの傾向",
    sourceDate: "2026-10-23",
    updatedAt: "2026-10-23T21:00:00.000Z",
  });
  const seen = [];
  const reflect = async ({ manual }) => {
    seen.push(manual?.draft ?? null);
    return manualOf(seen.length);
  };

  await submitMorning({ store, reflect, input: sampleEntry, today: morning });
  await submitMorning({
    store,
    reflect,
    input: { ...sampleEntry, goal: "サンプル。午後は家にいる。" },
    today: morning,
  });

  assert.deepEqual(seen, ["きのうの説明書", "きのうの説明書"]);
  const entry = await store.getEntry("2026-10-24");
  assert.equal(entry.goal, "サンプル。午後は家にいる。");
  assert.equal(entry.reflection, "受け取り2");
  assert.equal((await store.getManual()).draft, "# 自分の説明書\n\n下書き2");
});

test("要約が失敗しても、その日の言葉は残る", async () => {
  const store = createStore(await tempDir());
  const result = await submitMorning({
    store,
    reflect: async () => {
      const error = new Error("missing");
      error.code = "NO_API_KEY";
      throw error;
    },
    input: sampleEntry,
    today: morning,
  });
  assert.equal(result.saved, true);
  assert.equal(result.summarized, false);
  assert.equal(result.reason, "no_api_key");
  const entry = await store.getEntry("2026-10-24");
  assert.equal(entry.goal, sampleEntry.goal);
  assert.equal(entry.reflection, null);
  assert.equal(await store.getManual(), null);
});

test("サンプル1日が保存され、傾向と説明書が返る", async (t) => {
  const dir = await tempDir();
  let calls = 0;
  const app = createApp({
    dataDir: dir,
    publicDir: path.join(root, "public"),
    sharedDir: path.join(root, "shared"),
    hasApiKey: true,
    now: () => morning,
    reflect: async ({ entry, past }) => {
      calls += 1;
      assert.equal(entry.goal, sampleEntry.goal);
      assert.equal(past.length, 0);
      return {
        reflection: "明るさが先に来ている朝として受け取りました。",
        tendency: "初日の仮説。計画は歩くことに置かれている。人との距離は内向寄り。",
        manual: "# 自分の説明書\n\n## 今朝のテンポ\n\n軽い。\n\n## あつかい方\n\n予定は一つにする。",
      };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;

  const posted = await fetch(`${url}/api/entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sampleEntry),
  });
  const body = await posted.json();
  assert.equal(posted.status, 200);
  assert.equal(body.summarized, true);
  assert.equal(body.entry.date, "2026-10-24");
  assert.equal(body.entry.priorManual, undefined);
  assert.match(body.manual.tendency, /初日の仮説/);
  assert.match(body.manual.tendency, /内向寄り/);
  assert.match(body.manual.draft, /自分の説明書/);

  const saved = JSON.parse(await fs.readFile(path.join(dir, "entries.json"), "utf8"));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].moodText, sampleEntry.moodText);

  const listed = await fetch(`${url}/api/bootstrap`);
  const bootstrap = await listed.json();
  assert.equal(bootstrap.entries.length, 1);
  assert.equal(bootstrap.manual.sourceDate, "2026-10-24");
  assert.equal(bootstrap.entries[0].priorManual, undefined);

  const page = await fetch(url);
  assert.match(await page.text(), /気分テンポ日記/);
  assert.equal(calls, 1);

  const rejected = await fetch(`${url}/api/entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ moodText: "気分だけ" }),
  });
  assert.equal(rejected.status, 400);
  assert.equal(calls, 1);
});
