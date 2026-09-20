import { showToast } from './toast.js';

const PROVIDER_LABEL = { kakao: '카카오', apple: 'Apple', google: 'Google' };
const logoutButton = document.getElementById('logout');

async function loadAccount() {
  const res = await fetch('api/me').catch(() => null);
  if (res?.status === 401) return location.replace('./');
  if (!res?.ok) return showToast('네트워크 연결을 확인해 주세요.');
  const { user } = await res.json();
  document.getElementById('account').textContent =
    user.phone ?? `${user.providers.map((name) => PROVIDER_LABEL[name] ?? name).join(', ')} 간편 로그인`;
}

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await fetch('api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    location.replace('./');
  } catch {
    logoutButton.disabled = false;
    showToast('네트워크 연결을 확인해 주세요.');
  }
});

// 뒤로 가기로 복원된 경우에도 세션을 다시 확인한다
window.addEventListener('pageshow', loadAccount);
