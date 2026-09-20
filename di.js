// Composition root (웹): 구현체를 아는 곳은 이 파일뿐이다. 화면은 authGateway 만 가져다 쓴다.
import { API_BASE_URL } from './config.js';
import { createHttpAuthGateway } from './gateways/httpAuthGateway.js';

export const authGateway = createHttpAuthGateway({
  baseUrl: API_BASE_URL,
  navigate: (url) => { location.href = url; },
});
