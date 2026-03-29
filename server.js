import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 4000);
const ENABLE_DEBUG_ROUTES =
  String(process.env.ENABLE_DEBUG_ROUTES || '').toLowerCase() === 'true';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 15);

const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5175,https://web-restaurant-frontend-git-main-akashs-projects-10cba8a4.vercel.app'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/* ================ Email (SMTP / Gmail) ================ */
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || 'akirrestaurants@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'cwqykrqspinoxtzq';

const MAIL_FROM = process.env.MAIL_FROM || 'AKIR Restaurant <akirrestaurants@gmail.com>';
const MAIL_TO = process.env.MAIL_TO || 'akirrestaurants@gmail.com';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

async function verifySmtpIfConfigured() {
  if (!SMTP_USER || !SMTP_PASS) return false;
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    console.error('SMTP verify failed:', err?.message || err);
    return false;
  }
}

async function sendWithSMTP({ to, subject, html }) {
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP credentials missing');
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(value, maxLength = 300) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value ?? '').replace(/[^\d+]/g, '').slice(0, 20);
}

function formatDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return 'Invalid date';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const corsConfig = {
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
};

const rateLimitBuckets = new Map();

function formRateLimiter(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { start: now, count: 1 });
    return next();
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a few minutes and try again.',
    });
  }

  bucket.count += 1;
  next();
}

app.use(cors(corsConfig));
app.options('*', cors(corsConfig));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.type('text/plain').send('AKIR Restaurant Backend');
});

app.get('/health', async (_req, res) => {
  const smtpConfigured = !!SMTP_USER && !!SMTP_PASS;
  const smtpVerified = smtpConfigured ? await verifySmtpIfConfigured() : false;

  res.json({
    status: 'OK',
    message: 'AKIR Restaurant Backend is running',
    provider: 'smtp',
    emailConfigured: smtpConfigured,
    smtpVerified,
    timestamp: new Date().toISOString(),
  });
});

if (ENABLE_DEBUG_ROUTES) {
  app.get('/debug/email-provider', async (_req, res) => {
    const smtpConfigured = !!SMTP_USER && !!SMTP_PASS;
    const smtpVerified = smtpConfigured ? await verifySmtpIfConfigured() : false;

    res.json({
      provider: 'smtp',
      hasSmtpUser: !!SMTP_USER,
      hasSmtpPass: !!SMTP_PASS,
      smtpVerified,
      mailFrom: MAIL_FROM,
      mailTo: MAIL_TO,
    });
  });

  app.get('/debug/test-email', async (req, res) => {
    try {
      const to = (req.query.to || MAIL_TO)?.toString();
      if (!to) {
        return res.status(400).json({ ok: false, error: 'No recipient' });
      }

      await sendWithSMTP({
        to,
        subject: 'AKIR Restaurant — SMTP Test',
        html: `<p>SMTP test successful at ${new Date().toISOString()}</p>`,
      });

      return res.json({ ok: true, provider: 'smtp', sentTo: to });
    } catch (e) {
      console.error('Test email failed:', e);
      return res.status(500).json({
        ok: false,
        provider: 'smtp',
        error: 'Failed to send test email',
      });
    }
  });
}

app.post('/api/reservations', formRateLimiter, async (req, res) => {
  try {
    const name = normalizeText(req.body?.name, 80);
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone);
    const date = String(req.body?.date ?? '').trim();
    const time = String(req.body?.time ?? '').trim();
    const guests = Number(req.body?.guests);
    const notes = normalizeText(
      req.body?.specialRequests ?? req.body?.message ?? req.body?.notes ?? '',
      1000
    );

    if (!name || !email || !phone || !date || !time || !guests) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    if (!/^\+?\d{8,15}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Invalid reservation date' });
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ success: false, message: 'Invalid reservation time' });
    }

    if (!Number.isInteger(guests) || guests < 1 || guests > 50) {
      return res.status(400).json({ success: false, message: 'Guests must be between 1 and 50' });
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone);
    const safeDate = escapeHtml(formatDateOnly(date));
    const safeTime = escapeHtml(time);
    const safeGuests = escapeHtml(String(guests));
    const safeNotes = escapeHtml(notes);

    const adminHtml = `
      <h2>New Reservation Request - AKIR Restaurant</h2>
      <h3>Customer Details</h3>
      <p>
        <b>Name:</b> ${safeName}<br/>
        <b>Email:</b> ${safeEmail}<br/>
        <b>Phone:</b> ${safePhone}
      </p>

      <h3>Reservation Details</h3>
      <p>
        <b>Date:</b> ${safeDate}<br/>
        <b>Time:</b> ${safeTime}<br/>
        <b>Guests:</b> ${safeGuests}
      </p>

      ${notes ? `<p><b>Special Requests:</b> ${safeNotes}</p>` : ''}
    `;

    const customerHtml = `
      <h2>Thank you, ${safeName}!</h2>
      <p>We have received your reservation request.</p>
      <p>
        <b>Date:</b> ${safeDate}<br/>
        <b>Time:</b> ${safeTime}<br/>
        <b>Guests:</b> ${safeGuests}
      </p>
      ${notes ? `<p><b>Your notes:</b> ${safeNotes}</p>` : ''}
      <p>We will contact you within 24 hours to confirm your booking.</p>
      <p><b>AKIR Restaurant</b></p>
    `;

    await Promise.all([
      sendWithSMTP({
        to: MAIL_TO,
        subject: `New Reservation Request - ${name}`,
        html: adminHtml,
      }),
      sendWithSMTP({
        to: email,
        subject: 'Reservation Request Received - AKIR Restaurant',
        html: customerHtml,
      }),
    ]);

    return res.json({
      success: true,
      message: 'Reservation request received successfully',
      reservationId: `AKIR-${Date.now()}`,
    });
  } catch (error) {
    console.error('Error processing reservation:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/contact', formRateLimiter, async (req, res) => {
  try {
    const name = normalizeText(req.body?.name, 80);
    const email = normalizeEmail(req.body?.email);
    const subject = normalizeText(req.body?.subject || 'General Inquiry', 120);
    const message = String(req.body?.message ?? '').trim().slice(0, 4000);

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    const html = `
      <h2>New Contact Form Submission</h2>
      <p>
        <b>Name:</b> ${escapeHtml(name)}<br/>
        <b>Email:</b> ${escapeHtml(email)}
      </p>
      <p><b>Subject:</b> ${escapeHtml(subject)}</p>
      <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>
    `;

    const replyHtml = `
  <h2>Thank you, ${escapeHtml(name)}!</h2>
  <p>We have received your message.</p>
  <p>Our team will get back to you soon.</p>
  <p><b>AKIR Restaurant</b></p>
  <p>Heads up: our reply may sometimes land in Spam/Promotions.</p>
`;

    await Promise.all([
      sendWithSMTP({
        to: MAIL_TO,
        subject: `Contact Form: ${subject}`,
        html,
      }),
      sendWithSMTP({
        to: email,
        subject: "We received your message - AKIR Restaurant",
        html: replyHtml,
      }),
    ]);

    return res.json({
      success: true,
      message: 'Contact form submitted successfully',
    });
  } catch (error) {
    console.error('Error processing contact form:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Origin not allowed' });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({ success: false, message: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 AKIR Restaurant Backend running on port ${PORT}`);
  console.log('⚙️  Config:', {
    PORT,
    ALLOWED_ORIGINS,
    provider: 'smtp',
    hasSmtpUser: !!SMTP_USER,
    hasSmtpPass: !!SMTP_PASS,
    MAIL_FROM,
    MAIL_TO,
    ENABLE_DEBUG_ROUTES,
  });
});