export function $<T extends HTMLElement = HTMLElement>(selector: string, parent: ParentNode = document): T | null {
  return parent.querySelector<T>(selector);
}

export function $$<T extends HTMLElement = HTMLElement>(selector: string, parent: ParentNode = document): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

export function showToast(message: string, duration: number = 2000): void {
  let toastEl = $('#toast-container');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast-container';
    toastEl.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;';
    document.body.appendChild(toastEl);
  }

  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = message;
  item.style.cssText = 'background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;margin-top:8px;border-radius:4px;font-size:13px;';
  toastEl.appendChild(item);

  setTimeout(() => {
    item.remove();
  }, duration);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
