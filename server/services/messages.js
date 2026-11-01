// Builds the customer message (email and "Copy message") for an order.
//
// There are 5 kinds of message:
//   'in-progress'  Order confirmation   (order logged)
//   'ready'        Order ready          (stage changed to Ready)
//   'completed'    Receipt              (stage changed to Completed)
//   'cancelled'    Order cancelled      (order cancelled)
//   'refund'       Refund confirmation  (refund recorded)
//
// Each one is different for delivery and self-collect orders.
// The order must have items.product populated.
//
// Returns { subject, text }. The text is plain text, so it works both in an
// email and when the seller copies it into WhatsApp or Instagram.

const TZ = process.env.SHOP_TZ ?? 'Asia/Singapore'; // same timezone as order numbers
const LINE = '----------------------------------------';


// ---------- small helpers ----------

// money(41) → "$41.00"
function money(n) {
  return '$' + Number(n || 0).toFixed(2);
}

// formatDate(date) → "Tue, 28 Oct 2026"
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-SG', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

// formatDateTime(date) → "Fri, 31 Oct 2026, 2:00 pm"
function formatDateTime(date) {
  const time = new Date(date).toLocaleTimeString('en-SG', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit',
  }).toLowerCase();
  return formatDate(date) + ', ' + time;
}

// The order number, e.g. "ORD-261028-03".
// Very old orders may not have one, so fall back to part of the database id.
function orderNumber(order) {
  return order.orderNo || '#' + String(order._id).slice(-6).toUpperCase();
}

// How much the customer has paid so far
function amountPaid(order) {
  if (order.paymentStatus === 'paid') return order.price;
  if (order.paymentStatus === 'deposit') return order.depositAmount || 0;
  return 0;
}

// The 'refund' message is shown for refunded orders, otherwise the stage message.
// Used by "Copy message" on the order page.
export function messageType(order) {
  if (order.refundAmount > 0) return 'refund';
  return order.status;
}


// ---------- the parts every message shares ----------

// "ITEMS" block, plus a subtotal and adjustment line if the seller
// changed the total by hand (e.g. gave a discount).
function itemLines(order) {
  const lines = ['ITEMS'];
  let subtotal = 0;
  let allPricesKnown = true;

  for (const item of order.items) {
    let name = item.product ? item.product.name : 'Item';
    if (item.variant) name += ' (' + item.variant + ')';

    // unitPrice is copied onto the order when it's saved.
    // Older orders may not have it, so use the product's price instead.
    let unitPrice = item.unitPrice;
    if (unitPrice == null && item.product) unitPrice = item.product.price;

    if (unitPrice == null) {
      allPricesKnown = false;
      lines.push(item.quantity + ' x ' + name);
    } else {
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      lines.push(item.quantity + ' x ' + name + ' @ ' + money(unitPrice) + '   ' + money(lineTotal));
    }
  }

  lines.push('');

  // Only show an adjustment if the items don't add up to the total
  const difference = order.price - subtotal;
  if (allPricesKnown && Math.abs(difference) >= 0.01) {
    lines.push('Subtotal:          ' + money(subtotal));
    if (difference < 0) {
      lines.push('Discount:          -' + money(-difference));
    } else {
      lines.push('Adjustment:        +' + money(difference));
    }
  }

  return lines;
}

// Header block: title, order number, order date (and refund date for refunds)
function headerLines(order, title) {
  const lines = [
    LINE,
    title,
    'Order no:      ' + orderNumber(order),
    'Order date:    ' + formatDate(order.createdAt),
  ];
  if (title === 'REFUND CONFIRMATION' && order.refundedAt) {
    lines.push('Refund date:   ' + formatDate(order.refundedAt));
  }
  lines.push(LINE);
  return lines;
}

// Payment lines for orders that are still to be delivered or collected.
// whenDue is added after the balance, e.g. "(payable upon collection)".
function paymentDueLines(order, whenDue) {
  const lines = ['Total:             ' + money(order.price)];
  const paid = amountPaid(order);
  const balance = order.price - paid;
  const note = whenDue ? ' (' + whenDue + ')' : '';

  if (order.paymentStatus === 'paid' || balance <= 0) {
    lines.push('Payment:           Paid in full');
  } else if (paid > 0) {
    lines.push('Deposit paid:      ' + money(paid));
    lines.push('Balance due:       ' + money(balance) + note);
  } else {
    lines.push('Amount due:        ' + money(order.price) + note);
  }
  return lines;
}

// "Delivery" or "Self-collection"
function fulfilmentName(order) {
  return order.fulfilmentMethod === 'delivery' ? 'Delivery' : 'Self-collection';
}

function isDelivery(order) {
  return order.fulfilmentMethod === 'delivery';
}

// Joins the parts into one message: greeting, opening, details, closing, sign-off
function assemble(order, shopName, opening, details, closing) {
  return [
    'Dear ' + order.customerName + ',',
    '',
    ...opening,
    '',
    ...details,
    LINE,
    '',
    ...closing,
    'If you have any questions, simply reply to this message.',
    '',
    'Kind regards,',
    shopName,
  ].join('\n');
}


// ---------- the 5 messages ----------

// 1. Order confirmation (order logged, stage "In progress")
function confirmationMessage(order, shopName) {
  const details = [
    ...headerLines(order, 'ORDER CONFIRMATION'),
    '',
    ...itemLines(order),
    ...paymentDueLines(order, ''),
    '',
  ];

  let closing;
  if (isDelivery(order)) {
    details.push('DELIVERY');
    details.push('Address:       ' + (order.deliveryAddress || '-'));
    details.push('Due:           ' + formatDateTime(order.dueAt));
    closing = ['We will let you know when your order is ready for delivery.'];
  } else {
    details.push('SELF-COLLECTION');
    details.push('Collect on:    ' + formatDateTime(order.dueAt));
    closing = ['We will let you know when your order is ready for collection.'];
  }

  return {
    subject: 'Order confirmed: ' + orderNumber(order),
    text: assemble(
      order,
      shopName,
      [
        'Thank you for your order with ' + shopName + '. We have received it',
        'and started preparing it. Your order details are below.',
      ],
      details,
      closing
    ),
  };
}

// 2. Order ready
function readyMessage(order, shopName) {
  let opening;
  let details;
  let closing;

  if (isDelivery(order)) {
    opening = [
      'Good news! Your order ' + orderNumber(order) + ' is ready and will be',
      'delivered to you on ' + formatDateTime(order.dueAt) + '.',
    ];
    details = [
      ...headerLines(order, 'ORDER READY: DELIVERY'),
      '',
      ...itemLines(order),
      ...paymentDueLines(order, 'payable upon delivery'),
      '',
      'Address:       ' + (order.deliveryAddress || '-'),
      'Delivery on:   ' + formatDateTime(order.dueAt),
    ];
    closing = ['Please ensure someone is available to receive the order.'];
  } else {
    opening = ['Good news! Your order ' + orderNumber(order) + ' is ready for collection.'];
    details = [
      ...headerLines(order, 'ORDER READY: SELF-COLLECTION'),
      '',
      ...itemLines(order),
      ...paymentDueLines(order, 'payable upon collection'),
      '',
      'Collect from:  ' + formatDateTime(order.dueAt),
    ];
    closing = ['Please let us know when you will be collecting, or if you need to change the timing.'];
  }

  return {
    subject: 'Your order is ready: ' + orderNumber(order),
    text: assemble(order, shopName, opening, details, closing),
  };
}

// 3. Receipt (stage "Completed")
function receiptMessage(order, shopName) {
  const paid = amountPaid(order);
  const outstanding = order.price - paid;

  const details = [
    ...headerLines(order, 'RECEIPT'),
    '',
    ...itemLines(order),
    'Total:             ' + money(order.price),
    'Amount paid:       ' + money(paid),
  ];
  if (outstanding > 0) {
    details.push('Outstanding:       ' + money(outstanding));
  } else {
    details.push('Payment:           Paid in full');
  }
  details.push('');

  // The app doesn't record the exact delivery/collection time,
  // so use the last time the order was updated (when it was marked Completed).
  let opening;
  if (isDelivery(order)) {
    details.push('Delivered on:  ' + formatDate(order.updatedAt));
    details.push('Address:       ' + (order.deliveryAddress || '-'));
    opening = ['Thank you for shopping with ' + shopName + '. Your order has been delivered.'];
  } else {
    details.push('Collected on:  ' + formatDate(order.updatedAt));
    opening = ['Thank you for collecting your order from ' + shopName + '.'];
  }
  opening.push('Here is your receipt for your records.');

  return {
    subject: 'Receipt for ' + orderNumber(order),
    text: assemble(
      order,
      shopName,
      opening,
      details,
      ['We hope you enjoy your order and look forward to serving you again.']
    ),
  };
}

// 4. Order cancelled (same for delivery and self-collect)
function cancelledMessage(order, shopName) {
  const paid = amountPaid(order);

  const details = [
    ...headerLines(order, 'ORDER CANCELLED'),
    '',
    ...itemLines(order),
    'Order total:       ' + money(order.price),
  ];
  if (paid > 0) details.push('Amount paid:       ' + money(paid));
  if (order.forfeitedAmount > 0) {
    details.push('Deposit retained:  ' + money(order.forfeitedAmount) + ' (non-refundable)');
  }
  details.push('');
  details.push('Fulfilment:    ' + fulfilmentName(order));
  if (order.cancelledAt) details.push('Cancelled on:  ' + formatDate(order.cancelledAt));

  const closing = [];
  // Money paid that isn't kept as a deposit may be refunded later
  if (paid - (order.forfeitedAmount || 0) > 0 && !(order.refundAmount > 0)) {
    closing.push('Any refund due to you will be confirmed in a separate message.');
  }

  return {
    subject: 'Order cancelled: ' + orderNumber(order),
    text: assemble(
      order,
      shopName,
      ['We are writing to confirm that your order with ' + shopName + ' has been cancelled.'],
      details,
      closing
    ),
  };
}

// 5. Refund confirmation (same for delivery and self-collect)
// refundNow = the amount refunded this time. If not given (e.g. "Copy message"),
// the total refunded so far is shown.
function refundMessage(order, shopName, refundNow) {
  const paid = amountPaid(order);
  const totalRefunded = order.refundAmount || 0;
  const thisRefund = refundNow != null ? refundNow : totalRefunded;

  const details = [
    ...headerLines(order, 'REFUND CONFIRMATION'),
    '',
    ...itemLines(order),
    'Order total:       ' + money(order.price),
    'Amount paid:       ' + money(paid),
    'Refund amount:     ' + money(thisRefund),
  ];
  // Second or later refund on the same order: show the running total
  if (Math.abs(totalRefunded - thisRefund) >= 0.01) {
    details.push('Total refunded:    ' + money(totalRefunded));
  }
  details.push('');
  details.push('Fulfilment:    ' + fulfilmentName(order));

  const opening = [];
  if (order.status === 'cancelled') {
    opening.push('Following the cancellation of your order, we have processed a refund.');
  } else {
    opening.push('We have processed a refund for your order with ' + shopName + '.');
  }
  // Everything the customer paid (minus any retained deposit) has now been refunded
  if (paid > 0 && totalRefunded >= paid - (order.forfeitedAmount || 0)) {
    opening.push('Your payment has been refunded in full. The details are below.');
  } else {
    opening.push('The details are below.');
  }

  return {
    subject: 'Refund processed: ' + orderNumber(order),
    text: assemble(
      order,
      shopName,
      opening,
      details,
      ['We apologise for any inconvenience caused.']
    ),
  };
}


// ---------- main function ----------

// type      'in-progress' | 'ready' | 'completed' | 'cancelled' | 'refund'
//           (leave out to use the order's current stage)
// refundNow only for 'refund': the amount refunded this time
export function buildMessage(order, shopName, type, refundNow) {
  const kind = type || order.status;
  const shop = shopName || 'CartOut';

  if (kind === 'refund') return refundMessage(order, shop, refundNow);
  if (kind === 'cancelled') return cancelledMessage(order, shop);
  if (kind === 'completed') return receiptMessage(order, shop);
  if (kind === 'ready') return readyMessage(order, shop);
  return confirmationMessage(order, shop);
}