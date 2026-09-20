import { showToast } from './toast.js';

const form = document.getElementById('auth-form');
const phoneInput = document.getElementById('phone');
const passwordInput = document.getElementById('password');
const buttons = form.querySelectorAll('button');

const PASSWORD_MIN = 8;
const PROVIDER_LABEL = { kakao: '카카오', apple: 'Apple', google: 'Google' };
const SERVER_UNREACHABLE = '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.';
const DIGITS_ONLY = '숫자만 입력해 주세요.';
const REDIRECT_ERRORS = {
  provider_unavailable: '간편 로그인은 아직 준비 중이에요.',
  social_failed: '간편 로그인에 실패했어요. 다시 시도해 주세요.',
};

// 입력 오류는 해당 필드의 빨간 테두리 + 아래 문구로 보여 준다 (Figma 2 · 3번 화면)
function setFieldError(input, message) {
  const errorText = document.getElementById(`${input.id}-error`);
  input.closest('.field').classList.toggle('field--error', Boolean(message));
  input.setAttribute('aria-invalid', String(Boolean(message)));
  errorText.textContent = message ?? '';
  errorText.hidden = !message;
}

// 01012345678 → 010 - 1234 - 5678 (10자리는 010 - 123 - 4567)
function formatPhone(value) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)} - ${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)} - ${d.slice(3, 6)} - ${d.slice(6)}`;
  return `${d.slice(0, 3)} - ${d.slice(3, 7)} - ${d.slice(7)}`;
}

// 숫자 · 공백 · 하이픈 말고 다른 글자가 섞였는가
const hasNonDigits = (value) => /[^\d\s-]/.test(value);

phoneInput.addEventListener('input', () => {
  if (hasNonDigits(phoneInput.value)) return setFieldError(phoneInput, DIGITS_ONLY);
  setFieldError(phoneInput, null);
  // 중간을 고치는 중에는 커서가 튀지 않도록 그대로 두고, 포커스를 잃을 때 정리한다
  if (phoneInput.selectionStart === phoneInput.value.length) phoneInput.value = formatPhone(phoneInput.value);
});
phoneInput.addEventListener('blur', () => {
  if (!hasNonDigits(phoneInput.value)) phoneInput.value = formatPhone(phoneInput.value);
});
passwordInput.addEventListener('input', () => setFieldError(passwordInput, null));

// 틀린 필드에 오류를 표시하고, 제출해도 되는지 돌려준다
function validate() {
  // 이전 제출에서 서버가 돌려준 오류("이미 가입하신…")가 남아 있지 않게 먼저 지운다
  setFieldError(phoneInput, null);
  setFieldError(passwordInput, null);

  let firstInvalid = null;
  const fail = (input, message) => {
    setFieldError(input, message);
    firstInvalid ??= input;
  };

  if (hasNonDigits(phoneInput.value)) fail(phoneInput, DIGITS_ONLY);
  else if (!/^01[016789]\d{7,8}$/.test(phoneInput.value.replace(/\D/g, ''))) fail(phoneInput, '전화 번호를 정확히 입력해 주세요.');
  if (passwordInput.value.length < PASSWORD_MIN) fail(passwordInput, `비밀번호는 ${PASSWORD_MIN}자 이상으로 입력해 주세요.`);

  firstInvalid?.focus();
  return !firstInvalid;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  // Enter 로 제출하면 submitter 는 첫 번째 제출 버튼(회원가입)이 된다
  const action = event.submitter?.value === 'login' ? 'login' : 'signup';
  if (!validate()) return;

  buttons.forEach((button) => { button.disabled = true; });
  try {
    const res = await fetch(`api/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneInput.value, password: passwordInput.value }),
    });
    if (res.ok) return location.replace('home');

    // 정적 호스팅(GitHub Pages)처럼 API 서버가 없는 곳에서는 JSON 오류 본문이 오지 않는다
    const body = await res.json().catch(() => ({}));
    const input = { phone: phoneInput, password: passwordInput }[body.field];
    if (input) {
      setFieldError(input, body.error);
      input.focus();
    } else {
      showToast(body.error ?? SERVER_UNREACHABLE);
    }
  } catch {
    showToast('네트워크 연결을 확인해 주세요.');
  }
  buttons.forEach((button) => { button.disabled = false; });
});

// 키가 설정되지 않은 간편 로그인은 이동하지 않고 안내만 한다
const providersReady = fetch('api/providers').then((res) => res.json()).catch(() => null);
document.querySelectorAll('[data-provider]').forEach((link) => {
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    const name = link.dataset.provider;
    const providers = await providersReady;
    if (!providers) return showToast(SERVER_UNREACHABLE);
    if (!providers[name]) return showToast(`${PROVIDER_LABEL[name]} 간편 로그인은 아직 준비 중이에요.`);
    location.href = link.href;
  });
});

const redirectError = REDIRECT_ERRORS[new URLSearchParams(location.search).get('error')];
if (redirectError) {
  showToast(redirectError);
  history.replaceState(null, '', location.pathname);
}

// 뒤로 가기로 캐시된 화면이 복원됐는데 이미 로그인 상태라면 홈으로 보낸다
window.addEventListener('pageshow', async (event) => {
  if (!event.persisted) return;
  const res = await fetch('api/me').catch(() => null);
  if (res?.ok) location.replace('home');
});
