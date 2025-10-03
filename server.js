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

/* ================= Core ================= */
const PORT = Number(process.env.PORT || 4000);

// Add both localhost and your deployed frontend(s) here, comma-separated in env:
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ||
  'http://localhost:5175,https://web-restaurant-frontend-git-main-akashs-projects-10cba8a4.vercel.app'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/* ================ Email (SendGrid Only) ================ */
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'AKIR Restaurant <akirrestaurants@gmail.com>'; // must be a verified Single Sender or a domain-verified address
const MAIL_TO   = process.env.MAIL_TO   || 'akirrestaurants@gmail.com'; // owner inbox (can be same as from)

// Helper to split "Name <addr@x>" or just "addr@x"
function parseFrom(from) {
  if (from.includes('<')) {
    const name = from.split('<')[0].trim();
    const addr = from.split('<')[1].replace('>', '').trim();
    return { name, addr };
  }
  return { name: undefined, addr: from };
}

async function sendWithSendGrid({ to, subject, html }) {
  if (!SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY missing');
  }
  const { name, addr } = parseFrom(MAIL_FROM);

  const body = {
    personalizations: [
      { to: (Array.isArray(to) ? to : [to]).map(e => ({ email: e })) }
    ],
    from: name ? { name, email: addr } : { email: addr },
    subject,
    content: [{ type: 'text/html', value: html }]
  };

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    // Common causes: from address not verified, key invalid, trial restrictions
    throw new Error(`SendGrid ${resp.status} ${resp.statusText} :: ${txt}`);
  }
}

/* ================ Middleware (CORS + JSON) ================ */
const corsConfig = {
  origin(origin, cb) {
    // allow server-to-server/tools (no Origin) and explicit allowlist
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
};

app.use(cors(corsConfig));
app.options('*', cors(corsConfig));      // important for preflight
app.use(express.json({ limit: '1mb' }));

/* ================= Routes ================= */
app.get('/', (_req, res) => res.type('text/plain').send('AKIR Restaurant Backend'));

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    message: 'AKIR Restaurant Backend is running',
    provider: 'sendgrid',
    emailConfigured: !!SENDGRID_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

/* ---------- Debug routes (safe to keep) ---------- */
// See which provider + flags the server sees
app.get('/debug/email-provider', (_req, res) => {
  res.json({
    provider: 'sendgrid',
    hasSendGridKey: !!SENDGRID_API_KEY,
    mailFrom: MAIL_FROM,
    mailTo: MAIL_TO
  });
});

// Send a test email quickly: GET /debug/test-email?to=you@example.com
app.get('/debug/test-email', async (req, res) => {
  try {
    const to = (req.query.to || MAIL_TO)?.toString();
    if (!to) return res.status(400).json({ ok: false, error: 'No recipient' });

    await sendWithSendGrid({
      to,
      subject: 'AKIR Restaurant — SendGrid test',
      html: `<p>SendGrid test at ${new Date().toISOString()}</p>`
    });

    res.json({ ok: true, provider: 'sendgrid', sentTo: to });
  } catch (e) {
    console.error('Test email failed:', e);
    res.status(500).json({ ok: false, provider: 'sendgrid', error: String(e) });
  }
});

/* ---------- Business routes ---------- */
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
      <p><b>Heads up:</b> Sometimes emails land in <b>Spam</b>. Please check there if you don't see it in Inbox.</p>
      <p>We will contact you within 24 hours to confirm.</p>
    `;

    // send emails (owner + customer) via SendGrid
    await Promise.all([
      sendWithSendGrid({ to: MAIL_TO, subject: adminSubject, html: adminHtml }),
      sendWithSendGrid({ to: email,   subject: customerSubject, html: customerHtml }),
    ]);

    return res.json({
      success: true,
      message: 'Reservation request received',
      reservationId: `AKIR-${Date.now()}`
    });
  } catch (error) {
    console.error('Error processing reservation:', error);
    // Don’t leak secrets to client; show generic; details go to Render logs
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const html = `
      <h2>New Contact Form Submission</h2>
      <p><b>Name:</b> ${name}<br/><b>Email:</b> ${email}</p>
      <p><b>Subject:</b> ${subject || 'General Inquiry'}</p>
      <pre style="white-space:pre-wrap">${message}</pre>
    `;
    await sendWithSendGrid({ to: MAIL_TO, subject: `Contact Form: ${subject || 'General Inquiry'}`, html });
    return res.json({ success: true, message: 'Contact form submitted successfully' });
  } catch (error) {
    console.error('Error processing contact form:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AKIR Restaurant Backend running on port ${PORT}`);
  console.log('⚙️  Config:', {
    PORT,
    ALLOWED_ORIGINS,
    provider: 'sendgrid',
    hasSendGridKey: !!SENDGRID_API_KEY,
    MAIL_FROM,
    MAIL_TO,
  });
});
