// be/src/routes/documentsRouter.ts
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db'; // Your database connection pool

// Import your generator services
import { generateUserManual } from '../services/userManualGenerator';
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
        github_access_token?: string | null; // Allow null
    }
}

async function authenticateAndLoadUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const endpointPath = req.path;
    console.log(`[AUTH - ${endpointPath}] Middleware hit for ${req.method} ${req.originalUrl}`);
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn(`[AUTH - ${endpointPath}] No token provided or malformed token.`);
        return res.status(401).json({ message: 'No token provided or malformed token.' });
    }
    const token = authHeader.split(' ')[1];
    console.log(`[AUTH - ${endpointPath}] Token received (first 10 chars): ${token ? token.substring(0, 10) + '...' : 'EMPTY_TOKEN'}`);

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };
        req.user = decoded;
        console.log(`[AUTH - ${endpointPath}] JWT decoded. User ID: ${decoded.id}, Username: ${decoded.username}`);

        const userResult = await pool.query(
            'SELECT id, username, email, github_id, github_access_token FROM users WHERE id = $1',
            [decoded.id]
        );

        if (userResult.rows.length === 0) {
            console.warn(`[AUTH - ${endpointPath}] User not found in DB for ID: ${decoded.id}`);
            return res.status(401).json({ message: 'User not found for token.' });
        }
        req.dbUser = userResult.rows[0];
        const ghTokenSnippet = req.dbUser.github_access_token ? `${req.dbUser.github_access_token.substring(0, 7)}...` : 'NULL';
        console.log(`[AUTH - ${endpointPath}] User record fetched. User ID: ${req.dbUser.id}, Username: ${req.dbUser.username}, GitHub Token (start): ${ghTokenSnippet}`);
        return next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            console.warn(`[AUTH - ${endpointPath}] Invalid or expired JWT: ${error.message}`);
            return res.status(401).json({ message: 'Invalid or expired token.' });
        }
        console.error(`[AUTH - ${endpointPath}] Server error during authentication:`, error);
        return res.status(500).json({ message: "Server error during authentication." });
    }
}

async function getRepositoryId(userId: number, repoFullName?: string | null): Promise<number | null> {
    if (!repoFullName) {
        console.log('[DB_HELPER] getRepositoryId: repoFullName is null or undefined, returning null.');
        return null;
    }
    console.log(`[DB_HELPER] getRepositoryId: Fetching repository_id for user_id: ${userId}, repoFullName: ${repoFullName}`);
    const { rows } = await pool.query(
        `SELECT id FROM user_repositories WHERE user_id = $1 AND repo_full_name = $2`,
        [userId, repoFullName]
    );
    const repoId = rows[0]?.id ?? null;
    console.log(`[DB_HELPER] getRepositoryId: Found repository_id: ${repoId}`);
    return repoId;
}

/* ==========================================================
   STANDARD DOCUMENT CRUD
========================================================== */

// List all documents for the authenticated user
documentsRouter.get('/', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    console.log(`[DOCS_CRUD] GET /: Request for all documents by user ID: ${userId}`);
    try {
        const { rows } = await pool.query(
            `SELECT id, title, doc_type, repo_full_name, branch_name, created_at, updated_at, github_file_url, github_commit_url
             FROM documents
             WHERE owner_id = $1
             ORDER BY updated_at DESC`,
            [userId]
        );
        console.log(`[DOCS_CRUD] GET /: Found ${rows.length} documents for user ID: ${userId}`);
        res.json(rows);
    } catch (e) {
        console.error(`[DOCS_CRUD] GET /: Error fetching documents for user ID ${userId}:`, e);
        res.status(500).json({ message: 'Error fetching documents' });
    }
});

// List recent documents for the authenticated user
documentsRouter.get('/recent', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    console.log(`[DOCS_CRUD] GET /recent: Request for recent documents by user ID: ${userId}`);
    try {
        const { rows } = await pool.query(
            `SELECT id, title, doc_type, repo_full_name, branch_name, updated_at, github_file_url, github_commit_url
             FROM documents
             WHERE owner_id = $1
             ORDER BY updated_at DESC
             LIMIT 10`,
            [userId]
        );
        console.log(`[DOCS_CRUD] GET /recent: Found ${rows.length} recent documents for user ID: ${userId}`);
        res.json(rows);
    } catch (e) {
        console.error(`[DOCS_CRUD] GET /recent: Error fetching recent documents for user ID ${userId}:`, e);
        res.status(500).json({ message: 'Error fetching recent documents' });
    }
});

// Create a new document
documentsRouter.post('/', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.user!.id;
    console.log(`[DOCS_CRUD] POST /: Create document request by user ID: ${ownerId}. Body:`, req.body);
    const { title, content, repoFullName, branchName, docType, githubFileUrl, githubCommitUrl } = req.body;

    if (!title) return res.status(400).json({ message: 'Title is required' });
    if (!docType) return res.status(400).json({ message: 'docType is required' });

    try {
        const repositoryId = await getRepositoryId(ownerId, repoFullName);
        const result = await pool.query(
            `INSERT INTO documents (owner_id, repository_id, title, content, repo_full_name, branch_name, doc_type, github_file_url, github_commit_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, title, doc_type, content, repo_full_name, branch_name, created_at, updated_at, github_file_url, github_commit_url`, // Added 'content'
            [
                ownerId, repositoryId, title, content ?? '', repoFullName ?? null,
                branchName ?? null, docType.toUpperCase(), githubFileUrl ?? null, githubCommitUrl ?? null
            ]
        );
        console.log(`[DOCS_CRUD] POST /: Document created. ID: ${result.rows[0]?.id}, Title: ${result.rows[0]?.title}`);
        res.status(201).json(result.rows[0]);
    } catch (e) {
        console.error(`[DOCS_CRUD] POST /: Error creating document for user ID ${ownerId}:`, e);
        res.status(500).json({ message: 'Error creating document' });
    }
});

// Update an existing document
documentsRouter.put('/:id', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const { id: docId } = req.params;
    const ownerId = req.user!.id;
    console.log(`[DOCS_CRUD] PUT /${docId}: Update document request by user ID: ${ownerId}. Body:`, req.body);
    const { title, content, repoFullName, branchName, docType, githubFileUrl, githubCommitUrl } = req.body;

    try {
        const repositoryId = await getRepositoryId(ownerId, repoFullName);
        const result = await pool.query( // Changed from rowCount to result to get updated row
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
             WHERE id = $9 AND owner_id = $10
             RETURNING id, title, doc_type, content, repo_full_name, branch_name, updated_at, github_file_url, github_commit_url`, // Added 'content'
            [
                title, content, repositoryId, repoFullName, branchName,
                docType?.toUpperCase(), githubFileUrl, githubCommitUrl, docId, ownerId
            ]
        );
        if (result.rows.length === 0) {
            console.warn(`[DOCS_CRUD] PUT /${docId}: Document not found or no permission for user ID ${ownerId}.`);
            return res.status(404).json({ message: 'Document not found or you do not have permission to update.' });
        }
        console.log(`[DOCS_CRUD] PUT /${docId}: Document updated successfully for user ID ${ownerId}.`);
        res.json({ message: 'Document updated successfully', document: result.rows[0] });
    } catch (e) {
        console.error(`[DOCS_CRUD] PUT /${docId}: Error updating document for user ID ${ownerId}:`, e);
        res.status(500).json({ message: 'Error updating document' });
    }
});

// Delete a document
documentsRouter.delete('/:id', authenticateAndLoadUser, async (req: AuthenticatedRequest, res: Response) => {
    const { id: docId } = req.params;
    const ownerId = req.user!.id;
    console.log(`[DOCS_CRUD] DELETE /${docId}: Delete document request by user ID: ${ownerId}.`);
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM documents WHERE id = $1 AND owner_id = $2`,
            [docId, ownerId]
        );
        if (!rowCount) {
            console.warn(`[DOCS_CRUD] DELETE /${docId}: Document not found or no permission for user ID ${ownerId}.`);
            return res.status(404).json({ message: 'Document not found or you do not have permission to delete.' });
        }
        console.log(`[DOCS_CRUD] DELETE /${docId}: Document deleted successfully for user ID ${ownerId}.`);
        res.json({ message: 'Document deleted successfully' }); // Or res.sendStatus(204)
    } catch (e) {
        console.error(`[DOCS_CRUD] DELETE /${docId}: Error deleting document for user ID ${ownerId}:`, e);
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
    success: boolean;
    message: string;
    markdownContent: string;
    githubFileUrl?: string;
    githubCommitUrl?: string;
    error?: string;
}>;

async function handleGeneration(
    req: AuthenticatedRequest,
    res: Response,
    docType: string,
    generatorFunction: GeneratorFunction
) {
    const { repoFullName, branchName } = req.body;
    const ownerId = req.user!.id;

    console.log(`[DOC_GENERATE - ${docType}] handleGeneration called. User ID: ${ownerId}, Repo: ${repoFullName}, Branch: ${branchName}`);
    if (!req.dbUser) {
        console.error(`[DOC_GENERATE - ${docType}] CRITICAL: req.dbUser is undefined in handleGeneration.`);
        return res.status(500).json({ message: "User data not fully loaded on server. Cannot proceed." });
    }
    const githubTokenForLog = req.dbUser.github_access_token ? `${req.dbUser.github_access_token.substring(0, 7)}...` : 'NULL or EMPTY';
    console.log(`[DOC_GENERATE - ${docType}] User details from DB: ID=${req.dbUser.id}, Username=${req.dbUser.username}, GitHub Token (start): ${githubTokenForLog}`);

    const githubToken = req.dbUser.github_access_token;

    if (!repoFullName || !branchName) {
        console.warn(`[DOC_GENERATE - ${docType}] Missing repoFullName or branchName. Body:`, req.body);
        return res.status(400).json({ message: 'repoFullName and branchName are required.' });
    }
    if (!githubToken) {
        console.error(`[DOC_GENERATE - ${docType}] GitHub token is missing from dbUser for user ID ${ownerId}. Returning 403.`);
        return res.status(403).json({ message: 'GitHub account not linked or token missing for this user. Please link your GitHub account in settings.' });
    }

    const defaultDocName = repoFullName.split('/')[1] || 'document';
    const defaultTitle = `${docType.replace(/_/g, ' ')} for ${defaultDocName}`;
    const { title = defaultTitle } = req.body; // Allow frontend to override title if needed
    console.log(`[DOC_GENERATE - ${docType}] Document title to be used: "${title}"`);

    try {
        console.log(`[DOC_GENERATE - ${docType}] Calling generatorFunction for ${repoFullName} using branch ${branchName}`);
        const generationResult = await generatorFunction(repoFullName, githubToken, branchName);
        console.log(`[DOC_GENERATE - ${docType}] Generator function completed. Success: ${generationResult.success}, Message: ${generationResult.message}`);
        console.log(`[DOC_GENERATE - ${docType}] Markdown content from generator (first 100 chars): ${generationResult.markdownContent.substring(0,100)}...`);

        const repositoryId = await getRepositoryId(ownerId, repoFullName);
        console.log(`[DOC_GENERATE - ${docType}] Obtained repositoryId: ${repositoryId} for saving generated document.`);

        const docResult = await pool.query(
            `INSERT INTO documents (owner_id, repository_id, title, content, repo_full_name, branch_name, doc_type, github_file_url, github_commit_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, title, doc_type, content, repo_full_name, branch_name, created_at, updated_at, github_file_url, github_commit_url`, // Ensure 'content' is returned
            [
                ownerId, repositoryId, title, generationResult.markdownContent,
                repoFullName, branchName, docType.toUpperCase(),
                generationResult.githubFileUrl, generationResult.githubCommitUrl
            ]
        );

        if (!docResult.rows[0]) {
            console.error(`[DOC_GENERATE - ${docType}] Failed to insert document into DB or RETURNING clause did not yield a row for title: ${title}`);
            return res.status(500).json({ message: 'Failed to save generated document to database.' });
        }

        const newEchoDocument = docResult.rows[0];
        console.log(`[DOC_GENERATE - ${docType}] Document saved to Echo DB. ID: ${newEchoDocument.id}. Content snippet: ${newEchoDocument.content ? newEchoDocument.content.substring(0,50)+'...' : 'NULL'}. GitHub related success from generator: ${generationResult.success}`);

        if (generationResult.success) {
            res.status(201).json({
                message: generationResult.message || `Successfully generated ${docType.toLowerCase()} and (if applicable) committed to GitHub. Document saved in Echo.`,
                echoDocument: newEchoDocument,
                githubFileUrl: generationResult.githubFileUrl,
                githubCommitUrl: generationResult.githubCommitUrl
            });
        } else {
            res.status(207).json({
                message: generationResult.message || `Generated ${docType.toLowerCase()} and saved in Echo, but an issue occurred with GitHub interaction or content quality.`,
                echoDocument: newEchoDocument,
                githubError: generationResult.error || generationResult.message
            });
        }

    } catch (error: any) {
        console.error(`[DOC_GENERATE - ${docType}] Error during generation or saving to DB:`, error);
        res.status(500).json({ message: error.message || `Overall failure to generate ${docType.toLowerCase()}` });
    }
}

// Endpoints
documentsRouter.post('/generate-user-manual', authenticateAndLoadUser, (req, res) => {
    console.log(`[ROUTE] POST /generate-user-manual hit for user: ${req.user?.id}, repo: ${req.body.repoFullName}, branch: ${req.body.branchName}`);
    handleGeneration(req as AuthenticatedRequest, res, 'USER_MANUAL', generateUserManual);
});

documentsRouter.post('/generate-contributing-guide', authenticateAndLoadUser, (req, res) => {
    console.log(`[ROUTE] POST /generate-contributing-guide hit for user: ${req.user?.id}, repo: ${req.body.repoFullName}, branch: ${req.body.branchName}`);
    handleGeneration(req as AuthenticatedRequest, res, 'CONTRIBUTING_GUIDE', generateContributingGuide);
});

documentsRouter.post('/explain-project-structure', authenticateAndLoadUser, (req, res) => {
    console.log(`[ROUTE] POST /explain-project-structure hit for user: ${req.user?.id}, repo: ${req.body.repoFullName}, branch: ${req.body.branchName}`);
    handleGeneration(req as AuthenticatedRequest, res, 'PROJECT_STRUCTURE', explainProjectStructure);
});


documentsRouter.post('/analyze-repository', async (req: Request, res: Response) => {
    console.log('[ROUTE] POST /analyze-repository (public) hit. Body:', req.body);
    const { repoFullName, token: githubTokenFromBody, selectedBranch } = req.body;
    if (!repoFullName || !githubTokenFromBody || !selectedBranch) {
        return res.status(400).json({ message: 'Missing params: repoFullName, token, selectedBranch' });
    }
    try {
        const result = await generateUserManual(repoFullName, githubTokenFromBody, selectedBranch);
        res.json({ userManual: result.markdownContent });
    } catch (e: any) {
        console.error("[ROUTE] Error in public /analyze-repository:", e);
        res.status(500).json({ message: e.message || 'Error analyzing repository' });
    }
});

export default documentsRouter;