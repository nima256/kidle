function getPersianDate(date = new Date()) {
  const year = date.toLocaleDateString('fa-IR', { year: 'numeric' });
  const month = date.toLocaleDateString('fa-IR', { month: 'numeric' });
  const day = date.toLocaleDateString('fa-IR', { day: 'numeric' });
  return `${year}-${month}-${day}`;
}

module.exports = { getPersianDate };