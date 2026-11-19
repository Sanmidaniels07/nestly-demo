// A full page load on purpose: switching character (or resetting) must
// restart the app so it signs in again as the new person from scratch.
export const hardNavigate = (path: string) => {
  window.location.assign(path);
};
