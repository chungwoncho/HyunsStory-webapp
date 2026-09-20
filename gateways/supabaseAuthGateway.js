// Infrastructure: 인증 포트(AuthGateway)의 Supabase 구현.
// 화면은 이 객체의 메서드와 오류 "이름"만 안다. Supabase 의 오류 코드 · 응답 모양은 여기서 끝난다.
//
// AuthGateway
//   requestCode(phone, password) → { ok: true, mode: 'signup' | 'login' } | { ok: false, error }
//        인증코드 SMS 를 보낸다. 처음 보는 번호면 가입 절차(signup), 가입된 번호면 비밀번호를 확인한 뒤 로그인 절차(login)
//   resendCode(phone, mode)      → { ok: true } | { ok: false, error }
//   verifyCode(phone, code)      → { ok: true } | { ok: false, error }   성공하면 로그인 상태가 된다
//   logOut()                 → void
//   currentUser()            → { phone, providers } | null        (자동 로그인 확인. 네트워크 오류면 throw)
//   availableProviders()     → { kakao, apple, google } | null    (null = 서버에 닿지 못함)
//   startSocialLogin(name, redirectTo) → { ok: true } | { ok: false, error }
//
// error: 'InvalidPhone' | 'WeakPassword' | 'InvalidCredentials' | 'InvalidCode' | 'TooManyAttempts'
//      | 'SmsFailed' | 'PhoneLoginDisabled' | 'ProviderUnavailable' | 'Network' | 'Unknown'
import { normalizePhone, toE164, isVerificationCode, PASSWORD_MIN, PASSWORD_MAX } from '../domain/phone.js';

const SOCIAL_PROVIDERS = ['kakao', 'apple', 'google'];

const ERROR_BY_CODE = {
  invalid_credentials: 'InvalidCredentials',
  otp_expired: 'InvalidCode', // Supabase 는 틀린 코드와 만료된 코드를 같은 코드로 돌려준다
  sms_send_failed: 'SmsFailed',
  otp_disabled: 'PhoneLoginDisabled',
  weak_password: 'WeakPassword',
  validation_failed: 'InvalidPhone',
  phone_provider_disabled: 'PhoneLoginDisabled',
  signup_disabled: 'PhoneLoginDisabled',
  provider_disabled: 'ProviderUnavailable',
  over_request_rate_limit: 'TooManyAttempts',
  over_sms_send_rate_limit: 'TooManyAttempts',
};

function toErrorName(error) {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'Network';
  if (error.status === 429) return 'TooManyAttempts';
  return ERROR_BY_CODE[error.code] ?? 'Unknown';
}

const fail = (error) => ({ ok: false, error });

function readCredentials(phoneInput, password) {
  const phone = normalizePhone(phoneInput);
  if (!phone) return fail('InvalidPhone');
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return fail('WeakPassword');
  }
  return { ok: true, credentials: { phone: toE164(phone), password } };
}

export function createSupabaseAuthGateway(client, { settingsUrl, publishableKey, fetchFn = globalThis.fetch } = {}) {
  return {
    async requestCode(phoneInput, password) {
      const input = readCredentials(phoneInput, password);
      if (!input.ok) return input;

      // 가입 요청: 처음 보는 번호(또는 인증을 끝내지 않은 번호)면 회원을 만들고 인증코드를 보낸다
      const signUp = await client.auth.signUp(input.credentials);
      if (signUp.error) return fail(toErrorName(signUp.error));
      if (!signUp.data.user) return fail('Unknown');
      // 이미 가입된 번호면 Supabase 는 오류 대신 identities 가 빈 가짜 회원을 돌려주고 SMS 를 보내지 않는다
      if (signUp.data.user.identities?.length) return { ok: true, mode: 'signup' };

      // 가입된 번호: 비밀번호가 맞을 때만 코드를 보낸다 (남의 번호로 SMS 를 계속 보내지 못하게)
      const logIn = await client.auth.signInWithPassword(input.credentials);
      if (logIn.error) return fail(toErrorName(logIn.error));
      await client.auth.signOut({ scope: 'local' }); // 인증코드를 확인하기 전에는 로그인 상태로 두지 않는다
      const otp = await client.auth.signInWithOtp({ phone: input.credentials.phone, options: { shouldCreateUser: false } });
      return otp.error ? fail(toErrorName(otp.error)) : { ok: true, mode: 'login' };
    },

    async resendCode(phoneInput, mode) {
      const phone = normalizePhone(phoneInput);
      if (!phone) return fail('InvalidPhone');
      const { error } = mode === 'signup'
        ? await client.auth.resend({ type: 'sms', phone: toE164(phone) })
        : await client.auth.signInWithOtp({ phone: toE164(phone), options: { shouldCreateUser: false } });
      return error ? fail(toErrorName(error)) : { ok: true };
    },

    async verifyCode(phoneInput, code) {
      const phone = normalizePhone(phoneInput);
      if (!phone) return fail('InvalidPhone');
      if (!isVerificationCode(code)) return fail('InvalidCode');
      const { data, error } = await client.auth.verifyOtp({ phone: toE164(phone), token: code, type: 'sms' });
      if (error) return fail(toErrorName(error));
      return data.session ? { ok: true } : fail('Unknown');
    },

    async logOut() {
      // local: 이 기기에서만 로그아웃한다 (다른 기기의 자동 로그인은 유지)
      await client.auth.signOut({ scope: 'local' });
    },

    async currentUser() {
      const { data, error } = await client.auth.getSession();
      // 오프라인이라 세션을 갱신하지 못한 것은 "로그아웃됨"이 아니다. 호출한 쪽이 구분할 수 있게 던진다
      if (error && toErrorName(error) === 'Network') throw error;
      const user = data.session?.user;
      if (!user) return null;
      return {
        phone: user.phone || null,
        providers: (user.app_metadata?.providers ?? []).filter((name) => SOCIAL_PROVIDERS.includes(name)),
      };
    },

    async availableProviders() {
      try {
        const res = await fetchFn(settingsUrl, { headers: { apikey: publishableKey } });
        if (!res.ok) return null;
        const { external = {} } = await res.json();
        return Object.fromEntries(SOCIAL_PROVIDERS.map((name) => [name, Boolean(external[name])]));
      } catch {
        return null;
      }
    },

    async startSocialLogin(name, redirectTo) {
      if (!SOCIAL_PROVIDERS.includes(name)) return fail('ProviderUnavailable');
      // 성공하면 브라우저가 제공자 로그인 화면으로 이동한다. 처음이면 가입, 있으면 로그인된다.
      const { error } = await client.auth.signInWithOAuth({ provider: name, options: { redirectTo } });
      return error ? fail(toErrorName(error)) : { ok: true };
    },
  };
}
