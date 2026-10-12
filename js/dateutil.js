// Local-time date helpers. Dates are stored as "YYYY-MM-DD" (all-day)
// or "YYYY-MM-DDTHH:mm" (timed) in the user's local time — never UTC.
const DateUtil = (() => {
  const pad = (n) => String(n).padStart(2, '0');

  const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtDateTime = (d) => `${fmtDate(d)}T${fmtTime(d)}`;

  function parseDate(s) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(s, n) {
    const d = parseDate(s);
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  }

  return { fmtDate, fmtTime, fmtDateTime, parseDate, addDays };
})();

if (typeof module !== 'undefined') module.exports = DateUtil;
