// Emails the customer about their order.
// Does nothing if the order has no customer email.
// The order must have items.product populated.
//
//   notifyCustomer(order)                    message for the order's current stage
//   notifyCustomer(order, 'refund', amount)  refund confirmation for this refund
import User from '../models/User.js';
import { sendEmail } from './email.js';
import { buildMessage } from './messages.js';

export async function notifyCustomer(order, type, refundNow) {
  if (!order.customerEmail) return;

  const seller = await User.findById(order.seller);
  const shopName = seller ? seller.shopName : 'CartOut';
  const sellerEmail = seller ? seller.email : undefined;

  const message = buildMessage(order, shopName, type, refundNow);

  await sendEmail(
    order.customerEmail,
    message.subject,
    message.text,
    shopName,    // shown as the sender's name
    sellerEmail  // customer replies go to the seller
  );
}