export type ToastType = 'success' | 'error' | 'info';

export function notifyDataChanged() {
  window.dispatchEvent(new CustomEvent('kbig-data-changed'));
}

export function showToast(type: ToastType, message: string) {
  window.dispatchEvent(new CustomEvent('kbig-toast', { detail: { type, message } }));
}
