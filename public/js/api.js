// Thin fetch wrapper with JWT token handling. Exposed as window.API.
(function () {
  const TOKEN_KEY = 'hwp_token';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch('/api' + path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      setToken(null);
      if (!path.startsWith('/auth')) {
        window.dispatchEvent(new Event('hwp:logout'));
      }
    }

    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await res.json();

    if (!res.ok) {
      const message = (data && data.error) || `Ошибка ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  window.API = {
    getToken, setToken,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    del: (p, b) => request('DELETE', p, b),
    // Direct URL for file downloads that need the auth header via fetch-blob
    async download(path, filename) {
      const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + getToken() } });
      if (!res.ok) throw new Error('Не удалось скачать файл');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    },
  };
})();
