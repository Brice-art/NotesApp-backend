require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");
const User = require("./models/User");
const Note = require("./models/Note");

const app = express();

// MongoDB Connection
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

// Middleware
app.use(express.json());

// CORS
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://notes-app-frontend-five-rho.vercel.app"
  ],
  credentials: true
}));


app.set('trust proxy', 1); // Trust first proxy (needed for secure cookies on platforms like Railway

// Cookie Session
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

// Add this middleware RIGHT AFTER cookie-session
app.use((req, res, next) => {
  console.log('📨 Incoming request to:', req.path);
  console.log('🍪 Cookie header:', req.headers.cookie);
  console.log('📦 Session object:', req.session);
  console.log('👤 Session userId:', req.session?.userId);
  console.log('---');
  next();
});

// Auth Middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};

// ============= AUTH ROUTES =============

// Signup
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword });
    
    req.session.userId = user._id.toString();
    
    console.log('✅ Signup successful:', email);
    
    res.status(201).json({
      message: "User created successfully",
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({ error: "Signup failed" });
  }
});

// Login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    // Set the session - this marks it as modified
    req.session = { userId: user._id.toString() }; // ⬅️ Changed this line
    
    console.log('✅ Login successful:', email);
    console.log('✅ Session after login:', req.session);
    
    res.json({
      message: "Login successful",
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Logout
app.post("/auth/logout", (req, res) => {
  req.session = null;
  res.json({ message: "Logged out successfully" });
});

// Check Session
app.get("/auth/session", async (req, res) => {
  try {
    console.log('🔍 Session check - userId:', req.session?.userId);
    
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "No active session" });
    }
    
    const user = await User.findById(req.session.userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    console.log('✅ Session valid for:', user.email);
    
    res.json({
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('❌ Session check error:', error);
    res.status(500).json({ error: "Session check failed" });
  }
});

// ============= NOTES ROUTES =============

// Get all notes
app.get("/notes", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { search, category, isArchived = "false" } = req.query;
    
    let query = { user: userId, isArchived: isArchived === "true" };
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (category) {
      query.category = category;
    }
    
    const notes = await Note.find(query).sort({ isPinned: -1, createdAt: -1 });
    res.json({ notes });
  } catch (error) {
    console.error('❌ Get notes error:', error);
    res.status(500).json({ error: "Failed to get notes" });
  }
});

// Create note
app.post("/notes", requireAuth, async (req, res) => {
  try {
    const { title, content = "", color = "#ffffff", category = "General" } = req.body;
    const userId = req.session.userId;
    
    const note = await Note.create({ user: userId, title, content, color, category });
    
    res.status(201).json({
      message: "Note created successfully",
      note
    });
  } catch (error) {
    console.error('❌ Create note error:', error);
    res.status(500).json({ error: "Failed to create note" });
  }
});

// Update note
app.put("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.session.userId;
    const { title, content, color, category, isPinned, isFavorite, isArchived } = req.body;
    
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (color !== undefined) updateData.color = color;
    if (category !== undefined) updateData.category = category;
    if (isPinned !== undefined) updateData.isPinned = isPinned;
    if (isFavorite !== undefined) updateData.isFavorite = isFavorite;
    if (isArchived !== undefined) {
      updateData.isArchived = isArchived;
      if (isArchived) updateData.isPinned = false;
    }
    
    const note = await Note.findOneAndUpdate(
      { _id: noteId, user: userId },
      updateData,
      { new: true }
    );
    
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }
    
    res.json({ message: "Note updated successfully", note });
  } catch (error) {
    console.error('❌ Update note error:', error);
    res.status(500).json({ error: "Failed to update note" });
  }
});

// Delete note
app.delete("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.session.userId;
    
    const result = await Note.deleteOne({ _id: noteId, user: userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Note not found" });
    }
    
    res.json({ message: "Note deleted successfully" });
  } catch (error) {
    console.error('❌ Delete note error:', error);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

// Pin/Unpin note
app.patch("/notes/:noteId/pin", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.session.userId;
    
    const note = await Note.findOne({ _id: noteId, user: userId });
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }
    
    note.isPinned = !note.isPinned;
    await note.save();
    
    res.json({
      message: `Note ${note.isPinned ? 'pinned' : 'unpinned'} successfully`,
      note
    });
  } catch (error) {
    console.error('❌ Pin note error:', error);
    res.status(500).json({ error: "Failed to pin note" });
  }
});

// Archive note
app.patch("/notes/:noteId/archive", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.session.userId;
    const { archive = true } = req.body;
    
    const note = await Note.findOne({ _id: noteId, user: userId });
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }
    
    note.isArchived = archive;
    if (archive) note.isPinned = false;
    await note.save();
    
    res.json({
      message: `Note ${archive ? 'archived' : 'unarchived'} successfully`,
      note
    });
  } catch (error) {
    console.error('❌ Archive note error:', error);
    res.status(500).json({ error: "Failed to archive note" });
  }
});

// Get categories
app.get("/categories", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const categories = await Note.distinct("category", { user: userId });
    res.json({ categories });
  } catch (error) {
    console.error('❌ Get categories error:', error);
    res.status(500).json({ error: "Failed to get categories" });
  }
});

// Root route
app.get("/", (req, res) => {
  res.json({ 
    message: "NotesApp API is running",
    version: "2.0.0"
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});