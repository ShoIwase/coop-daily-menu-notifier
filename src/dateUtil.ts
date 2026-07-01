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
