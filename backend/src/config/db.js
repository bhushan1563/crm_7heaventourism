import mongoose from 'mongoose';

export const connectDB = async () => {
  console.log("mongoURI :", process.env.MONGODB_URI)
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    throw new Error("MONGODB_URI is not defined");
  }

  mongoose.set("strictQuery", false);

  const conn = await mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000
  });

  console.log("[7Heaven] MongoDB connected");
  console.log("[7Heaven] Host:", conn.connection.host);
  console.log("[7Heaven] DB:", conn.connection.name);

  await conn.connection.db.admin().command({ ping: 1 });

  console.log("[7Heaven] MongoDB authentication verified");

  const collections = await conn.connection.db.listCollections().toArray();

  console.log(
    "[7Heaven] Collections:",
    collections.map(c => c.name)
  );

  return conn;
};
