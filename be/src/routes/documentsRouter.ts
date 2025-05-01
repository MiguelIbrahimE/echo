/* ==========================================================
   documentsRouter.ts               ✨ 2025-05-01
   CRUD for manuals + “recent” + GPT analysis
========================================================== */
import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { analyzeRepository } from '../services/documentService';

const pool = new Pool();
const documentsRouter = Router();

/* ---------- helpers ---------- */
interface AuthRequest extends Request { user?: any; }

function requireLocalJWT(req: AuthRequest, res: Response, next: NextFunction) {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback');
        return next();
    } catch {
        return res.status(401).json({ message: 'Invalid token' });
    }
}

/* ---------- util: resolve repository_id for user ---------- */
async function getRepositoryId(
    userId: number,
    repoFullName: string | undefined | null
): Promise<number | null> {
    if (!repoFullName) return null;
    const { rows } = await pool.query(
        `SELECT id FROM user_repositories
     WHERE user_id = $1 AND repo_full_name = $2`,
        [userId, repoFullName]
    );
    return rows[0]?.id ?? null;
}

/* ==========================================================
   1) routes that NEED JWT
========================================================== */

/* -- list all docs for user -------------------------------- */
documentsRouter.get(
    '/',
    requireLocalJWT,
    async (req: AuthRequest, res: Response) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, title, repo_full_name, branch_name,
                created_at, updated_at
         FROM documents
         WHERE owner_id = $1
         ORDER BY updated_at DESC`,
                [req.user.id]
            );
            res.json(rows);
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Error fetching documents' });
        }
    }
);

/* -- ten most-recent -------------------------------------- */
documentsRouter.get(
    '/recent',
    requireLocalJWT,
    async (req: AuthRequest, res: Response) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, title, repo_full_name, branch_name, updated_at
         FROM documents
         WHERE owner_id = $1
         ORDER BY updated_at DESC
         LIMIT 10`,
                [req.user.id]
            );
            res.json(rows);
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Error fetching recent documents' });
        }
    }
);

/* -- create ----------------------------------------------- */
documentsRouter.post(
    '/',
    requireLocalJWT,
    async (req: AuthRequest, res: Response) => {
        const { title, content, repoFullName, branchName, repositoryId } = req.body;
        if (!title) return res.status(400).json({ message: 'title required' });

        try {
            const repoId =
                repositoryId ?? (await getRepositoryId(req.user.id, repoFullName));

            await pool.query(
                `INSERT INTO documents
         (owner_id, repository_id, title, content, repo_full_name, branch_name)
         VALUES ($1,$2,$3,$4,$5,$6)`,
                [
                    req.user.id,
                    repoId,
                    title,
                    content ?? '',
                    repoFullName ?? null,
                    branchName ?? null,
                ]
            );
            res.status(201).json({ message: 'Document created' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Error creating document' });
        }
    }
);

/* -- update ----------------------------------------------- */
documentsRouter.put(
    '/:id',
    requireLocalJWT,
    async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { title, content, repoFullName, branchName, repositoryId } = req.body;

        try {
            const repoId =
                repositoryId ?? (await getRepositoryId(req.user.id, repoFullName));

            const { rowCount } = await pool.query(
                `UPDATE documents
         SET title          = COALESCE($1,title),
             content        = COALESCE($2,content),
             repository_id  = $3,
             repo_full_name = $4,
             branch_name    = $5
         WHERE id = $6 AND owner_id = $7`,
                [
                    title,
                    content,
                    repoId,
                    repoFullName,
                    branchName,
                    id,
                    req.user.id,
                ]
            );
            if (!rowCount)
                return res.status(403).json({ message: 'Not your document' });
            res.json({ message: 'Document updated' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Error updating document' });
        }
    }
);

/* -- delete ----------------------------------------------- */
documentsRouter.delete(
    '/:id',
    requireLocalJWT,
    async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        try {
            const { rowCount } = await pool.query(
                `DELETE FROM documents
         WHERE id = $1 AND owner_id = $2`,
                [id, req.user.id]
            );
            if (!rowCount)
                return res.status(403).json({ message: 'Not your document' });
            res.json({ message: 'Document deleted' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Error deleting document' });
        }
    }
);

/* ==========================================================
   2) GPT analysis route – public
========================================================== */
documentsRouter.post(
    '/analyze-repository',
    async (req: Request, res: Response) => {
        const { repoFullName, token, selectedBranch } = req.body;
        if (!repoFullName || !token || !selectedBranch) {
            return res.status(400).json({ message: 'Missing params' });
        }
        try {
            const result = await analyzeRepository(
                repoFullName,
                token,
                selectedBranch
            );
            res.json({ userManual: result.userManual });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Error analyzing repository' });
        }
    }
);

export default documentsRouter;
