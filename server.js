// backend/server.js
// ESM + dotenv (Render injects envs in prod)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

/* ============= Core ============= */
const PORT = Number(process.env.PORT || 4000);
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5175,https://*.vercel.app')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/* ============= Email (SendGrid only) ============= */
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'akirrestaurants@gmail.com'; // must match verified sender
const MAIL_TO   = process.env.MAIL_TO   || 'akirrestaurants@gmail.com';

if (!SENDGRID_API_KEY) {
  console.warn('⚠️  SENDGRID_API_KEY is missing — emails will fail');
}
if (!MAIL_FROM) {
  console.warn('⚠️  MAIL_FROM is missing — must be a verified SendGrid sender');
}

/* ============= CORS & JSON ============= */
const corsConfig = {
  origin(origin, cb) {
    // allow server-to-server/tools (no Origin) and allowed web origins
    if (!origin) return cb(null, true);
    // wildcard match for *.vercel.app
    const ok =
      ALLOWED_ORIGINS.includes(origin) ||
      (origin.endsWith('.vercel.app') && ALLOWED_ORIGINS.some(o => o.includes('*.vercel.app')));
    return ok ? cb(null, true) : cb(null, false); // don't throw; just deny
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24h
};

app.use(cors(corsConfig));
// Preflight handler (return 204 quickly)
app.options('*', cors(corsConfig), (_req, res) => res.sendStatus(204));

app.use(express.json({ limit: '1mb' }));

/* ============= Send helper ============= */
async function sendWithSendGrid({ to, subject, html }) {
  const fromParsed = (() => {
    // Accept "Name <email>" or plain email
    const m = MAIL_FROM.match(/^\s*(.+?)\s*<\s*(.+?)\s*>\s*$/);
    if (m) return { name: m[1], email: m[2] };
    return { email: MAIL_FROM };
  })();

  const body = {
    personalizations: [
      { to: (Array.isArray(to) ? to : [to]).map(e => ({ email: e })) }
    ],
    from: fromParsed,
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

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`SendGrid ${resp.status}: ${t}`);
  }
}

/* ============= Routes ============= */
app.get('/', (_req, res) => res.type('text/plain').send('AKIR Restaurant Backend'));

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    message: 'AKIR Restaurant Backend is running',
    provider: 'sendgrid',
    emailConfigured: Boolean(SENDGRID_API_KEY && MAIL_FROM && MAIL_TO),
    timestamp: new Date().toISOString(),
  });
});

// Debug: show provider + key presence
app.get('/debug/email-provider', (_req, res) => {
  res.json({
    provider: 'sendgrid',
    hasSendGridKey: !!SENDGRID_API_KEY,
    mailFrom: MAIL_FROM || '(missing)',
    mailTo: MAIL_TO || '(missing)',
  });
});

// Debug: send a test email (GET /debug/test-email?to=you@example.com)
app.get('/debug/test-email', async (req, res) => {
  try {
    const to = (req.query.to || MAIL_TO)?.toString();
    if (!to) return res.status(400).json({ ok: false, error: 'No recipient' });

    await sendWithSendGrid({
      to,
      subject: 'AKIR Restaurant — SendGrid test',
      html: `<p>SendGrid test at ${new Date().toISOString()}</p>`,
    });

    res.json({ ok: true, provider: 'sendgrid', sentTo: to });
  } catch (e) {
    console.error('Test email failed:', e);
    res.status(500).json({ ok: false, provider: 'sendgrid', error: String(e) });
  }
});

// Reservations
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
      <p><b>Note:</b> If you don't see our email, please check your <i>Spam</i> folder and mark it as "Not spam".</p>
    `;

    await Promise.all([
      sendWithSendGrid({ to: MAIL_TO, subject: adminSubject, html: adminHtml }),
      sendWithSendGrid({ to: email,   subject: customerSubject, html: customerHtml }),
    ]);

    return res.json({ success: true, message: 'Reservation request received', reservationId: `AKIR-${Date.now()}` });
  } catch (error) {
    console.error('Error processing reservation:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Contact form
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    await sendWithSendGrid({
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
  console.log(`🚀 AKIR Restaurant Backend (SendGrid) running on :${PORT}`);
  console.log('CORS ORIGINS:', ALLOWED_ORIGINS);
});
