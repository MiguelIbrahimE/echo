// be/src/server.ts
import express from 'express';
import cors from 'cors';
import documentsRouter from './routes/documentsRouter';
import authRouter from './auth/authRouter'; // <--- new import

const app = express();
const PORT = process.env.PORT || 5001;

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
