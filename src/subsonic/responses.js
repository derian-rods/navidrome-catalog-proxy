export function okResponse(payload = {}) {
  return {
    'subsonic-response': {
      status: 'ok',
      version: '1.16.1',
      type: 'navidrome-catalog-proxy',
      serverVersion: '0.1.0',
      ...payload
    }
  };
}
