const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiUrl = (path) => {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

export const apiFetch = (path, options = {}) => {
  return fetch(apiUrl(path), options);
};