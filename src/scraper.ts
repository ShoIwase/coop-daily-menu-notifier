import { chromium, Page } from "playwright";
import fs from "fs";
import path from "path";
import { CourseMenu, ScrapedMenus } from "./types";

const DEBUG = process.env.DEBUG_SCRAPE === "true";
const DEBUG_DIR = path.join(process.cwd(), "debug");

const LOGIN_URL =
  process.env.LOGIN_URL ?? "https://daily.coopdeli.jp/auth/login.html";

const COURSES: { key: "okazu" | "sikkari"; label: string }[] = [
  { key: "okazu", label: "舞菜おかず" },
  { key: "sikkari", label: "舞菜しっかりおかず" },
];

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

  // ラベルでの取得を優先し、見つからない場合は type 属性でフォールバックする
  const idField = page
    .getByLabel(/組合員コード|ID|ユーザー/)
    .or(page.locator('input[type="text"], input[type="tel"]').first());
  const pwField = page
    .getByLabel(/パスワード/)
    .or(page.locator('input[type="password"]').first());

  await idField.first().fill(memberCode);
  await pwField.first().fill(password);

  const loginButton = page
    .getByRole("link", { name: /ログイン/ })
    .or(page.getByRole("button", { name: /ログイン/ }))
    .or(page.getByText("ログイン", { exact: false }));

  await Promise.all([
    page.waitForLoadState("networkidle"),
    loginButton.first().click(),
  ]);
  await dumpDebug(page, "02_after_login");
}

async function navigateToMenuPage(page: Page): Promise<void> {
  const menuLink = page
    .getByRole("link", { name: /献立|舞菜/ })
    .first();

  if (await menuLink.count()) {
    await Promise.all([
      page.waitForLoadState("networkidle"),
      menuLink.click(),
    ]);
    await dumpDebug(page, "03_menu_page");
  } else {
    console.warn(
      "[scraper] 献立ページへのリンクが見つかりませんでした。ログイン後のページをそのまま解析します。"
    );
  }
}

async function extractCourseMenu(
  page: Page,
  courseLabel: string,
  includeWeekly: boolean
): Promise<CourseMenu> {
  const courseSection = page.getByText(courseLabel, { exact: false }).first();

  if (!(await courseSection.count())) {
    console.warn(`[scraper] コース「${courseLabel}」の要素が見つかりませんでした`);
    return { today: "（取得できませんでした）" };
  }

  const container = courseSection.locator(
    "xpath=ancestor::*[self::section or self::div or self::article][1]"
  );

  const todayText = (await container.first().innerText().catch(() => "")).trim();

  const result: CourseMenu = { today: todayText || "（今日のメニューを取得できませんでした）" };

  if (includeWeekly) {
    const weeklyLink = container
      .getByRole("link", { name: /週間|週予定/ })
      .first();

    if (await weeklyLink.count()) {
      await Promise.all([
        page.waitForLoadState("networkidle"),
        weeklyLink.click(),
      ]);
      await dumpDebug(page, `04_weekly_${courseLabel}`);
      const weeklyText = (await page.locator("body").innerText().catch(() => "")).trim();
      result.weekly = weeklyText || "（週間メニューを取得できませんでした）";
      await page.goBack({ waitUntil: "networkidle" }).catch(() => undefined);
    } else {
      console.warn(
        `[scraper] コース「${courseLabel}」の週間メニューリンクが見つかりませんでした`
      );
      result.weekly = "（週間メニューリンクが見つかりませんでした）";
    }
  }

  return result;
}

export async function scrapeMenus(includeWeekly: boolean): Promise<ScrapedMenus> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await login(page);
    await navigateToMenuPage(page);

    const menus: Partial<Record<"okazu" | "sikkari", CourseMenu>> = {};
    for (const course of COURSES) {
      menus[course.key] = await extractCourseMenu(page, course.label, includeWeekly);
    }

    return menus as ScrapedMenus;
  } finally {
    await browser.close();
  }
}
