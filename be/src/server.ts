// be/src/server.ts
import express from 'express';
import cors    from 'cors';
import dotenv  from 'dotenv';
// import { pool } from './db'; // Not directly used in server.ts usually
dotenv.config();
import repositoriesRouter from './routes/repositoriesRouter';
import authRouter          from './auth/authRouter'; // Main auth router
import documentsRouter     from './routes/documentsRouter';
// import githubAuthRouter    from './routes/githubAuthRouter'; // <-- REMOVE OR COMMENT OUT
import userSettingsRouter  from './routes/userSettingsRouter';

const app  = express();
const PORT = process.env.PORT || 5001; // Use PORT from .env or default

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

app.use('/repositories', repositoriesRouter);
app.use('/auth',       authRouter); // Handles /auth/login, /auth/signup, /auth/github, /auth/github/callback
app.use('/documents',  documentsRouter);
// app.use('/github',     githubAuthRouter); // <-- REMOVE OR COMMENT OUT
app.use('/user',       userSettingsRouter);

app.get('/', (_req, res) => res.send('Echo backend up 🚀'));

// Global Error Handler (should be after all route definitions)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("🛑 GLOBAL ERROR HANDLER CAUGHT:", err.message, err.stack ? `\n${err.stack}` : '');
    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || 'An unexpected internal server error occurred.';
    res.status(statusCode).json({ message: message });
});


app.listen(PORT, () => console.log(`Backend listening on :${PORT}`));