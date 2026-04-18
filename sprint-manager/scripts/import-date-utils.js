function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function toFourDigitYear(year) {
  const numericYear = Number(year);

  if (!Number.isFinite(numericYear)) {
    return NaN;
  }

  if (numericYear >= 100) {
    return numericYear;
  }

  return numericYear >= 70 ? 1900 + numericYear : 2000 + numericYear;
}

function formatDateParts(year, month, day) {
  return `${String(year).padStart(4, '0')}-${padDatePart(month)}-${padDatePart(day)}`;
}

function isValidDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function normalizeImportedDate(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return '';
  }

  const isoDateMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);

  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]);
    const month = Number(isoDateMatch[2]);
    const day = Number(isoDateMatch[3]);

    return isValidDateParts(year, month, day) ? formatDateParts(year, month, day) : '';
  }

  const slashDateMatch = rawValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);

  if (slashDateMatch) {
    const month = Number(slashDateMatch[1]);
    const day = Number(slashDateMatch[2]);
    const year = toFourDigitYear(slashDateMatch[3]);

    return isValidDateParts(year, month, day) ? formatDateParts(year, month, day) : '';
  }

  const dashDateMatch = rawValue.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);

  if (dashDateMatch) {
    const month = Number(dashDateMatch[1]);
    const day = Number(dashDateMatch[2]);
    const year = toFourDigitYear(dashDateMatch[3]);

    return isValidDateParts(year, month, day) ? formatDateParts(year, month, day) : '';
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return formatDateParts(
    parsedDate.getFullYear(),
    parsedDate.getMonth() + 1,
    parsedDate.getDate()
  );
}

module.exports = {
  normalizeImportedDate,
};
