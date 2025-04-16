import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { analyzeRepository } from '../services/documentService';

const pool = new Pool();
const documentsRouter = Router();

/**
 * Extend Express's `Request` type so we can add `req.user`.
 */
interface AuthRequest extends Request {
    user?: any; // or a more specific type if you prefer
}

/**
 * A reusable local JWT middleware function
 * with typed params so TS doesn't complain.
 */
function requireLocalJWT(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    try {
        console.log('Verifying local JWT:', token);
        const secret = process.env.JWT_SECRET || 'fallback';
        const decoded = jwt.verify(token, secret);
        req.user = decoded; // store the decoded JWT payload on req.user
        next();
    } catch (e) {
        console.error('Token verification failed:', e);
        return res.status(401).json({ message: 'Invalid token' });
    }
}

/**
 * 1) Routes that DO need local JWT
 */
documentsRouter.get('/', requireLocalJWT, async (req: AuthRequest, res: Response) => {
    try {
        // Because we typed req as AuthRequest, we can do req.user
        const userId = req.user?.id;
        const result = await pool.query(
            `SELECT id, owner_id, title, content, repo_full_name, branch_name
       FROM documents
       WHERE owner_id = $1`,
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching documents' });
    }
});

documentsRouter.post('/', requireLocalJWT, async (req: AuthRequest, res: Response) => {
    const { title, content, repoFullName, branchName } = req.body;
    const userId = req.user?.id;

    try {
        await pool.query(
            `INSERT INTO documents (owner_id, title, content, repo_full_name, branch_name)
       VALUES ($1, $2, $3, $4, $5)`,
            [userId, title, content, repoFullName, branchName]
        );
        res.status(201).json({ message: 'Document created' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating document' });
    }
});

documentsRouter.put('/:id', requireLocalJWT, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, content, repoFullName, branchName } = req.body;

    try {
        await pool.query(
            `UPDATE documents
         SET title = $1,
             content = $2,
             repo_full_name = $3,
             branch_name = $4
       WHERE id = $5`,
            [title, content, repoFullName, branchName, id]
        );
        res.status(200).json({ message: 'Document updated' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating document' });
    }
});

documentsRouter.delete('/:id', requireLocalJWT, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM documents WHERE id = $1', [id]);
        res.status(200).json({ message: 'Document deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting document' });
    }
});

/**
 * 2) Route that DOES NOT require local JWT
 * so we can call it with only the GitHub token in req.body
 */
documentsRouter.post('/analyze-repository', async (req: Request, res: Response) => {
    const { repoFullName, token, selectedBranch } = req.body;
    try {
        console.log('Analyzing repository...');
        const userManual = await analyzeRepository(repoFullName, token, selectedBranch);
        console.log('User manual generated:', userManual);
        res.json({ userManual });
    } catch (error) {
        console.error('Error analyzing repository:', error);
        res.status(500).json({ message: 'Error analyzing repository' });
    }
});

export default documentsRouter;
