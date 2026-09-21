/* eslint-disable @typescript-eslint/no-explicit-any */
export type Line = Record<string, number | null>;
export type Ssot = Record<string, any>;
export type PeriodId = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "Q1" | "Q2" | "Q3_to_aug" | "ytd_aug";
export type QuestionStatus = "Confirmado" | "Hipótese" | "Por validar" | "Sem resposta";
export type ActionStatus = "Proposta pendente" | "Aprovada" | "Em curso" | "Concluída" | "Bloqueada";

export type MeetingItem = { id: string; question: string; metric: string; source: string; proposedOwner: string; response: string; evidence: string; references: string; classification: QuestionStatus; confidence: "Alta" | "Média" | "Baixa"; verification: string; decision: string; action: string; actionOwner: string; dueDate: string; actionStatus: ActionStatus; updatedAt: string; history: { at: string; field: string; value: string }[] };
export type AgendaItem = { id: string; label: string; minutes: number };
export type MeetingSession = { schema: 1; title: string; meetingDate: string; participants: string; agenda: AgendaItem[]; items: MeetingItem[]; selectedScenario: "base" | "downside" | "upside"; whatIfRevenue: number; whatIfMarginPp: number; whatIfFse: number; createdAt: string; updatedAt: string };
export type Audit = { id: string; label: string; ok: boolean; detail: string };
export type Imported = { ssot: Ssot; audits: Audit[]; fingerprint: string };

const TOLERANCE = 0.011;
const labels: Record<string, string> = { revenue: "Receita", gross_profit: "Margem bruta", ebitda: "EBITDA", pbt: "Resultado antes de impostos", fse: "FSE", staff: "Pessoal", other_costs: "Outros gastos", other_income: "Outros rendimentos", receivables: "Clientes", inventory: "Inventário", payables: "Fornecedores", working_capital: "Working Capital", cash_and_bank: "Tesouraria contabilística", financial_debt: "Dívida financeira", net_cash: "Caixa líquida de dívida" };
export const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const euro = (v: number | null | undefined, d = 0) => v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
export const eurosK = (v: number | null | undefined) => v == null ? "—" : `${euro(v / 1000, 1)} mil`;
export const percent = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("pt-PT", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v);
export const delta = (a: number | null | undefined, b: number | null | undefined) => a == null || b == null ? null : a - b;
export const variancePct = (a: number | null | undefined, b: number | null | undefined) => a == null || b == null || b === 0 ? null : (a - b) / Math.abs(b);
export const labelMetric = (key: string) => labels[key] ?? key;
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const line = (v: unknown): Line => typeof v === "object" && v !== null ? v as Line : {};
const sum = (rows: Line[], key: string) => rows.reduce((total, row) => total + (num(row[key]) ?? 0), 0);
const within = (a: number | null, b: number | null, tolerance = TOLERANCE) => a != null && b != null && Math.abs(a - b) <= tolerance;
const now = () => new Date().toISOString();

export async function importSsot(file: File): Promise<Imported> {
  if (!file.name.toLowerCase().endsWith(".json")) throw new Error("Selecione o ficheiro SSOT em formato JSON.");
  const parsed: unknown = JSON.parse(await file.text());
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("O ficheiro não contém um objeto SSOT.");
  const ssot = parsed as Ssot;
  if (typeof ssot.schema_version !== "string" || !ssot.schema_version.startsWith("1.")) throw new Error(`Versão de SSOT não suportada: ${String(ssot.schema_version ?? "ausente")}.`);
  const required = [ssot.report_as_of, ssot.monthly?.actual_2026, ssot.monthly?.budget_2026, ssot.monthly?.actual_2025, ssot.summaries?.actual_2026?.ytd_aug, ssot.forecast?.cases?.base?.full_year];
  if (required.some((value) => !value)) throw new Error("SSOT inválido: faltam séries, resumo YTD ou forecast base.");
  if (ssot.report_as_of !== "2026-08-31") throw new Error(`Data de referência incompatível: ${String(ssot.report_as_of)}. Esperado: 2026-08-31.`);
  return { ssot, audits: auditSsot(ssot), fingerprint: await digest(await file.arrayBuffer()) };
}

export function auditSsot(s: Ssot): Audit[] {
  const actual = s.monthly.actual_2026 as Record<string, Line>; const budget = s.monthly.budget_2026 as Record<string, Line>; const prior = s.monthly.actual_2025 as Record<string, Line>;
  const ytd = line(s.summaries.actual_2026.ytd_aug); const q = s.quarterly as Record<string, Record<string, Line>>; const keys = ["revenue", "gross_profit", "ebitda", "pbt"];
  const monthlyOk = keys.every((key) => within(sum(Object.values(actual).slice(0, 8), key), num(ytd[key])));
  const q3Ok = [actual, budget, prior].every((series, index) => { const group = index === 0 ? "actual_2026" : index === 1 ? "budget_2026" : "actual_2025"; return keys.every((key) => within((num(series["7"]?.[key]) ?? 0) + (num(series["8"]?.[key]) ?? 0), num(q[group]?.Q3_to_aug?.[key]))); });
  const formulas = keys.every((key) => key) && [actual, budget, prior].every((series) => Object.values(series).every((item) => formulaOk(line(item))));
  const scenarios = s.forecast.cases as Record<string, { months: Record<string, Line>; full_year: Line }>;
  const forecast = Object.values(scenarios).every((scenario) => keys.every((key) => within((num(ytd[key]) ?? 0) + sum(Object.values(scenario.months), key), num(scenario.full_year[key]))));
  const balance = line(s.balance_end_of_month?.actual_2026?.["8"]); const wc = within((num(balance.receivables) ?? 0) + (num(balance.inventory) ?? 0) - (num(balance.payables) ?? 0), num(balance.working_capital));
  const units = s.business_units?.ytd_aug?.actual_2026 as Record<string, Line> | undefined; const unitsOk = units ? within(sum(Object.values(units), "pbt"), num(ytd.pbt)) : false;
  return [
    { id: "schema", label: "Esquema e data de referência", ok: s.schema_version.startsWith("1.") && s.report_as_of === "2026-08-31", detail: `SSOT ${s.schema_version}; referência ${s.report_as_of}.` },
    { id: "month-ytd", label: "Meses → YTD", ok: monthlyOk, detail: "Soma janeiro–agosto reconcilia receita, margem bruta, EBITDA e resultado antes de impostos." },
    { id: "quarter", label: "T3 parcial", ok: q3Ok, detail: "Julho–agosto é comparado apenas com julho–agosto do orçamento e de 2025." },
    { id: "formulas", label: "Fórmulas P&L", ok: formulas, detail: "Margem bruta, EBITDA e resultado antes de impostos seguem a definição do SSOT." },
    { id: "forecast", label: "Fecho anual", ok: forecast, detail: "Real janeiro–agosto + estimativa setembro–dezembro = cenário anual." },
    { id: "balances", label: "Working Capital", ok: wc, detail: "Clientes + inventário − fornecedores reconcilia ao saldo de agosto." },
    { id: "units", label: "Unidades → consolidado", ok: unitsOk, detail: unitsOk ? "Resultado antes de impostos das unidades reconcilia ao consolidado." : "Reconciliação por unidade não disponível no SSOT importado." },
  ];
}
function formulaOk(row: Line) { const gross = num(row.gross_profit); const ebitda = num(row.ebitda); const pbt = num(row.pbt); if (gross == null || ebitda == null || pbt == null) return true; const expectedGross = (num(row.sales) ?? 0) + (num(row.services) ?? 0) + (num(row.cogs) ?? 0); const expectedEbitda = gross + (num(row.fse) ?? 0) + (num(row.staff) ?? 0) + (num(row.impairment) ?? 0) + (num(row.reversals) ?? 0) + (num(row.other_costs) ?? 0) + (num(row.other_income) ?? 0); return within(gross, expectedGross) && within(ebitda, expectedEbitda) && within(pbt, ebitda + (num(row.depreciation) ?? 0) + (num(row.financing) ?? 0)); }

export function periodLine(s: Ssot, status: "actual_2026" | "budget_2026" | "actual_2025", period: PeriodId): Line { if (period === "ytd_aug") return line(s.summaries?.[status]?.ytd_aug); if (period === "Q1" || period === "Q2" || period === "Q3_to_aug") return line(s.quarterly?.[status]?.[period]); return line(s.monthly?.[status]?.[period]); }
export function periodTitle(p: PeriodId) { return p === "ytd_aug" ? "YTD janeiro–agosto" : p === "Q3_to_aug" ? "T3 parcial · julho–agosto" : p === "Q1" ? "T1 · janeiro–março" : p === "Q2" ? "T2 · abril–junho" : months[Number(p) - 1]; }
export function balanceLine(s: Ssot, status: "actual_2026" | "actual_2025", month: "7" | "8") { return line(s.balance_end_of_month?.[status]?.[month]); }

const prompts: [string, string, string, string][] = [
  ["O que explica a redução de tesouraria em agosto?", "Tesouraria contabilística", "CFO / Tesouraria", "Ponte julho–agosto por cobrança, stock, fornecedores, impostos, dívida e outros movimentos."],
  ["Que parcelas de clientes estão vencidas e concentradas?", "Clientes", "Comercial / CFO", "Aging, maiores clientes, disputas e plano de cobrança."],
  ["Por que subiu o inventário em agosto?", "Inventário", "Compras / Operações", "SKU, antiguidade, compromissos de venda, devoluções, validade e margem."],
  ["Os custos FSE de agosto são recorrentes?", "FSE", "CFO / Operações", "Ponte por lançamento, centro de custo e competência."],
  ["A margem bruta observada é sustentável?", "Margem bruta", "Comercial / Operações", "Preço, mix, custo e encomendas futuras."],
  ["Que mercados de Trading recuperam volume sem sacrificar margem?", "Trading por mercado", "Trading / Compras", "Livro de encomendas e margem de contribuição por geografia."],
  ["Que encomendas sustentam a rampa ULM de setembro a dezembro?", "ULM", "ULM / Comercial", "Encomendas firmes, pipeline ponderado, prazos, margem e capacidade."],
];
export function defaultAgenda(): AgendaItem[] { return [["Abertura e trajetória", 12], ["Unidades e margens", 18], ["Caixa e Working Capital", 18], ["Forecast e oportunidades", 15], ["Decisões e compromissos", 12]].map(([label, minutes], index) => ({ id: `agenda-${index}`, label: String(label), minutes: Number(minutes) })); }
export function newItem(question = "Nova questão", metric = "", owner = "", evidence = ""): MeetingItem { return { id: crypto.randomUUID(), question, metric, source: "Relatório / workflow importado", proposedOwner: owner, response: "", evidence, references: "", classification: "Sem resposta", confidence: "Baixa", verification: "", decision: "", action: "", actionOwner: "", dueDate: "", actionStatus: "Proposta pendente", updatedAt: now(), history: [] }; }
export function newSession(s?: Ssot): MeetingSession { const workflow = Array.isArray(s?.meeting_workflow) ? s.meeting_workflow.map((w: any) => [String(w.question), "Workflow SSOT", String(w.owner ?? ""), String(w.evidence ?? "")] as [string, string, string, string]) : []; const all = [...prompts, ...workflow].filter((row, index, rows) => rows.findIndex((candidate) => candidate[0] === row[0]) === index); return { schema: 1, title: "Reunião executiva de resultados", meetingDate: new Date().toISOString().slice(0, 10), participants: "", agenda: defaultAgenda(), items: all.map((row) => newItem(...row)), selectedScenario: "base", whatIfRevenue: 0, whatIfMarginPp: 0, whatIfFse: 0, createdAt: now(), updatedAt: now() }; }
export const validCommitment = (item: MeetingItem) => !["Aprovada", "Em curso", "Concluída"].includes(item.actionStatus) || Boolean(item.action.trim() && item.actionOwner.trim() && item.dueDate);
export function forecastView(s: Ssot, session: MeetingSession) { const scenario = s.forecast.cases?.[session.selectedScenario]; const base = line(scenario?.full_year); const forecastMonths = scenario?.months ? Object.values(scenario.months) as Line[] : []; const futureRevenue = sum(forecastMonths, "revenue"); const futureFse = sum(forecastMonths, "fse"); const revenueDelta = futureRevenue * session.whatIfRevenue / 100; const grossDelta = (futureRevenue + revenueDelta) * session.whatIfMarginPp / 100; const fseDelta = Math.abs(futureFse) * session.whatIfFse / 100 * -1; const ebitdaDelta = grossDelta + fseDelta; return { base, adjusted: { ...base, revenue: (num(base.revenue) ?? 0) + revenueDelta, gross_profit: (num(base.gross_profit) ?? 0) + grossDelta, ebitda: (num(base.ebitda) ?? 0) + ebitdaDelta, pbt: (num(base.pbt) ?? 0) + ebitdaDelta }, isWhatIf: Boolean(session.whatIfRevenue || session.whatIfMarginPp || session.whatIfFse), assumptions: s.forecast.base_drivers, scenarioDriver: s.forecast.scenario_drivers?.[session.selectedScenario] }; }
async function digest(input: ArrayBuffer) { const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", input)); return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16); }
const encode = new TextEncoder(); const decode = new TextDecoder(); const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data)); const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function keyFor(password: string, salt: Uint8Array) { const material = await crypto.subtle.importKey("raw", encode.encode(password), "PBKDF2", false, ["deriveKey"]); const rawSalt = new Uint8Array(salt).buffer; return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: rawSalt, iterations: 210000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
export async function encryptSession(session: MeetingSession, password: string) { if (password.length < 10) throw new Error("Use uma palavra-passe com pelo menos 10 caracteres."); const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor(password, salt), encode.encode(JSON.stringify(session))); return JSON.stringify({ version: 1, algorithm: "AES-GCM/PBKDF2-SHA-256", iterations: 210000, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(encrypted)) }, null, 2); }
export async function decryptSession(text: string, password: string): Promise<MeetingSession> { try { const data = JSON.parse(text); if (data.version !== 1 || data.algorithm !== "AES-GCM/PBKDF2-SHA-256") throw new Error(); const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(data.iv) }, await keyFor(password, unb64(data.salt)), unb64(data.ciphertext)); const session = JSON.parse(decode.decode(plain)); if (session?.schema !== 1 || !Array.isArray(session.items)) throw new Error(); return session as MeetingSession; } catch { throw new Error("Não foi possível abrir a cópia: palavra-passe ou ficheiro inválido."); } }
