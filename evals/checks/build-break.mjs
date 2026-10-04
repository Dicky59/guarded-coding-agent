// The build must pass WITHOUT cheating: no suppressions, no `any`.
import fs from "node:fs";
import path from "node:path";

const fail = (m) => { console.error(`CHECK FAILED: ${m}`); process.exit(1); };
const root = process.cwd();

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (p.endsWith(".ts")) yield p;
  }
}

for (const file of walk(path.join(root, "src"))) {
  const text = fs.readFileSync(file, "utf8");
  if (/@ts-ignore|@ts-expect-error|@ts-nocheck/.test(text)) fail(`${path.relative(root, file)} uses a TS suppression comment`);
  if (/\bas any\b|:\s*any\b|<any>/.test(text)) fail(`${path.relative(root, file)} uses \`any\``);
}
const report = fs.readFileSync(path.join(root, "src", "report.ts"), "utf8");
if (!/export function renderReport/.test(report)) fail("renderReport is no longer exported from report.ts");
console.log("ok");
