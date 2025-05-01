import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

const router = Router();

/* ---------- JWT guard ---------- */
function requireJwt(req: Request, res: Response, next: NextFunction) {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No local JWT' });
    try {
        (req as any).user = jwt.verify(token, process.env.JWT_SECRET || 'fallback');
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid JWT' });
    }
}

/* ---------- POST /user/api-key ---------- */
router.post('/api-key', requireJwt, async (req: Request, res: Response) => {
    const { apiKey } = req.body;
    const userId     = (req as any).user?.id;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20)
        return res.status(400).json({ message: 'Invalid API key' });

    try {
        await pool.query('UPDATE users SET chatgpt_key = $1 WHERE id = $2', [apiKey, userId]);

        /* optional: mirror to .env inside container */
        fs.writeFileSync('/app/.env', `GPT_API_KEY=${apiKey}\n`, 'utf8');
        process.env.GPT_API_KEY = apiKey;

        console.log(`🔑  Stored ChatGPT key for user #${userId}`);
        res.sendStatus(200);
    } catch (err) {
        console.error('user/api-key error:', err);
        res.status(500).json({ message: 'Could not save key' });
    }
});

export default router;
