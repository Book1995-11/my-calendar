// Wraps FullCalendar and converts between stored tasks and calendar events.
// All-day tasks store an inclusive end date; FullCalendar uses an exclusive one.
// Recurring tasks are expanded into one event per occurrence in the visible range.
const CalendarView = (() => {
  let calendar = null;
  let handlers = {};
  let current = { tasks: [], plans: [] };

  // occurrence: 'YYYY-MM-DD' for one occurrence of a recurring task, else null.
  function toEvent(task, plan, occurrence) {
    const color = Format.taskColor(task, plan);
    const times = occurrence ? Recurrence.occurrenceTimes(task, occurrence) : task;
    const done = occurrence ? (task.doneDates || []).includes(occurrence) : task.status === 'done';
    const event = {
      id: occurrence ? `${task.id}@${occurrence}` : task.id,
      title: (occurrence ? '↻ ' : '') + task.title,
      start: times.start,
      allDay: task.allDay,
      extendedProps: { taskId: task.id, occurrence },
      // Move a recurring series from its dialog, not by dragging one occurrence.
      editable: !occurrence,
      backgroundColor: color,
      borderColor: color,
      textColor: Format.textOn(color),
      classNames: [
        done ? 'is-done' : '',
        task.priority === 'high' ? 'is-high' : '',
      ].filter(Boolean),
    };
    if (times.end) event.end = task.allDay ? DateUtil.addDays(times.end, 1) : times.end;
    return event;
  }

  function taskSource(info, success) {
    const from = DateUtil.fmtDate(info.start);
    const to = DateUtil.addDays(DateUtil.fmtDate(info.end), -1);
    const planById = Object.fromEntries(current.plans.map((p) => [p.id, p]));
    const ctx = handlers.getCompanyCalendar();
    const events = [];
    for (const t of current.tasks) {
      if (!Tasks.isRecurring(t)) {
        events.push(toEvent(t, planById[t.planId], null));
        continue;
      }
      for (const d of Recurrence.occurrences(t, from, to, ctx)) events.push(toEvent(t, planById[t.planId], d));
    }
    success(events);
  }

  function fromEvent(event) {
    if (event.allDay) {
      const start = DateUtil.fmtDate(event.start);
      let end = event.end ? DateUtil.addDays(DateUtil.fmtDate(event.end), -1) : null;
      if (end === start) end = null;
      return { allDay: true, start, end };
    }
    return {
      allDay: false,
      start: DateUtil.fmtDateTime(event.start),
      end: event.end ? DateUtil.fmtDateTime(event.end) : null,
    };
  }

  // Special days are drawn as colored backgrounds behind the tasks.
  function specialDaySource(info, success) {
    const { days } = handlers.getCompanyCalendar();
    const from = DateUtil.fmtDate(info.start);
    const to = DateUtil.addDays(DateUtil.fmtDate(info.end), -1);
    success(SpecialDays.occurrences(days, from, to).map((o) => ({
      title: o.day.name,
      start: o.start,
      end: DateUtil.addDays(o.end, 1),
      allDay: true,
      display: 'background',
      backgroundColor: Format.dayType(o.day.type).color + '33', // translucent, keeps the label crisp
      classNames: ['special-day'],
    })));
  }

  // A fresh function each time, so setOption() makes FullCalendar redraw cells.
  const offDayClasses = () => (arg) =>
    handlers.getCompanyCalendar().weekendDays.includes(arg.date.getDay()) ? ['is-off-day'] : [];

  // handlers: onSelect(start, end, allDay), onEventClick(taskId, occurrence|null),
  //           onEventMoved(id, {allDay, start, end}), getCompanyCalendar() -> {days, weekendDays}
  function init(el, h) {
    handlers = h;
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    const moved = (info) => handlers.onEventMoved(info.event.id, fromEvent(info.event));

    calendar = new FullCalendar.Calendar(el, {
      locale: 'th',
      initialView: narrow ? 'listWeek' : 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
      },
      buttonText: { today: 'วันนี้', month: 'เดือน', week: 'สัปดาห์', day: 'วัน', list: 'รายการ' },
      noEventsText: 'ไม่มีงาน',
      height: '100%',
      expandRows: true,
      nowIndicator: true,
      editable: true,
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      longPressDelay: 300,
      eventSources: [
        { id: 'special', events: specialDaySource },
        { id: 'tasks', events: taskSource },
      ],
      dayCellClassNames: offDayClasses(),
      select: (info) => {
        calendar.unselect();
        handlers.onSelect(info.start, info.end, info.allDay);
      },
      eventClick: (info) => {
        const { taskId, occurrence } = info.event.extendedProps;
        if (taskId) handlers.onEventClick(taskId, occurrence);
      },
      eventDidMount: (info) => {
        const { taskId, occurrence } = info.event.extendedProps;
        if (!taskId) return;
        info.el.dataset.tip = taskId;
        if (occurrence) info.el.dataset.tipOccurrence = occurrence;
      },
      eventDrop: moved,
      eventResize: moved,
    });
    calendar.render();
    // Web font changes row heights once loaded; re-measure.
    if (document.fonts) document.fonts.ready.then(() => calendar.updateSize());
  }

  function setTasks(tasks, plans) {
    current = { tasks, plans };
    calendar.getEventSourceById('tasks')?.refetch();
  }

  // Call after special days or weekly days off change.
  function refreshCompanyCalendar() {
    calendar.setOption('dayCellClassNames', offDayClasses());
    calendar.getEventSourceById('special')?.refetch();
  }

  // Call after the calendar's container becomes visible again.
  const updateSize = () => calendar && calendar.updateSize();

  // FullCalendar sizes its tables in pixels from the screen layout, so before
  // printing, lay it out at the printable width of A4 landscape (277mm ≈ 1040px;
  // the browser shrinks it for smaller paper) with its natural height.
  function setPrintMode(on) {
    calendar.el.style.width = on ? '1040px' : '';
    calendar.setOption('height', on ? 'auto' : '100%');
    calendar.updateSize();
  }

  return { init, setTasks, refreshCompanyCalendar, updateSize, setPrintMode };
})();
