import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("artefacto não contém valores financeiros reais nem workbook", () => {
  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /root/);
  assert.doesNotMatch(html, /\.xlsx/i);
});
