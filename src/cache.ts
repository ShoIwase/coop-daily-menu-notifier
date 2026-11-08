import fs from "fs";
import path from "path";
import { ScrapedMenus } from "./types";

// 実行日（毎週月曜）に取得できるのはコープ側の仕様上「来週分」の献立のみで、
// 「今週配達される分」の献立はその前の週のうちにしか取得できない。そのため
// 取得は毎回そのまま送信せずキャッシュに保存し、次回実行時に「1週間前に取得
// しておいた＝まさに今週配達される分」を送信してから、新たに取得した来週分を
// 上書き保存する。
const CACHE_PATH = path.join(process.cwd(), "data", "menu-cache.json");

// 週1実行なので、正常なら前回の保存から7日前後。schedule の遅延を見込んでも
// 10日を超えていれば、ワークフローを止めていた間などに残った古い献立なので送らない。
const MAX_CACHE_AGE_DAYS = 10;

export function loadCachedMenus(now: Date = new Date()): ScrapedMenus | null {
  if (!fs.existsSync(CACHE_PATH)) return null;
  const { cachedAt, ...menus } = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
  const savedAt = cachedAt ? new Date(cachedAt) : null;
  if (!savedAt || isNaN(savedAt.getTime())) {
    console.log("[cache] 保存日時が無いキャッシュのため送信しません");
    return null;
  }
  const ageDays = (now.getTime() - savedAt.getTime()) / 86_400_000;
  if (ageDays > MAX_CACHE_AGE_DAYS) {
    console.log(`[cache] キャッシュが${ageDays.toFixed(1)}日前のもので古いため送信しません（上限${MAX_CACHE_AGE_DAYS}日）`);
    return null;
  }
  return menus as ScrapedMenus;
}

export function saveCachedMenus(menus: ScrapedMenus): void {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  const data = { cachedAt: new Date().toISOString(), ...menus };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
