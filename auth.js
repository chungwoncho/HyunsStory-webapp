import { showToast } from './toast.js';
import { authGateway } from './di.js';
import { AUTH_STORAGE_KEY, SMS_CODE_TTL_SECONDS } from './config.js';
import {
  PASSWORD_MIN, formatPhone, formatCountdown, hasNonDigits, isVerificationCode, normalizePhone,
} from './domain/phone.js';

const form = document.getElementById('auth-form');
const phoneInput = document.getElementById('phone');
const passwordInput = document.getElementById('password');
const passwordToggle = document.getElementById('password-toggle');
const sendCodeButton = document.getElementById('send-code');
const codeGroup = document.getElementById('code-group');
const codeInput = document.getElementById('code');
const codeTimer = document.getElementById('code-timer');
const buttons = form.querySelectorAll('button[type="submit"], #send-code');

const PROVIDER_LABEL = { kakao: '카카오', apple: 'Apple', google: 'Google' };
const SERVER_UNREACHABLE = '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.';
const DIGITS_ONLY = '숫자만 입력해 주세요.';
const INVALID_PHONE = '전화 번호를 정확히 입력해 주세요.';
const WEAK_PASSWORD = `비밀번호는 ${PASSWORD_MIN}자 이상으로 입력해 주세요.`;
const CODE_EXPIRED = '인증 시간이 지났어요. 인증번호를 다시 받아 주세요.';

// 게이트웨이가 돌려준 오류 이름 → 어느 필드 아래에 어떤 문구로 보여 줄지. field 가 없으면 토스트
const ERROR_VIEW = {
  InvalidPhone: { field: 'phone', message: INVALID_PHONE },
  WeakPassword: { field: 'password', message: WEAK_PASSWORD },
  InvalidCredentials: { field: 'password', message: '비밀번호가 올바르지 않아요.' },
  InvalidCode: { field: 'code', message: '인증코드가 올바르지 않아요.' },
  TooManyAttempts: { message: '요청이 너무 잦아요. 1분 뒤에 다시 시도해 주세요.' },
  SmsFailed: { message: '인증번호 문자를 보내지 못했어요. 잠시 후 다시 시도해 주세요.' },
  PhoneLoginDisabled: { message: '전화번호 인증이 아직 열리지 않았어요.' },
  Network: { message: '네트워크 연결을 확인해 주세요.' },
};
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

function showError(errorName) {
  const { field, message = SERVER_UNREACHABLE } = ERROR_VIEW[errorName] ?? {};
  const input = { phone: phoneInput, password: passwordInput, code: codeInput }[field];
  if (!input) return showToast(message);
  setFieldError(input, message);
  input.focus();
}

const setBusy = (busy) => buttons.forEach((button) => { button.disabled = busy; });

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
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '');
  setFieldError(codeInput, null);
});

// 자물쇠를 누르면 비밀번호가 보이고(열린 자물쇠), 다시 누르면 가려진다
function setPasswordVisible(visible) {
  passwordInput.type = visible ? 'text' : 'password';
  passwordToggle.setAttribute('aria-pressed', String(visible));
  passwordToggle.setAttribute('aria-label', visible ? '비밀번호 숨기기' : '비밀번호 보기');
  passwordToggle.querySelector('img').src = visible ? 'assets/lock-unlock-fill.svg' : 'assets/lock-fill.svg';
}
// 입력창의 포커스(모바일 키보드)와 커서 위치를 잃지 않도록 버튼이 포커스를 가져가지 못하게 한다
passwordToggle.addEventListener('mousedown', (event) => event.preventDefault());
passwordToggle.addEventListener('click', () => {
  const { selectionStart, selectionEnd } = passwordInput;
  setPasswordVisible(passwordInput.type === 'password');
  if (verification) return; // 잠긴 상태에서는 보기만 하고 입력창을 건드리지 않는다
  passwordInput.focus();
  restoreCaret(selectionStart, selectionEnd);
});

// type 을 바꾸면 Chrome 은 다음 렌더링 때 입력창 내부를 다시 만들면서 커서를 맨 앞으로 되돌린다.
// 그 되돌림(selectionchange)이 일어난 직후에 원래 자리로 옮긴다. 되돌림이 없는 브라우저를 위해 바로 한 번 옮겨 둔다.
function restoreCaret(start, end) {
  passwordInput.setSelectionRange(start, end);
  const stop = new AbortController();
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== passwordInput || passwordInput.selectionStart !== 0 || start === 0) return;
    stop.abort();
    passwordInput.setSelectionRange(start, end);
  }, { signal: stop.signal });
  // 사용자가 직접 입력하거나 커서를 옮기기 시작하면 더는 건드리지 않는다
  for (const type of ['keydown', 'pointerdown', 'blur']) {
    passwordInput.addEventListener(type, () => stop.abort(), { signal: stop.signal });
  }
  setTimeout(() => stop.abort(), 500);
}

// 틀린 필드에 오류를 표시하고, 다음으로 넘어가도 되는지 돌려준다
function validateCredentials() {
  setFieldError(phoneInput, null);
  setFieldError(passwordInput, null);

  let firstInvalid = null;
  const fail = (input, message) => {
    setFieldError(input, message);
    firstInvalid ??= input;
  };

  if (hasNonDigits(phoneInput.value)) fail(phoneInput, DIGITS_ONLY);
  else if (!normalizePhone(phoneInput.value)) fail(phoneInput, INVALID_PHONE);
  if (passwordInput.value.length < PASSWORD_MIN) fail(passwordInput, WEAK_PASSWORD);

  firstInvalid?.focus();
  return !firstInvalid;
}

// ── 전화번호 인증 (Figma 1:3451 → 1:3465) ─────────────────────────────────
// 인증번호를 보낸 뒤의 상태. null 이면 아직 보내지 않았다.
//   mode: 'signup'(처음 보는 번호) | 'login'(가입된 번호)   expiresAt: 코드가 만료되는 시각(ms)
let verification = null;
let timerId;

function renderTimer() {
  const secondsLeft = (verification.expiresAt - Date.now()) / 1000;
  const expired = secondsLeft <= 0;
  codeTimer.textContent = expired ? CODE_EXPIRED : formatCountdown(secondsLeft);
  codeTimer.classList.toggle('field-hint--expired', expired);
  if (expired) clearInterval(timerId);
}

function startVerification(mode) {
  verification = { mode, expiresAt: Date.now() + SMS_CODE_TTL_SECONDS * 1000 };
  setPasswordVisible(false);
  for (const input of [phoneInput, passwordInput]) {
    input.readOnly = true;
    input.closest('.field').classList.add('field--locked');
  }
  sendCodeButton.textContent = '인증번호 재발송하기';
  codeGroup.hidden = false;
  codeInput.value = '';
  setFieldError(codeInput, null);
  clearInterval(timerId);
  timerId = setInterval(renderTimer, 1000);
  renderTimer();
  codeInput.focus();
}

// 번호나 비밀번호를 고치려고 잠긴 필드를 누르면 인증을 처음부터 다시 한다
function resetVerification() {
  verification = null;
  clearInterval(timerId);
  for (const input of [phoneInput, passwordInput]) {
    input.readOnly = false;
    input.closest('.field').classList.remove('field--locked');
  }
  sendCodeButton.textContent = '인증번호 발송하기';
  codeGroup.hidden = true;
  codeInput.value = '';
  setFieldError(codeInput, null);
}
for (const input of [phoneInput, passwordInput]) {
  input.addEventListener('pointerdown', () => { if (verification) resetVerification(); });
  input.addEventListener('keydown', (event) => {
    if (verification && event.key !== 'Tab') resetVerification();
  });
}

sendCodeButton.addEventListener('click', async () => {
  // 재발송은 잠긴 값 그대로 보내므로 다시 검사하지 않는다
  if (!verification && !validateCredentials()) return;

  setBusy(true);
  const sending = verification
    ? authGateway.resendCode(phoneInput.value, verification.mode)
    : authGateway.requestCode(phoneInput.value, passwordInput.value);
  const result = await sending.catch(() => ({ ok: false, error: 'Unknown' }));
  setBusy(false);

  if (!result.ok) return showError(result.error);
  startVerification(result.mode ?? verification.mode); // 재발송은 mode 가 그대로다
  showToast('인증번호를 문자로 보냈어요.');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  // Enter 로 제출하면 submitter 는 첫 번째 제출 버튼(회원가입)이 된다
  const action = event.submitter?.value === 'login' ? 'login' : 'signup';

  if (!verification) {
    if (!validateCredentials()) return;
    setFieldError(phoneInput, '전화번호 인증을 먼저 해 주세요.');
    return sendCodeButton.focus();
  }
  // 인증은 받았지만 누른 버튼이 번호의 상태와 맞지 않는 경우 (Figma 3번 화면)
  if (action === 'signup' && verification.mode === 'login') return setFieldError(phoneInput, '이미 가입하신 전화번호입니다.');
  if (action === 'login' && verification.mode === 'signup') return setFieldError(phoneInput, '가입되지 않은 전화번호입니다.');
  setFieldError(phoneInput, null);

  if (Date.now() >= verification.expiresAt) return setFieldError(codeInput, CODE_EXPIRED);
  if (!isVerificationCode(codeInput.value)) {
    setFieldError(codeInput, '인증코드 6자리를 입력해 주세요.');
    return codeInput.focus();
  }

  setBusy(true);
  const result = await authGateway.verifyCode(phoneInput.value, codeInput.value).catch(() => ({ ok: false, error: 'Unknown' }));
  if (result.ok) return location.replace('home'); // 인증이 끝나면 바로 로그인 상태다
  setBusy(false);
  showError(result.error);
});

// 키가 설정되지 않은 간편 로그인은 이동하지 않고 안내만 한다
const providersReady = authGateway.availableProviders();
document.querySelectorAll('[data-provider]').forEach((button) => {
  button.addEventListener('click', async () => {
    const name = button.dataset.provider;
    const providers = await providersReady;
    if (!providers) return showToast(SERVER_UNREACHABLE);
    if (!providers[name]) return showToast(`${PROVIDER_LABEL[name]} 간편 로그인은 아직 준비 중이에요.`);
    // 돌아올 곳은 홈. 처음이면 가입, 이미 있으면 로그인된다
    const result = await authGateway.startSocialLogin(name, new URL('home', location.href).href);
    if (!result.ok) showToast(REDIRECT_ERRORS.social_failed);
  });
});

const redirectError = REDIRECT_ERRORS[new URLSearchParams(location.search).get('error')];
if (redirectError) {
  showToast(redirectError);
  history.replaceState(null, '', location.pathname);
}

// 뒤로 가기로 캐시된 화면이 복원됐는데 이미 로그인 상태라면 홈으로 보낸다
window.addEventListener('pageshow', (event) => {
  if (event.persisted && localStorage.getItem(AUTH_STORAGE_KEY)) location.replace('home');
});
