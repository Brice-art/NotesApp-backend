// config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        const MONGO_URI = process.env.MONGO_URI;
        await mongoose.connect(MONGO_URI);
        console.log("MongoDB connected successfully");
    } catch (err) {
        console.error("MongoDB connection failed:", err.message);
        process.exit(1);
    }
};

module.exports = connectDB;