// Company calendar: special days (holidays, leave, events) and working-day math.
// A special day is { name, type, start, end|null, yearly } with inclusive dates.
const SpecialDays = (() => {
  // Thai public holidays that fall on the same date every year. Lunar holidays
  // (Makha Bucha, Visakha Bucha, Asarnha Bucha, Khao Phansa) move each year
  // and must be added by hand.
  const THAI_FIXED_HOLIDAYS = [
    ['01-01', 'วันขึ้นปีใหม่'],
    ['04-06', 'วันจักรี'],
    ['04-13', 'วันสงกรานต์', '04-15'],
    ['05-01', 'วันแรงงานแห่งชาติ'],
    ['05-04', 'วันฉัตรมงคล'],
    ['06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี'],
    ['07-28', 'วันเฉลิมพระชนมพรรษา ร.10'],
    ['08-12', 'วันแม่แห่งชาติ'],
    ['10-13', 'วันนวมินทรมหาราช'],
    ['10-23', 'วันปิยมหาราช'],
    ['12-05', 'วันพ่อแห่งชาติ'],
    ['12-10', 'วันรัฐธรรมนูญ'],
    ['12-31', 'วันสิ้นปี'],
  ];

  const MAX_SPAN = 3660; // ~10 years; guards loops against bad input

  const spanDays = (start, end) =>
    Math.round((DateUtil.parseDate(end) - DateUtil.parseDate(start)) / 86400000);

  // Expand special days into concrete { day, start, end } occurrences that
  // overlap [from, to]. Yearly days repeat on the same month/day.
  function occurrences(days, from, to) {
    const out = [];
    const y0 = Number(from.slice(0, 4)) - 1; // previous year catches Dec→Jan spans
    const y1 = Number(to.slice(0, 4));
    for (const day of days) {
      const len = Math.max(0, spanDays(day.start, day.end || day.start));
      const starts = [];
      if (day.yearly) {
        const m = Number(day.start.slice(5, 7)) - 1;
        const d = Number(day.start.slice(8, 10));
        for (let y = y0; y <= y1; y++) starts.push(DateUtil.fmtDate(new Date(y, m, d)));
      } else {
        starts.push(day.start);
      }
      for (const s of starts) {
        const e = DateUtil.addDays(s, len);
        if (e >= from && s <= to) out.push({ day, start: s, end: e });
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }

  // Each date in [from, to] -> names of non-working special days on it.
  function offDates(days, from, to) {
    const map = new Map();
    const offDays = days.filter((d) => Format.dayType(d.type).off);
    for (const o of occurrences(offDays, from, to)) {
      for (let d = o.start; d <= o.end; d = DateUtil.addDays(d, 1)) {
        if (d < from || d > to) continue;
        if (!map.has(d)) map.set(d, []);
        map.get(d).push(o.day.name);
      }
    }
    return map;
  }

  // Working days in [start, end] plus the special days off inside it.
  // Returns null when the range is invalid or unreasonably long.
  function summarize(start, end, days, weekendDays) {
    if (!start || !end || end < start || spanDays(start, end) > MAX_SPAN) return null;
    const off = offDates(days, start, end);
    let working = 0;
    const holidays = [];
    for (let d = start; d <= end; d = DateUtil.addDays(d, 1)) {
      if (off.has(d)) holidays.push({ date: d, names: off.get(d) });
      else if (!weekendDays.includes(DateUtil.parseDate(d).getDay())) working++;
    }
    return { working, holidays };
  }

  // Preset entries not already present (same name and month/day).
  function missingThaiHolidays(existing, year) {
    const key = (name, start) => `${name}|${start.slice(5)}`;
    const have = new Set(existing.map((d) => key(d.name, d.start)));
    return THAI_FIXED_HOLIDAYS
      .map(([md, name, endMd]) => ({
        name,
        type: 'holiday',
        start: `${year}-${md}`,
        end: endMd ? `${year}-${endMd}` : null,
        yearly: true,
      }))
      .filter((d) => !have.has(key(d.name, d.start)));
  }

  return { occurrences, offDates, summarize, missingThaiHolidays };
})();
