# AKIR Restaurant Backend

<<<<<<< HEAD
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
=======
This is the backend API for the AKIR Restaurant website.

## Features

- **Reservation System**: Handle table reservations with email notifications
- **Contact Form**: Process customer inquiries and feedback
- **Email Integration**: Send automated emails using Nodemailer
- **CORS Support**: Configured for frontend communication
- **Health Check**: Monitor backend status

## Setup

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Environment Configuration** (Optional)
   Create a `.env` file in the backend directory:
   ```env
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   RESTAURANT_EMAIL=restaurant@akir.com
   PORT=3001
   ```

3. **Start the Server**
   ```bash
   npm start
   ```
>>>>>>> aef4d17c4e05cc6699602df53d67b58c8ad4b705

## API Endpoints

### Health Check
<<<<<<< HEAD

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
=======
- **GET** `/health`
- Returns server status and timestamp

### Reservations
- **POST** `/api/reservations`
- Body: `{ name, email, phone, date, time, guests, specialRequests }`
- Sends confirmation emails to both restaurant and customer

### Contact Form
- **POST** `/api/contact`
- Body: `{ name, email, subject, message }`
- Sends inquiry email to restaurant

## Email Configuration

To enable email notifications:

1. **Gmail Setup**:
   - Enable 2-factor authentication
   - Generate an App Password
   - Use your Gmail address and App Password in `.env`

2. **Other Providers**:
   - Update the transporter configuration in `server.js`
   - Modify SMTP settings as needed

## Development

- **Port**: 3001 (configurable via PORT env variable)
- **CORS**: Configured for localhost:3000, localhost:5173, localhost:5174
- **Logging**: All requests and errors are logged to console

## Production Deployment

For production deployment:

1. Set up proper environment variables
2. Configure email service (Gmail, SendGrid, etc.)
3. Set up proper CORS origins
4. Use a process manager like PM2
5. Set up SSL/HTTPS
# Web_Restaurant_backend
>>>>>>> aef4d17c4e05cc6699602df53d67b58c8ad4b705
