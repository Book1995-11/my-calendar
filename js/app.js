(() => {
  const PREF = {
    view: 'calendar.view',
    hideDone: 'calendar.hideDone',
    planFilter: 'calendar.planFilter',
    ganttMode: 'calendar.ganttMode',
  };
  const VIEWS = ['summary', 'calendar', 'board', 'gantt'];
  const NO_PLAN = '__none__';
  const PLAN_PALETTE = ['#2f6fd6', '#2e9e6b', '#d98a1f', '#8b5cf6', '#d64545', '#0f9fb5'];
  const BACKUP_REMIND_DAYS = 14;

  const $ = (sel) => document.querySelector(sel);
  const esc = Format.escapeHtml;
  const { pref } = UI;

  const hideDone = $('#hideDone');
  const planFilter = $('#planFilter');
  const search = $('#search');
  let view = 'calendar';

  // ---------- filtering & rendering ----------

  function filteredTasks({ includeDone }) {
    const pf = planFilter.value;
    return Storage.getTasks().filter((t) =>
      (pf === '' || (pf === NO_PLAN ? !t.planId : t.planId === pf)) &&
      (includeDone || !hideDone.checked || t.status !== 'done') &&
      Tasks.matchesSearch(t, search.value));
  }

  const companyCalendar = () => ({ days: Storage.getDays(), weekendDays: Storage.getSettings().weekendDays });

  function render() {
    const plans = Storage.getPlans();
    const ctx = companyCalendar();
    if (view === 'summary') SummaryView.render(filteredTasks({ includeDone: true }), plans, ctx);
    else if (view === 'calendar') CalendarView.setTasks(filteredTasks({ includeDone: false }), plans);
    else if (view === 'board') BoardView.render(filteredTasks({ includeDone: true }), plans, ctx);
    else GanttView.render(filteredTasks({ includeDone: false }), plans, ctx);
    updateBackupReminder();
  }

  function setView(name) {
    if (!VIEWS.includes(name)) name = 'calendar';
    view = name;
    pref.set(PREF.view, name);
    document.querySelectorAll('.tabs [data-view]').forEach((b) =>
      b.setAttribute('aria-selected', String(b.dataset.view === name)));
    document.querySelectorAll('.view').forEach((s) => { s.hidden = s.id !== `view-${name}`; });
    // The board and summary always include finished work, so the toggle doesn't apply there.
    hideDone.closest('label').hidden = name === 'board' || name === 'summary';
    if (name === 'calendar') CalendarView.updateSize();
    render();
  }

  function refreshPlanOptions() {
    const plans = Storage.getPlans();
    const current = planFilter.value || pref.get(PREF.planFilter) || '';
    planFilter.innerHTML =
      '<option value="">ทุกแผนงาน</option>' +
      plans.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') +
      `<option value="${NO_PLAN}">ไม่มีแผน</option>`;
    const valid = current === NO_PLAN || plans.some((p) => p.id === current);
    planFilter.value = valid ? current : '';
  }

  // Everything that depends on stored data, e.g. after an import or another tab's change.
  function refreshAll() {
    refreshPlanOptions();
    CalendarView.refreshCompanyCalendar();
    render();
  }

  // ---------- task dialog ----------

  TaskDialog.init({ companyCalendar, onSaved: render });

  function openTask(id, occurrence = null) {
    const task = Storage.getTask(id);
    if (task) TaskDialog.open(task, { occurrence });
  }

  // New task pre-filled with today's date and the current plan filter.
  function newTask(extra = {}) {
    const pf = planFilter.value;
    TaskDialog.open({
      allDay: true,
      start: Tasks.today(),
      planId: pf && pf !== NO_PLAN ? pf : null,
      ...extra,
    });
  }

  // ---------- plans dialog ----------

  const plansDialog = $('#plansDialog');
  const planForm = $('#planForm');
  const pf = (name) => planForm.elements.namedItem(name);
  const planList = $('#planList');
  const planError = $('#planError');
  let editingPlanId = null;

  function renderPlanList() {
    const plans = Storage.getPlans();
    const tasks = Storage.getTasks();
    planList.innerHTML = plans.map((p) => {
      const count = tasks.filter((t) => t.planId === p.id).length;
      const done = tasks.filter((t) => t.planId === p.id && t.status === 'done').length;
      return `
        <li data-id="${esc(p.id)}">
          <span class="dot dot-lg" style="background:${Format.safeColor(p.color)}"></span>
          <div class="plan-info">
            <strong>${esc(p.name)}</strong>
            <small>เสร็จ ${done}/${count} งาน${p.description ? ' · ' + esc(p.description) : ''}</small>
          </div>
          <button type="button" class="btn btn-small" data-action="edit">แก้ไข</button>
          <button type="button" class="btn btn-small btn-danger" data-action="delete">ลบ</button>
        </li>`;
    }).join('');
    $('#planEmpty').hidden = plans.length > 0;
  }

  function resetPlanForm() {
    editingPlanId = null;
    planForm.reset();
    pf('color').value = PLAN_PALETTE[Storage.getPlans().length % PLAN_PALETTE.length];
    $('#planFormTitle').textContent = 'เพิ่มแผนงาน';
    $('#btnPlanSave').textContent = 'เพิ่มแผน';
    $('#btnPlanCancelEdit').hidden = true;
    planError.hidden = true;
  }

  function editPlan(plan) {
    editingPlanId = plan.id;
    pf('name').value = plan.name;
    pf('color').value = Format.safeColor(plan.color);
    pf('description').value = plan.description || '';
    $('#planFormTitle').textContent = 'แก้ไขแผนงาน';
    $('#btnPlanSave').textContent = 'บันทึก';
    $('#btnPlanCancelEdit').hidden = false;
    planError.hidden = true;
    pf('name').focus();
  }

  function plansChanged() {
    renderPlanList();
    refreshPlanOptions();
    render();
  }

  planList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const plan = Storage.getPlan(btn.closest('li').dataset.id);
    if (!plan) return;
    if (btn.dataset.action === 'edit') return editPlan(plan);
    if (!confirm(`ลบแผน "${plan.name}" ?\nงานในแผนนี้จะไม่ถูกลบ แต่จะกลายเป็น "ไม่มีแผน"`)) return;
    Storage.deletePlan(plan.id);
    if (editingPlanId === plan.id) resetPlanForm();
    plansChanged();
  });

  planForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = pf('name').value.trim();
    if (!name) {
      planError.textContent = 'กรุณาใส่ชื่อแผน';
      planError.hidden = false;
      return;
    }
    const data = { name, color: pf('color').value, description: pf('description').value.trim() };
    if (editingPlanId) Storage.updatePlan(editingPlanId, data);
    else Storage.addPlan(data);
    resetPlanForm();
    plansChanged();
  });

  $('#btnPlanCancelEdit').addEventListener('click', resetPlanForm);
  $('#btnPlansClose').addEventListener('click', () => plansDialog.close());
  UI.closeOnBackdrop(plansDialog);

  $('#btnPlans').addEventListener('click', () => {
    resetPlanForm();
    renderPlanList();
    plansDialog.showModal();
  });

  // ---------- special days dialog ----------

  const daysDialog = $('#daysDialog');
  const dayForm = $('#dayForm');
  const df = (name) => dayForm.elements.namedItem(name);
  const dayList = $('#dayList');
  const dayError = $('#dayError');
  const weekendBox = $('#weekendDays');
  const WEEKDAYS = [[1, 'จ.'], [2, 'อ.'], [3, 'พ.'], [4, 'พฤ.'], [5, 'ศ.'], [6, 'ส.'], [0, 'อา.']];
  const fullDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  let editingDayId = null;

  df('type').innerHTML = Object.entries(Format.DAY_TYPES)
    .map(([value, t]) => `<option value="${value}">${t.label}</option>`).join('');

  weekendBox.innerHTML = WEEKDAYS.map(([d, label]) =>
    `<label class="check weekday"><input type="checkbox" value="${d}"> ${label}</label>`).join('');

  function renderWeekendBoxes() {
    const off = Storage.getSettings().weekendDays;
    weekendBox.querySelectorAll('input').forEach((i) => { i.checked = off.includes(Number(i.value)); });
  }

  function dayRangeText(day) {
    const fmt = (s) => (day.yearly ? Format.shortDate(s) : fullDate.format(DateUtil.parseDate(s)));
    const range = fmt(day.start) + (day.end ? ' – ' + fmt(day.end) : '');
    return day.yearly ? `ทุกปี · ${range}` : range;
  }

  function renderDayList() {
    // Yearly days sort by month/day, then one-off days by full date.
    const sortKey = (d) => (d.yearly ? '0-' + d.start.slice(5) : '1-' + d.start);
    const days = Storage.getDays().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    dayList.innerHTML = days.map((d) => {
      const type = Format.dayType(d.type);
      return `
        <li data-id="${esc(d.id)}">
          <span class="dot dot-lg" style="background:${type.color}"></span>
          <div class="plan-info">
            <strong>${esc(d.name)}</strong>
            <small>${type.label} · ${esc(dayRangeText(d))}</small>
          </div>
          <button type="button" class="btn btn-small" data-action="edit">แก้ไข</button>
          <button type="button" class="btn btn-small btn-danger" data-action="delete">ลบ</button>
        </li>`;
    }).join('');
    $('#dayEmpty').hidden = days.length > 0;
  }

  function resetDayForm() {
    editingDayId = null;
    dayForm.reset();
    $('#dayFormTitle').textContent = 'เพิ่มวันพิเศษ';
    $('#btnDaySave').textContent = 'เพิ่ม';
    $('#btnDayCancelEdit').hidden = true;
    dayError.hidden = true;
  }

  function editDay(day) {
    editingDayId = day.id;
    df('name').value = day.name;
    df('type').value = day.type;
    df('start').value = day.start;
    df('end').value = day.end || '';
    df('yearly').checked = !!day.yearly;
    $('#dayFormTitle').textContent = 'แก้ไขวันพิเศษ';
    $('#btnDaySave').textContent = 'บันทึก';
    $('#btnDayCancelEdit').hidden = false;
    dayError.hidden = true;
    df('name').focus();
  }

  function companyCalendarChanged() {
    renderDayList();
    CalendarView.refreshCompanyCalendar();
    render();
  }

  weekendBox.addEventListener('change', () => {
    const off = [...weekendBox.querySelectorAll('input:checked')].map((i) => Number(i.value));
    Storage.updateSettings({ weekendDays: off });
    companyCalendarChanged();
  });

  dayList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const day = Storage.getDay(btn.closest('li').dataset.id);
    if (!day) return;
    if (btn.dataset.action === 'edit') return editDay(day);
    if (!confirm(`ลบ "${day.name}" ?`)) return;
    Storage.deleteDay(day.id);
    if (editingDayId === day.id) resetDayForm();
    companyCalendarChanged();
  });

  dayForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = df('name').value.trim();
    const start = df('start').value;
    let end = df('end').value || null;
    const fail = (msg) => { dayError.textContent = msg; dayError.hidden = false; };
    if (!name) return fail('กรุณาใส่ชื่อ');
    if (!start) return fail('กรุณาเลือกวันเริ่ม');
    if (end && end < start) return fail('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    if (end === start) end = null;
    const data = { name, type: df('type').value, start, end, yearly: df('yearly').checked };
    if (editingDayId) Storage.updateDay(editingDayId, data);
    else Storage.addDay(data);
    resetDayForm();
    companyCalendarChanged();
  });

  $('#btnThaiHolidays').addEventListener('click', () => {
    const missing = SpecialDays.missingThaiHolidays(Storage.getDays(), new Date().getFullYear());
    if (!missing.length) return alert('มีวันหยุดราชการชุดนี้ครบแล้ว');
    const ok = confirm(
      `เพิ่มวันหยุดราชการที่วันที่ตายตัว ${missing.length} รายการ (ซ้ำทุกปี)?\n\n` +
      'วันหยุดทางจันทรคติ (มาฆบูชา วิสาขบูชา อาสาฬหบูชา เข้าพรรษา) วันที่เปลี่ยนทุกปี กรุณาเพิ่มเอง\n' +
      'แนะนำให้ตรวจกับประกาศวันหยุดของบริษัท แล้วลบวันที่บริษัทไม่ได้หยุดออก');
    if (!ok) return;
    missing.forEach((d) => Storage.addDay(d));
    companyCalendarChanged();
  });

  $('#btnDayCancelEdit').addEventListener('click', resetDayForm);
  $('#btnDaysClose').addEventListener('click', () => daysDialog.close());
  UI.closeOnBackdrop(daysDialog);

  $('#btnDays').addEventListener('click', () => {
    resetDayForm();
    renderWeekendBoxes();
    renderDayList();
    daysDialog.showModal();
  });

  // ---------- backup dialog ----------

  const backupDialog = $('#backupDialog');
  const importFile = $('#importFile');
  const importInfo = $('#importInfo');
  const relTime = new Intl.RelativeTimeFormat('th', { numeric: 'auto' });
  let pendingImport = null;

  function daysSinceBackup() {
    const last = Storage.getSettings().lastBackup;
    return last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  }

  function updateBackupReminder() {
    const since = daysSinceBackup();
    const snoozed = sessionStorage.getItem('calendar.backupSnoozed') === '1';
    const due = Storage.getTasks().length > 0 && (since === null || since >= BACKUP_REMIND_DAYS);
    $('#backupReminder').hidden = !due || snoozed;
    $('#backupReminderText').textContent = since === null
      ? 'ยังไม่เคยสำรองข้อมูล — ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์นี้เท่านั้น ถ้าล้างข้อมูลเว็บไซต์ งานจะหาย'
      : `สำรองข้อมูลล่าสุด ${relTime.format(-since, 'day')} — แนะนำให้สำรองใหม่`;
  }

  function renderBackupDialog() {
    const since = daysSinceBackup();
    $('#lastBackup').textContent = since === null ? 'ยังไม่เคยสำรองข้อมูล' : `สำรองล่าสุด: ${relTime.format(-since, 'day')}`;
    importFile.value = '';
    pendingImport = null;
    importInfo.textContent = '';
    $('#btnImportMerge').disabled = true;
    $('#btnImportReplace').disabled = true;
  }

  function exportBackup() {
    Backup.exportJson(Storage.exportData());
    Storage.updateSettings({ lastBackup: new Date().toISOString() });
    updateBackupReminder();
    if (backupDialog.open) renderBackupDialog();
  }

  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    pendingImport = null;
    $('#btnImportMerge').disabled = true;
    $('#btnImportReplace').disabled = true;
    if (!file) return;
    try {
      pendingImport = Backup.parseJson(await file.text());
    } catch (err) {
      importInfo.textContent = err.message;
      return;
    }
    const d = pendingImport;
    importInfo.textContent = `พบ งาน ${d.tasks.length} · แผนงาน ${d.plans.length} · วันพิเศษ ${d.days.length}` +
      (d.skipped ? ` (ข้าม ${d.skipped} รายการที่ข้อมูลไม่ถูกต้อง)` : '');
    $('#btnImportMerge').disabled = false;
    $('#btnImportReplace').disabled = false;
  });

  function runImport(mode) {
    if (!pendingImport) return;
    if (mode === 'replace' && !confirm('แทนที่ข้อมูลทั้งหมดในเบราว์เซอร์นี้ด้วยไฟล์ที่เลือก?\nข้อมูลเดิมจะหายไป (แนะนำให้ดาวน์โหลดไฟล์สำรองก่อน)')) return;
    Storage.importData(pendingImport, mode);
    const n = pendingImport.tasks.length;
    renderBackupDialog();
    importInfo.textContent = `นำเข้าเรียบร้อย (${mode === 'replace' ? 'แทนที่' : 'รวม'} งาน ${n} รายการ)`;
    refreshAll();
  }

  $('#btnImportMerge').addEventListener('click', () => runImport('merge'));
  $('#btnImportReplace').addEventListener('click', () => runImport('replace'));
  $('#btnExportJson').addEventListener('click', exportBackup);
  $('#btnExportIcs').addEventListener('click', () => {
    Backup.exportIcs({
      tasks: Storage.getTasks(),
      plans: Storage.getPlans(),
      days: Storage.getDays(),
      includeDays: $('#icsIncludeDays').checked,
      ctx: companyCalendar(),
    });
  });
  $('#btnBackupClose').addEventListener('click', () => backupDialog.close());
  UI.closeOnBackdrop(backupDialog);

  function openBackupDialog() {
    renderBackupDialog();
    backupDialog.showModal();
  }

  $('#btnBackup').addEventListener('click', openBackupDialog);
  $('#btnBackupNow').addEventListener('click', openBackupDialog);
  $('#btnBackupLater').addEventListener('click', () => {
    sessionStorage.setItem('calendar.backupSnoozed', '1');
    updateBackupReminder();
  });

  // ---------- print ----------

  const VIEW_NAMES = { summary: 'สรุป', calendar: 'ปฏิทิน', board: 'บอร์ด', gantt: 'Gantt' };
  const printStamp = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

  window.addEventListener('beforeprint', () => {
    // Always print the light theme; dark backgrounds waste ink and often don't print.
    document.documentElement.dataset.theme = 'light';
    const filter = planFilter.selectedIndex > 0 ? ` · ${planFilter.selectedOptions[0].text}` : '';
    const q = search.value.trim() ? ` · ค้นหา "${search.value.trim()}"` : '';
    $('#printHeader').textContent = `My Calendar · ${VIEW_NAMES[view]}${filter}${q} · พิมพ์เมื่อ ${printStamp.format(new Date())}`;
    if (view === 'calendar') CalendarView.setPrintMode(true);
  });
  window.addEventListener('afterprint', () => {
    delete document.documentElement.dataset.theme;
    if (view === 'calendar') CalendarView.setPrintMode(false);
  });
  $('#btnPrint').addEventListener('click', () => window.print());

  // ---------- top bar ----------

  // The "more" menu closes after picking an item or clicking elsewhere.
  const menu = $('#menu');
  menu.addEventListener('click', (e) => { if (e.target.closest('.menu-list button')) menu.open = false; });
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });

  $('#btnNewTask').addEventListener('click', () => newTask());

  document.querySelectorAll('.tabs [data-view]').forEach((b) =>
    b.addEventListener('click', () => setView(b.dataset.view)));

  hideDone.checked = pref.get(PREF.hideDone) === '1';
  hideDone.addEventListener('change', () => {
    pref.set(PREF.hideDone, hideDone.checked ? '1' : '0');
    render();
  });

  planFilter.addEventListener('change', () => {
    pref.set(PREF.planFilter, planFilter.value);
    render();
  });

  search.addEventListener('input', render);

  // ---------- storage ----------

  if (!Storage.available()) $('#storageWarning').hidden = false;
  Storage.setSaveErrorHandler(() => { $('#storageWarning').hidden = false; });

  // Keep several open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key !== Storage.KEY) return;
    Storage.reload();
    refreshAll();
  });

  // ---------- views ----------

  SummaryView.init($('#summary'), { onOpen: openTask });

  CalendarView.init($('#calendar'), {
    getCompanyCalendar: companyCalendar,
    onSelect(start, end, allDay) {
      if (allDay) {
        const s = DateUtil.fmtDate(start);
        const e = DateUtil.addDays(DateUtil.fmtDate(end), -1);
        newTask({ allDay: true, start: s, end: e !== s ? e : null });
      } else {
        newTask({ allDay: false, start: DateUtil.fmtDateTime(start), end: DateUtil.fmtDateTime(end) });
      }
    },
    onEventClick: openTask,
    onEventMoved(id, times) {
      Storage.updateTask(id, times);
      render();
    },
  });

  BoardView.init($('#board'), {
    onOpen: (id) => openTask(id),
    onAdd(status) {
      newTask(Tasks.syncStatusProgress({ status, progress: 0 }, 'status'));
    },
    onStatusChange(id, status) {
      const task = Storage.getTask(id);
      if (!task || task.status === status) return;
      const patch = Tasks.syncStatusProgress({ status, progress: task.progress }, 'status');
      // Finishing a task with a checklist ticks every item, keeping progress consistent.
      if (status === 'done' && (task.checklist || []).length) {
        patch.checklist = task.checklist.map((i) => ({ ...i, done: true }));
      }
      Storage.updateTask(id, patch);
      render();
    },
  });

  // Gantt edits update storage without re-rendering, so the chart keeps its
  // scroll position. It re-renders only when the change affects the bar's look.
  GanttView.init($('#gantt'), $('#ganttEmpty'), {
    onOpen: (id) => openTask(id),
    onDatesChanged(id, startDate, endDate) {
      const task = Storage.getTask(id);
      if (!task) return;
      if (task.allDay) {
        Storage.updateTask(id, { start: startDate, end: endDate !== startDate ? endDate : null });
        return;
      }
      // Timed task: keep its clock times, move only the dates.
      const startClock = task.start.slice(10);
      const endClock = task.end ? task.end.slice(10) : startClock;
      const start = startDate + startClock;
      let end = endDate + endClock;
      if (end <= start) end = null;
      Storage.updateTask(id, { start, end });
    },
    onProgressChanged(id, progress) {
      const task = Storage.getTask(id);
      if (!task) return;
      // Progress of a task with a checklist comes from the checklist: undo the drag.
      if ((task.checklist || []).length) {
        render();
        return;
      }
      const before = task.status;
      Storage.updateTask(id, Tasks.syncStatusProgress({ status: task.status, progress }, 'progress'));
      if (task.status !== before) render();
    },
  });

  const ganttModes = $('#ganttModes');
  function setGanttMode(m) {
    if (!['Day', 'Week', 'Month'].includes(m)) m = 'Day';
    pref.set(PREF.ganttMode, m);
    ganttModes.querySelectorAll('[data-mode]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    GanttView.setMode(m);
  }
  ganttModes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) setGanttMode(b.dataset.mode);
  });
  $('#ganttToday').addEventListener('click', () => GanttView.scrollToday());

  // ---------- start ----------

  refreshPlanOptions();
  setGanttMode(pref.get(PREF.ganttMode));
  setView(pref.get(PREF.view));
})();
