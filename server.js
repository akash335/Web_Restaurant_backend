// backend/server.js

// --- Load .env from THIS folder (works no matter where you start the app) ---
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// --- Core deps ---
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';

const app = express();

// --- Config ---
const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGINS = [
  'http://localhost:5175',
];

// Gmail creds (App Password must be 16 chars, NO spaces)
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const RESTAURANT_EMAIL =
  process.env.RESTAURANT_EMAIL || process.env.MAIL_TO || EMAIL_USER;

// --- Middleware ---
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// --- Mail helper (Gmail, STARTTLS on 587) ---
const hasEmail = Boolean(EMAIL_USER && EMAIL_PASS);
const transporter = hasEmail
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    })
  : null;

if (transporter) {
  transporter
    .verify()
    .then(() => console.log('✅ SMTP verified (smtp.gmail.com:587)'))
    .catch((err) => console.error('❌ SMTP verify failed:', err?.message || err));
} else {
  console.log('📧 Email disabled (missing EMAIL_USER/PASS). Using simulation.');
}

// --- Routes ---
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'AKIR Restaurant Backend is running',
    emailConfigured: hasEmail && Boolean(RESTAURANT_EMAIL),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/reservations', async (req, res) => {
  console.log('POST /api/reservations body =', req.body);
  try {
    const { name, email, phone, date, time, guests, message, specialRequests } =
      req.body || {};
    if (!name || !email || !phone || !date || !time || !guests) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing required fields' });
    }
    const notes = specialRequests ?? message ?? '';

    // Admin email
    const adminMail = {
      from: EMAIL_USER || 'no-reply@akir.com',
      to: RESTAURANT_EMAIL || 'restaurant@akir.com',
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

    // Customer confirmation
    const customerMail = {
      from: EMAIL_USER || 'no-reply@akir.com',
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

    // Try to send emails, but don't fail the booking if email fails (dev-friendly)
    if (transporter) {
      try {
        await Promise.all([transporter.sendMail(adminMail), transporter.sendMail(customerMail)]);
        console.log('✅ Reservation emails sent');
      } catch (e) {
        console.error('❌ Email send failed:', e?.message || e);
      }
    } else {
      console.log('📨 [SIMULATION] Would email:', {
        to: RESTAURANT_EMAIL,
        subject: adminMail.subject,
      });
    }

    console.log('New reservation:', {
      name,
      email,
      phone,
      date,
      time,
      guests,
      notes,
      at: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: 'Reservation request received',
      reservationId: `AKIR-${Date.now()}`,
    });
  } catch (error) {
    console.error('Error processing reservation:', error);
    // In dev you can keep this success response to avoid UI error banners:
    return res.json({ success: true, message: 'Saved (email failed in dev)' });
    // In prod, prefer: res.status(500).json({ success:false, message:'Server error' })
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing required fields' });
    }

    const mail = {
      from: EMAIL_USER || 'no-reply@akir.com',
      to: RESTAURANT_EMAIL || 'restaurant@akir.com',
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
      console.log('📨 [SIMULATION] Would email contact to:', RESTAURANT_EMAIL);
    }

    return res.json({ success: true, message: 'Contact form submitted successfully' });
  } catch (error) {
    console.error('Error processing contact form:', error);
    return res.json({ success: true, message: 'Saved (email failed in dev)' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AKIR Restaurant Backend running on port ${PORT}`);
  console.log(`📧 Email: ${hasEmail ? 'Configured' : 'Simulation (set EMAIL_USER/PASS)'}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  logConfig();
});

// --- Helpful boot log ---
function logConfig() {
  console.log('⚙️  Config:', {
    PORT,
    EMAIL_USER: EMAIL_USER || '(missing)',
    EMAIL_PASS: EMAIL_PASS ? '***' : '(missing)',
    RESTAURANT_EMAIL: RESTAURANT_EMAIL || '(missing)',
  });
}