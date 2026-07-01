import axios from "axios";
import { splitIntoChunks } from "./format";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendToDiscord(message: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_URL が環境変数に設定されていません");
  }

  const chunks = splitIntoChunks(message);

  for (let i = 0; i < chunks.length; i++) {
    await axios.post(webhookUrl, { content: chunks[i] });
    if (i < chunks.length - 1) {
      await delay(500);
    }
  }
}
