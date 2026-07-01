import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

// PDFは2段組みレイアウトで、左列コースと右列コースの品目が同じ「行」に混在して
// 配置されている（例: 舞菜おかず＝左列、舞菜しっかりおかず＝右列が同じ行ブロック）。
// pdftotext -layout はページを上から下へ行単位で線形化するため、片方のコースだけを
// 文字列の範囲で綺麗に切り出すことはできない。簡易抽出（Bedrock不使用時のフォール
// バック）ではこの制約込みの粗い抽出しかできないが、Bedrockに渡す際は該当コースの
// 表組み部分をPDFから直接画像として切り出し、画像そのものを読み取らせることで
// 正確な行数・列（曜日）を保つ。
const ROW_BLOCKS = [
  ["舞菜おかず", "舞菜しっかりおかず"],
  ["舞菜弁当", "舞菜ミニ弁当"],
  ["舞菜御膳", "エネルギー塩分"],
];

function findRowBlock(courseLabel: string): string[] {
  return ROW_BLOCKS.find((block) => block.includes(courseLabel)) ?? [courseLabel];
}

export interface PdfHandle {
  path: string;
}

export async function downloadPdf(pdfUrl: string): Promise<PdfHandle> {
  const response = await axios.get<ArrayBuffer>(pdfUrl, {
    responseType: "arraybuffer",
  });
  const tmpFile = path.join(os.tmpdir(), `coop-menu-${Date.now()}.pdf`);
  fs.writeFileSync(tmpFile, Buffer.from(response.data));
  return { path: tmpFile };
}

export function cleanupPdf(handle: PdfHandle): void {
  fs.rmSync(handle.path, { force: true });
}

export async function extractLayoutText(handle: PdfHandle): Promise<string> {
  // -layout で視覚的な行順（見出しの直後に品目が並ぶ順）を維持する。
  const { stdout } = await execFileAsync(
    "pdftotext",
    ["-layout", handle.path, "-"],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  return stdout;
}

// courseLabel 単体のみを境界とする粗い切り出し（簡易抽出のフォールバック用）。
// 同じ行ブロックの相方コースの品目までは含んでしまう場合があるが、
// Bedrockを使わない場合の最後の砦として最低限の情報を返す。
function findSingleCourseSection(fullText: string, courseLabel: string): string | null {
  const startIndex = fullText.indexOf(courseLabel);
  if (startIndex === -1) return null;

  const searchFrom = startIndex + courseLabel.length;
  let endIndex = fullText.length;
  const otherHeaders = ROW_BLOCKS.flat().filter((h) => h !== courseLabel);
  for (const header of otherHeaders) {
    const idx = fullText.indexOf(header, searchFrom);
    if (idx !== -1 && idx < endIndex) {
      endIndex = idx;
    }
  }

  return fullText.slice(searchFrom, endIndex);
}

export function extractCourseSnippet(
  fullText: string,
  courseLabel: string,
  maxChars = 600
): string {
  const rawSnippet = findSingleCourseSection(fullText, courseLabel);
  if (rawSnippet === null) {
    return "（PDFから該当コースの記載を見つけられませんでした）";
  }

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

// ---------------------------------------------------------------------------
// 画像ベース抽出（Bedrockのビジョン機能向け）
// ---------------------------------------------------------------------------

interface HeaderPosition {
  label: string;
  x: number;
  y: number;
}

// 各コースの見出しは縦書きでページ左端／右端に配置されている。
// pdftotext -bbox-layout で取得できる単語の座標からその位置を特定する。
async function getCourseHeaderPositions(
  handle: PdfHandle
): Promise<{ positions: HeaderPosition[]; pageWidth: number; pageHeight: number }> {
  const { stdout } = await execFileAsync(
    "pdftotext",
    ["-bbox-layout", "-f", "1", "-l", "1", handle.path, "-"],
    { maxBuffer: 20 * 1024 * 1024 }
  );

  const pageMatch = stdout.match(/<page width="([\d.]+)" height="([\d.]+)">/);
  const pageWidth = pageMatch ? parseFloat(pageMatch[1]) : 0;
  const pageHeight = pageMatch ? parseFloat(pageMatch[2]) : 0;

  // 「舞菜しっかりおかず」は文字間隔の都合でPDF内部では複数の<word>に
  // 分割されることがあるため、先頭部分の一意な断片で照合する。
  const KNOWN_LABELS = ROW_BLOCKS.flat();
  const LABEL_PREFIXES = new Map<string, string>([["舞菜しっかりおかず", "舞菜し"]]);

  const positions: HeaderPosition[] = [];
  const wordRegex =
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]*)<\/word>/g;
  let m: RegExpExecArray | null;
  while ((m = wordRegex.exec(stdout))) {
    const [, xStr, yStr, text] = m;
    const trimmed = text.trim();
    const matchedLabel = KNOWN_LABELS.find(
      (label) => trimmed === label || trimmed === LABEL_PREFIXES.get(label)
    );
    if (matchedLabel && !positions.some((p) => p.label === matchedLabel)) {
      positions.push({ label: matchedLabel, x: parseFloat(xStr), y: parseFloat(yStr) });
    }
  }

  return { positions, pageWidth, pageHeight };
}

// courseLabelが掲載されている表組み部分をPDFページから画像として切り出す。
export async function renderCourseImage(
  handle: PdfHandle,
  courseLabel: string
): Promise<Buffer | null> {
  const { positions, pageWidth, pageHeight } = await getCourseHeaderPositions(handle);
  const target = positions.find((p) => p.label === courseLabel);
  if (!target || pageWidth === 0) return null;

  // ページはおおよそ左右2列。同じ列内で自分より下にある見出しのうち
  // 最も近いものを次の境界とする（無ければページ最下部まで）。
  const sameColumn = positions.filter(
    (p) => Math.abs(p.x - target.x) < 50 && p.y > target.y
  );
  const nextY = sameColumn.length
    ? Math.min(...sameColumn.map((p) => p.y))
    : pageHeight;

  const isLeftColumn = target.x < pageWidth / 2;
  const columnGapPt = 10;
  const xStartPt = isLeftColumn ? 0 : target.x - columnGapPt;
  const xEndPt = isLeftColumn ? target.x + 700 : pageWidth;
  const yStartPt = Math.max(0, target.y - 35);
  const yEndPt = Math.min(pageHeight, nextY);

  const DPI = 150;
  const SCALE = DPI / 72;
  const toPx = (pt: number) => Math.round(pt * SCALE);

  const outPrefix = path.join(os.tmpdir(), `coop-menu-crop-${Date.now()}`);
  await execFileAsync("pdftocairo", [
    "-png",
    "-r",
    String(DPI),
    "-f",
    "1",
    "-l",
    "1",
    "-x",
    String(toPx(xStartPt)),
    "-y",
    String(toPx(yStartPt)),
    "-W",
    String(toPx(xEndPt - xStartPt)),
    "-H",
    String(toPx(yEndPt - yStartPt)),
    handle.path,
    outPrefix,
  ]);

  const outFile = `${outPrefix}-1.png`;
  const buf = fs.readFileSync(outFile);
  fs.rmSync(outFile, { force: true });
  return buf;
}
