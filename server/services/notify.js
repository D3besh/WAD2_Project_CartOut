// Emails the customer the message for their order's current stage.
// Does nothing if the order has no customer email.
// The order must have items.product populated.
import User from '../models/User.js';
import { sendEmail } from './email.js';
import { buildStatusMessage } from './messages.js';

export async function notifyCustomer(order) {
  if (!order.customerEmail) return;

  const text = buildStatusMessage(order);
  const seller = await User.findById(order.seller);
  const shopName = seller ? seller.shopName : 'CartOut';
  const sellerEmail = seller ? seller.email : undefined;

  await sendEmail(
    order.customerEmail,
    'Update on your order from ' + shopName,
    text,
    shopName,    // shown as the sender's name
    sellerEmail  // customer replies go to the seller
  );
}