// Supabase 프로젝트 (HyunsStory). publishable key 는 브라우저에 공개해도 되는 키다.
// 비밀 키(sb_secret_…, service_role)는 절대 이 저장소에 넣지 않는다.
export const SUPABASE_URL = 'https://vbcodtfqsvykopzabbes.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2RdKkPR-c8Yg9jStSplOug_n4ihBsDi';

// 세션을 저장하는 localStorage 키. index.html 의 자동 로그인 스크립트가 같은 이름을 본다.
export const AUTH_STORAGE_KEY = 'hyunsstory-auth';

// 인증코드 유효 시간(초). Supabase 대시보드의 Phone → "SMS OTP Expiry" 와 같은 값이어야 한다 (시안의 03:00)
export const SMS_CODE_TTL_SECONDS = 180;
