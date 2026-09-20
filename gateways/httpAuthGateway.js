// Infrastructure(웹 쪽): 인증 포트(AuthGateway)의 HTTP 구현 — 우리 서버의 /api 를 부른다.
// 화면은 이 객체의 메서드와 오류 "이름"만 안다. 주소 · 응답 모양은 여기서 끝난다.
//
// AuthGateway
//   requestCode(phone, password) → { ok: true, mode: 'signup' | 'login', expiresInSeconds } | { ok: false, error }
//   resendCode(phone)            → { ok: true, mode, expiresInSeconds } | { ok: false, error }
//   verifyCode(phone, code, action) → { ok: true } | { ok: false, error }   성공하면 로그인 상태(세션 쿠키)가 된다
//   logOut()                     → void
//   currentUser()                → { phone, providers } | null   (자동 로그인 확인. 네트워크 오류면 throw)
//   availableProviders()         → { kakao, apple, google } | null   (null = 서버에 닿지 못함)
//   startSocialLogin(name)       → 제공자 로그인 화면으로 이동
//
// error: 'InvalidPhone' | 'WeakPassword' | 'InvalidCredentials' | 'InvalidCode' | 'CodeExpired' | 'PhoneTaken'
//      | 'NotRegistered' | 'TooManyAttempts' | 'SmsFailed' | 'Network' | 'ServerUnreachable' | 'Unknown'

export function createHttpAuthGateway({ baseUrl = '', fetchFn = (...args) => fetch(...args), navigate } = {}) {
  async function post(path, body) {
    let res;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: 'Network' };
    }
    // 정적 호스팅(GitHub Pages)처럼 API 서버가 없는 곳에서는 JSON 본문이 오지 않는다
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: 'ServerUnreachable' };
    return res.ok ? { ...data, ok: true } : { ok: false, error: data.error ?? 'Unknown' };
  }

  return {
    requestCode: (phone, password) => post('api/auth/code', { phone, password }),
    resendCode: (phone) => post('api/auth/resend', { phone }),
    verifyCode: (phone, code, action) => post('api/auth/verify', { phone, code, action }),

    async logOut() {
      await post('api/logout', {});
    },

    async currentUser() {
      const res = await fetchFn(`${baseUrl}api/me`, { credentials: 'same-origin' }); // 네트워크 오류는 그대로 던진다
      if (!res.ok) return null;
      return (await res.json()).user;
    },

    async availableProviders() {
      try {
        const res = await fetchFn(`${baseUrl}api/providers`);
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    },

    startSocialLogin(name) {
      navigate(`${baseUrl}auth/${encodeURIComponent(name)}`);
    },
  };
}
