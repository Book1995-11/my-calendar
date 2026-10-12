// Gantt timeline (Frappe Gantt). Bars use the task's color (see Format.taskColor).
// Timed tasks are shown as whole days. Special days are highlighted columns.
// Recurring tasks are routine work, not project steps, so they are left out.
const GanttView = (() => {
  const dayFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

  let root = null;
  let emptyEl = null;
  let handlers = {};
  let gantt = null;
  let mode = 'Day';
  let company = { days: [], weekendDays: [0, 6] };

  function toGanttTask(task, plan, dependencies) {
    const color = Format.taskColor(task, plan);
    return {
      id: task.id,
      name: Format.escapeHtml(task.title), // Frappe renders the name as HTML
      start: task.start.slice(0, 10),
      end: (task.end || task.start).slice(0, 10),
      progress: Number(task.progress) || 0,
      color: color + '59', // ~35% opacity for the unfinished part
      color_progress: color,
      custom_class: task.status === 'done' ? 'is-done' : '',
      dependencies,
      _task: task,
      _plan: plan,
    };
  }

  function popup(ctx) {
    const esc = Format.escapeHtml;
    const { _task: task, _plan: plan } = ctx.task;
    ctx.set_title(esc(task.title));
    ctx.set_subtitle(plan ? esc(plan.name) : '');
    const end = (task.end || task.start).slice(0, 10);
    const sum = SpecialDays.summarize(task.start.slice(0, 10), end, company.days, company.weekendDays);
    ctx.set_details(
      `${esc(Format.taskRange(task))}${sum ? ` · ${sum.working} วันทำงาน` : ''}<br>` +
      `สถานะ: ${Format.STATUS_LABELS[task.status] || ''} · ความคืบหน้า ${Math.round(ctx.task.progress)}%`,
    );
    ctx.add_action('แก้ไข', (t) => handlers.onOpen(t.id));
  }

  // Sort by plan (in plan order), then by start date.
  function order(tasks, plans) {
    const rank = Object.fromEntries(plans.map((p, i) => [p.id, i]));
    const r = (t) => (t.planId in rank ? rank[t.planId] : plans.length);
    return tasks.slice().sort((a, b) => r(a) - r(b) || a.start.localeCompare(b.start));
  }

  // Frappe sizes its container to exactly the rows, so the horizontal
  // scrollbar hides the last row. Add room for it, and cap at the panel
  // height so the chart scrolls inside (keeping the date header sticky).
  function fitHeight() {
    const container = root.querySelector('.gantt-container');
    if (!container || !gantt) return;
    container.style.height = `${gantt.grid_height + 20}px`;
    container.style.maxHeight = '100%';
  }

  // Frappe's holidays option: { color: 'weekend' | [{ date, name }] }.
  function holidays(rows) {
    const result = { 'var(--g-weekend-highlight-color)': 'weekend' };
    const years = rows.flatMap((r) => [Number(r.start.slice(0, 4)), Number(r.end.slice(0, 4))]);
    const from = `${Math.min(...years) - 1}-01-01`;
    const to = `${Math.max(...years) + 1}-12-31`;
    for (const o of SpecialDays.occurrences(company.days, from, to)) {
      const color = Format.dayType(o.day.type).color + '40';
      result[color] = result[color] || [];
      for (let d = o.start; d <= o.end; d = DateUtil.addDays(d, 1)) {
        result[color].push({ date: d, name: o.day.name });
      }
    }
    return result;
  }

  // company: { days, weekendDays } — special days and weekly days off.
  function render(tasks, plans, companyCalendar) {
    company = companyCalendar;
    const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
    const shown = order(tasks.filter((t) => !Tasks.isRecurring(t)), plans);
    const deps = Tasks.acyclicDependencies(shown);
    const rows = shown.map((t) => toGanttTask(t, planById[t.planId], deps[t.id]));

    root.innerHTML = '';
    gantt = null;
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) return;

    gantt = new Gantt(root, rows, {
      language: 'th',
      view_mode: mode,
      today_button: false,
      view_mode_select: false,
      bar_height: 26,
      padding: 16,
      popup,
      holidays: holidays(rows),
      is_weekend: (d) => company.weekendDays.includes(d.getDay()),
      on_double_click: (t) => handlers.onOpen(t.id),
      on_date_change: (t, start, end) =>
        handlers.onDatesChanged(t.id, DateUtil.fmtDate(start), DateUtil.fmtDate(end)),
      on_progress_change: (t, progress) => handlers.onProgressChanged(t.id, Math.round(progress)),
    });
    fitHeight();
  }

  function setMode(m) {
    mode = m;
    if (gantt) {
      gantt.change_view_mode(m);
      fitHeight();
    }
  }

  function scrollToday() {
    if (gantt) gantt.scroll_current();
  }

  // handlers: onOpen(id), onDatesChanged(id, startDate, endDate), onProgressChanged(id, pct)
  function init(el, empty, h) {
    root = el;
    emptyEl = empty;
    handlers = h;
  }

  return { init, render, setMode, scrollToday, getMode: () => mode };
})();
