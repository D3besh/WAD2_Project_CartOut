import { api } from './api.js';

export const listOrders = (params = {}) => api(`/orders?${new URLSearchParams(params)}`);
export const getOrder = (id) => api(`/orders/${id}`);
export const createOrder = (order) => api('/orders', { method: 'POST', body: order });
export const updateOrder = (id, order) => api(`/orders/${id}`, { method: 'PUT', body: order });
export const updateOrderStatus = (id, status) => api(`/orders/${id}/status`, { method: 'PATCH', body: { status } });
export const deleteOrder = (id) => api(`/orders/${id}`, { method: 'DELETE' });
export const extractOrder = (message) => api('/orders/extract', { method: 'POST', body: { message } });
export const checkOrder = (draft) => api('/orders/check', { method: 'POST', body: draft });
export const getTodaysDeliveries = () => api('/deliveries/today');
