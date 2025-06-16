# TouchSync Backend API

Real-time collaborative canvas backend for iOS app.

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL database
- Auth0 account
- Cloudinary account

### Installation

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Copy the environment example file:
```bash
cp .env.example .env
```

3. Configure your `.env` file with your credentials:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/touchsync
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_AUDIENCE=your-api-identifier
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
PORT=3000
NODE_ENV=development
```

4. Generate Prisma client:
```bash
npm run prisma:generate
```

5. Run database migrations:
```bash
npm run prisma:migrate
```

### Running the Application

Development mode:
```bash
npm run dev
```

Production build:
```bash
npm run build
npm start
```

### Database Management

View database with Prisma Studio:
```bash
npm run prisma:studio
```

## API Documentation

### Authentication
All endpoints (except `/health` and `/api/auth/verify`) require a valid Auth0 token in the Authorization header:
```
Authorization: Bearer <token>
```

The API supports both JWT and opaque Auth0 tokens. Opaque tokens are validated via Auth0's userinfo endpoint.

### Profile Completion
New users must complete their profile before accessing most features. The profile completion flow:

1. User authenticates with Auth0 (email/password)
2. Call `/api/auth/verify` to check if profile is complete
3. If `profileComplete` is false, user must call `/api/auth/complete-profile` with:
   - `username`: 3-20 characters, alphanumeric and underscores only
   - `firstName`: User's first name
   - `dateOfBirth`: ISO date string (user must be 13+ years old)

### Profile Requirements
- **Username**: Unique, 3-20 characters, letters/numbers/underscores only
- **Age**: Must be at least 13 years old
- **Required fields**: username, firstName, dateOfBirth

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### Authentication & Profile
- `POST /api/auth/verify` - Verify auth token and check profile status
- `POST /api/auth/complete-profile` - Complete user profile (username, firstName, dateOfBirth)
- `GET /api/auth/check-username?username=xxx` - Check if username is available

#### User Management (requires complete profile)
- `GET /api/users/me` - Get current user info
- `PUT /api/users/me` - Update user profile
- `GET /api/users` - Get all users with complete profiles
- `GET /api/users/search?username=xxx` - Search users by username

#### Room Management (requires complete profile)
- `POST /api/rooms` - Create a new room
- `GET /api/rooms` - Get user's rooms
- `GET /api/rooms/:id` - Get room details
- `PUT /api/rooms/:id` - Update room
- `DELETE /api/rooms/:id` - Leave room
- `POST /api/rooms/:id/join` - Join a room
- `GET /api/rooms/:id/elements` - Get room elements
- `POST /api/rooms/:id/elements` - Create element
- `PUT /api/rooms/:id/elements/:elementId` - Update element
- `DELETE /api/rooms/:id/elements/:elementId` - Delete element

#### Miscellaneous
- `GET /health` - Health check (no auth required)

## Socket.io Events

Connect with Auth0 token:
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

See the project brief for complete Socket.io event documentation.