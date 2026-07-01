import { ScrapedMenus } from "./types";
import { todayLabelJST } from "./dateUtil";

const DISCORD_LIMIT = 2000;

export function splitIntoChunks(text: string, limit = DISCORD_LIMIT): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit) {
      if (current) chunks.push(current);
      current = line.length > limit ? line.slice(0, limit) : line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

export function formatMessage(menus: ScrapedMenus, isMonday: boolean): string {
  const sections: string[] = [`📅 ${todayLabelJST()} のデイリーコープ献立`];

  if (isMonday) {
    sections.push("（月曜日のため、今週分の献立をまとめてお届けします）");
  }

  const courses: { label: string; key: "okazu" | "sikkari" }[] = [
    { label: "🍱 舞菜おかず", key: "okazu" },
    { label: "🍱 舞菜しっかりおかず", key: "sikkari" },
  ];

  for (const course of courses) {
    const menu = menus[course.key];
    sections.push(`\n**${course.label}**\n${menu.summary}`);
  }

  sections.push(
    `\n📄 正確な日付別メニューはこちら（公式PDF）\n${menus.pdfUrl}`
  );

  return sections.join("\n");
}
