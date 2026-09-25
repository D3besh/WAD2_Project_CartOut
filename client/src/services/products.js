import { api } from './api.js';

export const listProducts = () => api('/products');
export const getProduct = (id) => api(`/products/${id}`);
export const createProduct = (product) => api('/products', { method: 'POST', body: product });
export const updateProduct = (id, product) => api(`/products/${id}`, { method: 'PUT', body: product });
export const deleteProduct = (id) => api(`/products/${id}`, { method: 'DELETE' });
