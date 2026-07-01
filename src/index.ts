import dotenv from "dotenv";
dotenv.config();

import { scrapeMenus } from "./scraper";
import { formatMessage } from "./format";
import { sendToDiscord } from "./discord";

async function main(): Promise<void> {
  console.log("[index] 開始");

  const menus = await scrapeMenus();
  const message = formatMessage(menus);

  console.log("[index] Discordへ送信するメッセージ:\n" + message);

  await sendToDiscord(message);

  console.log("[index] 送信完了");
}

main().catch((err) => {
  console.error("[index] エラーが発生しました:", err);
  process.exit(1);
});
