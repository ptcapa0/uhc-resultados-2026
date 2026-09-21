import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const banned = ["uhc_ssot", "motor_pl", "relatorio_ceo", "4192495", "211226", "208384", "585390", "315233"];
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);

test("artefacto público contém apenas a aplicação e não dados confidenciais", () => {
  assert.ok(existsSync("dist/index.html"));
  const output = files("dist");
  assert.ok(output.every((file) => !/\.(xlsx|xls|csv)$/i.test(file)));
  const content = output.map((file) => readFileSync(file, "utf8")).join("\n").toLowerCase();
  for (const token of banned) assert.equal(content.includes(token), false, `dado confidencial encontrado: ${token}`);
});

test("página publicada usa caminhos relativos adequados a GitHub Pages", () => {
  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /\/uhc-resultados-2026\/assets\//);
});
