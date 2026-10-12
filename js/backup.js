// Backup (JSON export/import) and calendar export (.ics).
const Backup = (() => {
  const APP = 'my-calendar';
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

  const str = (v, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
  const idOk = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;

  // ---------- download helper ----------

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- JSON ----------

  function exportJson(data) {
    const payload = { app: APP, version: 1, exportedAt: new Date().toISOString(), ...data };
    download(`my-calendar-backup-${Tasks.today()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  }

  function cleanRepeat(r) {
    if (!r || !FREQS.includes(r.freq)) return null;
    return {
      freq: r.freq,
      interval: Math.max(1, Math.min(99, Number(r.interval) || 1)),
      weekdays: Array.isArray(r.weekdays) ? r.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
      until: DATE.test(r.until) ? r.until : null,
      skipOff: !!r.skipOff,
    };
  }

  function cleanTask(t) {
    if (!t || !idOk(t.id) || !str(t.title).trim()) return null;
    const allDay = DATE.test(t.start);
    if (!allDay && !DATETIME.test(t.start)) return null;
    const endOk = t.end && (allDay ? DATE : DATETIME).test(t.end) && t.end >= t.start;
    return {
      id: t.id,
      title: str(t.title, 200),
      description: str(t.description),
      allDay,
      start: t.start,
      end: endOk ? t.end : null,
      planId: idOk(t.planId) ? t.planId : null,
      priority: oneOf(t.priority, ['high', 'normal', 'low'], 'normal'),
      status: oneOf(t.status, ['todo', 'doing', 'done'], 'todo'),
      progress: Math.max(0, Math.min(100, Math.round(Number(t.progress) || 0))),
      color: Format.isColor(t.color) ? t.color : null,
      checklist: Array.isArray(t.checklist)
        ? t.checklist.filter((i) => i && str(i.text).trim())
          .map((i) => ({ id: idOk(i.id) ? i.id : Math.random().toString(36).slice(2), text: str(i.text, 300), done: !!i.done }))
        : [],
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.filter(idOk) : [],
      repeat: cleanRepeat(t.repeat),
      doneDates: Array.isArray(t.doneDates) ? t.doneDates.filter((d) => DATE.test(d)) : [],
      createdAt: str(t.createdAt, 40) || new Date().toISOString(),
      updatedAt: str(t.updatedAt, 40) || new Date().toISOString(),
    };
  }

  function cleanPlan(p) {
    if (!p || !idOk(p.id) || !str(p.name).trim()) return null;
    return {
      id: p.id,
      name: str(p.name, 100),
      color: Format.safeColor(p.color),
      description: str(p.description),
      createdAt: str(p.createdAt, 40) || new Date().toISOString(),
      updatedAt: str(p.updatedAt, 40) || new Date().toISOString(),
    };
  }

  function cleanDay(d) {
    if (!d || !idOk(d.id) || !str(d.name).trim() || !DATE.test(d.start)) return null;
    return {
      id: d.id,
      name: str(d.name, 100),
      type: oneOf(d.type, Object.keys(Format.DAY_TYPES), 'holiday'),
      start: d.start,
      end: DATE.test(d.end) && d.end > d.start ? d.end : null,
      yearly: !!d.yearly,
      createdAt: str(d.createdAt, 40) || new Date().toISOString(),
      updatedAt: str(d.updatedAt, 40) || new Date().toISOString(),
    };
  }

  // Parse and sanitize an imported backup. Throws an Error with a Thai message.
  function parseJson(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง');
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) {
      throw new Error('ไม่พบข้อมูลงานในไฟล์ (ไม่ใช่ไฟล์สำรองของ My Calendar)');
    }
    const keep = (list, fn) => (Array.isArray(list) ? list.map(fn).filter(Boolean) : []);
    const data = {
      tasks: keep(raw.tasks, cleanTask),
      plans: keep(raw.plans, cleanPlan),
      days: keep(raw.days, cleanDay),
      settings: Array.isArray(raw.settings?.weekendDays)
        ? { weekendDays: raw.settings.weekendDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) }
        : null,
    };
    const planIds = new Set(data.plans.map((p) => p.id));
    data.skipped = (raw.tasks.length - data.tasks.length) +
      (Array.isArray(raw.plans) ? raw.plans.length - data.plans.length : 0) +
      (Array.isArray(raw.days) ? raw.days.length - data.days.length : 0);
    data.unknownPlans = data.tasks.filter((t) => t.planId && !planIds.has(t.planId)).length;
    return data;
  }

  // ---------- iCalendar (.ics) ----------

  const icsText = (s) => String(s || '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsDate = (d) => d.replace(/-/g, '');
  const icsDateTime = (dt) => dt.replace(/[-:]/g, '') + '00';

  // Fold lines to 75 octets without splitting a UTF-8 character (RFC 5545 §3.1).
  function fold(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const parts = [];
    let current = '';
    let bytes = 0;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (bytes + n > (parts.length ? 74 : 75)) {
        parts.push(current);
        current = '';
        bytes = 0;
      }
      current += ch;
      bytes += n;
    }
    parts.push(current);
    return parts.join('\r\n ');
  }

  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  function taskEvent(task, plan, ctx, stamp) {
    const lines = ['BEGIN:VEVENT', `UID:${task.id}@my-calendar`, `DTSTAMP:${stamp}`];
    if (task.allDay) {
      const end = DateUtil.addDays(task.end || task.start, 1);
      lines.push(`DTSTART;VALUE=DATE:${icsDate(task.start)}`, `DTEND;VALUE=DATE:${icsDate(end)}`);
    } else {
      // Floating local time: shown at the same clock time in the importing calendar.
      // No end time: one hour, like the calendar view. ("YYYY-MM-DDTHH:mm" parses as local time.)
      const end = task.end || DateUtil.fmtDateTime(new Date(new Date(task.start).getTime() + 3600000));
      lines.push(`DTSTART:${icsDateTime(task.start)}`, `DTEND:${icsDateTime(end)}`);
    }
    lines.push(`SUMMARY:${icsText(task.title)}`);
    const desc = [
      task.description,
      plan ? `แผนงาน: ${plan.name}` : '',
      `สถานะ: ${Format.STATUS_LABELS[task.status]} (${task.progress || 0}%)`,
      ...(task.checklist || []).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`),
    ].filter(Boolean).join('\n');
    lines.push(`DESCRIPTION:${icsText(desc)}`);
    if (plan) lines.push(`CATEGORIES:${icsText(plan.name)}`);

    if (Tasks.isRecurring(task)) {
      const r = task.repeat;
      let rule = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${Math.max(1, Number(r.interval) || 1)}`;
      if (r.freq === 'weekly') rule += `;BYDAY=${Recurrence.weekdaysOf(task).map((d) => BYDAY[d]).join(',')}`;
      if (r.until) rule += `;UNTIL=${task.allDay ? icsDate(r.until) : icsDate(r.until) + 'T235959'}`;
      lines.push(rule);
      // Days skipped for holidays become exceptions (computed up to 2 years ahead when open-ended).
      const until = r.until || DateUtil.addDays(Tasks.today(), 730);
      const skipped = Recurrence.skippedDates(task, task.start.slice(0, 10), until, ctx);
      if (skipped.length) {
        lines.push(task.allDay
          ? `EXDATE;VALUE=DATE:${skipped.map(icsDate).join(',')}`
          : `EXDATE:${skipped.map((d) => icsDateTime(d + task.start.slice(10))).join(',')}`);
      }
    }
    lines.push('END:VEVENT');
    return lines;
  }

  function dayEvent(day, stamp) {
    const type = Format.dayType(day.type);
    const lines = [
      'BEGIN:VEVENT',
      `UID:day-${day.id}@my-calendar`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(day.start)}`,
      `DTEND;VALUE=DATE:${icsDate(DateUtil.addDays(day.end || day.start, 1))}`,
      `SUMMARY:${icsText(`[${type.label}] ${day.name}`)}`,
      `CATEGORIES:${icsText(type.label)}`,
      'TRANSP:TRANSPARENT',
    ];
    if (day.yearly) lines.push('RRULE:FREQ=YEARLY');
    lines.push('END:VEVENT');
    return lines;
  }

  // ctx = { days, weekendDays }
  function buildIcs({ tasks, plans, days, includeDays, ctx }) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//My Calendar//TH',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:My Calendar',
      ...tasks.flatMap((t) => taskEvent(t, planById[t.planId], ctx, stamp)),
      ...(includeDays ? days.flatMap((d) => dayEvent(d, stamp)) : []),
      'END:VCALENDAR',
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function exportIcs(options) {
    download(`my-calendar-${Tasks.today()}.ics`, buildIcs(options), 'text/calendar');
  }

  return { exportJson, parseJson, buildIcs, exportIcs };
})();
