// Colors, labels and display helpers shared by the views.
const Format = (() => {
  const PRIORITY_COLORS = { high: '#d64545', normal: '#2f6fd6', low: '#7a8494' };
  const PRIORITY_LABELS = { high: 'สูง', normal: 'ปกติ', low: 'ต่ำ' };
  const STATUS_LABELS = { todo: 'ยังไม่เริ่ม', doing: 'กำลังทำ', done: 'เสร็จแล้ว' };

  // Quick-pick colors for tasks (any other color can be chosen with the picker).
  const TASK_PALETTE = ['#2f6fd6', '#0f9fb5', '#2e9e6b', '#7cb342', '#f2b705', '#d98a1f', '#d64545', '#d6458f', '#8b5cf6', '#5f6b7f'];

  // Special day types. "off" days are excluded from working-day counts.
  const DAY_TYPES = {
    holiday: { label: 'วันหยุดบริษัท', color: '#e5484d', off: true },
    leave: { label: 'วันลา', color: '#d98a1f', off: true },
    event: { label: 'กิจกรรม / วันสำคัญ', color: '#8b5cf6', off: false },
  };

  const dayFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' });

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Colors come from <input type=color>; guard anything else (e.g. edited data).
  const isColor = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  const safeColor = (c) => (isColor(c) ? c : '#7a8494');

  // A task's own color wins, then its plan's, then its priority's.
  function taskColor(task, plan) {
    if (isColor(task.color)) return task.color;
    if (plan && isColor(plan.color)) return plan.color;
    return PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal;
  }

  // Readable text color (dark or white) on top of a background color.
  function textOn(hex) {
    const n = parseInt(safeColor(hex).slice(1), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.62 ? '#1d2433' : '#ffffff';
  }

  const dayType = (type) => DAY_TYPES[type] || DAY_TYPES.event;

  const shortDate = (s) => dayFmt.format(DateUtil.parseDate(s));

  // e.g. "14 ต.ค. – 16 ต.ค." or "12 ต.ค. 09:00 – 10:30"
  function taskRange(task) {
    const time = (s) => (task.allDay ? '' : ' ' + s.slice(11, 16));
    let out = shortDate(task.start) + time(task.start);
    if (task.end) {
      const sameDay = task.end.slice(0, 10) === task.start.slice(0, 10);
      out += ' – ' + (sameDay ? task.end.slice(11, 16) : shortDate(task.end) + time(task.end));
    }
    return out;
  }

  return {
    PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS, TASK_PALETTE, DAY_TYPES,
    escapeHtml, isColor, safeColor, taskColor, textOn, dayType, shortDate, taskRange,
  };
})();
