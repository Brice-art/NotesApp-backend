const mongoose = require("mongoose");

const NoteSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  content: { 
    type: String, 
    default: "",
    trim: true
  },
  color: { 
    type: String, 
    default: "#ffffff"
  },
  category: { 
    type: String, 
    default: "General",
    trim: true
  },
  isPinned: { 
    type: Boolean, 
    default: false 
  },
  isFavorite: { 
    type: Boolean, 
    default: false 
  },
  isArchived: { 
    type: Boolean, 
    default: false 
  },
  dueDate: {
    type: Date,
    default: null
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  }
}, { 
  timestamps: true 
});

// Index for better query performance
NoteSchema.index({ user: 1, createdAt: -1 });
NoteSchema.index({ user: 1, isPinned: -1 });
NoteSchema.index({ user: 1, isDeleted: 1, dueDate: 1 });

module.exports = mongoose.model("Note", NoteSchema);