// Builds the customer message for an order's current stage.
// The order must have items.product populated.
// Keep the wording in sync with `generated` in client/src/views/OrderDetailView.vue.
export function buildStatusMessage(order) {
  const parts = [];
  for (const item of order.items) {
    let text = item.quantity + ' ' + (item.product ? item.product.name : 'item');
    if (item.variant) text += ' (' + item.variant + ')';
    parts.push(text);
  }
  const items = parts.join(', ');
  const name = order.customerName;
  const how = order.fulfilmentMethod === 'delivery' ? 'delivering to you' : 'ready for you to collect';

  if (order.status === 'cancelled') {
    return `Hi ${name}, your order of ${items} has been cancelled. Please reach out if you have any questions.`;
  }
  if (order.status === 'ready') {
    return `Hi ${name}! Your order of ${items} is ready 🎉 We are ${how}. Thank you for your support!`;
  }
  if (order.status === 'completed') {
    return `Hi ${name}! Thanks for your order of ${items}. Hope you enjoy it! 😊`;
  }
  return `Hi ${name}! Thanks for your order of ${items}. We're working on it now 😊`;
}