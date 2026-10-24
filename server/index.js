import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createClaudeReflector } from "./claude.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error("PORT が不正です");
  process.exit(1);
}

const app = createApp({
  dataDir: path.join(root, "data"),
  publicDir: path.join(root, "public"),
  sharedDir: path.join(root, "shared"),
  reflect: createClaudeReflector(),
});

const server = app.listen(port, "127.0.0.1");
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`ポート ${port} は使用中です。PORT を変えて起動してください。`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
server.on("listening", () => {
  console.log(`気分テンポ日記 http://127.0.0.1:${port}`);
});
