import assert from "node:assert/strict";
import test from "node:test";
import { renderManual } from "../shared/render.js";
import { formatJapaneseDate, leanLabel, todayInTokyo } from "../shared/vocab.js";

test("説明書のHTMLではタグを文字として出す", () => {
  const html = renderManual("# 自分の説明書\n\n## 人との距離\n\n<script>alert(1)</script>\n\n- 一つ");
  assert.match(html, /<h1>自分の説明書<\/h1>/);
  assert.match(html, /<h2>人との距離<\/h2>/);
  assert.match(html, /<li>一つ<\/li>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("日付は東京の朝で切り替わる", () => {
  assert.equal(todayInTokyo(new Date("2026-10-23T14:30:00Z")), "2026-10-23");
  assert.equal(todayInTokyo(new Date("2026-10-23T15:30:00Z")), "2026-10-24");
  assert.match(formatJapaneseDate("2026-10-24"), /10月24日/);
  assert.match(formatJapaneseDate("2026-10-24"), /土/);
});

test("位置のラベルは両端と途中を分ける", () => {
  assert.equal(leanLabel(0, "social"), "内向寄り");
  assert.equal(leanLabel(50, "social"), "行き来の途中");
  assert.equal(leanLabel(100, "social"), "外向寄り");
  assert.equal(leanLabel(20, "stimulus"), "静けさ寄り");
  assert.equal(leanLabel(74, "stimulus"), "新しい刺激寄り");
});
