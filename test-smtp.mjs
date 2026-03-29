import 'dotenv/config';
import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = Number(process.env.SMTP_PORT || 465);
const secure = String(process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true';
const user = process.env.EMAIL_USER || process.env.SMTP_USER;
const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;

console.log('Using:', {host, port, secure, user, pass: !!pass});

const t = nodemailer.createTransport({host, port, secure, auth: {user, pass}});
try {
  await t.verify();
  console.log('✅ SMTP verify passed');
  await t.sendMail({
    from: process.env.MAIL_FROM || user,
    to: process.env.MAIL_TO || user,
    subject: 'SMTP test',
    text: 'Hello from AKIR-Restaurant backend',
  });
  console.log('✅ Test email sent');
} catch (e) {
  console.error('❌ SMTP error:', e.message || e);
}
