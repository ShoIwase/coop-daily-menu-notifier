import dayjs, { Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const JST = "Asia/Tokyo";

export function nowJST(): Dayjs {
  return dayjs().tz(JST);
}

// その日を含む週の月曜日（JST の 0 時）
export function mondayOfWeekJST(d: Dayjs): Dayjs {
  const jst = d.tz(JST).startOf("day");
  const offset = (jst.day() + 6) % 7; // 月=0 … 日=6
  return jst.subtract(offset, "day");
}
