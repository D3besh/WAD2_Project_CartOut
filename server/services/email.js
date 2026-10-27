// Sends plain-text emails through Gmail using Nodemailer.
//
// How it works: Nodemailer logs in to Gmail's SMTP server (smtp.gmail.com)
// with the app's Gmail address and an app password, hands over the email,
// and Gmail delivers it to the customer's inbox.
//
// Needs GMAIL_USER and GMAIL_APP_PASSWORD in .env. If they are missing,
// emails are skipped, so the app (and the tests) still work without them.
import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// The transporter is the connection settings, created once.
// service: 'gmail' fills in Gmail's server address, port and encryption.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

// Sends one email. Never throws, so an email problem can't break saving an order.
//   to       customer's email address
//   subject  email subject line
//   text     the message body
//   fromName name shown as the sender, e.g. the shop name
//   replyTo  where the customer's replies go (the seller's email)
export async function sendEmail(to, subject, text, fromName, replyTo) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !to) return;

  try {
    await transporter.sendMail({
      from: '"' + (fromName || 'CartOut') + '" <' + GMAIL_USER + '>',
      to: to,
      replyTo: replyTo,
      subject: subject,
      text: text,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

// Checks the Gmail login once at startup and prints the result,
// so a wrong app password shows up straight away in the server log.
export async function checkEmailLogin() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.log('GMAIL_USER or GMAIL_APP_PASSWORD not set, email notifications are off');
    return;
  }
  try {
    await transporter.verify();
    console.log('Email notifications are on (sending as ' + GMAIL_USER + ')');
  } catch (err) {
    console.error('Gmail login failed, check GMAIL_USER and GMAIL_APP_PASSWORD:', err.message);
  }
}