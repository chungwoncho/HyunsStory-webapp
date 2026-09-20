// Domain: 전화번호 · 비밀번호 규칙. 브라우저 · Supabase 를 모르는 순수 함수만 둔다.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

// 숫자 · 공백 · 하이픈 말고 다른 글자가 섞였는가
export const hasNonDigits = (value) => /[^\d\s-]/.test(value);

// "010 - 1234 - 5678", "+82 10 1234 5678", "821012345678" → "01012345678". 휴대폰 번호가 아니면 null
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('82')) digits = '0' + digits.slice(2);
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

// 01012345678 → +821012345678 (Supabase Auth 가 받는 국제 표기)
export const toE164 = (phone) => `+82${phone.slice(1)}`;

// 입력 중 표기: 01012345678 → 010 - 1234 - 5678 (10자리는 010 - 123 - 4567)
export function formatPhone(value) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)} - ${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)} - ${d.slice(3, 6)} - ${d.slice(6)}`;
  return `${d.slice(0, 3)} - ${d.slice(3, 7)} - ${d.slice(7)}`;
}

// 화면에는 가운데를 가려서만 보여 준다: 010-****-5678
export function maskPhone(input) {
  const phone = normalizePhone(input);
  return phone ? `${phone.slice(0, 3)}-****-${phone.slice(-4)}` : null;
}
