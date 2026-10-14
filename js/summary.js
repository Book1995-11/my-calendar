// Summary tab: what needs attention now, plan progress, upcoming days off.
const SummaryView = (() => {
  let root = null;
  let handlers = {};

  const esc = Format.escapeHtml;
  const longDate = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // One row per task, or per occurrence for recurring tasks. Done items are skipped.
  function itemsBetween(tasks, from, to, ctx) {
    const items = [];
    for (const t of tasks) {
      if (Tasks.isRecurring(t)) {
        for (const d of Recurrence.occurrences(t, from, to, ctx)) {
          if (!(t.doneDates || []).includes(d)) items.push({ task: t, date: d, occurrence: d });
        }
      } else if (t.status !== 'done' && t.start.slice(0, 10) <= to && Tasks.endDate(t) >= from) {
        items.push({ task: t, date: t.start.slice(0, 10), occurrence: null });
      }
    }
    return items.sort((a, b) => a.date.localeCompare(b.date) || a.task.title.localeCompare(b.task.title));
  }

  function itemHtml({ task, date, occurrence }, planById, showDate) {
    const color = Format.taskColor(task, planById[task.planId]);
    const plan = planById[task.planId];
    const when = occurrence
      ? Format.shortDate(occurrence)
      : Format.taskRange(task);
    return `
      <li>
        <button type="button" class="summary-item" data-id="${esc(task.id)}" data-occurrence="${occurrence || ''}"
                data-tip="${esc(task.id)}" data-tip-occurrence="${occurrence || ''}">
          <span class="dot" style="background:${color}"></span>
          <span class="summary-title">${occurrence ? '↻ ' : ''}${esc(task.title)}</span>
          <span class="summary-meta">${showDate ? esc(when) : ''}${plan ? `${showDate ? ' · ' : ''}${esc(plan.name)}` : ''}</span>
        </button>
      </li>`;
  }

  function card(title, items, planById, { tone = '', empty = 'ไม่มี', showDate = true, limit = 8 } = {}) {
    const shown = items.slice(0, limit);
    const more = items.length - shown.length;
    return `
      <section class="summary-card ${tone}">
        <header><h2>${title}</h2><span class="summary-count">${items.length}</span></header>
        ${shown.length
          ? `<ul>${shown.map((i) => itemHtml(i, planById, showDate)).join('')}</ul>`
          : `<p class="empty">${empty}</p>`}
        ${more > 0 ? `<p class="summary-more">และอีก ${more} รายการ</p>` : ''}
      </section>`;
  }

  function planCard(tasks, plans) {
    const rows = [...plans, null].map((plan) => {
      const list = tasks.filter((t) => (plan ? t.planId === plan.id : !t.planId) && !Tasks.isRecurring(t));
      if (!list.length) return '';
      const done = list.filter((t) => t.status === 'done').length;
      const avg = Math.round(list.reduce((sum, t) => sum + (Number(t.progress) || 0), 0) / list.length);
      const color = plan ? Format.safeColor(plan.color) : 'var(--muted)';
      return `
        <li class="plan-progress">
          <div class="plan-progress-head">
            <span><span class="dot" style="background:${color}"></span> ${plan ? esc(plan.name) : 'ไม่มีแผน'}</span>
            <span class="summary-meta">เสร็จ ${done}/${list.length} · ${avg}%</span>
          </div>
          <div class="progress"><div style="width:${avg}%;background:${color}"></div></div>
        </li>`;
    }).join('');
    return `
      <section class="summary-card">
        <header><h2>ความคืบหน้าตามแผนงาน</h2></header>
        ${rows ? `<ul>${rows}</ul>` : '<p class="empty">ยังไม่มีงาน</p>'}
      </section>`;
  }

  function daysCard(ctx, today) {
    const upcoming = SpecialDays.occurrences(ctx.days, today, DateUtil.addDays(today, 90)).slice(0, 6);
    const rows = upcoming.map((o) => {
      const type = Format.dayType(o.day.type);
      const range = Format.shortDate(o.start) + (o.end !== o.start ? ' – ' + Format.shortDate(o.end) : '');
      return `
        <li class="summary-day">
          <span class="dot" style="background:${type.color}"></span>
          <span class="summary-title">${esc(o.day.name)}</span>
          <span class="summary-meta">${range}</span>
        </li>`;
    }).join('');
    return `
      <section class="summary-card">
        <header><h2>วันหยุด / วันพิเศษ ที่จะมาถึง</h2></header>
        ${rows ? `<ul>${rows}</ul>` : '<p class="empty">ไม่มีใน 90 วันข้างหน้า</p>'}
      </section>`;
  }

  // ctx = { days, weekendDays }
  function render(tasks, plans, ctx) {
    const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
    const today = Tasks.today();
    const overdue = tasks.filter(Tasks.isOverdue)
      .map((t) => ({ task: t, date: Tasks.endDate(t), occurrence: null }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const todayItems = itemsBetween(tasks, today, today, ctx);
    const week = itemsBetween(tasks, DateUtil.addDays(today, 1), DateUtil.addDays(today, 7), ctx);
    const doing = tasks.filter((t) => t.status === 'doing' && !Tasks.isRecurring(t))
      .map((t) => ({ task: t, date: t.start.slice(0, 10), occurrence: null }));

    root.innerHTML = `
      <p class="summary-date">${longDate.format(new Date())}</p>
      <div class="summary-grid">
        ${card('เลยกำหนด', overdue, planById, { tone: overdue.length ? 'tone-danger' : '', empty: 'ไม่มีงานเลยกำหนด' })}
        ${card('วันนี้', todayItems, planById, { tone: 'tone-primary', empty: 'วันนี้ว่าง' })}
        ${card('7 วันข้างหน้า', week, planById)}
        ${card('กำลังทำ', doing, planById, { empty: 'ไม่มีงานที่กำลังทำ' })}
        ${planCard(tasks, plans)}
        ${daysCard(ctx, today)}
      </div>`;
  }

  // handlers: onOpen(taskId, occurrence|null)
  function init(el, h) {
    root = el;
    handlers = h;
    root.addEventListener('click', (e) => {
      const item = e.target.closest('.summary-item');
      if (item) handlers.onOpen(item.dataset.id, item.dataset.occurrence || null);
    });
  }

  return { init, render };
})();
