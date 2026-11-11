import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import { ScrapedMenus } from "./types";
import { mondayOfWeekJST } from "./dateUtil";

// コープ側のサイトは常に「実行日を含む週の“次の週”」の献立しか公開しないため、
// 取得した献立は配達週の月曜日（YYYY-MM-DD, JST）をキーにして保存しておき、
// その週になってから送信する。平日は毎日送るので、今週分と来週分の2週分を持つ。
const CACHE_PATH = path.join(process.cwd(), "data", "menu-cache.json");

export interface CachedWeek extends ScrapedMenus {
  cachedAt: string;
}

interface CacheFile {
  weeks: Record<string, CachedWeek>;
}

function readCache(): CacheFile {
  if (!fs.existsSync(CACHE_PATH)) return { weeks: {} };
  const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
  if (raw.weeks) return raw as CacheFile;
  // 旧形式（1週分だけ・配達週の情報なし）。保存した日を含む週の翌週分として読み替える
  if (raw.cachedAt) {
    const weekOf = mondayOfWeekJST(dayjs(raw.cachedAt)).add(7, "day").format("YYYY-MM-DD");
    return { weeks: { [weekOf]: raw as CachedWeek } };
  }
  return { weeks: {} };
}

function writeCache(cache: CacheFile): void {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}

export function loadWeek(weekOf: string): CachedWeek | null {
  return readCache().weeks[weekOf] ?? null;
}

// weekOf の週の献立を保存し、keepFrom より前の週は捨てる
export function saveWeek(weekOf: string, menus: ScrapedMenus, keepFrom: string): void {
  const cache = readCache();
  cache.weeks[weekOf] = { cachedAt: new Date().toISOString(), ...menus };
  for (const key of Object.keys(cache.weeks)) {
    if (key < keepFrom) delete cache.weeks[key];
  }
  writeCache(cache);
}
