// Hover preview of a task: any element with data-tip="<taskId>" (and optional
// data-tip-occurrence="YYYY-MM-DD") shows the task's details after a short pause.
// Mouse only: touch screens tap to open the task instead.
const Tooltip = (() => {
  const SHOW_DELAY = 300;
  const MAX_DESCRIPTION = 400;
  const MAX_CHECKLIST = 8;

  let tip = null;
  let target = null;
  let timer = null;
  let lookup = () => null;

  const esc = Format.escapeHtml;

  function contentHtml(task, plan, occurrence) {
    const color = Format.taskColor(task, plan);
    const recurring = Tasks.isRecurring(task);
    const done = occurrence ? (task.doneDates || []).includes(occurrence) : task.status === 'done';
    const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));

    let when = Format.taskRange(task);
    if (occurrence) {
      const t = Recurrence.occurrenceTimes(task, occurrence);
      when = Format.taskRange({ ...task, start: t.start, end: t.end });
    }

    const rows = [`<div class="tip-meta">${esc(when)}</div>`];
    if (recurring) rows.push(`<div class="tip-meta">↻ ${esc(Recurrence.describe(task))}</div>`);

    const status = occurrence
      ? (done ? 'ครั้งนี้เสร็จแล้ว' : 'ครั้งนี้ยังไม่เสร็จ')
      : `${Format.STATUS_LABELS[task.status] || ''} · ${progress}%`;
    rows.push(`<div class="tip-meta">${esc(status)} · ความสำคัญ${esc(Format.PRIORITY_LABELS[task.priority] || '')}` +
      `${plan ? ` · ${esc(plan.name)}` : ''}</div>`);
    if (!occurrence && Tasks.isOverdue(task)) rows.push('<div class="tip-meta tip-overdue">เลยกำหนด</div>');

    const description = (task.description || '').trim();
    if (description) {
      const cut = description.length > MAX_DESCRIPTION ? description.slice(0, MAX_DESCRIPTION) + '…' : description;
      rows.push(`<div class="tip-description">${esc(cut)}</div>`);
    }

    const checklist = task.checklist || [];
    if (checklist.length) {
      const checked = checklist.filter((i) => i.done).length;
      const items = checklist.slice(0, MAX_CHECKLIST).map((i) =>
        `<li class="${i.done ? 'is-checked' : ''}">${i.done ? '☑' : '☐'} ${esc(i.text)}</li>`).join('');
      const more = checklist.length - MAX_CHECKLIST;
      rows.push(`<div class="tip-section">Checklist ${checked}/${checklist.length}</div><ul class="tip-checklist">${items}` +
        `${more > 0 ? `<li class="tip-more">และอีก ${more} รายการ</li>` : ''}</ul>`);
    }

    const all = lookup.allTasks();
    const deps = (task.dependsOn || []).map((id) => all.find((t) => t.id === id)).filter(Boolean);
    if (deps.length) {
      const blocking = new Set(Tasks.blockingDependencies(task, all).map((t) => t.id));
      rows.push(`<div class="tip-section">ต้องรองานก่อนหน้า</div><ul class="tip-checklist">` +
        deps.map((t) => `<li class="${t.status === 'done' ? 'is-checked' : ''}${blocking.has(t.id) ? ' tip-overdue' : ''}">` +
          `${t.status === 'done' ? '☑' : '⛓'} ${esc(t.title)}${blocking.has(t.id) ? ' (ทับช่วงเวลา)' : ''}</li>`).join('') + '</ul>');
    }

    return `
      <div class="tip-title"><span class="dot" style="background:${color}"></span>${recurring ? '↻ ' : ''}${esc(task.title)}</div>
      ${rows.join('')}`;
  }

  function place(el) {
    const r = el.getBoundingClientRect();
    const gap = 8;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let left = Math.min(Math.max(gap, r.left), vw - w - gap);
    // Below the element if it fits, else above, else wherever has more room.
    let top = r.bottom + gap;
    if (top + h > vh - gap) top = r.top - h - gap >= gap ? r.top - h - gap : Math.max(gap, vh - h - gap);
    tip.style.left = `${Math.max(gap, left)}px`;
    tip.style.top = `${top}px`;
  }

  function show(el) {
    const found = lookup.task(el.dataset.tip);
    if (!found) return;
    tip.innerHTML = contentHtml(found.task, found.plan, el.dataset.tipOccurrence || null);
    tip.hidden = false;
    place(el);
  }

  function hide() {
    clearTimeout(timer);
    timer = null;
    target = null;
    if (tip) tip.hidden = true;
  }

  // l: { task(id) -> {task, plan}|null, allTasks() -> tasks }
  function init(l) {
    lookup = l;
    tip = document.createElement('div');
    tip.className = 'task-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);

    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest?.('[data-tip]');
      if (el === target) return;
      hide();
      if (!el) return;
      target = el;
      timer = setTimeout(() => {
        // FullCalendar may have re-rendered the element while we waited.
        if (target === el && el.isConnected) show(el);
      }, SHOW_DELAY);
    });
    document.addEventListener('pointerout', (e) => {
      if (target && !target.contains(e.relatedTarget)) hide();
    });
    // Get out of the way of clicks, drags, scrolling and typing.
    for (const type of ['pointerdown', 'dragstart', 'keydown', 'wheel']) {
      document.addEventListener(type, hide, true);
    }
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
  }

  return { init, hide };
})();
