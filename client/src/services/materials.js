import { api } from './api.js';

export const listMaterials = () => api('/materials');
export const getShoppingList = () => api('/materials/shopping-list');
export const createMaterial = (material) => api('/materials', { method: 'POST', body: material });
export const updateMaterial = (id, material) => api(`/materials/${id}`, { method: 'PUT', body: material });
export const restockMaterial = (id, update) => api(`/materials/${id}/restock`, { method: 'PATCH', body: update });
export const deleteMaterial = (id) => api(`/materials/${id}`, { method: 'DELETE' });
