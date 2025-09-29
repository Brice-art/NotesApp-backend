require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const User = require("./models/User");
const Note = require("./models/Note");
const bcrypt = require("bcrypt");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const app = express();

// Connect Database
connectDB();

// Middleware
// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://notes-app-frontend-five-rho.vercel.app'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS not allowed'), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
}));  

app.use(express.json());

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGO_URI
  }),
  cookie: {
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please log in" });
  }
  next();
};

// =============== AUTH ROUTES ===============

// Register
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ 
      name, 
      email, 
      password: hashedPassword 
    });
    
    req.session.userId = user._id;
    res.status(201).json({
      message: "User created successfully",
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: "Signup failed" });
  }
});

// Login user
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
    
    req.session.userId = user._id;
    
    // Add this logging
    console.log('Login successful for:', email);
    console.log('Session ID:', req.session.id);
    console.log('User ID set in session:', req.session.userId);
    
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: "Could not save session" });
      }
      
      console.log('Session saved successfully');
      res.json({
        message: "Login successful",
        user: { id: user._id, name: user.name, email: user.email }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: "Login failed" });
  }
});
// Logout
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out successfully" });
  });
});

// Check session
app.get("/auth/session", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "No active session" });
    }
    
    const user = await User.findById(req.session.userId).select("-password");
    res.json({
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: "Session check failed" });
  }
});

// =============== NOTES ROUTES ===============

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
    res.status(500).json({ error: "Failed to get notes" });
  }
});

// Get single note
app.get("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.session.userId;
    
    const note = await Note.findOne({ _id: noteId, user: userId });
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }
    
    res.json({ note });
  } catch (error) {
    res.status(500).json({ error: "Failed to get note" });
  }
});

// Create note
app.post("/notes", requireAuth, async (req, res) => {
  try {
    const { title, content = "", color = "#ffffff", category = "General" } = req.body;
    const userId = req.session.userId;
    
    const note = await Note.create({
      user: userId,
      title,
      content,
      color,
      category
    });
    
    res.status(201).json({
      message: "Note created successfully",
      note
    });
  } catch (error) {
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
      if (isArchived) updateData.isPinned = false; // Can't pin archived notes
    }
    
    const note = await Note.findOneAndUpdate(
      { _id: noteId, user: userId },
      updateData,
      { new: true }
    );
    
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }
    
    res.json({
      message: "Note updated successfully",
      note
    });
  } catch (error) {
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
    res.status(500).json({ error: "Failed to pin note" });
  }
});

// Archive/Unarchive note
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
    if (archive) note.isPinned = false; // Can't pin archived notes
    await note.save();
    
    res.json({
      message: `Note ${archive ? 'archived' : 'unarchived'} successfully`,
      note
    });
  } catch (error) {
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
    res.status(500).json({ error: "Failed to get categories" });
  }
});

// Root route
app.get("/", (req, res) => {
  res.json({ 
    message: "NotesApp API is running",
    endpoints: {
      auth: ["POST /auth/signup", "POST /auth/login", "POST /auth/logout", "GET /auth/session"],
      notes: ["GET /notes", "POST /notes", "PUT /notes/:id", "DELETE /notes/:id"],
      actions: ["PATCH /notes/:id/pin", "PATCH /notes/:id/archive"]
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});