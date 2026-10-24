import fs from "node:fs/promises";
import path from "node:path";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    const wrapped = new Error(`${path.basename(file)} を読めません`);
    wrapped.cause = error;
    throw wrapped;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(tmp, file);
}

export function createStore(dir) {
  const entriesPath = path.join(dir, "entries.json");
  const manualPath = path.join(dir, "manual.json");
  let chain = Promise.resolve();

  function exclusive(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  return {
    list() {
      return exclusive(async () => {
        const entries = await readJson(entriesPath, []);
        return [...entries].sort((a, b) => b.date.localeCompare(a.date));
      });
    },
    getEntry(date) {
      return exclusive(async () => {
        const entries = await readJson(entriesPath, []);
        return entries.find((entry) => entry.date === date) ?? null;
      });
    },
    saveEntry(entry) {
      return exclusive(async () => {
        const entries = await readJson(entriesPath, []);
        const next = entries.filter((item) => item.date !== entry.date);
        next.push(entry);
        next.sort((a, b) => a.date.localeCompare(b.date));
        await writeJson(entriesPath, next);
        return entry;
      });
    },
    getManual() {
      return exclusive(() => readJson(manualPath, null));
    },
    saveManual(manual) {
      return exclusive(async () => {
        await writeJson(manualPath, manual);
        return manual;
      });
    },
  };
}
