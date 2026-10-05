#!/usr/bin/env node
// Generates a larger variant of the shop-shipping fixture.
//
//   node shop-xl.mjs <outDir> [--modules 40] [--seed 7]
//
// The hand-written shop-shipping core (same bug, same tests) is copied as-is, then surrounded by
// N generated "ext" modules: correct, tested code that adds realistic bulk and search noise
// (shipping/weight/rate words, kgToGrams/gramsToKg calls, same-named exports in many modules).
// Output is deterministic for a given (modules, seed), and module i does not depend on N, so
// growing N only adds modules. Test expectations are *characterised* by running the generated code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(here, "../fixtures/shop-shipping");

const args = process.argv.slice(2);
const outDir = args[0] && !args[0].startsWith("--") ? path.resolve(args[0]) : null;
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const MODULES = opt("modules", 40);
const SEED = opt("seed", 7);
if (!outDir) {
  console.error("usage: node shop-xl.mjs <outDir> [--modules N] [--seed S]");
  process.exit(2);
}

// ---- deterministic randomness ----
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const money = (rnd, lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
const shuffle = (rnd, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const J = (v) => JSON.stringify(v);

// ---- module catalogue: [slug, Singular, archetype]. The first block is deliberately "shipping-flavoured" noise. ----
const NOUNS = [
  ["carriers", "Carrier", "ratetable"],
  ["shipping-labels", "ShippingLabel", "statemachine"],
  ["parcel-tracking", "ParcelTracking", "statemachine"],
  ["weight-classes", "WeightClass", "weight"],
  ["freight-quotes", "FreightQuote", "ratetable"],
  ["shipping-insurance", "ShippingInsurance", "ledger"],
  ["delivery-windows", "DeliveryWindow", "queue"],
  ["pallets", "Pallet", "weight"],
  ["packaging", "Package", "weight"],
  ["customs-forms", "CustomsForm", "statemachine"],
  ["returns", "Return", "statemachine"],
  ["warehouses", "Warehouse", "weight"],
  ["coupons", "Coupon", "ledger"],
  ["invoices", "Invoice", "ledger"],
  ["subscriptions", "Subscription", "statemachine"],
  ["suppliers", "Supplier", "scoring"],
  ["reviews", "Review", "scoring"],
  ["wishlists", "Wishlist", "registry"],
  ["notifications", "Notification", "queue"],
  ["audits", "Audit", "ledger"],
  ["gift-cards", "GiftCard", "ledger"],
  ["loyalty-points", "LoyaltyPoint", "scoring"],
  ["refunds", "Refund", "ledger"],
  ["payouts", "Payout", "ledger"],
  ["bundles", "Bundle", "registry"],
  ["brands", "Brand", "registry"],
  ["categories", "Category", "registry"],
  ["tags", "Tag", "registry"],
  ["campaigns", "Campaign", "statemachine"],
  ["banners", "Banner", "registry"],
  ["promotions", "Promotion", "ratetable"],
  ["tax-rules", "TaxRule", "ratetable"],
  ["currencies", "Currency", "ratetable"],
  ["exchange-rates", "ExchangeRate", "ratetable"],
  ["sessions", "Session", "queue"],
  ["tickets", "Ticket", "queue"],
  ["feedback", "Feedback", "scoring"],
  ["recommendations", "Recommendation", "scoring"],
  ["search-queries", "SearchQuery", "registry"],
  ["price-history", "PricePoint", "ledger"],
  ["stock-alerts", "StockAlert", "queue"],
  ["restocks", "Restock", "queue"],
  ["vendors", "Vendor", "scoring"],
  ["contracts", "Contract", "statemachine"],
  ["shifts", "Shift", "queue"],
  ["roles", "Role", "registry"],
  ["permissions", "Permission", "registry"],
  ["feature-flags", "FeatureFlag", "registry"],
  ["experiments", "Experiment", "scoring"],
  ["email-templates", "EmailTemplate", "registry"],
  ["webhooks", "Webhook", "queue"],
  ["exports", "Export", "statemachine"],
  ["imports", "Import", "statemachine"],
  ["backups", "Backup", "statemachine"],
  ["sla-tracking", "SlaCheck", "scoring"],
  ["budgets", "Budget", "ledger"],
  ["expenses", "Expense", "ledger"],
  ["forecasts", "Forecast", "scoring"],
  ["kpis", "Kpi", "scoring"],
  ["audiences", "Audience", "registry"],
];
if (MODULES < 1 || MODULES > NOUNS.length) {
  console.error(`--modules must be between 1 and ${NOUNS.length}`);
  process.exit(2);
}

const STATUS_POOL = ["new", "review", "approved", "packed", "dispatched", "done", "archived", "open", "closed", "pending"];
const NAME_POOL = ["Alpha Deal", "Beta Pack", "Gamma Set", "Delta Line", "Epsilon Box", "Zeta Run", "Eta Crate", "Theta Bin"];

// ---- archetypes: each returns { service, cases } where cases are [label, expression over `svc`] ----
const ARCHETYPES = {
  ledger(p, rnd) {
    const fee = pick(rnd, [1, 1.5, 2, 2.5, 3]);
    const [a, b, c] = [money(rnd, 5, 90), money(rnd, 5, 90), money(rnd, 5, 90)];
    return {
      service: `import { roundMoney } from "../../utils/units.js";
import { isoDay } from "../../utils/dates.js";

const FEE_PERCENT = ${fee};

/** Sum of all ${p.slug} entry amounts, in euros. */
export function balance(entries) {
  return roundMoney(entries.reduce((sum, e) => sum + e.amount, 0));
}

/** Amount plus the ${p.slug} handling fee. */
export function withFee(amount) {
  return roundMoney(amount * (1 + FEE_PERCENT / 100));
}

/** Entry totals grouped by calendar day. */
export function byDay(entries) {
  const days = {};
  for (const e of entries) {
    const day = isoDay(new Date(e.at));
    days[day] = roundMoney((days[day] ?? 0) + e.amount);
  }
  return days;
}
`,
      cases: [
        ["balance sums amounts", `svc.balance([{ amount: ${a} }, { amount: ${b} }, { amount: ${c} }])`],
        ["the fee is added on top", `svc.withFee(${a})`],
        ["entries are grouped per day", `svc.byDay([{ amount: ${a}, at: "2026-02-03T08:00:00Z" }, { amount: ${b}, at: "2026-02-03T20:00:00Z" }, { amount: ${c}, at: "2026-02-04T01:00:00Z" }])`],
      ],
    };
  },

  statemachine(p, rnd) {
    const flow = shuffle(rnd, STATUS_POOL).slice(0, int(rnd, 3, 4));
    return {
      service: `const FLOW = ${J(flow)};

export function nextStatus(status) {
  const i = FLOW.indexOf(status);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}

export function isTerminal(status) {
  return nextStatus(status) === null;
}

/** Move a ${p.slug} item one step along its flow. */
export function advance(item) {
  const next = nextStatus(item.status);
  if (next === null) throw new Error(\`\${item.status} is terminal\`);
  return { ...item, status: next };
}
`,
      cases: [
        ["next status follows the flow", `svc.nextStatus(${J(flow[0])})`],
        ["the last status has no successor", `svc.nextStatus(${J(flow.at(-1))})`],
        ["advance moves one step", `svc.advance({ id: "x", status: ${J(flow[0])} })`],
        ["only the last status is terminal", `[svc.isTerminal(${J(flow[0])}), svc.isTerminal(${J(flow.at(-1))})]`],
      ],
    };
  },

  weight(p, rnd) {
    const cap = int(rnd, 5, 40);
    const [g1, g2, g3] = [int(rnd, 100, 900), int(rnd, 100, 900), int(rnd, 1000, 4000)];
    return {
      service: `import { gramsToKg, kgToGrams } from "../../utils/units.js";

const CAPACITY_KG = ${cap};

/** Total weight of a ${p.slug} load, in kilograms. */
export function totalWeightKg(items) {
  return gramsToKg(items.reduce((sum, i) => sum + i.weightGrams * (i.qty ?? 1), 0));
}

export function heaviest(items) {
  return items.reduce((a, b) => (b.weightGrams > a.weightGrams ? b : a));
}

/** Does the load fit within the ${p.slug} capacity? */
export function fitsCapacity(items) {
  const grams = items.reduce((sum, i) => sum + i.weightGrams * (i.qty ?? 1), 0);
  return grams <= kgToGrams(CAPACITY_KG);
}
`,
      cases: [
        ["total weight is reported in kg", `svc.totalWeightKg([{ weightGrams: ${g1}, qty: 2 }, { weightGrams: ${g2} }])`],
        ["heaviest item", `svc.heaviest([{ id: "a", weightGrams: ${g1} }, { id: "b", weightGrams: ${g3} }, { id: "c", weightGrams: ${g2} }]).id`],
        ["fits just under the capacity", `svc.fitsCapacity([{ weightGrams: ${cap * 1000 - 1} }])`],
        ["does not fit just over the capacity", `svc.fitsCapacity([{ weightGrams: ${cap * 1000 + 1} }])`],
      ],
    };
  },

  scoring(p, rnd) {
    const [w1, w2] = [int(rnd, 1, 4), int(rnd, 1, 3)];
    const items = [0, 1, 2].map((i) => `{ name: ${J(NAME_POOL[(i * 3 + int(rnd, 0, 2)) % NAME_POOL.length])}, rating: ${money(rnd, 1, 5)}, volume: ${int(rnd, 1, 30)} }`);
    return {
      service: `const W_RATING = ${w1};
const W_VOLUME = ${w2};

/** Weighted ${p.slug} score, rounded to two decimals. */
export function score(item) {
  return Math.round((item.rating * W_RATING + item.volume * W_VOLUME) * 100) / 100;
}

export function rank(items) {
  return [...items].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export function top(items, n) {
  return rank(items).slice(0, n);
}
`,
      cases: [
        ["score is a weighted sum", `svc.score(${items[0]})`],
        ["ranking is best first", `svc.rank([${items.join(", ")}]).map((i) => i.name)`],
        ["top n keeps the best", `svc.top([${items.join(", ")}], 2).map((i) => i.name)`],
      ],
    };
  },

  queue(p, rnd) {
    const [pa, pb] = [int(rnd, 1, 3), int(rnd, 4, 6)];
    return {
      service: `/** Priority queue for ${p.slug}: higher priority first, FIFO within a priority. */
export function enqueue(queue, item, priority = 0) {
  const seq = queue.reduce((max, q) => Math.max(max, q.seq), -1) + 1;
  return [...queue, { item, priority, seq }].sort((a, b) => b.priority - a.priority || a.seq - b.seq);
}

export function dequeue(queue) {
  if (queue.length === 0) return { item: null, queue };
  const [first, ...rest] = queue;
  return { item: first.item, queue: rest };
}

export function size(queue) {
  return queue.length;
}
`,
      cases: [
        ["highest priority leaves first", `svc.dequeue(svc.enqueue(svc.enqueue(svc.enqueue([], "a", ${pa}), "b", ${pb}), "c", ${pb})).item`],
        ["equal priorities are FIFO", `svc.dequeue(svc.dequeue(svc.enqueue(svc.enqueue(svc.enqueue([], "a", ${pa}), "b", ${pb}), "c", ${pb})).queue).item`],
        ["size counts waiting items", `svc.size(svc.enqueue(svc.enqueue([], "a"), "b"))`],
        ["dequeue on empty is safe", `svc.dequeue([]).item`],
      ],
    };
  },

  ratetable(p, rnd) {
    const a = int(rnd, 1, 3);
    const b = a + int(rnd, 2, 6);
    const [x, y, z] = [money(rnd, 2, 6), money(rnd, 6, 12), money(rnd, 12, 30)];
    return {
      service: `import { roundMoney } from "../../utils/units.js";

const BANDS = [
  { upTo: ${a}, price: ${x} },
  { upTo: ${b}, price: ${y} },
  { upTo: Infinity, price: ${z} },
];

/** The ${p.slug} rate band a value falls into. */
export function bandFor(value) {
  return BANDS.find((band) => value <= band.upTo);
}

export function quote(value, multiplier = 1) {
  return roundMoney(bandFor(value).price * multiplier);
}

export function cheapest() {
  return BANDS[0].price;
}
`,
      cases: [
        ["lowest band", `svc.quote(${a - 0.5})`],
        ["middle band with a multiplier", `svc.quote(${a + 1}, 1.5)`],
        ["top band", `svc.quote(1000)`],
        ["cheapest price", `svc.cheapest()`],
      ],
    };
  },

  registry(p, rnd) {
    const names = shuffle(rnd, NAME_POOL).slice(0, 3).map((n) => `{ name: ${J(n)} }`);
    const prefix = J(names[0].match(/"([A-Za-z]+)/)[1].slice(0, 3));
    return {
      service: `export function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** ${p.slug} whose slug starts with the given text. */
export function byPrefix(items, prefix) {
  const wanted = slugify(prefix);
  return items.filter((i) => slugify(i.name).startsWith(wanted));
}

export function uniqueSlugs(items) {
  return new Set(items.map((i) => slugify(i.name))).size === items.length;
}
`,
      cases: [
        ["slugify normalises names", `svc.slugify("  Hello, Big World! ")`],
        ["prefix lookup", `svc.byPrefix([${names.join(", ")}], ${prefix}).map((i) => i.name)`],
        ["slugs are unique", `svc.uniqueSlugs([${names.join(", ")}])`],
        ["duplicate slugs are detected", `svc.uniqueSlugs([{ name: "A b" }, { name: "a-B" }])`],
      ],
    };
  },
};

// ---- shared per-module files ----
const modelSrc = (p) => `import { assertNonEmpty } from "../../utils/validate.js";
import { newId } from "../../utils/ids.js";

export function create${p.S}({ name, amount = 0, weightGrams = 0, status = "new" }) {
  return { id: newId(${J(p.prefix)}), name: assertNonEmpty(name, "name"), amount, weightGrams, status };
}
`;
const repoSrc = (p) => `export function create${p.S}Repository() {
  const items = new Map();
  return {
    save(item) {
      items.set(item.id, item);
      return item;
    },
    get: (id) => items.get(id) ?? null,
    list: () => [...items.values()],
    remove: (id) => items.delete(id),
    count: () => items.size,
  };
}
`;
const formatSrc = (p) => `export function label(item) {
  return \`\${item.name} (#\${item.id})\`;
}

export function summaryLine(items) {
  return \`\${items.length} ${p.slug}\${items.length === 1 ? " item" : " items"}\`;
}
`;
const indexSrc = (p, archetype) => `export { create${p.S} } from "./model.js";
export { create${p.S}Repository } from "./repository.js";
export * as service from "./service.js";
export * as format from "./format.js";

export const meta = { name: ${J(p.slug)}, archetype: ${J(archetype)} };
`;

function testSrc(p, cases) {
  const body = cases
    .map(([label, expr, value]) => `test(${J(label)}, () => {\n  assert.deepEqual(${expr}, ${J(value)});\n});`)
    .join("\n\n");
  return `import test from "node:test";
import assert from "node:assert/strict";
import * as svc from "../../src/ext/${p.slug}/service.js";
import * as format from "../../src/ext/${p.slug}/format.js";
import { create${p.S}, create${p.S}Repository, meta } from "../../src/ext/${p.slug}/index.js";

test("model validates and trims its name", () => {
  assert.throws(() => create${p.S}({ name: "  " }), TypeError);
  const item = create${p.S}({ name: " Sample " });
  assert.equal(item.name, "Sample");
  assert.match(item.id, /^${p.prefix}-\\d+$/);
});

test("repository stores, lists and removes", () => {
  const repo = create${p.S}Repository();
  const a = repo.save(create${p.S}({ name: "A" }));
  repo.save(create${p.S}({ name: "B" }));
  assert.equal(repo.count(), 2);
  assert.equal(repo.get(a.id).name, "A");
  repo.remove(a.id);
  assert.equal(repo.get(a.id), null);
  assert.equal(repo.list().length, 1);
});

test("format helpers", () => {
  assert.equal(format.label({ id: "x-1", name: "Foo" }), "Foo (#x-1)");
  assert.equal(format.summaryLine([1]), "1 ${p.slug} item");
  assert.equal(format.summaryLine([1, 2]), "2 ${p.slug} items");
});

test("module metadata", () => {
  assert.equal(meta.name, ${J(p.slug)});
});

${body}
`;
}

// ---- build ----
fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(coreDir, outDir, { recursive: true });

const extDir = path.join(outDir, "src", "ext");
const extTests = path.join(outDir, "test", "ext");
fs.mkdirSync(extDir, { recursive: true });
fs.mkdirSync(extTests, { recursive: true });

const mods = NOUNS.slice(0, MODULES);
for (let i = 0; i < mods.length; i++) {
  const [slug, S, archetype] = mods[i];
  const p = { slug, S, prefix: slug.replace(/[^a-z]/g, "").slice(0, 3) };
  const rnd = mulberry32(SEED * 1000 + i);
  const { service, cases } = ARCHETYPES[archetype](p, rnd);

  const dir = path.join(extDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "model.js"), modelSrc(p));
  fs.writeFileSync(path.join(dir, "repository.js"), repoSrc(p));
  fs.writeFileSync(path.join(dir, "service.js"), service);
  fs.writeFileSync(path.join(dir, "format.js"), formatSrc(p));
  fs.writeFileSync(path.join(dir, "index.js"), indexSrc(p, archetype));

  // characterise: evaluate each case against the code we just generated
  const svc = await import(pathToFileURL(path.join(dir, "service.js")).href);
  const evaluated = cases.map(([label, expr]) => {
    const value = new Function("svc", `return ${expr};`)(svc);
    if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) {
      throw new Error(`${slug}: case "${label}" produced ${value}`);
    }
    return [label, expr, value];
  });
  fs.writeFileSync(path.join(extTests, `${slug}.test.js`), testSrc(p, evaluated));
}

// registry ties every module together
const imports = mods.map(([slug], i) => `import { meta as m${i} } from "./${slug}/index.js";`).join("\n");
fs.writeFileSync(
  path.join(extDir, "registry.js"),
  `${imports}

export const modules = [${mods.map((_, i) => `m${i}`).join(", ")}];

export function findModule(name) {
  return modules.find((m) => m.name === name) ?? null;
}
`,
);
fs.writeFileSync(
  path.join(extTests, "registry.test.js"),
  `import test from "node:test";
import assert from "node:assert/strict";
import { findModule, modules } from "../../src/ext/registry.js";

test("every extension module is registered exactly once", () => {
  assert.equal(modules.length, ${MODULES});
  assert.equal(new Set(modules.map((m) => m.name)).size, ${MODULES});
});

test("modules can be looked up by name", () => {
  assert.equal(findModule(${J(mods[0][0])}).name, ${J(mods[0][0])});
  assert.equal(findModule("nope"), null);
});
`,
);

fs.appendFileSync(
  path.join(outDir, "README.md"),
  `    src/ext        ${MODULES} extension modules (carriers, labels, warehouses, coupons, ...), each with
                   model / repository / service / format and its own tests under test/ext
`,
);

const count = (d) => fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
console.log(`generated ${MODULES} modules (seed ${SEED}) -> ${count(outDir)} files in ${outDir}`);
