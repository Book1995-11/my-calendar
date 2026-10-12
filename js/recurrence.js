// Recurring tasks. task.repeat = { freq, interval, weekdays, until, skipOff }
//   freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
//   weekdays: 0-6 (Sunday = 0), weekly only; defaults to the start's weekday
//   until: last allowed date (inclusive) or null
//   skipOff: skip occurrences that land on a weekly day off or a special day off
const Recurrence = (() => {
  const MAX_OCCURRENCES = 1500;
  const DAY_MS = 86400000;
  const WEEKDAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const longDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

  const daysBetween = (a, b) => Math.round((DateUtil.parseDate(b) - DateUtil.parseDate(a)) / DAY_MS);
  const interval = (r) => Math.max(1, Math.min(99, Number(r.interval) || 1));

  function weekdaysOf(task) {
    const wd = (task.repeat.weekdays || []).filter((d) => d >= 0 && d <= 6);
    return wd.length ? [...new Set(wd)].sort() : [DateUtil.parseDate(task.start).getDay()];
  }

  // Candidate dates in order, starting near `from` (not filtered by skipOff).
  function* candidates(task, from) {
    const r = task.repeat;
    const n = interval(r);
    const start = task.start.slice(0, 10);
    const s = DateUtil.parseDate(start);

    if (r.freq === 'daily') {
      const skip = Math.max(0, Math.floor(daysBetween(start, from) / n));
      for (let k = skip; ; k++) yield DateUtil.addDays(start, k * n);
    }
    if (r.freq === 'weekly') {
      const weekStart = DateUtil.addDays(start, -s.getDay()); // Sunday of the start week
      const skip = Math.max(0, Math.floor(daysBetween(weekStart, from) / 7 / n) - 1);
      const days = weekdaysOf(task);
      for (let k = skip; ; k++) {
        for (const wd of days) yield DateUtil.addDays(weekStart, k * n * 7 + wd);
      }
    }
    if (r.freq === 'monthly' || r.freq === 'yearly') {
      const step = r.freq === 'monthly' ? n : n * 12;
      const f = DateUtil.parseDate(from);
      const monthsDiff = (f.getFullYear() - s.getFullYear()) * 12 + f.getMonth() - s.getMonth();
      const skip = Math.max(0, Math.floor(monthsDiff / step) - 1);
      for (let k = skip; ; k++) {
        const d = new Date(s.getFullYear(), s.getMonth() + k * step, s.getDate());
        // Skip months without that day (e.g. the 31st, or Feb 29 in other years).
        if (d.getDate() === s.getDate()) yield DateUtil.fmtDate(d);
      }
    }
  }

  // Occurrence dates ('YYYY-MM-DD') of a task that overlap [from, to].
  // ctx = { days, weekendDays } is needed for skipOff.
  function occurrences(task, from, to, ctx) {
    const start = task.start.slice(0, 10);
    if (!Tasks.isRecurring(task)) {
      return Tasks.endDate(task) >= from && start <= to ? [start] : [];
    }
    const span = Math.max(0, daysBetween(start, Tasks.endDate(task)));
    const until = task.repeat.until || '9999-12-31';
    const last = to < until ? to : until;
    const lookFrom = DateUtil.addDays(from, -span); // occurrences that started earlier but still run
    const off = task.repeat.skipOff ? SpecialDays.offDates(ctx.days, lookFrom, last) : null;
    const out = [];
    let guard = 0;
    for (const d of candidates(task, lookFrom)) {
      if (d > last || ++guard > MAX_OCCURRENCES * 4) break;
      if (d < start || d < lookFrom) continue;
      if (off && (off.has(d) || ctx.weekendDays.includes(DateUtil.parseDate(d).getDay()))) continue;
      out.push(d);
      if (out.length >= MAX_OCCURRENCES) break;
    }
    return out;
  }

  // Dates the series would have had without skipOff, but skips (for .ics EXDATE).
  function skippedDates(task, from, to, ctx) {
    if (!Tasks.isRecurring(task) || !task.repeat.skipOff) return [];
    const kept = new Set(occurrences(task, from, to, ctx));
    const all = occurrences({ ...task, repeat: { ...task.repeat, skipOff: false } }, from, to, ctx);
    return all.filter((d) => !kept.has(d));
  }

  // Next occurrence on or after `from` (default today), or null.
  function next(task, ctx, from = Tasks.today()) {
    return occurrences(task, from, DateUtil.addDays(from, 800), ctx)[0] || null;
  }

  // Shift a stored date-or-datetime by the same amount as start → date.
  function shift(value, fromDate, toDate) {
    if (!value) return null;
    return DateUtil.addDays(value.slice(0, 10), daysBetween(fromDate, toDate)) + value.slice(10);
  }

  // Start/end of the occurrence that begins on `date`.
  function occurrenceTimes(task, date) {
    const start = task.start.slice(0, 10);
    return { start: shift(task.start, start, date), end: shift(task.end, start, date) };
  }

  // Thai description, e.g. "ทุก 2 สัปดาห์ (จ., พ.) ถึง 31 ธ.ค. 2569 · ข้ามวันหยุด"
  function describe(task) {
    const r = task.repeat;
    if (!r || !r.freq) return '';
    const n = interval(r);
    const unit = { daily: 'วัน', weekly: 'สัปดาห์', monthly: 'เดือน', yearly: 'ปี' }[r.freq];
    let text = n === 1 ? `ทุก${unit}` : `ทุก ${n} ${unit}`;
    if (r.freq === 'weekly') text += ` (${weekdaysOf(task).map((d) => WEEKDAY_SHORT[d]).join(', ')})`;
    if (r.freq === 'monthly') text += ` วันที่ ${DateUtil.parseDate(task.start).getDate()}`;
    if (r.until) text += ` ถึง ${longDate.format(DateUtil.parseDate(r.until))}`;
    if (r.skipOff) text += ' · ข้ามวันหยุด';
    return text;
  }

  return { occurrences, skippedDates, next, occurrenceTimes, describe, weekdaysOf, WEEKDAY_SHORT };
})();
