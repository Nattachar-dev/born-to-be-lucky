
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiUrl = (path) => {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

// อ่าน Cookie จาก Browser
const getCookie = (name) => {
  const cookies = document.cookie.split(';');

  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=');

    if (key === name) {
      return decodeURIComponent(value.join('='));
    }
  }

  return null;
};

// ส่ง Request ไปยัง Backend
export const apiFetch = (path, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();

  const headers = new Headers(options.headers || {});

  // เพิ่ม CSRF Token สำหรับ Request ที่เปลี่ยนแปลงข้อมูล
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    const csrfToken = getCookie('csrftoken');

    if (csrfToken) {
      headers.set('X-CSRFToken', csrfToken);
    }
  }

  return fetch(apiUrl(path), {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
  });
};
