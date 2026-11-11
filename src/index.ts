import dotenv from "dotenv";
dotenv.config();

import { scrapeMenus } from "./scraper";
import { loadWeek, saveWeek } from "./cache";
import { mondayOfWeekJST, nowJST } from "./dateUtil";

// 献立を取得して data/menu-cache.json に配達週ごとに保存するだけ。
// Discord への通知は自宅サーバーの IoT ダッシュボード（home/iot）が
// 毎朝の天気レポートにその日の分を載せる形で行う（このファイルを raw で読む）。
async function main(): Promise<void> {
  console.log("[index] 開始");
  const thisMonday = mondayOfWeekJST(nowJST());
  const thisWeek = thisMonday.format("YYYY-MM-DD");
  const nextWeek = thisMonday.add(7, "day").format("YYYY-MM-DD");

  // コープ側のサイトは常に「今日を含む週の次の週」の献立しか公開しないため、
  // 取得できるのは来週分。来週分がまだ無いときだけ取得する
  // （通常は月曜に取得。失敗したら翌日以降の実行で取り直す）
  if (loadWeek(nextWeek)) {
    console.log(`[index] ${nextWeek} の週の献立は取得済み`);
    return;
  }
  console.log(`[index] ${nextWeek} の週の献立を取得してキャッシュします`);
  const menus = await scrapeMenus();
  saveWeek(nextWeek, menus, thisWeek);
  console.log("[index] キャッシュ更新完了");
}

main().catch((err) => {
  console.error("[index] エラーが発生しました:", err);
  process.exit(1);
});
