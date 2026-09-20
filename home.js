import { showToast } from './toast.js';
import { authGateway } from './di.js';
import { maskPhone } from './domain/phone.js';

const PROVIDER_LABEL = { kakao: '카카오', apple: 'Apple', google: 'Google' };
const logoutButton = document.getElementById('logout');

async function loadAccount() {
  let user;
  try {
    user = await authGateway.currentUser();
  } catch {
    return showToast('네트워크 연결을 확인해 주세요.'); // 오프라인일 뿐, 로그아웃시키지 않는다
  }
  if (!user) return location.replace('./');
  document.getElementById('account').textContent =
    maskPhone(user.phone) ?? `${user.providers.map((name) => PROVIDER_LABEL[name] ?? name).join(', ')} 간편 로그인`;
}

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await authGateway.logOut();
    location.replace('./');
  } catch {
    logoutButton.disabled = false;
    showToast('네트워크 연결을 확인해 주세요.');
  }
});

// 뒤로 가기로 복원된 경우에도 세션을 다시 확인한다
window.addEventListener('pageshow', loadAccount);
