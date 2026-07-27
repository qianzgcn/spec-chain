import "server-only";

import { db } from "@/server/db";

const shanghaiTimestampFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
});

function formatShanghaiTimestamp(timestamp: number) {
  const parts = shanghaiTimestampFormatter.formatToParts(new Date(timestamp));

  const values = new Map(parts.map((part) => [part.type, part.value]));
  return [
    values.get("year"),
    values.get("month"),
    values.get("day"),
    values.get("hour"),
    values.get("minute"),
    values.get("second"),
    values.get("fractionalSecond"),
  ].join("");
}

export async function generateBusinessCode(prefix: "FE" | "US" | "TC") {
  const timestamp = await db.$transaction(async (transaction) => {
    const now = BigInt(Date.now());
    const existing = await transaction.businessCodeSequence.findUnique({
      where: { prefix },
    });
    const nextTimestamp =
      existing && existing.lastTimestamp >= now
        ? existing.lastTimestamp + 1n
        : now;

    await transaction.businessCodeSequence.upsert({
      where: { prefix },
      create: { prefix, lastTimestamp: nextTimestamp },
      update: { lastTimestamp: nextTimestamp },
    });

    return nextTimestamp;
  });

  return `${prefix}-${formatShanghaiTimestamp(Number(timestamp))}`;
}
