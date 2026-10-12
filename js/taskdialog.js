// Add / edit task dialog: dates, repeat, color, checklist, dependencies.
const TaskDialog = (() => {
  const $ = (sel) => document.querySelector(sel);
  const esc = Format.escapeHtml;
  // Monday-first, as on Thai office calendars.
  const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

  const dialog = $('#taskDialog');
  const form = $('#taskForm');
  const f = (name) => form.elements.namedItem(name);
  const formError = $('#formError');
  const dateHint = $('#dateHint');

  let opts = {};          // { companyCalendar(), onSaved() }
  let editingId = null;
  let occurrence = null;  // date of the occurrence the dialog was opened from
  let checklist = [];     // working copy: [{ id, text, done }]
  let deps = new Set();   // ids of tasks this one waits for

  const newItemId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- color ----------

  $('#colorSwatches').innerHTML =
    '<label class="swatch swatch-auto" title="อัตโนมัติ: ใช้สีของแผนงาน หรือสีตามความสำคัญ">' +
    '<input type="radio" name="colorChoice" value="auto"><span><i class="auto-dot"></i>อัตโนมัติ</span></label>' +
    Format.TASK_PALETTE.map((c) =>
      `<label class="swatch" title="${c}"><input type="radio" name="colorChoice" value="${c}">` +
      `<span style="background:${c}"></span></label>`).join('') +
    '<label class="swatch swatch-custom" title="เลือกสีเอง"><input type="radio" name="colorChoice" value="custom">' +
    '<input type="color" name="customColor" value="#2f6fd6"></label>';

  function updateAutoSwatch() {
    const plan = Storage.getPlan(f('planId').value);
    form.querySelector('.auto-dot').style.background = Format.taskColor({ priority: f('priority').value }, plan);
  }

  // Note: a radio group can't be set to "" (browsers ignore it), hence the "auto" value.
  function setColorChoice(color) {
    const palette = Format.TASK_PALETTE.map((c) => c.toLowerCase());
    if (!Format.isColor(color)) {
      f('colorChoice').value = 'auto';
    } else if (palette.includes(color.toLowerCase())) {
      f('colorChoice').value = Format.TASK_PALETTE[palette.indexOf(color.toLowerCase())];
    } else {
      f('colorChoice').value = 'custom';
      f('customColor').value = color;
    }
  }

  function readColorChoice() {
    const choice = f('colorChoice').value;
    if (choice === 'custom') return f('customColor').value;
    return Format.isColor(choice) ? choice : null;
  }

  // ---------- repeat ----------

  $('#repeatWeekdays').innerHTML = WEEKDAY_ORDER.map((d) =>
    `<label class="check weekday"><input type="checkbox" name="repeatWeekday" value="${d}"> ${Recurrence.WEEKDAY_SHORT[d]}</label>`).join('');

  const weekdayBoxes = () => [...form.querySelectorAll('input[name="repeatWeekday"]')];

  function syncRepeat() {
    const freq = f('repeatFreq').value;
    form.dataset.repeat = freq;
    $('#repeatUnit').textContent = { daily: 'วัน', weekly: 'สัปดาห์', monthly: 'เดือน', yearly: 'ปี' }[freq] || '';
    // Weekly needs at least one day: default to the start date's weekday.
    if (freq === 'weekly' && !weekdayBoxes().some((b) => b.checked) && f('startDate').value) {
      const wd = DateUtil.parseDate(f('startDate').value).getDay();
      weekdayBoxes().find((b) => Number(b.value) === wd).checked = true;
    }
    $('#depsBox').hidden = !!freq; // recurring tasks are not part of the Gantt
  }

  function setRepeat(repeat, start) {
    f('repeatFreq').value = repeat?.freq || '';
    f('repeatInterval').value = repeat?.interval || 1;
    f('repeatUntil').value = repeat?.until || '';
    f('repeatSkipOff').checked = !!repeat?.skipOff;
    const days = repeat?.freq === 'weekly' && repeat.weekdays?.length
      ? repeat.weekdays
      : (start ? [DateUtil.parseDate(start).getDay()] : []);
    weekdayBoxes().forEach((b) => { b.checked = repeat?.freq === 'weekly' && days.includes(Number(b.value)); });
    syncRepeat();
  }

  function readRepeat(startDate) {
    const freq = f('repeatFreq').value;
    if (!freq) return { repeat: null };
    const until = f('repeatUntil').value || null;
    if (until && until < startDate) return { error: 'วันสิ้นสุดการทำซ้ำต้องไม่ก่อนวันเริ่ม' };
    const weekdays = weekdayBoxes().filter((b) => b.checked).map((b) => Number(b.value));
    if (freq === 'weekly' && !weekdays.length) return { error: 'กรุณาเลือกวันในสัปดาห์ที่ทำซ้ำ' };
    return {
      repeat: {
        freq,
        interval: Math.max(1, Math.min(99, Number(f('repeatInterval').value) || 1)),
        weekdays: freq === 'weekly' ? weekdays : [],
        until,
        skipOff: f('repeatSkipOff').checked,
      },
    };
  }

  // ---------- checklist ----------

  const checklistEl = $('#checklist');

  function renderChecklist() {
    checklistEl.innerHTML = checklist.map((item, i) => `
      <li data-i="${i}" class="${item.done ? 'is-checked' : ''}">
        <input type="checkbox" ${item.done ? 'checked' : ''} aria-label="ทำแล้ว">
        <input type="text" class="checklist-text" value="${esc(item.text)}" maxlength="300" aria-label="รายการ">
        <button type="button" class="btn-x" aria-label="ลบรายการ">×</button>
      </li>`).join('');
    syncChecklistProgress();
  }

  // With a checklist, progress is computed from it and the slider is locked.
  function syncChecklistProgress() {
    const pct = Tasks.checklistProgress(checklist);
    const locked = pct !== null;
    f('progress').disabled = locked;
    $('#progressAuto').hidden = !locked;
    if (locked) {
      f('progress').value = pct;
      f('status').value = Tasks.syncStatusProgress({ status: f('status').value, progress: pct }, 'progress').status;
    }
    syncProgressLabel();
  }

  function addChecklistItem() {
    const input = $('#checklistNew');
    const text = input.value.trim();
    if (!text) return;
    checklist.push({ id: newItemId(), text, done: false });
    input.value = '';
    renderChecklist();
    input.focus();
  }

  checklistEl.addEventListener('change', (e) => {
    const li = e.target.closest('li');
    if (!li || e.target.type !== 'checkbox') return;
    checklist[Number(li.dataset.i)].done = e.target.checked;
    li.classList.toggle('is-checked', e.target.checked);
    syncChecklistProgress();
  });
  checklistEl.addEventListener('input', (e) => {
    const li = e.target.closest('li');
    if (li && e.target.classList.contains('checklist-text')) checklist[Number(li.dataset.i)].text = e.target.value;
  });
  checklistEl.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li || !e.target.classList.contains('btn-x')) return;
    checklist.splice(Number(li.dataset.i), 1);
    renderChecklist();
  });
  // Enter inside the checklist must not submit the whole form.
  checklistEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  $('#checklistNew').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addChecklistItem();
  });
  $('#btnChecklistAdd').addEventListener('click', addChecklistItem);

  // ---------- dependencies ----------

  const depsList = $('#depsList');

  function renderDeps() {
    const all = Storage.getTasks();
    // Exclude itself, recurring tasks, and tasks waiting on this one (would make a loop).
    const excluded = editingId ? Tasks.dependents(editingId, all) : new Set();
    if (editingId) excluded.add(editingId);
    const q = $('#depsSearch').value;
    const planById = Object.fromEntries(Storage.getPlans().map((p) => [p.id, p]));
    const candidates = all
      .filter((t) => !excluded.has(t.id) && !Tasks.isRecurring(t))
      .filter((t) => deps.has(t.id) || Tasks.matchesSearch(t, q))
      .sort((a, b) => a.start.localeCompare(b.start));
    depsList.innerHTML = candidates.map((t) => `
      <li>
        <label class="check">
          <input type="checkbox" value="${esc(t.id)}" ${deps.has(t.id) ? 'checked' : ''}>
          <span class="dot" style="background:${Format.taskColor(t, planById[t.planId])}"></span>
          <span>${esc(t.title)} <small>${esc(Format.taskRange(t))}</small></span>
        </label>
      </li>`).join('') || '<li class="empty">ไม่มีงานให้เลือก</li>';
    $('#depsCount').textContent = deps.size ? `(${deps.size})` : '';
  }

  depsList.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) deps.add(e.target.value);
    else deps.delete(e.target.value);
    $('#depsCount').textContent = deps.size ? `(${deps.size})` : '';
    updateDateHint();
  });
  $('#depsSearch').addEventListener('input', renderDeps);

  // ---------- date hint ----------

  // Working days in the chosen range, holidays inside it, and unfinished prerequisites.
  function updateDateHint() {
    const start = f('startDate').value;
    const end = f('endDate').value || start;
    const { days, weekendDays } = opts.companyCalendar();
    const sum = SpecialDays.summarize(start, end, days, weekendDays);
    if (!sum) {
      dateHint.hidden = true;
      return;
    }
    const startOff = weekendDays.includes(DateUtil.parseDate(start).getDay()) || sum.holidays[0]?.date === start;
    const parts = [`${sum.working} วันทำงาน`];
    if (startOff) parts.push('วันเริ่มตรงกับวันหยุด');
    if (sum.holidays.length) {
      const list = sum.holidays.slice(0, 3)
        .map((h) => `${esc(h.names.join(', '))} (${Format.shortDate(h.date)})`).join(', ');
      const more = sum.holidays.length > 3 ? ` และอีก ${sum.holidays.length - 3} วัน` : '';
      parts.push(`มีวันหยุด: ${list}${more}`);
    }
    const blocking = f('repeatFreq').value ? [] :
      Tasks.blockingDependencies({ start, dependsOn: [...deps] }, Storage.getTasks());
    if (blocking.length) {
      parts.push('เริ่มก่อนงานที่ต้องรอจะเสร็จ: ' +
        blocking.map((t) => `${esc(t.title)} (เสร็จ ${Format.shortDate(Tasks.endDate(t))})`).join(', '));
    }
    dateHint.innerHTML = parts.join(' · ');
    dateHint.classList.toggle('warn', startOff || sum.holidays.length > 0 || blocking.length > 0);
    dateHint.hidden = false;
  }

  // ---------- open / read / save ----------

  function syncAllDay() {
    form.classList.toggle('all-day', f('allDay').checked);
  }

  function syncProgressLabel() {
    $('#progressOut').textContent = `${f('progress').value}%`;
  }

  // options: { occurrence: 'YYYY-MM-DD' } when opened from one occurrence of a recurring task
  function open(task, options = {}) {
    editingId = task.id || null;
    occurrence = Tasks.isRecurring(task) ? options.occurrence || null : null;
    checklist = (task.checklist || []).map((i) => ({ ...i }));
    deps = new Set(task.dependsOn || []);

    $('#dialogTitle').textContent = editingId ? 'แก้ไขงาน' : 'งานใหม่';
    $('#btnDelete').hidden = !editingId;
    formError.hidden = true;

    f('planId').innerHTML = '<option value="">— ไม่มี —</option>' +
      Storage.getPlans().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');

    f('title').value = task.title || '';
    f('planId').value = task.planId || '';
    f('allDay').checked = !!task.allDay;
    f('startDate').value = task.start ? task.start.slice(0, 10) : '';
    f('startTime').value = task.start && !task.allDay ? task.start.slice(11, 16) : '';
    f('endDate').value = task.end ? task.end.slice(0, 10) : '';
    f('endTime').value = task.end && !task.allDay ? task.end.slice(11, 16) : '';
    f('priority').value = task.priority || 'normal';
    f('status').value = task.status || 'todo';
    f('progress').value = task.progress || 0;
    f('description').value = task.description || '';
    $('#checklistNew').value = '';
    $('#depsSearch').value = '';

    $('#occurrenceRow').hidden = !occurrence;
    if (occurrence) {
      $('#occurrenceText').textContent = `ครั้งวันที่ ${Format.shortDate(occurrence)} ทำเสร็จแล้ว`;
      f('occurrenceDone').checked = (task.doneDates || []).includes(occurrence);
    }

    setColorChoice(task.color);
    setRepeat(task.repeat, f('startDate').value);
    syncAllDay();
    renderChecklist();
    renderDeps();
    $('#depsBox').open = deps.size > 0;
    updateAutoSwatch();
    updateDateHint();

    dialog.showModal();
    f('title').focus();
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
    return null;
  }

  // Returns task data, or null after showing a validation error.
  function read() {
    const title = f('title').value.trim();
    const allDay = f('allDay').checked;
    const startDate = f('startDate').value;
    const startTime = f('startTime').value;
    const endDate = f('endDate').value;
    const endTime = f('endTime').value;

    if (!title) return showError('กรุณาใส่ชื่องาน');
    if (!startDate) return showError('กรุณาเลือกวันเริ่ม');
    if (!allDay && !startTime) return showError('กรุณาระบุเวลาเริ่ม หรือเลือก "ทั้งวัน"');

    let start, end = null;
    if (allDay) {
      start = startDate;
      if (endDate && endDate !== startDate) end = endDate;
    } else {
      start = `${startDate}T${startTime}`;
      if (endDate || endTime) end = `${endDate || startDate}T${endTime || startTime}`;
      if (end === start) end = null;
    }
    if (end && end < start) return showError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');

    const { repeat, error } = readRepeat(startDate);
    if (error) return showError(error);

    const items = checklist.map((i) => ({ ...i, text: i.text.trim() })).filter((i) => i.text);
    const data = {
      title,
      planId: f('planId').value || null,
      color: readColorChoice(),
      allDay,
      start,
      end,
      priority: f('priority').value,
      status: f('status').value,
      progress: Number(f('progress').value),
      description: f('description').value.trim(),
      checklist: items,
      dependsOn: repeat ? [] : [...deps],
      repeat,
    };

    if (occurrence) {
      const existing = Storage.getTask(editingId)?.doneDates || [];
      const doneDates = new Set(existing);
      if (f('occurrenceDone').checked) doneDates.add(occurrence);
      else doneDates.delete(occurrence);
      data.doneDates = [...doneDates].sort();
    }
    return data;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = read();
    if (!data) return;
    if (editingId) Storage.updateTask(editingId, data);
    else Storage.addTask(data);
    dialog.close();
    opts.onSaved();
  });

  $('#btnDelete').addEventListener('click', () => {
    const task = Storage.getTask(editingId);
    if (!task) return;
    const msg = Tasks.isRecurring(task) ? `ลบงานซ้ำ "${task.title}" ทั้งชุด?` : `ลบงาน "${task.title}" ?`;
    if (!confirm(msg)) return;
    Storage.deleteTask(editingId);
    dialog.close();
    opts.onSaved();
  });

  // Keep status, progress and checklist consistent while editing.
  f('status').addEventListener('change', () => {
    if (f('status').value === 'done' && checklist.length) {
      checklist.forEach((i) => { i.done = true; });
      renderChecklist();
    }
    const d = Tasks.syncStatusProgress({ status: f('status').value, progress: Number(f('progress').value) }, 'status');
    f('progress').value = d.progress;
    syncProgressLabel();
  });
  f('progress').addEventListener('input', () => {
    const d = Tasks.syncStatusProgress({ status: f('status').value, progress: Number(f('progress').value) }, 'progress');
    f('status').value = d.status;
    syncProgressLabel();
  });

  $('#btnCancel').addEventListener('click', () => dialog.close());
  UI.closeOnBackdrop(dialog);
  f('allDay').addEventListener('change', syncAllDay);
  f('planId').addEventListener('change', updateAutoSwatch);
  f('priority').addEventListener('change', updateAutoSwatch);
  f('startDate').addEventListener('change', () => { syncRepeat(); updateDateHint(); });
  f('endDate').addEventListener('change', updateDateHint);
  f('repeatFreq').addEventListener('change', () => { syncRepeat(); updateDateHint(); });
  // Picking a custom color selects the "custom" swatch.
  f('customColor').addEventListener('input', () => { f('colorChoice').value = 'custom'; });
  f('customColor').addEventListener('click', () => { f('colorChoice').value = 'custom'; });

  // options: { companyCalendar: () => ({ days, weekendDays }), onSaved: () => void }
  function init(options) {
    opts = options;
  }

  return { init, open };
})();
