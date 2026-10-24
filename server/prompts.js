import { leanLabel, moodById } from "../shared/vocab.js";

export const SYSTEM_PROMPT = `あなたは「気分テンポ日記」の記録係です。相手の朝の言葉を受け取り、傾向の要約と「自分の説明書」の下書きを更新します。会話の相手ではあっても、治療者ではありません。

相手の前提（結論にしないこと）:
- 自分を HSS型HSP として理解している。刺激を求める気持ちと、刺激に疲れやすい感覚が同じ日にある。
- 内向と外向を行き来する。数値は今朝の位置であり、性格の決定ではない。
- 気分や周りの興味で、優先順位と計画をよく変える。変わり方を残したい。

reflection:
- 今日の言葉の受け取り。2から4文。
- 評価、励ましの定型句、助言の列挙で埋めない。
- 本人の言葉を勝手に言い換えすぎない。

tendency:
- 計画の変わり方と、内向と外向の寄りに、必ず両方触れる。
- 刺激の求め方（静けさと新しさ）にも、記録がある範囲で触れる。
- 別の日がないときは、先頭を「初日の仮説。」とし、傾向を断定しない。
- 記録にない出来事を書かない。

manual:
- 自分の説明書の全文。Markdown。
- 前回の下書きがあるときはそれを土台にし、今日の分で更新する。消すときは、今日の記録と矛盾する部分だけ。
- 見出しはこの順:
  # 自分の説明書
  ## 今朝のテンポ
  ## 計画の変わり方
  ## 人との距離
  ## 興味
  ## 任せること
  ## 目標
  ## あつかい方
- 全体でおおよそ400字から900字。朝に一度読める長さ。
- 「あつかい方」は、その日のテンポでの予定の置き方にとどめる。直す、治す、鍛える、とは書かない。

禁止:
- 診断、病名の示唆、治療、薬、医療的な助言
- カウンセリングを名乗ることに
- 内向、外向、HSP、HSS を欠陥や固定ラベルの結論にすること
- 記録にない事実の捏造

自傷や、生きていたくないという内容が読み取れるとき:
- 傾向の分析と、説明書への転記をしない
- reflection は短く、一人で抱えないことと、よりそいホットライン 0120-279-338（24時間）につながることを伝える
- manual は前回の下書きをそのまま返し、前回がなければ見出しだけの短い下書きにして、今日の危機的な記述は入れない
- tendency は「今日は傾向をまとめない。」とだけ書く`;

export const REFLECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reflection", "tendency", "manual"],
  properties: {
    reflection: { type: "string" },
    tendency: { type: "string" },
    manual: { type: "string" },
  },
};

function formatEntry(entry) {
  const mood = moodById(entry.mood)?.label ?? entry.mood;
  return [
    `日付: ${entry.date}`,
    `気分: ${mood}`,
    `気分の言葉: ${entry.moodText}`,
    `人との距離: ${entry.social}（${leanLabel(entry.social, "social")}）`,
    `刺激: ${entry.stimulus}（${leanLabel(entry.stimulus, "stimulus")}）`,
    `やりたいこと: ${entry.wantToDo}`,
    `興味: ${entry.interests}`,
    `任せたい仕事: ${entry.delegate}`,
    `目標: ${entry.goal}`,
  ].join("\n");
}

export function buildUserPrompt({ entry, past, manual }) {
  const days = (past ?? []).slice(-14);
  const parts = ["今日の記録:", formatEntry(entry), ""];
  if (days.length === 0) {
    parts.push(
      "別の日の記録はありません。tendency は「初日の仮説。」で始め、性格の結論にしないこと。",
    );
  } else {
    parts.push(`別の日の記録: ${days.length}日（古い順）`);
    for (const day of days) {
      parts.push(formatEntry(day));
      parts.push("---");
    }
    parts.push(
      "計画の変わり方は、やりたいことと目標が日によってどう違ったかを書いてください。",
    );
    parts.push(
      "内向と外向は、人との距離の数値の移りとして書き、固定の性格にしないでください。",
    );
  }
  parts.push(
    "",
    "前回の傾向要約:",
    manual?.tendency?.trim() || "（まだない）",
    "",
    "前回の自分の説明書:",
    manual?.draft?.trim() || "（まだない。今日が最初の下書き）",
  );
  return parts.join("\n");
}
