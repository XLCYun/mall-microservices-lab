export const phonePath = 'signup/verify-phone';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

export async function verifyPhone(request) {
  if (request.method !== 'POST') return json({ error: '请使用 POST 方法。' }, 405, { Allow: 'POST' });
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') return json({ error: '请求体需要使用 application/json。' }, 415);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: '请求体不是有效的 JSON。' }, 400);
  }
  if (typeof input?.phone !== 'string') return json({ error: 'phone 字段需要是字符串。' }, 400);
  return json({ valid: /^1[3-9][0-9]{9}$/.test(input.phone) });
}
