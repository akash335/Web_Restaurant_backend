# AKIR Restaurant Backend

Backend API for the AKIR Restaurant website.

---

## Features

* Reservation system with email confirmations
* Contact form with auto-reply to customers
* Email integration (Nodemailer with multiple fallbacks)
* CORS support for frontend communication
* Health check endpoint

---

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Variables

Create a `.env` file in the backend directory:

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
RESTAURANT_EMAIL=akirrestaurants@gmail.com
PORT=4000
```

### 3. Start Server

```bash
npm start
```

---

## API Endpoints

### Health Check

* **GET** `/health`
* Returns server status and timestamp

---

### Reservations

* **POST** `/api/reservations`

**Body:**

```json
{
  "name": "",
  "email": "",
  "phone": "",
  "date": "",
  "time": "",
  "guests": "",
  "specialRequests": ""
}
```

✔ Sends confirmation emails to:

* Restaurant
* Customer

---

### Contact Form

* **POST** `/api/contact`

**Body:**

```json
{
  "name": "",
  "email": "",
  "subject": "",
  "message": ""
}
```

✔ Sends:

* Message to restaurant
* Auto-reply to customer

---

## Email System

Supports multiple fallbacks:

* SMTP (Gmail / custom provider)
* sendmail (if available)
* Ethereal (for development testing)

---

## Development

* **Port**: 4000
* **CORS**: configured for `http://localhost:5175` and production frontend URL
* **Logging**: enabled for requests and errors

---

## Production Deployment

For production:

1. Set environment variables properly
2. Configure email service (Gmail / SMTP / SendGrid)
3. Update CORS origins
4. Use a process manager (PM2 / Docker / hosting platform)
5. Enable HTTPS/SSL

---

## Notes

* Ensure Gmail App Password is used (not normal password)
* Check Spam/Promotions folder for test emails
* Backend must be deployed separately from frontend for production