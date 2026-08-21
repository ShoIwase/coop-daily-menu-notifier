import dotenv from "dotenv";
dotenv.config();

import { scrapeMenus } from "./scraper";
import { formatMessage } from "./format";
import { sendToDiscord } from "./discord";
import { loadCachedMenus, saveCachedMenus } from "./cache";

async function main(): Promise<void> {
  console.log("[index] 開始");

  // 前回実行時（1週間前）に取得しておいた分＝今週配達される献立を送信する。
  // コープ側のサイトは常に「今日を含む週の次の週」の献立しか公開しないため、
  // 今この場で取得しても今週配達分には辿り着けない。
  const menusForThisWeek = loadCachedMenus();
  if (menusForThisWeek) {
    const message = formatMessage(menusForThisWeek);
    console.log("[index] Discordへ送信するメッセージ:\n" + message);
    await sendToDiscord(message);
    console.log("[index] 送信完了");
  } else {
    console.log(
      "[index] キャッシュがまだ無いため今回は送信をスキップします（次回実行分から配信されます）"
    );
  }

  console.log("[index] 来週配達分の献立を取得してキャッシュを更新します");
  const menusForNextWeek = await scrapeMenus();
  saveCachedMenus(menusForNextWeek);
  console.log("[index] キャッシュ更新完了");
}

main().catch((err) => {
  console.error("[index] エラーが発生しました:", err);
  process.exit(1);
});
