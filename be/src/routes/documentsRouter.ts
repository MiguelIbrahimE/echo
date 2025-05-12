// be/src/routes/documentsRouter.ts
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db'; // Your database connection pool

// Import your generator services
import { analyzeRepository as generateUserManual } from '../services/userManualGenerator'; // Renamed for clarity

import { generateContributingGuide } from '../services/contributingGuideGenerator';
import { explainProjectStructure } from '../services/projectStructureExplainer';

const documentsRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_key_for_dev_only';

/* ---------- helpers ---------- */
interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        username: string;
        // Add other user properties if decoded from JWT, like email
    };
    dbUser?: { // For attaching full user record from DB including github_access_token
        id: number;
        username: string;
        email?: string;
        github_id?: string;
        github_access_token?: string;
    }
}

// JWT Authentication Middleware + User & GitHub Token Fetcher
async function authenticateAndLoadUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided or malformed token.' });
    }
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };
        req.user = decoded; // Basic user info from JWT

        // Fetch full user details including github_access_token from DB
        const userResult = await pool.query(
            'SELECT id, username, email, github_id, github_access_token FROM users WHERE id = $1',
            [decoded.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'User not found for token.' });
        }
        req.dbUser = userResult.rows[0]; // Attach full user record


        return next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: 'Invalid or expired token.' });
        }
        console.error("Error in authenticateAndLoadUser middleware:", error);
        return res.status(500).json({ message: "Server error during authentication." });
    }
}


/* ---------- util: resolve repository_id ---------- */
async function getRepositoryId(
    userId: number,
    repoFullName?: string | null
): Promise<number | null> {
    if (!repoFullName) return null;
    const { rows } = await pool.query(
        `SELECT id FROM user_repositories WHERE user_id = $1 AND repo_full_name = $2`,
        [userId, repoFullName]
    );
    return rows[0]?.id ?? null;
}

/* ==========================================================
   STANDARD DOCUMENT CRUD (Authenticated with app's JWT)
========================================================== */

// List all documents for the authenticated user
documentsRouter.get('/', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, title, doc_type, repo_full_name, branch_name, created_at, updated_at
             FROM documents
             WHERE owner_id = $1
             ORDER BY updated_at DESC`,
            [req.user!.id] // req.user is guaranteed by authenticateAndLoadUser
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error fetching documents' });
    }
});

// List recent documents for the authenticated user
documentsRouter.get('/recent', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, title, doc_type, repo_full_name, branch_name, updated_at
             FROM documents
             WHERE owner_id = $1
             ORDER BY updated_at DESC
             LIMIT 10`,
            [req.user!.id]
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error fetching recent documents' });
    }
});

// Create a new document (e.g., manually, or after generation)
documentsRouter.post('/', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const { title, content, repoFullName, branchName, docType } = req.body; // Added docType
    const ownerId = req.user!.id;

    if (!title) return res.status(400).json({ message: 'Title is required' });
    if (!docType) return res.status(400).json({ message: 'docType is required (e.g., USER_MANUAL, API_REFERENCE)' });


    try {
        const repositoryId = await getRepositoryId(ownerId, repoFullName);

        const result = await pool.query(
            `INSERT INTO documents (owner_id, repository_id, title, content, repo_full_name, branch_name, doc_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, title, doc_type, repo_full_name, branch_name, created_at, updated_at`, // Return the created doc
            [
                ownerId,
                repositoryId,
                title,
                content ?? '', // Default to empty string if content is not provided
                repoFullName ?? null,
                branchName ?? null,
                docType.toUpperCase(), // Store doc_type in uppercase
            ]
        );
        res.status(201).json(result.rows[0]); // Send back the created document
    } catch (e) {
        console.error("Error creating document record:", e);
        res.status(500).json({ message: 'Error creating document' });
    }
});

// Update an existing document
documentsRouter.put('/:id', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const { id: docId } = req.params;
    const { title, content, repoFullName, branchName, docType } = req.body;
    const ownerId = req.user!.id;

    try {
        const repositoryId = await getRepositoryId(ownerId, repoFullName);

        const { rowCount } = await pool.query(
            `UPDATE documents
             SET title = COALESCE($1, title),
                 content = COALESCE($2, content),
                 repository_id = $3,        -- Allow updating to null or new repo_id
                 repo_full_name = $4,   -- Allow updating to null or new repo_full_name
                 branch_name = $5,      -- Allow updating to null or new branch_name
                 doc_type = COALESCE($6, doc_type), -- Allow updating doc_type
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $7 AND owner_id = $8`,
            [title, content, repositoryId, repoFullName, branchName, docType?.toUpperCase(), docId, ownerId]
        );
        if (!rowCount) return res.status(404).json({ message: 'Document not found or you do not have permission to update.' });
        res.json({ message: 'Document updated successfully' });
    } catch (e) {
        console.error("Error updating document:", e);
        res.status(500).json({ message: 'Error updating document' });
    }
});

// Delete a document
documentsRouter.delete('/:id', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const { id: docId } = req.params;
    const ownerId = req.user!.id;
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM documents WHERE id = $1 AND owner_id = $2`,
            [docId, ownerId]
        );
        if (!rowCount) return res.status(404).json({ message: 'Document not found or you do not have permission to delete.' });
        res.json({ message: 'Document deleted successfully' });
    } catch (e) {
        console.error("Error deleting document:", e);
        res.status(500).json({ message: 'Error deleting document' });
    }
});


/* ==========================================================
   DOCUMENT GENERATION ROUTES (Authenticated with app's JWT)
   These routes will use the user's stored GitHub token.
========================================================== */

// Generic helper for generation to reduce repetition
async function handleGeneration(
    req: AuthenticatedRequest,
    res: Response,
    docType: string, // e.g., 'USER_MANUAL', 'API_REFERENCE'
    generatorFunction: (repoFullName: string, githubToken: string, branch: string) => Promise<{ [key: string]: string }>
) {
    const { repoFullName, branchName } = req.body;
    const ownerId = req.user!.id;
    const githubToken = req.dbUser?.github_access_token; // From authenticateAndLoadUser middleware

    if (!repoFullName || !branchName) {
        return res.status(400).json({ message: 'repoFullName and branchName are required.' });
    }
    if (!githubToken) {
        return res.status(403).json({ message: 'GitHub account not linked or token missing for this user. Please link your GitHub account in settings.' });
    }

    const defaultTitle = `${docType.replace(/_/g, ' ')} for ${repoFullName.split('/')[1]}`;
    const { title = defaultTitle } = req.body; // Allow custom title from request

    try {
        console.log(`[${docType}] Generation started for ${repoFullName} by user ${ownerId}`);
        const generationResult = await generatorFunction(repoFullName, githubToken, branchName);
        const contentKey = Object.keys(generationResult)[0]; // e.g., 'userManual', 'apiReferenceMarkdown'
        const generatedContent = generationResult[contentKey];

        // Save the generated document to the database
        const repositoryId = await getRepositoryId(ownerId, repoFullName);
        const docResult = await pool.query(
            `INSERT INTO documents (owner_id, repository_id, title, content, repo_full_name, branch_name, doc_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, title, doc_type, repo_full_name, branch_name, created_at, updated_at`,
            [ownerId, repositoryId, title, generatedContent, repoFullName, branchName, docType.toUpperCase()]
        );
        console.log(`[${docType}] Document saved with ID: ${docResult.rows[0].id}`);
        res.status(201).json(docResult.rows[0]); // Return the newly created document record

    } catch (error: any) {
        console.error(`Failed to generate ${docType.toLowerCase()}:`, error);
        res.status(500).json({ message: error.message || `Failed to generate ${docType.toLowerCase()}` });
    }
}

// Endpoint for User Manual (Developer Guide)
documentsRouter.post('/generate-user-manual', authenticateAndLoadUser, (req, res) =>
    handleGeneration(req as AuthenticatedRequest, res, 'USER_MANUAL', generateUserManual)
);

// Endpoint for API Reference

// Endpoint for Contributing Guide
documentsRouter.post('/generate-contributing-guide', authenticateAndLoadUser, (req, res) =>
    handleGeneration(req as AuthenticatedRequest, res, 'CONTRIBUTING_GUIDE', generateContributingGuide)
);

// Endpoint for Project Structure Explanation
documentsRouter.post('/explain-project-structure', authenticateAndLoadUser, (req, res) =>
    handleGeneration(req as AuthenticatedRequest, res, 'PROJECT_STRUCTURE', explainProjectStructure)
);


/* ==========================================================
   OLD GPT analysis route – This was public and took a token in body.
   Consider if this is still needed or if all generation should be authenticated.
   If kept, ensure it doesn't save to a user's documents table without auth.
========================================================== */
documentsRouter.post('/analyze-repository', async (req: Request, res: Response) => {
    const { repoFullName, token: githubTokenFromBody, selectedBranch } = req.body;
    if (!repoFullName || !githubTokenFromBody || !selectedBranch) {
        return res.status(400).json({ message: 'Missing params: repoFullName, token, selectedBranch' });
    }

    try {
        // Note: This directly uses the token from the body.
        // This is different from the authenticated routes above which use the user's stored token.
        const result = await generateUserManual(repoFullName, githubTokenFromBody, selectedBranch);
        // This public route just returns the content, doesn't save it to any user.
        res.json({ userManual: result.userManual });
    } catch (e: any) {
        console.error("Error in public /analyze-repository:", e);
        res.status(500).json({ message: e.message || 'Error analyzing repository' });
    }
});

export default documentsRouter;