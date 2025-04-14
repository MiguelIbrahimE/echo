import { Router } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { analyzeRepository } from '../services/documentService';

// We rely on environment variables from your environment
const pool = new Pool();
const documentsRouter = Router();

/**
 * A reusable local JWT middleware function
 */
function requireLocalJWT(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    try {
        console.log('Verifying local JWT:', token);
        const secret = process.env.JWT_SECRET || 'fallback';
        const decoded = jwt.verify(token, secret) as any;
        (req as any).user = decoded;
        next();
    } catch (e) {
        console.error('Token verification failed:', e);
        return res.status(401).json({ message: 'Invalid token' });
    }
}

/**
 * 1) Routes that DO need local JWT
 */
documentsRouter.get('/', requireLocalJWT, async (req, res) => {
    try {
        const userId = (req as any).user.id;
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

documentsRouter.post('/', requireLocalJWT, async (req, res) => {
    const { title, content, repoFullName, branchName } = req.body;
    const userId = (req as any).user.id;

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

documentsRouter.put('/:id', requireLocalJWT, async (req, res) => {
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

documentsRouter.delete('/:id', requireLocalJWT, async (req, res) => {
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
 * so we can call it with only the GitHub token
 */
documentsRouter.post('/analyze-repository', async (req, res) => {
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
