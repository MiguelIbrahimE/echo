// be/src/server.ts
import express from 'express';
import cors from 'cors';
import documentsRouter from './routes/documentsRouter';
import authRouter from './auth/authRouter';

// [ADDED] Import and configure dotenv at the VERY top
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// [ADDED] Optional debug: check if GPT_API_KEY is loaded
if (!process.env.GPT_API_KEY) {
  console.warn('>>> WARNING: process.env.GPT_API_KEY is NOT defined!');
} else {
  console.log('>>> SUCCESS: GPT_API_KEY is defined, length:', process.env.GPT_API_KEY.length);
}

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Our new auth routes
app.use('/auth', authRouter);

// The existing documents router
app.use('/documents', documentsRouter);

app.get('/', (req, res) => {
  res.send('Hello from the TypeScript backend!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
