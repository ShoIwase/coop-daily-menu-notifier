import { chromium, Locator, Page } from "playwright";
import fs from "fs";
import path from "path";
import { CourseMenu, ScrapedMenus } from "./types";
import {
  downloadPdf,
  cleanupPdf,
  extractLayoutText,
  extractCourseSnippet,
  renderCourseImage,
  PdfHandle,
} from "./pdfMenu";
import { refineMenuFromImage } from "./bedrock";

const USE_BEDROCK = process.env.USE_BEDROCK === "true";

const DEBUG = process.env.DEBUG_SCRAPE === "true";
const DEBUG_DIR = path.join(process.cwd(), "debug");

const LOGIN_URL =
  process.env.LOGIN_URL ?? "https://daily.coopdeli.jp/auth/login.html";

const COURSES: { key: "okazu" | "sikkari"; label: string }[] = [
  { key: "okazu", label: "舞菜おかず" },
  { key: "sikkari", label: "舞菜しっかりおかず" },
];

// メニューPDFのファイル名パターン（例: daily_menu_240.pdf）
const MENU_PDF_PATTERN = /daily_menu_\d+\.pdf(\?.*)?$/i;

async function dumpDebug(page: Page, stepName: string): Promise<void> {
  if (!DEBUG) return;
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const safeName = stepName.replace(/[^a-zA-Z0-9_-]/g, "_");
  await page
    .screenshot({ path: path.join(DEBUG_DIR, `${safeName}.png`), fullPage: true })
    .catch((err) => console.error(`[debug] screenshot failed for ${stepName}:`, err));
  const html = await page.content().catch(() => null);
  if (html) {
    fs.writeFileSync(path.join(DEBUG_DIR, `${safeName}.html`), html, "utf-8");
  }
  console.log(`[debug] saved step "${stepName}" -> ${DEBUG_DIR}`);
}

async function findFirstMatch(candidates: Locator[]): Promise<Locator | null> {
  for (const candidate of candidates) {
    if ((await candidate.count()) > 0) {
      return candidate.first();
    }
  }
  return null;
}

async function login(page: Page): Promise<void> {
  const memberCode = process.env.COOP_MEMBER_CODE;
  const password = process.env.COOP_PASSWORD;
  if (!memberCode || !password) {
    throw new Error(
      "COOP_MEMBER_CODE / COOP_PASSWORD が環境変数に設定されていません"
    );
  }

  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await dumpDebug(page, "01_login_page");

  const idField = await findFirstMatch([
    page.getByLabel(/組合員コード|ID|ユーザー/),
    page.locator('input[type="text"], input[type="tel"]'),
  ]);
  const pwField = await findFirstMatch([
    page.getByLabel(/パスワード/),
    page.locator('input[type="password"]'),
  ]);
  if (!idField || !pwField) {
    throw new Error("ログインフォームの入力欄が見つかりませんでした");
  }
  await idField.fill(memberCode);
  await pwField.fill(password);

  // 見出しテキストなど非クリック要素を誤って拾わないよう、リンク/ボタン役割のみに限定する
  const loginButton = await findFirstMatch([
    page.getByRole("link", { name: /ログイン/ }),
    page.getByRole("button", { name: /ログイン/ }),
    page.locator("a, button").filter({ hasText: /ログイン/ }),
  ]);
  if (!loginButton) {
    throw new Error("ログインボタンが見つかりませんでした");
  }

  await Promise.all([page.waitForLoadState("networkidle"), loginButton.click()]);
  await dumpDebug(page, "02_after_login");
}

async function findMenuPdfUrl(page: Page): Promise<string> {
  // ログイン直後はナビゲーションが非同期描画されるため、count() を即座に見るのではなく
  // 要素が実際に現れるまで積極的にポーリングする。
  const dailyCoopTab = page.getByRole("link", { name: /デイリーコープ/ }).first();
  const tabAppeared = await dailyCoopTab
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (tabAppeared) {
    await Promise.all([page.waitForLoadState("networkidle"), dailyCoopTab.click()]);
    // タブ切り替え後にコンテンツが非同期で描画されるケースに備えて少し待つ
    await page.waitForTimeout(2000);
    await dumpDebug(page, "03_daily_coop_tab");
  } else {
    console.warn(
      "[scraper] 「デイリーコープ」タブが見つかりませんでした。現在のページから探索します。"
    );
  }

  const pdfLinks = await page.$$eval(
    'a[href$=".pdf"], a[href*=".pdf?"]',
    (anchors) =>
      anchors.map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a.textContent ?? "").trim(),
      }))
  );

  if (DEBUG) {
    console.log(
      `[debug] PDFリンク一覧 (${pdfLinks.length}件):\n${JSON.stringify(pdfLinks, null, 2)}`
    );
  }

  const menuLink =
    pdfLinks.find((l) => MENU_PDF_PATTERN.test(l.href)) ??
    pdfLinks.find((l) => l.text.includes("メインメニュー") || l.text.includes("献立"));

  if (!menuLink) {
    throw new Error(
      "献立カレンダーPDFへのリンクが見つかりませんでした（DEBUG_SCRAPE=true で一覧を確認してください）"
    );
  }

  return menuLink.href;
}

export async function scrapeMenus(): Promise<ScrapedMenus> {
  const browser = await chromium.launch({ headless: true });
  let pdfUrl: string;
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await login(page);
    pdfUrl = await findMenuPdfUrl(page);
  } finally {
    await browser.close();
  }

  const pdfHandle = await downloadPdf(pdfUrl);
  try {
    const menus: Partial<Record<"okazu" | "sikkari", CourseMenu>> = {};
    for (const course of COURSES) {
      menus[course.key] = { summary: await buildCourseSummary(pdfHandle, course.label) };
    }

    return { pdfUrl, ...(menus as Record<"okazu" | "sikkari", CourseMenu>) };
  } finally {
    cleanupPdf(pdfHandle);
  }
}

async function buildCourseSummary(pdfHandle: PdfHandle, courseLabel: string): Promise<string> {
  const heuristicFallback = async () => {
    const pdfText = await extractLayoutText(pdfHandle);
    return extractCourseSnippet(pdfText, courseLabel);
  };

  if (!USE_BEDROCK) return heuristicFallback();

  try {
    const image = await renderCourseImage(pdfHandle, courseLabel);
    if (!image) throw new Error("該当コースの表組み画像を切り出せませんでした");
    return await refineMenuFromImage(courseLabel, image);
  } catch (err) {
    console.warn(
      `[scraper] Bedrockによる整形に失敗したため簡易抽出結果を使用します（コース: ${courseLabel}）:`,
      err
    );
    return heuristicFallback();
  }
}
