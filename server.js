// backend/server.js
// ESM + dotenv (Render will also inject envs)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';

const app = express();

// ---------- Core config ----------
const PORT = Number(process.env.PORT || 4000);

// Comma-separated list of allowed origins (add your deployed frontend origin here)
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5175')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// ---------- Email config (Gmail SMTP) ----------
const SMTP_HOST   = process.env.SMTP_HOST  || 'smtp.gmail.com';
const SMTP_PORT   = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE).toLowerCase() === 'true' || SMTP_PORT === 465;

const SMTP_USER   = process.env.SMTP_USER || process.env.EMAIL_USER || '';
const SMTP_PASS   = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';

const MAIL_FROM   = process.env.MAIL_FROM || SMTP_USER; // Gmail may rewrite if different
const MAIL_TO     = process.env.MAIL_TO || process.env.RESTAURANT_EMAIL || SMTP_USER;

// ---------- Middleware ----------
app.use(cors({
  origin(origin, cb) {
    // allow non-browser tools (no Origin header) and explicit allowlist
    if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// ---------- Single transporter ----------
const hasEmail = Boolean(SMTP_USER && SMTP_PASS);
const transporter = hasEmail
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,               // true only for 465
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      requireTLS: !SMTP_SECURE,          // enforce STARTTLS on 587
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      tls: { minVersion: 'TLSv1.2' }
    })
  : null;

(async () => {
  if (transporter) {
    try {
      await transporter.verify();
      console.log('✅ SMTP verified:', SMTP_HOST, SMTP_PORT);
    } catch (err) {
      console.error('❌ SMTP verify failed:', err?.message || err);
    }
  } else {
    console.log('📧 Email disabled (missing SMTP_USER/PASS). Using simulation.');
  }
})();

// ---------- Routes ----------
app.get('/', (_req, res) => res.type('text/plain').send('AKIR Restaurant Backend'));
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    message: 'AKIR Restaurant Backend is running',
    emailConfigured: hasEmail && Boolean(MAIL_FROM && MAIL_TO),
    timestamp: new Date().toISOString(),
  });
});

// Debug: verify SMTP from the running instance
app.get('/debug/smtp-verify', async (_req, res) => {
  if (!transporter) return res.status(503).json({ ok: false, error: 'No transporter (missing SMTP_USER/PASS)' });
  try {
    await transporter.verify();
    res.json({ ok: true, user: SMTP_USER && '***', host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE });
  } catch (e) {
    console.error('SMTP verify failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Debug: send a test email (GET /debug/test-email?to=you@example.com)
app.get('/debug/test-email', async (req, res) => {
  if (!transporter) return res.status(503).json({ ok: false, error: 'No transporter (missing SMTP_USER/PASS)' });
  const to = (req.query.to || MAIL_TO || SMTP_USER)?.toString();
  if (!to) return res.status(400).json({ ok: false, error: 'No recipient' });
  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject: 'AKIR Restaurant — SMTP test',
      html: `<p>SMTP test at ${new Date().toISOString()}</p>`
    });
    res.json({ ok: true, sentTo: to });
  } catch (e) {
    console.error('Test email failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/reservations', async (req, res) => {
  console.log('POST /api/reservations body =', req.body);
  try {
    const { name, email, phone, date, time, guests, message, specialRequests } = req.body || {};
    if (!name || !email || !phone || !date || !time || !guests) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const notes = specialRequests ?? message ?? '';

    const adminMail = {
      from: MAIL_FROM,
      to: MAIL_TO,
      subject: `New Reservation Request - ${name}`,
      html: `
        <h2>New Reservation Request - AKIR Restaurant</h2>
        <h3>Customer</h3>
        <p><b>Name:</b> ${name}<br/><b>Email:</b> ${email}<br/><b>Phone:</b> ${phone}</p>
        <h3>Reservation</h3>
        <p><b>Date:</b> ${new Date(date).toLocaleDateString()}<br/><b>Time:</b> ${time}<br/><b>Guests:</b> ${guests}</p>
        ${notes ? `<p><b>Notes:</b> ${notes}</p>` : ''}
      `,
    };

    const customerMail = {
      from: MAIL_FROM,
      to: email,
      subject: 'Reservation Request Received - AKIR Restaurant',
      html: `
        <h2>Thanks, ${name}!</h2>
        <p>We received your reservation request.</p>
        <p><b>Date:</b> ${new Date(date).toLocaleDateString()} |
           <b>Time:</b> ${time} |
           <b>Guests:</b> ${guests}</p>
        ${notes ? `<p><b>Your notes:</b> ${notes}</p>` : ''}
        <p>We will contact you within 24 hours to confirm.</p>
      `,
    };

    if (transporter) {
      try {
        await Promise.all([transporter.sendMail(adminMail), transporter.sendMail(customerMail)]);
        console.log('✅ Reservation emails sent');
      } catch (e) {
        console.error('❌ Email send failed:', e?.message || e);
      }
    } else {
      console.log('📨 [SIMULATION] Would email admin/customer.');
    }

    console.log('New reservation:', { name, email, phone, date, time, guests, notes, at: new Date().toISOString() });
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

    const mail = {
      from: MAIL_FROM,
      to: MAIL_TO,
      subject: `Contact Form: ${subject || 'General Inquiry'}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><b>Name:</b> ${name}<br/><b>Email:</b> ${email}</p>
        <p><b>Subject:</b> ${subject || 'General Inquiry'}</p>
        <pre style="white-space:pre-wrap">${message}</pre>
      `,
    };

    if (transporter) {
      try {
        await transporter.sendMail(mail);
        console.log('✅ Contact email sent');
      } catch (e) {
        console.error('❌ Contact email failed:', e?.message || e);
      }
    } else {
      console.log('📨 [SIMULATION] Would email contact to:', MAIL_TO);
    }

    return res.json({ success: true, message: 'Contact form submitted successfully' });
  } catch (error) {
    console.error('Error processing contact form:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AKIR Restaurant Backend running on port ${PORT}`);
  console.log(`📧 Email: ${hasEmail ? 'Configured' : 'Simulation (set SMTP_USER/PASS)'}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  logConfig();
});

function logConfig() {
  console.log('⚙️  Config:', {
    PORT,
    CORS_ORIGINS,
    SMTP_HOST, SMTP_PORT, SMTP_SECURE,
    SMTP_USER: SMTP_USER ? '***' : '(missing)',
    SMTP_PASS: SMTP_PASS ? '***' : '(missing)',
    MAIL_FROM: MAIL_FROM || '(missing)',
    MAIL_TO: MAIL_TO || '(missing)',
  });
}
