// Kanban board: one column per status, cards can be dragged between columns.
const BoardView = (() => {
  const COLUMNS = ['todo', 'doing', 'done'];

  let root = null;
  let handlers = {};
  let ctx = { days: [], weekendDays: [0, 6] };

  function cardHtml(task, plan) {
    const esc = Format.escapeHtml;
    const priorityColor = Format.PRIORITY_COLORS[task.priority] || Format.PRIORITY_COLORS.normal;
    const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
    const overdue = Tasks.isOverdue(task);
    const recurring = Tasks.isRecurring(task);
    const next = recurring ? Recurrence.next(task, ctx) : null;
    const checklist = task.checklist || [];
    const checked = checklist.filter((i) => i.done).length;
    let meta = esc(Format.taskRange(task));
    if (recurring) meta = `↻ ${esc(Recurrence.describe(task))}<br>${next ? 'ครั้งถัดไป ' + Format.shortDate(next) : 'สิ้นสุดแล้ว'}`;
    return `
      <article class="card" draggable="true" data-id="${esc(task.id)}" data-tip="${esc(task.id)}" tabindex="0"
               style="border-left-color:${Format.taskColor(task, plan)}">
        <div class="card-title">
          <span class="dot" style="background:${priorityColor}"></span>
          ${esc(task.title)}
        </div>
        <div class="card-meta${overdue ? ' overdue' : ''}">${meta}${overdue ? ' · เลยกำหนด' : ''}</div>
        <div class="chips">
          ${plan ? `<span class="chip"><span class="dot" style="background:${Format.safeColor(plan.color)}"></span>${esc(plan.name)}</span>` : ''}
          ${checklist.length ? `<span class="chip${checked === checklist.length ? ' chip-ok' : ''}">☑ ${checked}/${checklist.length}</span>` : ''}
          ${(task.dependsOn || []).length ? `<span class="chip">⛓ ${task.dependsOn.length}</span>` : ''}
        </div>
        <div class="progress"><div style="width:${progress}%"></div></div>
      </article>`;
  }

  // companyCalendar: { days, weekendDays }, used for the next occurrence of recurring tasks.
  function render(tasks, plans, companyCalendar) {
    ctx = companyCalendar;
    const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
    const sorted = tasks.slice().sort((a, b) => a.start.localeCompare(b.start));

    root.innerHTML = COLUMNS.map((status) => {
      const items = sorted.filter((t) => t.status === status);
      return `
        <section class="column" data-status="${status}">
          <header class="column-head">
            <h2>${Format.STATUS_LABELS[status]} <span class="count">${items.length}</span></h2>
            <button type="button" class="btn btn-icon" data-add="${status}" aria-label="เพิ่มงาน">+</button>
          </header>
          <div class="column-body">
            ${items.map((t) => cardHtml(t, planById[t.planId])).join('') || '<p class="empty">ไม่มีงาน</p>'}
          </div>
        </section>`;
    }).join('');
  }

  // handlers: onOpen(id), onAdd(status), onStatusChange(id, status)
  function init(el, h) {
    root = el;
    handlers = h;

    root.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) return handlers.onAdd(add.dataset.add);
      const card = e.target.closest('.card');
      if (card) handlers.onOpen(card.dataset.id);
    });

    root.addEventListener('keydown', (e) => {
      const card = e.target.closest('.card');
      if (card && e.key === 'Enter') handlers.onOpen(card.dataset.id);
    });

    root.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    root.addEventListener('dragend', (e) => {
      e.target.closest('.card')?.classList.remove('dragging');
      root.querySelectorAll('.drop-target').forEach((c) => c.classList.remove('drop-target'));
    });
    root.addEventListener('dragover', (e) => {
      const col = e.target.closest('.column');
      if (!col) return;
      e.preventDefault();
      root.querySelectorAll('.drop-target').forEach((c) => c !== col && c.classList.remove('drop-target'));
      col.classList.add('drop-target');
    });
    root.addEventListener('drop', (e) => {
      const col = e.target.closest('.column');
      const id = e.dataTransfer.getData('text/plain');
      if (!col || !id) return;
      e.preventDefault();
      handlers.onStatusChange(id, col.dataset.status);
    });
  }

  return { init, render };
})();
