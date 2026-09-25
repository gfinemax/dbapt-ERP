import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const buildDirectory = resolve(projectDirectory, process.env.NEXT_BUILD_DIR || ".next");
const routeDirectory = resolve(buildDirectory, "server/app/finance/expense-resolutions");
const staticDirectory = resolve(buildDirectory, "static");

const budgets = {
  initialJavaScript: Number(process.env.EXPENSE_RESOLUTION_INITIAL_JS_BUDGET || 370_000),
  largestAsyncChunk: Number(process.env.EXPENSE_RESOLUTION_ASYNC_CHUNK_BUDGET || 100_000),
  totalAsyncJavaScript: Number(process.env.EXPENSE_RESOLUTION_ASYNC_TOTAL_BUDGET || 110_000),
};

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

function readInitialChunkPaths() {
  const manifestPath = resolve(routeDirectory, "page_client-reference-manifest.js");
  const source = readFileSync(manifestPath, "utf8");
  const jsonStart = source.indexOf('{"moduleLoading"');
  const jsonEnd = source.lastIndexOf("};");
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error("지출결의 클라이언트 매니페스트 형식을 읽지 못했습니다.");
  const manifest = JSON.parse(source.slice(jsonStart, jsonEnd + 1));
  const entryKey = "[project]/src/app/finance/expense-resolutions/page";
  const chunks = manifest.entryJSFiles?.[entryKey];
  if (!Array.isArray(chunks) || chunks.length === 0) throw new Error("지출결의 초기 JavaScript 청크가 없습니다.");
  return unique(chunks);
}

function readAsyncChunkPaths() {
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

  const initialChunks = readInitialChunkPaths();
  const asyncChunks = readAsyncChunkPaths();
  const initialBytes = initialChunks.reduce((total, path) => total + fileBytes(path), 0);
  const asyncSizes = asyncChunks.map((path) => ({ path, bytes: fileBytes(path) }));
  const totalAsyncBytes = asyncSizes.reduce((total, chunk) => total + chunk.bytes, 0);
  const largestAsyncBytes = asyncSizes.reduce((largest, chunk) => Math.max(largest, chunk.bytes), 0);

  console.log("\nExpense resolution performance budget");
  console.log(`Initial chunks: ${initialChunks.length} · Async chunks: ${asyncChunks.length}`);
  const results = [
    evaluateBudget("initial JavaScript", initialBytes, budgets.initialJavaScript),
    evaluateBudget("largest async chunk", largestAsyncBytes, budgets.largestAsyncChunk),
    evaluateBudget("total async JavaScript", totalAsyncBytes, budgets.totalAsyncJavaScript),
  ];

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
