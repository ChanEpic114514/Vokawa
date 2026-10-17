// Run before the application bundle. Keep shared content only in a bounded inbox.
(() => {
  const prefix = "#vokawa-share=";
  const maxRawLength = prefix.length + 3000 * 9;
  let pending;
  const listeners = new Set();
  function capture() {
    const hash = window.location.hash;
    if (!hash.startsWith("#vokawa-share")) return;
    let packet = hash.length > maxRawLength ? { error: "length" } : { raw: hash };
    try {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    } catch {
      // Fail closed: never expose the text to the app if URL cleanup failed.
      packet = { error: "cleanup" };
    }
    pending = packet;
    for (const listener of listeners) listener();
  }
  window.vokawaAnywhere = {
    take() { const value = pending; pending = undefined; return value; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  window.addEventListener("hashchange", capture);
  window.addEventListener("popstate", capture);
  window.addEventListener("pageshow", capture);
  capture();
})();
