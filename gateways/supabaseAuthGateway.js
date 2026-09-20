// Infrastructure: 인증 포트(AuthGateway)의 Supabase 구현.
// 화면은 이 객체의 메서드와 오류 "이름"만 안다. Supabase 의 오류 코드 · 응답 모양은 여기서 끝난다.
//
// AuthGateway
//   signUp(phone, password)  → { ok: true } | { ok: false, error }
//   logIn(phone, password)   → { ok: true } | { ok: false, error }
//   logOut()                 → void
//   currentUser()            → { phone, providers } | null        (자동 로그인 확인. 네트워크 오류면 throw)
//   availableProviders()     → { kakao, apple, google } | null    (null = 서버에 닿지 못함)
//   startSocialLogin(name, redirectTo) → { ok: true } | { ok: false, error }
//
// error: 'InvalidPhone' | 'WeakPassword' | 'PhoneTaken' | 'InvalidCredentials' | 'TooManyAttempts'
//      | 'PhoneLoginDisabled' | 'ConfirmationRequired' | 'ProviderUnavailable' | 'Network' | 'Unknown'
import { normalizePhone, toE164, PASSWORD_MIN, PASSWORD_MAX } from '../domain/phone.js';

const SOCIAL_PROVIDERS = ['kakao', 'apple', 'google'];

const ERROR_BY_CODE = {
  user_already_exists: 'PhoneTaken',
  phone_exists: 'PhoneTaken',
  invalid_credentials: 'InvalidCredentials',
  weak_password: 'WeakPassword',
  validation_failed: 'InvalidPhone',
  phone_provider_disabled: 'PhoneLoginDisabled',
  signup_disabled: 'PhoneLoginDisabled',
  phone_not_confirmed: 'ConfirmationRequired',
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
    async signUp(phoneInput, password) {
      const input = readCredentials(phoneInput, password);
      if (!input.ok) return input;
      const { data, error } = await client.auth.signUp(input.credentials);
      if (error) return fail(toErrorName(error));
      // 세션이 안 왔다면 프로젝트에 "전화번호 확인(SMS)"이 켜져 있는 것이다. 가입 즉시 로그인되지 않는다.
      return data.session ? { ok: true } : fail('ConfirmationRequired');
    },

    async logIn(phoneInput, password) {
      const input = readCredentials(phoneInput, password);
      if (!input.ok) return input;
      const { error } = await client.auth.signInWithPassword(input.credentials);
      return error ? fail(toErrorName(error)) : { ok: true };
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
