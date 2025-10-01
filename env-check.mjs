import 'dotenv/config';
console.log({
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: !!process.env.SMTP_PASS,
  SMTP_HOST: process.env.SMTP_HOST,
  MAIL_TO: process.env.MAIL_TO,
  ENABLE_EMAIL: process.env.ENABLE_EMAIL,
});
