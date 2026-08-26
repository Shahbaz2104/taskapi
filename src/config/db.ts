import mongoose from "mongoose";
import { env } from "./env.js";

const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
};

const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
  console.log("MongoDB disconnected");
};

export { connectDB, disconnectDB };
