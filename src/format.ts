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

// 配達は月・水・金のみのため、Bedrockが出力した5日分から該当曜日の行だけを残す。
// 曜日ラベルの行に分かれていない場合（簡易抽出のフォールバック時など）はそのまま返す。
const ORDER_DAYS = ["月", "水", "金"];

function filterToOrderDays(summary: string): string {
  const lines = summary
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return ORDER_DAYS.some(
        (day) => trimmed.startsWith(`${day}:`) || trimmed.startsWith(`${day}：`)
      );
    });
  return lines.length > 0 ? lines.join("\n") : summary;
}

export function formatMessage(menus: ScrapedMenus): string {
  const sections: string[] = [`📅 ${todayLabelJST()} 週のデイリーコープ献立（月・水・金分）`];

  const courses: { label: string; key: "okazu" | "sikkari" }[] = [
    { label: "🍱 舞菜おかず", key: "okazu" },
    { label: "🍱 舞菜しっかりおかず", key: "sikkari" },
  ];

  for (const course of courses) {
    const menu = menus[course.key];
    sections.push(`\n**${course.label}**\n${filterToOrderDays(menu.summary)}`);
  }

  sections.push(
    `\n📄 正確な日付別メニューはこちら（公式PDF）\n${menus.pdfUrl}`
  );

  return sections.join("\n");
}
