// Task rules shared by the views and dialogs.
const Tasks = (() => {
  const today = () => DateUtil.fmtDate(new Date());
  const endDate = (task) => (task.end || task.start).slice(0, 10);
  const isRecurring = (task) => !!(task.repeat && task.repeat.freq);

  // Keeps status and progress consistent after one of them changed.
  function syncStatusProgress(data, changed) {
    if (changed === 'status') {
      if (data.status === 'done') data.progress = 100;
    } else if (data.progress >= 100) {
      data.status = 'done';
    } else if (data.status === 'done') {
      data.status = 'doing';
    } else if (data.progress > 0 && data.status === 'todo') {
      data.status = 'doing';
    }
    return data;
  }

  // Progress from the checklist, or null when there is no checklist.
  function checklistProgress(checklist) {
    if (!checklist || !checklist.length) return null;
    return Math.round((checklist.filter((i) => i.done).length / checklist.length) * 100);
  }

  // Recurring tasks are never overdue as a whole.
  const isOverdue = (task) =>
    !isRecurring(task) && task.status !== 'done' && endDate(task) < today();

  function matchesSearch(task, query) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const text = [task.title, task.description, ...(task.checklist || []).map((i) => i.text)].join(' ');
    return text.toLowerCase().includes(q);
  }

  // Ids of every task that depends on `id`, directly or indirectly.
  function dependents(id, tasks) {
    const found = new Set();
    const walk = (target) => {
      for (const t of tasks) {
        if ((t.dependsOn || []).includes(target) && !found.has(t.id)) {
          found.add(t.id);
          walk(t.id);
        }
      }
    };
    walk(id);
    return found;
  }

  // Dependency edges with cycles removed: { taskId: [dependsOnId, ...] }.
  // Frappe Gantt loops forever on cyclic dependencies, so this must run first.
  function acyclicDependencies(tasks) {
    const ids = new Set(tasks.map((t) => t.id));
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const state = {}; // undefined = unvisited, 1 = in progress, 2 = done
    const result = {};
    const visit = (id) => {
      state[id] = 1;
      result[id] = [];
      for (const dep of byId[id].dependsOn || []) {
        if (!ids.has(dep) || state[dep] === 1) continue; // missing, or would close a cycle
        if (state[dep] !== 2) visit(dep);
        result[id].push(dep);
      }
      state[id] = 2;
    };
    tasks.forEach((t) => { if (!state[t.id]) visit(t.id); });
    return result;
  }

  // Dependencies that finish on or after the task's start date.
  function blockingDependencies(task, tasks) {
    const start = task.start.slice(0, 10);
    return (task.dependsOn || [])
      .map((id) => tasks.find((t) => t.id === id))
      .filter((dep) => dep && !isRecurring(dep) && endDate(dep) >= start);
  }

  return {
    today, endDate, isRecurring, syncStatusProgress, checklistProgress, isOverdue,
    matchesSearch, dependents, acyclicDependencies, blockingDependencies,
  };
})();
