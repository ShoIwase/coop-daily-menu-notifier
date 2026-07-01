import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

const COURSE_HEADERS = [
  "舞菜おかず",
  "舞菜しっかりおかず",
  "舞菜御膳",
  "舞菜弁当",
  "舞菜ミニ弁当",
  "エネルギー塩分",
];

export async function downloadPdfText(pdfUrl: string): Promise<string> {
  const response = await axios.get<ArrayBuffer>(pdfUrl, {
    responseType: "arraybuffer",
  });

  const tmpFile = path.join(os.tmpdir(), `coop-menu-${Date.now()}.pdf`);
  fs.writeFileSync(tmpFile, Buffer.from(response.data));

  try {
    // -layout で視覚的な行順（見出しの直後に品目が並ぶ順）を維持する。
    // 既定モード（読み取り順）だと同一セクション内でも品目が見出しより
    // 前に出現することがあり、見出し以降を切り出す方式と相性が悪い。
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-layout", tmpFile, "-"],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

export function extractCourseSnippet(
  fullText: string,
  courseLabel: string,
  maxChars = 600
): string {
  const startIndex = fullText.indexOf(courseLabel);
  if (startIndex === -1) {
    return "（PDFから該当コースの記載を見つけられませんでした）";
  }

  const searchFrom = startIndex + courseLabel.length;
  let endIndex = fullText.length;
  for (const header of COURSE_HEADERS) {
    if (header === courseLabel) continue;
    const idx = fullText.indexOf(header, searchFrom);
    if (idx !== -1 && idx < endIndex) {
      endIndex = idx;
    }
  }

  const rawSnippet = fullText.slice(searchFrom, endIndex);

  const cleaned = rawSnippet
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .filter((line) => line.length > 0)
    .filter(
      (line) =>
        !/^\(原材料|^＊|^\d+$|^(熱量|たんぱく質|脂質|炭水化物|食塩相当量)|^本体|^（税込|^\d+円$/.test(
          line
        )
    )
    .join("\n");

  return cleaned.slice(0, maxChars).trim() || "（メニュー品目を抽出できませんでした）";
}
