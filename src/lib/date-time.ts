type DateTimeValue = string | number | Date;

const compactDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const detailedDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "medium",
});

export function formatCompactDateTime(value: DateTimeValue) {
  return compactDateTimeFormatter.format(new Date(value));
}

export function formatDateTime(value: DateTimeValue) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatDetailedDateTime(value: DateTimeValue) {
  return detailedDateTimeFormatter.format(new Date(value));
}
