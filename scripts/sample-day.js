import { sampleEntry } from "./sample-entry.js";

const base = process.env.BASE_URL || "http://127.0.0.1:3000";

let response;
try {
  response = await fetch(`${base}/api/entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sampleEntry),
  });
} catch {
  console.error("サーバに接続できません。別のターミナルで npm start してから、もう一度 npm run sample してください。");
  process.exit(1);
}

const body = await response.json();
if (!response.ok) {
  console.error(body.message || "保存できませんでした");
  process.exit(1);
}

console.log(`保存した日: ${body.entry.date}`);
console.log(`目標: ${body.entry.goal}`);
if (!body.summarized) {
  console.error(body.message);
  console.error("言葉は data/entries.json に残っています。キーを設定してから、画面の「傾向と説明書を更新する」か、もう一度 npm run sample を実行してください。");
  process.exit(1);
}

console.log("");
console.log("今日の受け取り");
console.log(body.entry.reflection);
console.log("");
console.log("傾向");
console.log(body.manual.tendency);
console.log("");
console.log("自分の説明書");
console.log(body.manual.draft);
