import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const JST = "Asia/Tokyo";

export function nowJST() {
  return dayjs().tz(JST);
}

export function isMondayJST(): boolean {
  return nowJST().day() === 1;
}

export function todayLabelJST(): string {
  return nowJST().format("YYYY-MM-DD (ddd)");
}

const WEEKDAY_KANJI = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function todayWeekdayKanjiJST(): string {
  return WEEKDAY_KANJI[nowJST().day()];
}
