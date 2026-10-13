import mongoose from "mongoose";
import { logger } from "./logger";
import { memoryMode } from "./security";

let connectionPromise: Promise<typeof mongoose> | null = null;

export function hasMongoUri(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export async function connectMongo(): Promise<typeof mongoose | null> {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    if (memoryMode()) return null;
    throw new Error("MongoDB configuration is required");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 8000,
      })
      .then((client) => {
        logger.info("MongoDB connected");
        return client;
      })
      .catch((error) => {
        connectionPromise = null;
        logger.error("MongoDB connection failed");
        throw error;
      });
  }

  return connectionPromise;
}
