import Anthropic from "@anthropic-ai/sdk";
import { REFLECTION_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";

const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export function normalizeEffort(value) {
  const effort = String(value || "medium").toLowerCase();
  return EFFORTS.has(effort) ? effort : "medium";
}

function fail(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function textFrom(message) {
  const text = (message?.content ?? [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) throw fail("Claude の応答が空です", "CLAUDE_ERROR");
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export function parseReflection(message) {
  if (message?.stop_reason === "max_tokens") {
    throw fail("要約が途中で切れました", "CLAUDE_ERROR");
  }
  const parsed =
    message?.parsed_output && typeof message.parsed_output === "object"
      ? message.parsed_output
      : JSON.parse(textFrom(message));
  return normalizeReflection(parsed);
}

export function normalizeReflection(value) {
  const source = value ?? {};
  const out = {};
  for (const key of ["reflection", "tendency", "manual"]) {
    if (typeof source[key] !== "string" || !source[key].trim()) {
      throw fail(`要約の ${key} が空です`, "CLAUDE_ERROR");
    }
    out[key] = source[key].trim();
  }
  return {
    reflection: out.reflection.slice(0, 2000),
    tendency: out.tendency.slice(0, 4000),
    manual: out.manual.slice(0, 8000),
  };
}

export function createClaudeReflector(options = {}) {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  const model = options.model ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";
  const effort = normalizeEffort(options.effort ?? process.env.CLAUDE_EFFORT);
  const client = options.client ?? null;

  return async function reflect({ entry, past, manual }) {
    if (!client && !apiKey) {
      throw fail("ANTHROPIC_API_KEY が設定されていません", "NO_API_KEY");
    }
    const anthropic = client ?? new Anthropic({ apiKey, timeout: 60_000 });
    let message;
    try {
      message = await anthropic.messages.create({
        model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort,
          format: {
            type: "json_schema",
            schema: REFLECTION_SCHEMA,
          },
        },
        messages: [
          {
            role: "user",
            content: buildUserPrompt({ entry, past, manual }),
          },
        ],
      });
    } catch (error) {
      if (error?.status === 401) throw fail("APIキーが拒否されました", "BAD_API_KEY");
      console.error(`claude request failed: ${error.status || ""} ${error.message}`);
      throw fail("Claude API の呼び出しに失敗しました", "CLAUDE_ERROR");
    }
    return parseReflection(message);
  };
}
