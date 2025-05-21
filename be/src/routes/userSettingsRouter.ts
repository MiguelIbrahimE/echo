/* ======================================================
   userSettingsRouter.ts   ✨ 2025-05-01
   Account settings (save + fetch ChatGPT API key)
====================================================== */
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

/* ---------- GET /user/api-key  (masked) ---------- */
router.get('/api-key', requireJwt, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    try {
        const { rows } = await pool.query(
            'SELECT chatgpt_key FROM users WHERE id = $1',
            [userId]
        );
        const fullKey: string | null = rows[0]?.chatgpt_key ?? null;
        if (!fullKey) return res.json({ apiKey: null });

        const masked = `${fullKey.slice(0, 6)}…`;     // “sk-abc123…”
        res.json({ apiKey: masked });
    } catch (err) {
        console.error('user/api-key (GET) error:', err);
        res.status(500).json({ message: 'Could not fetch key' });
    }
});

/* ---------- POST /user/api-key  (store) ---------- */
router.post('/api-key', requireJwt, async (req: Request, res: Response) => {
    const { apiKey } = req.body;
    const userId     = (req as any).user?.id;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20)
        return res.status(400).json({ message: 'Invalid API key' });

    try {
        await pool.query(
            'UPDATE users SET chatgpt_key = $1 WHERE id = $2',
            [apiKey, userId]
        );

        /* (optional) mirror to container-local .env so running instance can use it */
        fs.writeFileSync('/app/.env', `GPT_API_KEY=${apiKey}\n`, 'utf8');
        process.env.GPT_API_KEY = apiKey;

        console.log(`🔑  Stored ChatGPT key for user #${userId}`);
        res.sendStatus(200);
    } catch (err) {
        console.error('user/api-key (POST) error:', err);
        res.status(500).json({ message: 'Could not save key' });
    }
});

export default router;