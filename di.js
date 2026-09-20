// Composition root: 구현체(Supabase)를 아는 곳은 이 파일뿐이다. 화면은 authGateway 만 가져다 쓴다.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AUTH_STORAGE_KEY } from './config.js';
import { createSupabaseAuthGateway } from './gateways/supabaseAuthGateway.js';

const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,      // 자동 로그인: 세션을 localStorage 에 보관
    autoRefreshToken: true,    // 만료 전에 알아서 갱신
    detectSessionInUrl: true,  // 간편 로그인에서 돌아올 때 주소에 실려 온 세션을 받는다
  },
});

export const authGateway = createSupabaseAuthGateway(client, {
  settingsUrl: `${SUPABASE_URL}/auth/v1/settings`,
  publishableKey: SUPABASE_PUBLISHABLE_KEY,
});
