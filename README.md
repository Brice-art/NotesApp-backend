# NotesApp Backend

This is the Express + MongoDB backend for the NotesApp project. It handles authentication, notes CRUD, search, pin/archive actions, and user-specific data.

## Tech stack

- Node.js
- Express
- MongoDB + Mongoose
- JWT authentication
- bcrypt password hashing
- Jest + Supertest for testing

## Features

- User signup and login
- JWT-based protected routes
- Create, read, update, and delete notes
- Pin and archive notes
- Search by title/content
- Category filtering
- Tag support
- Soft delete / restore workflow
- Due date support

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file:

   ```bash
   copy .env.example .env
   ```

   Or on macOS/Linux:

   ```bash
   cp .env.example .env
   ```

3. Update the environment values:

   ```env
   FRONTEND_URL=http://localhost:5173
   MONGO_URI=mongodb://localhost:27017/notesapp
   PORT=3000
   JWT_SECRET=your_jwt_secret_here
   SESSION_SECRET=your_session_secret_here
   NODE_ENV=development
   ```

4. Start the server:

   ```bash
   npm start
   ```

## Running tests

```bash
npm test
```

## Environment variables

### .env.example

```env
FRONTEND_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/notesapp
PORT=3000
JWT_SECRET=your_jwt_secret_here
SESSION_SECRET=your_session_secret_here
NODE_ENV=development
```

## Notes

- This app expects a MongoDB instance to be available.
- For Atlas deployments, set `MONGO_URI` to your cluster connection string.
- `JWT_SECRET` should be a strong random string in production.
- The frontend should be configured to call the backend on the same port (`3000` by default).
