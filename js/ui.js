// Small UI helpers shared by the dialogs.
const UI = (() => {
  // Close a dialog when clicking outside its box (not on its padding).
  function closeOnBackdrop(dialog) {
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    });
  }

  // Per-browser view preferences; failures (private mode, blocked storage) are ignored.
  const pref = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  return { closeOnBackdrop, pref };
})();
