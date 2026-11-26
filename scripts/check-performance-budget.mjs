import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const buildDirectory = resolve(projectDirectory, process.env.NEXT_BUILD_DIR || ".next");
const staticDirectory = resolve(buildDirectory, "static");

const budgets = {
  // Bank/card evidence, measured A4 pagination, linked voucher navigation, monthly filtering, and accessible server sorting are part of the primary workspace.
  // Effective approval dates and the frozen reference-date snapshot add about 3 KB.
  initialJavaScript: Number(process.env.EXPENSE_RESOLUTION_INITIAL_JS_BUDGET || 330_000),
  // Original-document date/source controls and the reviewed accounting-route UI
  // keep the create dialog just over 100 KB. Retain a narrow regression margin.
  largestAsyncChunk: Number(process.env.EXPENSE_RESOLUTION_ASYNC_CHUNK_BUDGET || 103_000),
  // The favorites editor is fetched only after the user opens it (up to 9 KB).
  // Approved-document correction and its audit comparison ship with the on-demand detail view.
  // The measured production total is about 184.6 KB across six chunks.
  totalAsyncJavaScript: Number(process.env.EXPENSE_RESOLUTION_ASYNC_TOTAL_BUDGET || 187_000),
};

const routeBudgets = [
  { directory: "", entry: "[project]/src/app/page", label: "대시보드", limit: 185_000, route: "/" },
  { directory: "finance/bank-transactions", entry: "[project]/src/app/finance/bank-transactions/page", label: "전체 거래내역", limit: 175_000, route: "/finance/bank-transactions" },
  { directory: "approval/inbox", entry: "[project]/src/app/approval/inbox/page", label: "통합 결재함", limit: 205_000, route: "/approval/inbox" },
  { directory: "finance/workspace", entry: "[project]/src/app/finance/workspace/page", label: "재무 업무 홈", limit: 115_000, route: "/finance/workspace" },
  { directory: "finance/expense-resolutions", entry: "[project]/src/app/finance/expense-resolutions/page", label: "지출결의", limit: budgets.initialJavaScript, route: "/finance/expense-resolutions" },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function unique(values) {
  return [...new Set(values)];
}

function fileBytes(relativePath) {
  const normalizedPath = relativePath.replace(/^\/?_next\//, "").replace(/^static\//, "");
  const absolutePath = resolve(staticDirectory, normalizedPath);
  if (!existsSync(absolutePath)) throw new Error(`빌드 청크를 찾을 수 없습니다: ${relativePath}`);
  return statSync(absolutePath).size;
}

function readInitialChunkPaths(route) {
  const routeDirectory = resolve(buildDirectory, "server/app", route.directory);
  const manifestPath = resolve(routeDirectory, "page_client-reference-manifest.js");
  const source = readFileSync(manifestPath, "utf8");
  const jsonStart = source.indexOf('{"moduleLoading"');
  const jsonEnd = source.lastIndexOf("};");
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error("지출결의 클라이언트 매니페스트 형식을 읽지 못했습니다.");
  const manifest = JSON.parse(source.slice(jsonStart, jsonEnd + 1));
  const chunks = manifest.entryJSFiles?.[route.entry];
  if (!Array.isArray(chunks) || chunks.length === 0) throw new Error(`${route.route} 초기 JavaScript 청크가 없습니다.`);
  // Include shared layout JavaScript as well as the page itself. Moving a feature
  // to the root layout must not hide its cost from the route's performance budget.
  const layoutChunks = manifest.entryJSFiles?.["[project]/src/app/layout"] ?? [];
  return unique([...layoutChunks, ...chunks]);
}

function readAsyncChunkPaths() {
  const routeDirectory = resolve(buildDirectory, "server/app/finance/expense-resolutions");
  const manifestPath = resolve(routeDirectory, "page/react-loadable-manifest.json");
  const manifest = readJson(manifestPath);
  const chunks = Object.values(manifest).flatMap((entry) => Array.isArray(entry.files) ? entry.files : []);
  return unique(chunks.filter((path) => path.endsWith(".js")));
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString("en-US")} bytes (${(bytes / 1024).toFixed(1)} KiB)`;
}

function evaluateBudget(label, actual, budget) {
  const passed = actual <= budget;
  console.log(`${passed ? "PASS" : "FAIL"} ${label}: ${formatBytes(actual)} / ${formatBytes(budget)}`);
  return passed;
}

function main() {
  for (const [name, value] of Object.entries(budgets)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`성능 예산 값이 올바르지 않습니다: ${name}`);
  }

  const routeResults = routeBudgets.map((route) => {
    const chunks = readInitialChunkPaths(route);
    return { ...route, actual: chunks.reduce((total, path) => total + fileBytes(path), 0), chunkCount: chunks.length };
  });
  const asyncChunks = readAsyncChunkPaths();
  const asyncSizes = asyncChunks.map((path) => ({ path, bytes: fileBytes(path) }));
  const totalAsyncBytes = asyncSizes.reduce((total, chunk) => total + chunk.bytes, 0);
  const largestAsyncBytes = asyncSizes.reduce((largest, chunk) => Math.max(largest, chunk.bytes), 0);

  console.log("\nERP route performance budgets");
  const results = routeResults.map((route) => evaluateBudget(`${route.label} initial JavaScript (${route.route}, ${route.chunkCount} chunks)`, route.actual, route.limit));
  console.log(`\nExpense resolution async chunks: ${asyncChunks.length}`);
  results.push(
    evaluateBudget("largest async chunk", largestAsyncBytes, budgets.largestAsyncChunk),
    evaluateBudget("total async JavaScript", totalAsyncBytes, budgets.totalAsyncJavaScript),
  );

  if (results.includes(false)) {
    console.error("\n성능 예산을 초과했습니다. 의도된 증가라면 원인을 검토한 뒤 예산을 명시적으로 조정해주세요.");
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`성능 예산 검사 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
