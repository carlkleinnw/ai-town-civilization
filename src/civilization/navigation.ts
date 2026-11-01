export function worldUrl(id?: string, workbench = false) {
  return `/ai-town/${workbench ? 'workbench/' : ''}${id ? `?world=${encodeURIComponent(id)}` : ''}`;
}
// The chat-town world parameter belongs to a different table.
export function townUrl(civilizationId?: string) {
  return `/ai-town/?view=town${civilizationId ? `&civilization=${encodeURIComponent(civilizationId)}` : ''}`;
}
export function returnCivilizationId() {
  return (
    new URLSearchParams(window.location.search).get('civilization') ??
    readLocal('civilization-world') ??
    undefined
  );
}
export function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private browsing still supports navigation. */
  }
}
