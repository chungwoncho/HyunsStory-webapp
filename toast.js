let hideTimer;

export function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}
