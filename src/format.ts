import { ScrapedMenus } from "./types";
import { todayLabelJST, todayWeekdayKanjiJST } from "./dateUtil";

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

// Bedrock整形後は「月: ...」のように曜日ラベル+コロンで始まる行に分かれている。
// 月曜以外はその日の行だけを抜き出す。見つからない場合（簡易抽出のフォールバック時など、
// 曜日ごとに分かれていない場合）は全文をそのまま使う。
function extractTodayLine(summary: string, todayKanji: string): string {
  const line = summary
    .split("\n")
    .find((l) => l.trim().startsWith(`${todayKanji}:`) || l.trim().startsWith(`${todayKanji}：`));
  return line ? line.trim() : summary;
}

export function formatMessage(menus: ScrapedMenus, isMonday: boolean): string {
  const sections: string[] = [`📅 ${todayLabelJST()} のデイリーコープ献立`];

  if (isMonday) {
    sections.push("（月曜日のため、今週分の献立をまとめてお届けします）");
  }

  const todayKanji = todayWeekdayKanjiJST();
  const courses: { label: string; key: "okazu" | "sikkari" }[] = [
    { label: "🍱 舞菜おかず", key: "okazu" },
    { label: "🍱 舞菜しっかりおかず", key: "sikkari" },
  ];

  for (const course of courses) {
    const menu = menus[course.key];
    const body = isMonday ? menu.summary : extractTodayLine(menu.summary, todayKanji);
    sections.push(`\n**${course.label}**\n${body}`);
  }

  sections.push(
    `\n📄 正確な日付別メニューはこちら（公式PDF）\n${menus.pdfUrl}`
  );

  return sections.join("\n");
}
