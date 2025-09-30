require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const User = require("./models/User");
const Note = require("./models/Note");

const app = express();

// ====== DATABASE ======
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};
connectDB();

// ====== MIDDLEWARE ======
app.use(express.json());

// CORS (allow frontend origins)
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://notes-app-frontend-five-rho.vercel.app"
];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  })
);

// Trust proxy (for Railway/Render/Heroku HTTPS cookies)
app.set("trust proxy", 1);

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 7 * 24 * 60 * 60, // 7 days
    }),
    cookie: {
      secure: true,      // only works with HTTPS
      httpOnly: true,    // JS on frontend cannot read
      sameSite: "none",  // required for cross-origin (Vercel <-> Railway)
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// ====== AUTH MIDDLEWARE ======
const requireAuth = (req, res, next) => {
  console.log("🛂 Session ID:", req.session.id);
  console.log("🛂 Session Data:", req.session);

  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// ====== AUTH ROUTES ======
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    req.session.userId = user._id; // save to session
    console.log("✅ Signup successful:", email);

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    req.session.userId = user._id; // save user id to session
    console.log("✅ Login successful:", email);

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out successfully" });
  });
});

app.get("/auth/session", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "No active session" });
  }
  try {
    const user = await User.findById(req.session.userId).select("_id name email");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Session check failed" });
  }
});

// ====== NOTES ROUTES ======
app.get("/notes", requireAuth, async (req, res) => {
  try {
    const notes = await Note.find({ user: req.session.userId }).sort({ createdAt: -1 });
    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

app.post("/notes", requireAuth, async (req, res) => {
  try {
    const { title, content } = req.body;
    const note = await Note.create({
      user: req.session.userId,
      title,
      content,
    });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: "Failed to create note" });
  }
});

// ====== ROOT ======
app.get("/", (req, res) => {
  res.json({ message: "NotesApp API running with express-session 🚀" });
});

// ====== START ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
