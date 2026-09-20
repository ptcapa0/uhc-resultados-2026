import * as XLSX from "xlsx";

export type Status = "Confirmado" | "Hipótese" | "Por validar";
export type Decision = { id: string; question: string; answer: string; status: Status; owner: string; deadline: string };
export type MetricKey = "revenue" | "grossMargin" | "ebitda" | "workingCapital" | "cash";
export type Metric = { label: string; value: number | null; budget?: number | null; source: string; definition: string };
export type ReportData = { source: "demo" | "workbook"; periods: Record<string, Record<MetricKey, Metric>>; units: { name: string; result: number | null; source: string }[]; bridge: { label: string; value: number }[]; warnings: string[]; reconciled: boolean; fileName?: string };

const metricMeta: Record<MetricKey, Omit<Metric, "value" | "budget">> = {
  revenue: { label: "Receita", source: "Dados · movimentos P&L", definition: "Soma dos movimentos de vendas elegíveis. A margem do workbook usa vendas de mercadorias como denominador." },
  grossMargin: { label: "Margem bruta", source: "Dados · movimentos P&L", definition: "Receita menos custo das mercadorias vendidas, calculado a partir dos movimentos." },
  ebitda: { label: "EBITDA", source: "Dados · movimentos P&L", definition: "Resultado operacional antes de juros, impostos, depreciações e amortizações, conforme rubricas classificadas no movimento." },
  workingCapital: { label: "Working Capital", source: "Dados · movimentos de balanço", definition: "Clientes + inventário − fornecedores. Depósitos e caixa são apresentados separadamente." },
  cash: { label: "Depósitos e caixa", source: "Dados · movimentos de balanço", definition: "Saldo contabilístico de depósitos e caixa; não equivale necessariamente a liquidez disponível." },
};

const fake = (label: string, value: number, budget?: number): Metric => ({ ...metricMeta[label as MetricKey], value, budget });
export const demoReport: ReportData = {
  source: "demo", reconciled: false, warnings: ["Demonstração com valores fictícios. Importe o workbook para analisar resultados reais.", "O ficheiro é processado apenas neste navegador e não é guardado."],
  periods: {
    jul: { revenue: fake("revenue", 382.1, 410), grossMargin: fake("grossMargin", 61.2, 66), ebitda: fake("ebitda", 17.6, 22), workingCapital: fake("workingCapital", 310.4), cash: fake("cash", 88.3) },
    aug: { revenue: fake("revenue", 465.7, 530), grossMargin: fake("grossMargin", 72.8, 80), ebitda: fake("ebitda", 24.1, 31), workingCapital: fake("workingCapital", 366.2), cash: fake("cash", 74.6) },
    ytd: { revenue: fake("revenue", 3510.6), grossMargin: fake("grossMargin", 484.1), ebitda: fake("ebitda", 182.4), workingCapital: fake("workingCapital", 366.2), cash: fake("cash", 74.6) },
  },
  units: [{ name: "Trading", result: 42.6, source: "Demonstração" }, { name: "Unlicensed Medicines", result: 26.3, source: "Demonstração" }, { name: "Overhead", result: -18.9, source: "Demonstração" }],
  bridge: [{ label: "Orçamento", value: 31 }, { label: "Receita", value: -4.4 }, { label: "Margem", value: -1.5 }, { label: "Opex", value: -1 }, { label: "Real", value: 24.1 }],
};

const clean = (value: unknown) => String(value ?? "").trim();
const normal = (value: unknown) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const n = (value: unknown) => typeof value === "number" ? value : Number(String(value ?? "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")) || 0;
const get = (row: Record<string, unknown>, candidates: string[]) => Object.entries(row).find(([key]) => candidates.some((candidate) => normal(key).includes(candidate)))?.[1];
const includesAny = (value: unknown, words: string[]) => words.some((word) => normal(value).includes(word));

type Bucket = { actual: number; budget: number; clients: number; inventory: number; suppliers: number; cash: number; units: Map<string, number> };
const blankBucket = (): Bucket => ({ actual: 0, budget: 0, clients: 0, inventory: 0, suppliers: 0, cash: 0, units: new Map() });

export async function parseWorkbook(file: File): Promise<ReportData> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const dataSheet = workbook.SheetNames.find((name) => normal(name) === "dados");
  if (!dataSheet) throw new Error("Não foi encontrada a folha 'Dados'.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[dataSheet], { defval: "" });
  if (!rows.length) throw new Error("A folha 'Dados' não contém movimentos legíveis.");
  const buckets = new Map<string, Record<MetricKey, Bucket>>();
  const warnings: string[] = [];
  for (const row of rows) {
    const scenario = get(row, ["cenario", "scenario"]);
    const year = n(get(row, ["ano", "year"]));
    const month = n(get(row, ["mes", "month"]));
    const rubric = get(row, ["rubrica", "descricao", "conta"]);
    const balPl = get(row, ["balpl", "bal pl", "tipo"]);
    const unit = clean(get(row, ["unidade", "businessunit", "un", "stream"]));
    const amount = n(get(row, ["valor", "montante", "amount", "value", "saldo"]));
    if (year !== 2026 || !month || includesAny(rubric, ["saldos iniciais", "saldo inicial"])) continue;
    const scenarioKey = includesAny(scenario, ["orc", "budget", "plan"]) ? "budget" : includesAny(scenario, ["real", "actual"]) ? "actual" : "unknown";
    if (scenarioKey === "unknown") continue;
    const period = month === 7 ? "jul" : month === 8 ? "aug" : `m${month}`;
    if (!buckets.has(period)) buckets.set(period, { revenue: blankBucket(), grossMargin: blankBucket(), ebitda: blankBucket(), workingCapital: blankBucket(), cash: blankBucket() });
    const target = buckets.get(period)!;
    const signed = amount;
    const toPnl = normal(balPl).includes("pl") || normal(balPl).includes("resultado");
    const add = (key: MetricKey) => { target[key][scenarioKey] += signed; };
    if (toPnl && includesAny(rubric, ["venda", "receita", "proveito"])) { add("revenue"); add("grossMargin"); add("ebitda"); }
    else if (toPnl && includesAny(rubric, ["custo merc", "cmv", "cogs", "custo venda"])) { target.grossMargin[scenarioKey] -= Math.abs(signed); target.ebitda[scenarioKey] -= Math.abs(signed); }
    else if (toPnl) { target.ebitda[scenarioKey] += signed; }
    if (includesAny(rubric, ["cliente", "contas a receber"])) target.workingCapital.clients += signed;
    if (includesAny(rubric, ["invent", "stock"])) target.workingCapital.inventory += signed;
    if (includesAny(rubric, ["fornecedor", "contas a pagar"])) target.workingCapital.suppliers += signed;
    if (includesAny(rubric, ["deposit", "caixa", "banco"])) target.cash.cash += signed;
    if (unit && toPnl && scenarioKey === "actual") target.ebitda.units.set(unit, (target.ebitda.units.get(unit) ?? 0) + signed);
  }
  const metricFor = (bucket: Record<MetricKey, Bucket>, key: MetricKey): Metric => {
    const data = bucket[key];
    const value = key === "workingCapital" ? data.clients + data.inventory - Math.abs(data.suppliers) : key === "cash" ? data.cash : data.actual;
    return { ...metricMeta[key], value: value / 1000, budget: ["revenue", "grossMargin", "ebitda"].includes(key) ? data.budget / 1000 : undefined };
  };
  const createPeriod = (key: string) => {
    const bucket = buckets.get(key);
    if (!bucket) return null;
    return Object.fromEntries((Object.keys(metricMeta) as MetricKey[]).map((metric) => [metric, metricFor(bucket, metric)])) as Record<MetricKey, Metric>;
  };
  const jul = createPeriod("jul"); const aug = createPeriod("aug");
  if (!jul || !aug) warnings.push("Não foram encontrados todos os meses de julho e agosto de 2026 nos movimentos elegíveis.");
  const ytdKeys = [...buckets.keys()].filter((key) => key === "jul" || key === "aug" || /^m[1-8]$/.test(key));
  const ytd = (Object.keys(metricMeta) as MetricKey[]).reduce((acc, key) => {
    const values = ytdKeys.map((period) => metricFor(buckets.get(period)!, key));
    acc[key] = { ...metricMeta[key], value: values.reduce((sum, metric) => sum + (metric.value ?? 0), 0) };
    return acc;
  }, {} as Record<MetricKey, Metric>);
  const augBucket = buckets.get("aug");
  const units = [...(augBucket?.ebitda.units ?? new Map()).entries()].filter(([name]) => includesAny(name, ["trading", "unlicensed", "overhead"])) .map(([name, result]) => ({ name, result: result / 1000, source: "Dados · movimentos P&L" }));
  if (units.length < 3) warnings.push("O resultado por unidade não foi totalmente identificado nos movimentos. Por validar com o CFO.");
  const augP = aug ?? ytd;
  const bridge = [
    { label: "Orçamento", value: augP.ebitda.budget ?? 0 },
    { label: "Receita", value: (augP.revenue.value ?? 0) - (augP.revenue.budget ?? 0) },
    { label: "Margem", value: (augP.grossMargin.value ?? 0) - (augP.grossMargin.budget ?? 0) },
    { label: "Opex", value: (augP.ebitda.value ?? 0) - (augP.ebitda.budget ?? 0) - ((augP.grossMargin.value ?? 0) - (augP.grossMargin.budget ?? 0)) },
    { label: "Real", value: augP.ebitda.value ?? 0 },
  ];
  warnings.push("Reconciliação aplicada a movimentos da folha Dados: cenário, ano, mês, rubrica, BalPL e exclusão de SALDOS INICIAIS.");
  return { source: "workbook", fileName: file.name, periods: { jul: jul ?? ytd, aug: aug ?? ytd, ytd }, units, bridge, warnings, reconciled: Boolean(jul && aug) };
}

export const euroK = (value: number | null | undefined) => value == null ? "Por validar" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value) + " mil";
export const delta = (actual?: number | null, budget?: number | null) => actual == null || budget == null ? null : actual - budget;
