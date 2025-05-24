// be/src/repositoriesRouter.ts
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';          // ← shared instance

const repositoriesRouter = Router();

/* ---------- JWT guard (ensure this is the same as your working version) ---------- */
interface AuthRequest extends Request { user?: { id: number; [key: string]: any } }
function requireLocalJWT(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided or malformed token.' });
    }
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback') as { id: number; [key: string]: any };
        req.user = { id: decoded.id };
        return next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: 'Invalid or expired token.' });
        }
        console.error("Error in requireLocalJWT middleware:", error);
        return res.status(500).json({ message: "Server error during authentication." });
    }
}

/* ---------- POST /repositories ---------- */
repositoriesRouter.post('/', requireLocalJWT, async (req: AuthRequest, res: Response) => {
    const { repoFullName, githubToken } = req.body; // githubToken here is the GitHub OAuth access token

    if (!repoFullName) {
        return res.status(400).json({ message: 'repoFullName is required' });
    }

    if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'User authentication failed or user ID missing.' });
    }
    const userId = req.user.id;

    try {
        await pool.query('BEGIN');

        // 1. Insert or update the user_repositories table
        //    - REMOVED 'updated_at' and 'github_token' from INSERT and ON CONFLICT update
        //    - 'created_at' has a DEFAULT value and does not need to be in the INSERT list here
        //      unless you want to explicitly set it (but CURRENT_TIMESTAMP is fine for both).
        const insertOrUpdateRepoQuery = `
            INSERT INTO user_repositories (user_id, repo_full_name)
            VALUES ($1, $2)
            ON CONFLICT (user_id, repo_full_name)
            DO NOTHING  -- If the (user_id, repo_full_name) pair already exists, do nothing.
                        -- There are no other columns in user_repositories to update as per your schema.
            RETURNING id`;

        let result = await pool.query(insertOrUpdateRepoQuery, [userId, repoFullName]);
        let repositoryIdToReturn = result.rows[0]?.id;

        // If INSERT was skipped due to ON CONFLICT DO NOTHING, RETURNING id yields no rows.
        // In this case, we need to fetch the id of the existing row.
        if (!repositoryIdToReturn && result.rowCount === 0) { // rowCount is 0 if DO NOTHING happened
            console.log(`[RepositoriesRouter] Conflict on (user_id, repo_full_name) for user ${userId}, repo ${repoFullName}. Fetching existing ID.`);
            const selectExistingQuery = `SELECT id FROM user_repositories WHERE user_id = $1 AND repo_full_name = $2`;
            result = await pool.query(selectExistingQuery, [userId, repoFullName]);
            if (result.rows.length > 0) {
                repositoryIdToReturn = result.rows[0].id;
            } else {
                // This state should be very unlikely if INSERT or ON CONFLICT logic is sound.
                await pool.query('ROLLBACK');
                console.error(`[RepositoriesRouter] CRITICAL: Could not find or insert repository for user ${userId}, repo ${repoFullName}.`);
                return res.status(500).json({ message: 'Failed to ensure repository link.' });
            }
        }

        if (!repositoryIdToReturn) {
            await pool.query('ROLLBACK');
            console.error(`[RepositoriesRouter] CRITICAL: repositoryIdToReturn is still null/undefined after attempting insert/select for user ${userId}, repo ${repoFullName}.`);
            return res.status(500).json({ message: 'Critical error handling repository ID.' });
        }


        // 2. CRITICAL FIX: Update the users table with the GitHub access token
        if (githubToken && typeof githubToken === 'string' && githubToken.trim() !== '') {
            const updateUserTokenResult = await pool.query(
                `UPDATE users SET github_access_token = $1 WHERE id = $2`,
                [githubToken, userId]
            );
            if (updateUserTokenResult.rowCount !== null && updateUserTokenResult.rowCount > 0) {
                console.log(`[RepositoriesRouter] Updated/Set github_access_token for user ID: ${userId}`);
            } else {
                console.warn(`[RepositoriesRouter] Failed to update github_access_token for user ID: ${userId}. User not found or no change needed (rowCount: ${updateUserTokenResult.rowCount}).`);
            }
        } else {
            console.warn(`[RepositoriesRouter] githubToken was NOT updated for user ID: ${userId} because the provided githubToken was: '${githubToken}' (type: ${typeof githubToken}).`);
        }

        await pool.query('COMMIT');

        res.status(201).json({ repositoryId: repositoryIdToReturn });

    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Error in POST /repositories:', e);
        res.status(500).json({ message: 'Failed to save repository information due to a server error.' });
    }
});

/* ---------- GET /repositories (no changes needed here based on the error) ---------- */
repositoriesRouter.get('/', requireLocalJWT, async (req: AuthRequest, res: Response) => {
    // ... (your existing GET logic is fine)
    if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'User authentication failed or user ID missing.' });
    }
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
        console.error('Error in GET /repositories:', e);
        res.status(500).json({ message: 'Error fetching repositories' });
    }
});

export default repositoriesRouter;