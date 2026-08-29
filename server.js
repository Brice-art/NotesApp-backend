require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("./models/User");
const Note = require("./models/Note");
// const dns = require("dns");

const app = express();

// dns.setServers(["1.1.1.1", "8.8.8.8"]);

// MongoDB Connection
const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/notesapp";

const connectDB = async () => {
  try {
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    console.warn("Continuing in development mode without a live MongoDB connection. Set MONGO_URI to a reachable database to enable persistence.");
  }
};

if (process.env.NODE_ENV !== "test") {
  connectDB();
}

// Middleware
app.use(express.json());

// CORS - simpler now since we don't need credentials for cookies
const allowedOrigins = [
  "http://localhost:5173",
  "https://notes-app-frontend-five-rho.vercel.app",
  "https://agakayi.xyz"
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
}));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

// Auth Middleware - Verify JWT
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
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
    
    const token = generateToken(user._id);
    
    res.status(201).json({
      message: "User created successfully",
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Signup error:', error);
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
    
    const token = generateToken(user._id);
    
    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Check Auth (verify token)
app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: "Auth check failed" });
  }
});

// Logout (frontend handles this by removing token)
app.post("/auth/logout", (req, res) => {
  res.json({ message: "Logged out successfully" });
});

// ============= NOTES ROUTES =============

// Get all notes
app.get("/notes", requireAuth, async (req, res) => {
  try {
    const { search, category, isArchived = "false", tag, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const conditions = [
      { $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] }
    ];

    if (isArchived === "true") {
      conditions.push({ isArchived: true });
    } else {
      conditions.push({ $or: [{ isArchived: false }, { isArchived: { $exists: false } }] });
    }

    const query = { user: req.userId, $and: conditions };

    if (search) {
      query.$and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ]
      });
    }

    if (category) {
      query.$and.push({ category });
    }

    if (tag) {
      query.$and.push({ tags: { $in: [String(tag).trim().toLowerCase()] } });
    }

    const sortOptions = {};

    if (sortBy === "dueDate") {
      sortOptions.dueDate = sortOrder === "asc" ? 1 : -1;
    } else if (sortBy === "updatedAt") {
      sortOptions.updatedAt = sortOrder === "asc" ? 1 : -1;
    } else if (sortBy === "title") {
      sortOptions.title = sortOrder === "asc" ? 1 : -1;
    } else {
      sortOptions.isPinned = -1;
      sortOptions.createdAt = -1;
    }

    const notes = await Note.find(query).sort(sortOptions);
    res.json({ notes });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: "Failed to get notes" });
  }
});

// Create note
app.post("/notes", requireAuth, async (req, res) => {
  try {
    const { title, content = "", color = "#ffffff", category = "General", dueDate, tags = [] } = req.body;
    const normalizedDueDate = dueDate && dueDate !== "" ? new Date(dueDate) : null;
    const normalizedTags = Array.isArray(tags)
      ? tags.map((tag) => String(tag).trim()).filter(Boolean).map((tag) => tag.toLowerCase())
      : [];
    
    const note = await Note.create({ 
      user: req.userId, 
      title, 
      content, 
      color, 
      category,
      dueDate: normalizedDueDate,
      tags: normalizedTags
    });
    
    res.status(201).json({
      message: "Note created successfully",
      note
    });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: "Failed to create note" });
  }
});

// Update note
app.put("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { title, content, color, category, isPinned, isFavorite, isArchived, dueDate, tags } = req.body;
    
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
    if (dueDate !== undefined) {
      updateData.dueDate = dueDate && dueDate !== "" ? new Date(dueDate) : null;
    }
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags)
        ? tags.map((tag) => String(tag).trim()).filter(Boolean).map((tag) => tag.toLowerCase())
        : [];
    }
    
    const note = await Note.findOneAndUpdate(
      { _id: noteId, user: req.userId },
      updateData,
      { new: true }
    );
    
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }
    
    res.json({ message: "Note updated successfully", note });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: "Failed to update note" });
  }
});

// Soft delete note (moves to trash)
app.delete("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const note = await Note.findOne({ _id: noteId, user: req.userId });

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    note.isDeleted = true;
    note.deletedAt = new Date();
    await note.save();

    res.json({ message: "Note moved to trash successfully", note });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

// Restore deleted note
app.patch("/notes/:noteId/restore", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const note = await Note.findOne({ _id: noteId, user: req.userId });

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    note.isDeleted = false;
    note.deletedAt = null;
    await note.save();

    res.json({ message: "Note restored successfully", note });
  } catch (error) {
    console.error('Restore note error:', error);
    res.status(500).json({ error: "Failed to restore note" });
  }
});

// Pin/Unpin note
app.patch("/notes/:noteId/pin", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    
    const note = await Note.findOne({ _id: noteId, user: req.userId });
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
    console.error('Pin note error:', error);
    res.status(500).json({ error: "Failed to pin note" });
  }
});

// Archive note
app.patch("/notes/:noteId/archive", requireAuth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { archive = true } = req.body;
    
    const note = await Note.findOne({ _id: noteId, user: req.userId });
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
    console.error('Archive note error:', error);
    res.status(500).json({ error: "Failed to archive note" });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;

// Get categories
app.get("/categories", requireAuth, async (req, res) => {
  try {
    const categories = await Note.distinct("category", { user: req.userId, isDeleted: false });
    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: "Failed to get categories" });
  }
});

// Root route
app.get("/", (req, res) => {
  res.json({ message: "NotesApp API with JWT" });
});
