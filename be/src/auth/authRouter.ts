// be/src/auth/authRouter.ts
import express, { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken'; // Your app's JWT
import { pool } from '../db'; // Assuming your db.ts exports pool

const router = express.Router();

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET; // Your app's JWT secret
// This is where your BACKEND redirects the user's BROWSER after backend processing
const FRONTEND_OAUTH_CALLBACK_URL = process.env.FRONTEND_OAUTH_CALLBACK_URL || 'http://localhost:5173/auth/oauth-callback';
// This is the URL GitHub redirects to on your BACKEND
const GITHUB_BACKEND_CALLBACK_URL = process.env.GITHUB_BACKEND_CALLBACK_URL || `http://localhost:${process.env.PORT || 5001}/auth/github/callback`;


if (!CLIENT_ID || !CLIENT_SECRET || !JWT_SECRET) {
    throw new Error('Missing GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, or JWT_SECRET in environment variables.');
}

const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
        (req: Request, res: Response, next: NextFunction) =>
            fn(req, res, next).catch(next);

/* =====================================
   GITHUB OAUTH ROUTES
===================================== */

// STEP 1: Redirect user to GitHub's OAuth dialog
router.get(
    '/github',
    asyncHandler(async (req: Request, res: Response) => {
        const authorizeUrl =
            `https://github.com/login/oauth/authorize` +
            `?client_id=${CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(GITHUB_BACKEND_CALLBACK_URL)}` + // Your backend callback
            `&scope=repo%20user:email`; // Request repo access and user email

        console.log(`Redirecting to GitHub: ${authorizeUrl}`);
        return res.redirect(authorizeUrl);
    })
);

// STEP 2: GitHub calls back to this endpoint
router.get(
    '/github/callback',
    asyncHandler(async (req: Request, res: Response) => {
        const { code, error: oauthError, error_description } = req.query;

        if (oauthError) {
            console.error(`GitHub OAuth Error: ${oauthError} - ${error_description}`);
            return res.redirect(`${FRONTEND_OAUTH_CALLBACK_URL}?status=error&error=${encodeURIComponent(oauthError as string)}&error_description=${encodeURIComponent(error_description as string)}`);
        }

        if (!code) {
            return res.redirect(`${FRONTEND_OAUTH_CALLBACK_URL}?status=error&error=missing_code`);
        }

        try {
            // Exchange the code for a GitHub access token
            const tokenResponse = await axios.post(
                'https://github.com/login/oauth/access_token',
                {
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    code,
                    redirect_uri: GITHUB_BACKEND_CALLBACK_URL, // Must match
                },
                { headers: { accept: 'application/json' } }
            );

            const { access_token: githubAccessToken, error: tokenError } = tokenResponse.data;

            if (tokenError || !githubAccessToken) {
                console.error('Error getting GitHub access token:', tokenError || 'No access token returned');
                return res.redirect(`${FRONTEND_OAUTH_CALLBACK_URL}?status=error&error=${encodeURIComponent(tokenError || 'token_exchange_failed')}`);
            }

            // Fetch GitHub user profile with the GitHub access token
            const githubUserResponse = await axios.get('https://api.github.com/user', {
                headers: { Authorization: `Bearer ${githubAccessToken}` },
            });
            const githubUser = githubUserResponse.data;

            // Fetch user's primary email if not available in main profile
            let userEmail = githubUser.email;
            if (!userEmail) {
                const emailResponse = await axios.get('https://api.github.com/user/emails', {
                    headers: { Authorization: `Bearer ${githubAccessToken}` },
                });
                const primaryEmail = emailResponse.data.find((e: any) => e.primary && e.verified);
                if (primaryEmail) userEmail = primaryEmail.email;
            }
            if (!userEmail) userEmail = `${githubUser.login}@github.user`; // Fallback email

            // Find or create user in your database
            let appUserQuery = await pool.query('SELECT id, username FROM users WHERE github_id = $1', [githubUser.id]);
            let appUser;

            if (appUserQuery.rows.length === 0) {
                // User doesn't exist, create a new one
                // Ensure your 'users' table has 'github_id' (BIGINT or TEXT), 'github_access_token' (TEXT)
                // Use githubUser.login as default username, handle potential conflicts if needed
                const insertResult = await pool.query(
                    'INSERT INTO users (username, email, github_id, github_access_token) VALUES ($1, $2, $3, $4) RETURNING id, username',
                    [githubUser.login, userEmail, githubUser.id.toString(), githubAccessToken]
                );
                appUser = insertResult.rows[0];
            } else {
                // User exists, update their GitHub access token
                await pool.query('UPDATE users SET github_access_token = $1, email = $2 WHERE github_id = $3',
                    [githubAccessToken, userEmail, githubUser.id.toString()]);
                appUser = appUserQuery.rows[0];
            }

            // Generate YOUR application's JWT
            const appToken = jwt.sign(
                { id: appUser.id, username: appUser.username },
                JWT_SECRET,
                { expiresIn: '7d' } // Example: 7 day expiry
            );

            // Redirect to your front-end callback with your app's token
            console.log(`Successfully authenticated GitHub user ${appUser.username}. Redirecting to frontend.`);
            return res.redirect(`${FRONTEND_OAUTH_CALLBACK_URL}?appToken=${appToken}&status=success&provider=github`);

        } catch (error: any) {
            console.error('Error in GitHub OAuth callback:', error.message);
            if (axios.isAxiosError(error) && error.response) {
                console.error("Axios error data:", error.response.data);
            }
            return res.redirect(`${FRONTEND_OAUTH_CALLBACK_URL}?status=error&error=callback_processing_failed`);
        }
    })
);

// ... (your existing /signup, /login, and other routes in authRouter.ts) ...
// Make sure your /github/repos route uses the appToken to find the user, then uses their stored github_access_token
router.get(
    '/github/repos',
    asyncHandler(async (req: Request, res: Response) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Missing or invalid app token' });
        }
        const appToken = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(appToken, JWT_SECRET) as { id: number, username: string };
            const userResult = await pool.query('SELECT github_access_token FROM users WHERE id = $1', [decoded.id]);

            if (userResult.rows.length === 0 || !userResult.rows[0].github_access_token) {
                return res.status(403).json({ message: 'GitHub account not linked or token missing.' });
            }
            const githubAccessToken = userResult.rows[0].github_access_token;

            const response = await axios.get('https://api.github.com/user/repos?sort=updated&per_page=100', { // Get more repos, sorted
                headers: { Authorization: `Bearer ${githubAccessToken}` },
            });
            return res.json(response.data);
        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                return res.status(401).json({ message: 'Invalid app token.' });
            }
            console.error("Error fetching GitHub repos:", error);
            return res.status(500).json({ message: 'Failed to fetch GitHub repositories.' });
        }
    })
);


export default router;