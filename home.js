import { showToast } from './toast.js';
import { authGateway } from './di.js';
import { maskPhone } from './domain/phone.js';

const PROVIDER_LABEL = { kakao: '카카오', apple: 'Apple', google: 'Google' };
const logoutButton = document.getElementById('logout');

async function loadAccount() {
  // 간편 로그인에서 막 돌아온 경우, 주소에 실려 온 세션을 받은 뒤에 결과가 나온다
  let user;
  try {
    user = await authGateway.currentUser();
  } catch {
    return showToast('네트워크 연결을 확인해 주세요.'); // 오프라인일 뿐, 로그아웃시키지 않는다
  }
  if (!user) {
    // 저장된 세션이 무효라면 지워서, 가입 화면의 자동 로그인 스크립트가 다시 홈으로 보내지 않게 한다
    await authGateway.logOut().catch(() => {});
    const socialFailed = /[?#&]error=/.test(location.search + location.hash);
    return location.replace(socialFailed ? './?error=social_failed' : './');
  }
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
