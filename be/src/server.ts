import express from 'express';
import cors    from 'cors';
import dotenv  from 'dotenv';
dotenv.config();

import authRouter          from './auth/authRouter';
import documentsRouter     from './routes/documentsRouter';
import githubAuthRouter    from './routes/githubAuthRouter';
import userSettingsRouter  from './routes/userSettingsRouter';

const app  = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

app.use('/auth',       authRouter);
app.use('/documents',  documentsRouter);
app.use('/github',     githubAuthRouter);
app.use('/user',       userSettingsRouter);

app.get('/', (_req, res) => res.send('Echo backend up 🚀'));
app.listen(PORT, () => console.log(`Backend listening on :${PORT}`));
