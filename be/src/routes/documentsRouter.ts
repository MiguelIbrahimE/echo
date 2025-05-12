// be/src/routes/documentsRouter.ts
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db'; // Your database connection pool

// Import your generator services
import { generateUserManual } from '../services/userManualGenerator'; // Assuming analyzeRepository is aliased or file renamed
// import { generateApiReference } from '../services/apiReferenceGenerator'; // Remove if not used
import { generateContributingGuide } from '../services/contributingGuideGenerator';
import { explainProjectStructure } from '../services/projectStructureExplainer';

const documentsRouter = Router();
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
    // ... (implementation from your last message - looks good)
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

async function getRepositoryId( /* ... as before ... */ userId: number, repoFullName?: string | null): Promise<number | null> {
    if (!repoFullName) return null;
    const { rows } = await pool.query(
        `SELECT id FROM user_repositories WHERE user_id = $1 AND repo_full_name = $2`,
        [userId, repoFullName]
    );
    return rows[0]?.id ?? null;
}

/* ==========================================================
   STANDARD DOCUMENT CRUD
========================================================== */
// ... (GET '/', GET '/recent', POST '/', PUT '/:id', DELETE '/:id' as in your last message - these look good)
// List all documents for the authenticated user
documentsRouter.get('/', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, title, doc_type, repo_full_name, branch_name, created_at, updated_at, github_file_url, github_commit_url
             FROM documents
             WHERE owner_id = $1
             ORDER BY updated_at DESC`, // Added github_file_url, github_commit_url
            [req.user!.id]
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
            `SELECT id, title, doc_type, repo_full_name, branch_name, updated_at, github_file_url, github_commit_url
             FROM documents
             WHERE owner_id = $1
             ORDER BY updated_at DESC
             LIMIT 10`, // Added github_file_url, github_commit_url
            [req.user!.id]
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error fetching recent documents' });
    }
});

// Create a new document (e.g., manually, or after generation if frontend posts generated content)
documentsRouter.post('/', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const { title, content, repoFullName, branchName, docType, githubFileUrl, githubCommitUrl } = req.body;
    const ownerId = req.user!.id;

    if (!title) return res.status(400).json({ message: 'Title is required' });
    if (!docType) return res.status(400).json({ message: 'docType is required' });

    try {
        const repositoryId = await getRepositoryId(ownerId, repoFullName);
        const result = await pool.query(
            `INSERT INTO documents (owner_id, repository_id, title, content, repo_full_name, branch_name, doc_type, github_file_url, github_commit_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, title, doc_type, repo_full_name, branch_name, created_at, updated_at, github_file_url, github_commit_url`,
            [
                ownerId, repositoryId, title, content ?? '', repoFullName ?? null,
                branchName ?? null, docType.toUpperCase(), githubFileUrl ?? null, githubCommitUrl ?? null
            ]
        );
        res.status(201).json(result.rows[0]);
    } catch (e) {
        console.error("Error creating document record:", e);
        res.status(500).json({ message: 'Error creating document' });
    }
});

// Update an existing document
documentsRouter.put('/:id', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const { id: docId } = req.params;
    const { title, content, repoFullName, branchName, docType, githubFileUrl, githubCommitUrl } = req.body;
    const ownerId = req.user!.id;

    try {
        const repositoryId = await getRepositoryId(ownerId, repoFullName);
        const { rowCount } = await pool.query(
            `UPDATE documents
             SET title = COALESCE($1, title),
                 content = COALESCE($2, content),
                 repository_id = $3,
                 repo_full_name = $4,
                 branch_name = $5,
                 doc_type = COALESCE($6, doc_type),
                 github_file_url = COALESCE($7, github_file_url),
                 github_commit_url = COALESCE($8, github_commit_url),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $9 AND owner_id = $10`,
            [
                title, content, repositoryId, repoFullName, branchName,
                docType?.toUpperCase(), githubFileUrl, githubCommitUrl, docId, ownerId
            ]
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
   DOCUMENT GENERATION ROUTES
========================================================== */

type GeneratorFunction = (
    repoFullName: string,
    githubToken: string,
    branch: string
) => Promise<{
    success: boolean; // Indicates if GitHub commit was successful (or overall process)
    message: string;
    markdownContent: string; // Standardized key for the generated content
    githubFileUrl?: string;
    githubCommitUrl?: string;
    error?: string; // Error message if commit failed or generation failed
}>;


async function handleGeneration(
    req: AuthenticatedRequest,
    res: Response,
    docType: string,
    generatorFunction: GeneratorFunction
) {
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
    const defaultTitle = `${docType.replace(/_/g, ' ')} for ${defaultDocName}`;
    const { title = defaultTitle } = req.body;

    try {
        console.log(`[${docType}] Generation and GitHub commit started for ${repoFullName} by user ${ownerId}`);
        const generationResult = await generatorFunction(repoFullName, githubToken, branchName);

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
                docType.toUpperCase(),
                generationResult.githubFileUrl, // Store GitHub file URL (will be null if commit failed)
                generationResult.githubCommitUrl // Store GitHub commit URL (will be null if commit failed)
            ]
        );
        const newEchoDocument = docResult.rows[0];
        console.log(`[${docType}] Document saved to Echo DB with ID: ${newEchoDocument.id}. GitHub commit success: ${generationResult.success}`);

        if (generationResult.success) {
            res.status(201).json({
                message: `Successfully generated ${docType.toLowerCase()} and committed to GitHub. Document saved in Echo.`,
                echoDocument: newEchoDocument,
                githubFileUrl: generationResult.githubFileUrl,
                githubCommitUrl: generationResult.githubCommitUrl
            });
        } else {
            res.status(207).json({ // 207 Multi-Status: Echo save OK, GitHub commit failed
                message: `Generated ${docType.toLowerCase()} and saved in Echo, but failed to commit to GitHub: ${generationResult.error || 'Unknown GitHub commit error'}`,
                echoDocument: newEchoDocument,
                githubError: generationResult.error || 'Unknown GitHub commit error'
            });
        }

    } catch (error: any) { // Catch errors from generatorFunction or DB insert
        console.error(`[${docType}] Overall failure to generate or save:`, error);
        res.status(500).json({ message: error.message || `Overall failure to generate ${docType.toLowerCase()}` });
    }
}

// Endpoint for User Manual (Developer Guide - targets README.md)
documentsRouter.post('/generate-user-manual', authenticateAndLoadUser, (req, res) =>
    handleGeneration(req as AuthenticatedRequest, res, 'USER_MANUAL', generateUserManual)
);

// REMOVED API REFERENCE ROUTE as per your frontend change
// documentsRouter.post('/generate-api-reference', authenticateAndLoadUser, (req, res) =>
//     handleGeneration(req as AuthenticatedRequest, res, 'API_REFERENCE', generateApiReference)
// );

documentsRouter.post('/generate-contributing-guide', authenticateAndLoadUser, (req, res) =>
    handleGeneration(req as AuthenticatedRequest, res, 'CONTRIBUTING_GUIDE', generateContributingGuide)
);

documentsRouter.post('/explain-project-structure', authenticateAndLoadUser, (req, res) =>
    handleGeneration(req as AuthenticatedRequest, res, 'PROJECT_STRUCTURE', explainProjectStructure)
);


/* ==========================================================
   OLD GPT analysis route – PUBLIC, NO DB SAVE, NO GITHUB COMMIT
========================================================== */
documentsRouter.post('/analyze-repository', async (req: Request, res: Response) => {
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

export default documentsRouter;