import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const output = process.argv[2];
assert(output, "Pass a freshly built portfolio-demo output directory.");
const markers = [
  "demo-continuous-project", "demo-family-costs", "demo-event-project", "demo-europe-trip",
  "demo-archived-event-project", "demo-settlement-comparison", "project-share-house-living",
  "シェアハウス生活費", "週末の買い出し", "member-ryudai", "CloudNest",
];
const files = readdirSync(output, { recursive: true }).filter(file => /\.(?:m?js)$/.test(file));
assert(files.length > 0);
for (const file of files) {
  const source = readFileSync(join(output, file), "utf8");
  for (const marker of markers) assert(!source.includes(marker), file + " contains " + marker);
}
console.log("Portfolio demo fixture scan PASS across " + files.length + " JS files.");
