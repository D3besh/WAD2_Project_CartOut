import { api } from './api.js';

export const register = (details) => api('/auth/register', { method: 'POST', body: details });
export const login = (email, password) => api('/auth/login', { method: 'POST', body: { email, password } });
export const logout = () => api('/auth/logout', { method: 'POST' });
export const getCurrentUser = () => api('/auth/me');
