# AKIR Restaurant Backend

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

## API Endpoints

### Health Check
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
