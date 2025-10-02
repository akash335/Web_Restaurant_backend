// backend/server.js
// ESM + dotenv (Render injects envs in prod)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';

const app = express();

/* ============= Core config ============= */
const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5175')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/* ============= Email config ============= */
// Prefer HTTPS providers (no SMTP timeouts on Render free)
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const RESEND_API_KEY   = process.env.RESEND_API_KEY   || '';
const PROVIDER =
  SENDGRID_API_KEY ? 'sendgrid' :
  RESEND_API_KEY   ? 'resend'   :
  'smtp';

const MAIL_FROM = process.env.MAIL_FROM || 'AKIR Restaurant <akirrestaurants@gmail.com>';
const MAIL_TO   = process.env.MAIL_TO   || 'akirrestaurants@gmail.com';

// SMTP fallback (only used if no API key present)
const SMTP_HOST   = process.env.SMTP_HOST  || 'smtp.gmail.com';
const SMTP_PORT   = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE).toLowerCase() === 'true' || SMTP_PORT === 465;
const SMTP_USER   = process.env.SMTP_USER || process.env.EMAIL_USER || '';
const SMTP_PASS   = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';

/* ============= Middleware ============= */
app.use(cors({
  origin(origin, cb) {
    if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

/* ============= Email senders ============= */
let smtpTransporter = null;
if (PROVIDER === 'smtp' && SMTP_USER && SMTP_PASS) {
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,            // true only for 465
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    requireTLS: !SMTP_SECURE,       // enforce STARTTLS on 587
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: { minVersion: 'TLSv1.2' },
  });
  smtpTransporter.verify().then(
    () => console.log('✅ SMTP verified'),
    () => console.warn('⚠️ SMTP verify failed (fallback only)'),
  );
}

async function sendWithSendGrid({ to, subject, html }) {
  const [name, addr] = MAIL_FROM.includes('<')
    ? [MAIL_FROM.split('<')[0].trim(), MAIL_FROM.split('<')[1].replace('>', '').trim()]
    : [undefined, MAIL_FROM];

  const body = {
    personalizations: [{ to: (Array.isArray(to) ? to : [to]).map(e => ({ email: e })) }],
    from: name ? { name, email: addr } : { email: addr },
    subject,
    content: [{ type: 'text/html', value: html }],
  };

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`SendGrid ${resp.status}: ${await resp.text()}`);
}

async function sendWithResend({ to, subject, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: MAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}

async function sendWithSMTP({ to, subject, html }) {
  if (!smtpTransporter) throw new Error('SMTP not configured');
  await smtpTransporter.sendMail({
    from: MAIL_FROM,
    to: Array.isArray(to) ? to.join(',') : to,
    subject,
    html,
  });
}

async function sendEmail({ to, subject, html }) {
  if (PROVIDER === 'sendgrid') return sendWithSendGrid({ to, subject, html });
  if (PROVIDER === 'resend')   return sendWithResend({ to, subject, html });
  return sendWithSMTP({ to, subject, html });
}

/* ============= Routes ============= */
app.get('/', (_req, res) => res.type('text/plain').send('AKIR Restaurant Backend'));

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    message: 'AKIR Restaurant Backend is running',
    provider: PROVIDER, // keep or remove if you don't want to reveal provider
    emailConfigured:
      (PROVIDER === 'sendgrid' && !!SENDGRID_API_KEY) ||
      (PROVIDER === 'resend' && !!RESEND_API_KEY) ||
      (PROVIDER === 'smtp' && !!(SMTP_USER && SMTP_PASS)),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/reservations', async (req, res) => {
  try {
    const { name, email, phone, date, time, guests, message, specialRequests } = req.body || {};
    if (!name || !email || !phone || !date || !time || !guests) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const notes = specialRequests ?? message ?? '';

    const adminSubject = `New Reservation Request - ${name}`;
    const adminHtml = `
      <h2>New Reservation Request - AKIR Restaurant</h2>
      <h3>Customer</h3>
      <p><b>Name:</b> ${name}<br/><b>Email:</b> ${email}<br/><b>Phone:</b> ${phone}</p>
      <h3>Reservation</h3>
      <p><b>Date:</b> ${new Date(date).toLocaleDateString()}<br/><b>Time:</b> ${time}<br/><b>Guests:</b> ${guests}</p>
      ${notes ? `<p><b>Notes:</b> ${notes}</p>` : ''}
    `;

    const customerSubject = 'Reservation Request Received - AKIR Restaurant';
    const customerHtml = `
      <h2>Thanks, ${name}!</h2>
      <p>We received your reservation request.</p>
      <p><b>Date:</b> ${new Date(date).toLocaleDateString()} |
         <b>Time:</b> ${time} |
         <b>Guests:</b> ${guests}</p>
      ${notes ? `<p><b>Your notes:</b> ${notes}</p>` : ''}
      <p>We will contact you within 24 hours to confirm.</p>
    `;

    await Promise.all([
      sendEmail({ to: MAIL_TO, subject: adminSubject, html: adminHtml }),
      sendEmail({ to: email,   subject: customerSubject, html: customerHtml }),
    ]);

    return res.json({ success: true, message: 'Reservation request received', reservationId: `AKIR-${Date.now()}` });
  } catch (error) {
    console.error('Error processing reservation:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    await sendEmail({
      to: MAIL_TO,
      subject: `Contact Form: ${subject || 'General Inquiry'}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><b>Name:</b> ${name}<br/><b>Email:</b> ${email}</p>
        <p><b>Subject:</b> ${subject || 'General Inquiry'}</p>
        <pre style="white-space:pre-wrap">${message}</pre>
      `,
    });
    return res.json({ success: true, message: 'Contact form submitted successfully' });
  } catch (error) {
    console.error('Error processing contact form:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AKIR Restaurant Backend running on port ${PORT}`);
});
