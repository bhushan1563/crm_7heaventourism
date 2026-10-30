import mongoose from 'mongoose';
import { config } from './env.js';

let connecting;

mongoose.set('strictQuery', false);

mongoose.connection.on('disconnected', () => console.warn('[7Heaven] MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('[7Heaven] MongoDB reconnected'));
mongoose.connection.on('error', (err) => console.error('[7Heaven] MongoDB error:', err.message));

/** 1 = connected. Used by the health check. */
export const isDbConnected = () => mongoose.connection.readyState === 1;

/**
 * Connects once and shares the connection. Safe to call repeatedly (every serverless invocation does);
 * a failed attempt is forgotten so the next call retries.
 */
export const connectDB = async () => {
  if (isDbConnected()) return mongoose.connection;
  if (!config.mongoUri) throw new Error('MONGODB_URI is not defined');

  if (!connecting) {
    connecting = mongoose
      .connect(config.mongoUri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: config.isVercel ? 5 : 10
      })
      .then((conn) => {
        // Never log the connection string: it contains the database password.
        console.log(`[7Heaven] MongoDB connected (db: ${conn.connection.name})`);
        connecting = undefined; // later calls re-check isDbConnected() and reconnect if the link dropped
        return conn.connection;
      })
      .catch((err) => {
        connecting = undefined;
        throw err;
      });
  }

  return connecting;
};

export const disconnectDB = async () => {
  connecting = undefined;
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
};
