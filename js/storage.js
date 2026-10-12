// All data lives in this browser's localStorage under one key.
// Shape: { version, tasks: [...], plans: [...], days: [...], settings: {...} }
const Storage = (() => {
  const KEY = 'calendar.v1';
  const defaultSettings = () => ({ weekendDays: [0, 6] }); // Sunday, Saturday
  const empty = () => ({ version: 1, tasks: [], plans: [], days: [], settings: defaultSettings() });

  let state = load();
  let onSaveError = () => {};

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const data = JSON.parse(raw);
      return { ...empty(), ...data, settings: { ...defaultSettings(), ...data.settings } };
    } catch (e) {
      console.warn('Cannot read saved data', e);
      return empty();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Cannot save data', e);
      onSaveError(e);
    }
  }

  function available() {
    try {
      const probe = '__calendar_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  const newId = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);

  // Generic CRUD over one collection of state ("tasks" or "plans").
  function collection(name, defaults) {
    return {
      all: () => state[name].slice(),
      get: (id) => state[name].find((x) => x.id === id) || null,
      add(data) {
        const now = new Date().toISOString();
        const item = { ...defaults, ...data, id: newId(), createdAt: now, updatedAt: now };
        state[name].push(item);
        save();
        return item;
      },
      update(id, patch) {
        const item = state[name].find((x) => x.id === id);
        if (!item) return null;
        Object.assign(item, patch, { id, updatedAt: new Date().toISOString() });
        save();
        return item;
      },
      remove(id) {
        state[name] = state[name].filter((x) => x.id !== id);
        save();
      },
    };
  }

  const tasks = collection('tasks', {
    planId: null, progress: 0, color: null, checklist: [], dependsOn: [], repeat: null, doneDates: [],
  });
  const plans = collection('plans', { description: '' });
  const days = collection('days', { type: 'holiday', end: null, yearly: false });

  // Deleting a plan keeps its tasks but unassigns them.
  function deletePlan(id) {
    state.tasks.forEach((t) => { if (t.planId === id) t.planId = null; });
    plans.remove(id);
  }

  // Deleting a task also removes it from other tasks' dependencies.
  function deleteTask(id) {
    state.tasks.forEach((t) => {
      if ((t.dependsOn || []).includes(id)) t.dependsOn = t.dependsOn.filter((d) => d !== id);
    });
    tasks.remove(id);
  }

  // Deep copy of everything, for backups.
  const exportData = () => JSON.parse(JSON.stringify(
    { tasks: state.tasks, plans: state.plans, days: state.days, settings: state.settings }));

  // Import sanitized data: "replace" swaps everything, "merge" adds or
  // updates by id and keeps the rest.
  function importData(data, mode) {
    if (mode === 'replace') {
      state = { ...empty(), tasks: data.tasks, plans: data.plans, days: data.days,
        settings: { ...state.settings, ...(data.settings || {}) } };
    } else {
      for (const name of ['tasks', 'plans', 'days']) {
        const byId = new Map(state[name].map((x) => [x.id, x]));
        data[name].forEach((x) => byId.set(x.id, x));
        state[name] = [...byId.values()];
      }
    }
    save();
  }

  return {
    KEY,
    available,
    reload: () => { state = load(); },
    setSaveErrorHandler: (fn) => { onSaveError = fn; },

    getTasks: tasks.all,
    getTask: tasks.get,
    addTask: tasks.add,
    updateTask: tasks.update,
    deleteTask,

    getPlans: plans.all,
    getPlan: plans.get,
    addPlan: plans.add,
    updatePlan: plans.update,
    deletePlan,

    getDays: days.all,
    getDay: days.get,
    addDay: days.add,
    updateDay: days.update,
    deleteDay: days.remove,

    getSettings: () => ({ ...state.settings }),
    updateSettings(patch) {
      Object.assign(state.settings, patch);
      save();
    },

    exportData,
    importData,
  };
})();
