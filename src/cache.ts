import fs from "fs";
import path from "path";
import { ScrapedMenus } from "./types";

// 実行日（毎週月曜）に取得できるのはコープ側の仕様上「来週分」の献立のみで、
// 「今週配達される分」の献立はその前の週のうちにしか取得できない。そのため
// 取得は毎回そのまま送信せずキャッシュに保存し、次回実行時に「1週間前に取得
// しておいた＝まさに今週配達される分」を送信してから、新たに取得した来週分を
// 上書き保存する。
const CACHE_PATH = path.join(process.cwd(), "data", "menu-cache.json");

export function loadCachedMenus(): ScrapedMenus | null {
  if (!fs.existsSync(CACHE_PATH)) return null;
  return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
}

export function saveCachedMenus(menus: ScrapedMenus): void {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(menus, null, 2) + "\n", "utf-8");
}
