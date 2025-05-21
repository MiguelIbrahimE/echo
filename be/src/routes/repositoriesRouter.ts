import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';          // ← shared instance

const repositoriesRouter = Router();

/* ---------- JWT guard ---------- */
interface AuthRequest extends Request { user?: any; }
function requireLocalJWT(req: AuthRequest, res: Response, next: NextFunction) {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.sendStatus(401);
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback');
        return next();
    } catch {
        return res.sendStatus(401);
    }
}

/* ---------- POST /repositories ---------- */
repositoriesRouter.post('/', requireLocalJWT, async (req: AuthRequest, res: Response) => {
    const { repoFullName, githubToken } = req.body;
    if (!repoFullName) return res.status(400).json({ message: 'repoFullName required' });

    try {
        const userId = req.user.id;
        const { rows } = await pool.query(
            `INSERT INTO user_repositories (user_id, repo_full_name, github_token)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, repo_full_name)
       DO UPDATE SET github_token = EXCLUDED.github_token
       RETURNING id`,
            [userId, repoFullName, githubToken]
        );
        res.json({ repositoryId: rows[0].id });
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

/* ---------- GET /repositories ---------- */
repositoriesRouter.get('/', requireLocalJWT, async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, repo_full_name, created_at
       FROM user_repositories
       WHERE user_id = $1
       ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

export default repositoriesRouter;