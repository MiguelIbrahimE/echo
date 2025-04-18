import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import pool from '../db';

const router = Router();

/** Very small JWT‑auth wrapper (reuse your existing middleware if you have one) */
function requireJwt(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization || '';
    const token  = header.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No local JWT' });
    try {
        // we only need the user id here – validate & attach it
        const secret = process.env.JWT_SECRET || 'fallback';
        const decoded: any = require('jsonwebtoken').verify(token, secret);
        (req as any).user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ message: 'Invalid JWT' });
    }
}

/**
 * POST /user/api-key     (requires local JWT)
 * Body: { apiKey: 'sk-...' }
 */
router.post('/api-key', requireJwt, async (req: Request, res: Response) => {
    const { apiKey } = req.body;
    const userId     = (req as any).user?.id;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20)
        return res.status(400).json({ message: 'Invalid API key' });

    try {
        // 1 · store in DB
        await pool.query('UPDATE users SET chatgpt_key = $1 WHERE id = $2', [apiKey, userId]);

        // 2 · mirror to container‑local .env  (+ keep it in RAM so no restart needed)
        fs.writeFileSync('/app/.env', `GPT_API_KEY=${apiKey}\n`, 'utf8');
        process.env.GPT_API_KEY = apiKey;

        console.log(`🔑  Stored ChatGPT key for user #${userId}`);
        return res.sendStatus(200);
    } catch (err) {
        console.error('user/api-key error:', err);
        return res.status(500).json({ message: 'Could not save key' });
    }
});

export default router;
