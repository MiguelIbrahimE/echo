// be/src/routes/userManualRouter.ts
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db'; // Your database connection pool
import { generateUserManual } from '../services/userManualGenerator';

const userManualRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_key_for_dev_only';

/* ---------- helpers ---------- */
interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        username: string;
    };
    dbUser?: {
        id: number;
        username: string;
        email?: string;
        github_id?: string;
        github_access_token?: string;
    }
}

async function authenticateAndLoadUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided or malformed token.' });
    }
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };
        req.user = decoded;

        const userResult = await pool.query(
            'SELECT id, username, email, github_id, github_access_token FROM users WHERE id = $1',
            [decoded.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'User not found for token.' });
        }
        req.dbUser = userResult.rows[0];
        return next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: 'Invalid or expired token.' });
        }
        console.error("Error in authenticateAndLoadUser middleware:", error);
        return res.status(500).json({ message: "Server error during authentication." });
    }
}

async function getRepositoryId(userId: number, repoFullName?: string | null): Promise<number | null> {
    if (!repoFullName) return null;
    const { rows } = await pool.query(
        `SELECT id FROM user_repositories WHERE user_id = $1 AND repo_full_name = $2`,
        [userId, repoFullName]
    );
    return rows[0]?.id ?? null;
}

/* ==========================================================
   USER MANUAL GENERATION ROUTES
========================================================== */

// Endpoint for User Manual (Developer Guide - targets README.md)
userManualRouter.post('/generate', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const { repoFullName, branchName } = req.body;
    const ownerId = req.user!.id;
    const githubToken = req.dbUser!.github_access_token;

    if (!repoFullName || !branchName) {
        return res.status(400).json({ message: 'repoFullName and branchName are required.' });
    }
    if (!githubToken) {
        return res.status(403).json({ message: 'GitHub account not linked or token missing for this user. Please link your GitHub account in settings.' });
    }

    const defaultDocName = repoFullName.split('/')[1] || 'document';
    const defaultTitle = `User Manual for ${defaultDocName}`;
    const { title = defaultTitle } = req.body;

    try {
        console.log(`[UserManualGenerator] Generation and GitHub commit started for ${repoFullName} by user ${ownerId}`);
        const generationResult = await generateUserManual(repoFullName, githubToken, branchName);

        // Even if GitHub commit failed, we still have the content and can save it to Echo DB
        const repositoryId = await getRepositoryId(ownerId, repoFullName);
        const docResult = await pool.query(
            `INSERT INTO documents (owner_id, repository_id, title, content, repo_full_name, branch_name, doc_type, github_file_url, github_commit_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, title, doc_type, repo_full_name, branch_name, created_at, updated_at, github_file_url, github_commit_url`,
            [
                ownerId,
                repositoryId,
                title,
                generationResult.markdownContent, // Use the standardized key
                repoFullName,
                branchName,
                'USER_MANUAL',
                generationResult.githubFileUrl, // Store GitHub file URL (will be null if commit failed)
                generationResult.githubCommitUrl // Store GitHub commit URL (will be null if commit failed)
            ]
        );
        const newEchoDocument = docResult.rows[0];
        console.log(`[UserManualGenerator] Document saved to Echo DB with ID: ${newEchoDocument.id}. GitHub commit success: ${generationResult.success}`);

        if (generationResult.success) {
            res.status(201).json({
                message: `Successfully generated user manual and committed to GitHub. Document saved in Echo.`,
                echoDocument: newEchoDocument,
                githubFileUrl: generationResult.githubFileUrl,
                githubCommitUrl: generationResult.githubCommitUrl
            });
        } else {
            res.status(207).json({ // 207 Multi-Status: Echo save OK, GitHub commit failed
                message: `Generated user manual and saved in Echo, but failed to commit to GitHub: ${generationResult.error || 'Unknown GitHub commit error'}`,
                echoDocument: newEchoDocument,
                githubError: generationResult.error || 'Unknown GitHub commit error'
            });
        }

    } catch (error: any) { // Catch errors from generatorFunction or DB insert
        console.error(`[UserManualGenerator] Overall failure to generate or save:`, error);
        res.status(500).json({ message: error.message || `Overall failure to generate user manual` });
    }
});

/* ==========================================================
   OLD GPT analysis route – PUBLIC, NO DB SAVE, NO GITHUB COMMIT
========================================================== */
userManualRouter.post('/analyze-repository', async (req: Request, res: Response) => {
    const { repoFullName, token: githubTokenFromBody, selectedBranch } = req.body;
    if (!repoFullName || !githubTokenFromBody || !selectedBranch) {
        return res.status(400).json({ message: 'Missing params: repoFullName, token, selectedBranch' });
    }
    try {
        // This public route calls generateUserManual which now has a complex return type.
        // We only want to return the markdownContent for this old public route.
        const result = await generateUserManual(repoFullName, githubTokenFromBody, selectedBranch);
        res.json({ userManual: result.markdownContent }); // Adapt to new return structure
    } catch (e: any) {
        console.error("Error in public /analyze-repository:", e);
        res.status(500).json({ message: e.message || 'Error analyzing repository' });
    }
});

export default userManualRouter;
