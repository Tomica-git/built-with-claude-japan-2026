import assert from "node:assert/strict";
import test from "node:test";
import { createClaudeReflector, parseReflection } from "../server/claude.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../server/prompts.js";
import { sampleEntry } from "../scripts/sample-entry.js";

const today = { ...sampleEntry, date: "2026-10-24" };

test("初日の依頼は仮説と止め、翌日は計画の違いを見る", () => {
  const first = buildUserPrompt({ entry: today, past: [], manual: null });
  assert.match(first, /初日の仮説/);
  assert.match(first, /角を二つだけ曲がる/);
  assert.match(first, /内向寄り/);

  const second = buildUserPrompt({
    entry: { ...today, date: "2026-10-25", goal: "サンプル。人に会う。" },
    past: [today],
    manual: { draft: "前日の説明書", tendency: "前日の傾向" },
  });
  assert.doesNotMatch(second, /別の日の記録はありません/);
  assert.match(second, /角を二つだけ曲がる/);
  assert.match(second, /人に会う/);
  assert.match(second, /計画の変わり方/);
  assert.match(second, /前日の説明書/);
});

test("システムプロンプトは診断も治療も薬も頼まない", () => {
  assert.match(SYSTEM_PROMPT, /診断/);
  assert.match(SYSTEM_PROMPT, /治療/);
  assert.match(SYSTEM_PROMPT, /薬/);
  assert.match(SYSTEM_PROMPT, /医療的な助言/);
  assert.match(SYSTEM_PROMPT, /固定ラベルの結論にすること/);
});

test("Claude へはスキーマ付きで、思考ブロックを混ぜず読む", async () => {
  const previousModel = process.env.CLAUDE_MODEL;
  const previousEffort = process.env.CLAUDE_EFFORT;
  delete process.env.CLAUDE_MODEL;
  delete process.env.CLAUDE_EFFORT;
  let captured;
  const reflect = createClaudeReflector({
    apiKey: "test-key",
    client: {
      messages: {
        create: async (request) => {
          captured = request;
          return {
            content: [
              { type: "thinking", thinking: "これは返さない" },
              {
                type: "text",
                text: JSON.stringify({
                  reflection: "受け取り",
                  tendency: "初日の仮説。内向寄り。",
                  manual: "# 自分の説明書",
                }),
              },
            ],
          };
        },
      },
    },
  });

  try {
    const result = await reflect({ entry: today, past: [], manual: null });
    assert.equal(result.reflection, "受け取り");
    assert.equal(captured.model, "claude-sonnet-5-5");
    assert.equal(captured.max_tokens, 8000);
    assert.equal(captured.output_config.effort, "medium");
    assert.equal(captured.output_config.format.type, "json_schema");
    assert.deepEqual(captured.output_config.format.schema.required, [
      "reflection",
      "tendency",
      "manual",
    ]);
    assert.match(captured.system, /医療的な助言/);
    assert.match(captured.messages[0].content, /店先の手書きの文字/);
  } finally {
    if (previousModel === undefined) delete process.env.CLAUDE_MODEL;
    else process.env.CLAUDE_MODEL = previousModel;
    if (previousEffort === undefined) delete process.env.CLAUDE_EFFORT;
    else process.env.CLAUDE_EFFORT = previousEffort;
  }
});

test("APIキーがなければ Claude を呼ばない", async () => {
  const reflect = createClaudeReflector({ apiKey: "" });
  await assert.rejects(
    () => reflect({ entry: today, past: [], manual: null }),
    (error) => error.code === "NO_API_KEY",
  );
});

test("囲みがあっても要約のJSONを読む", () => {
  const parsed = parseReflection({
    content: [
      {
        type: "text",
        text: '```json\n{"reflection":"a","tendency":"b","manual":"c"}\n```',
      },
    ],
  });
  assert.deepEqual(parsed, { reflection: "a", tendency: "b", manual: "c" });
});
