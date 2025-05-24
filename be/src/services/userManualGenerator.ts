// be/src/services/userManualGenerator.ts
import axios from 'axios';
import { encode } from 'gpt-tokenizer';
import { commitFileToGithub } from './githubCommitService';
import fs from 'fs';
import path from 'path';

const OPENAI_API_KEY = process.env.GPT_API_KEY;

if (!OPENAI_API_KEY) {
    console.error(
        '❌ GPT_API_KEY is missing or undefined in the environment. Document generation will fail. ' +
        'Please ensure it is correctly set in your .env file and loaded by your application.'
    );
}

interface TreeItem { path: string; type: 'blob' | 'tree'; sha: string; size?: number; }
interface GitTreeResponse { tree: TreeItem[]; }
const MAX_TOKENS_PER_CHUNK = 3000;
const MAX_FILE_SIZE = 120000;

// --- Helper for Extracting User-Relevant Information ---
async function openaiExtractUserInfo(
    filePath: string,
    chunkIdx: number,
    totalChunks: number,
    content: string
): Promise<string> {
    if (!OPENAI_API_KEY) {
        const errorMsg = "OpenAI API Key is not configured.";
        console.error(`[UserManualGenerator - ExtractInfo] ${errorMsg}`);
        return `Error: ${errorMsg} Cannot extract info from ${filePath}.`;
    }

    const systemPrompt = `You are an assistant helping to create a user manual for a software project.
From the following file content (path: ${filePath}, chunk ${chunkIdx}/${totalChunks}), extract key information relevant to an end-user of the software. Focus on:
- What functionality this file or code seems to provide TO THE USER.
- How a user might INTERACT with this part of the software.
- Any user-facing FEATURES described or implemented.
- User-relevant CONFIGURATION options or settings.
- The PURPOSE of the file if it's documentation (e.g., README, usage examples, tutorials).
- Any USER INTERFACE elements or components described.
- Any INSTRUCTIONS or GUIDANCE for users.

If the content is clearly not relevant to an end-user (e.g., build scripts, test configurations, very low-level internal system logic without obvious user impact, corrupted data, binary content), clearly state that it's 'Primarily for developers or internal system functions.' or 'Content appears corrupted/unsuitable for user manual summary.'
Be concise and provide bullet points or short descriptions. If you're unsure whether content is user-relevant, err on the side of including it.`;

    const userPrompt = `File Content:\n\n\`\`\`\n${content}\n\`\`\``;

    try {
        const res = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 400,
            temperature: 0.1,
        }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });

        return `Information from ${filePath}:\n${res.data.choices[0].message.content.trim()}`;
    } catch (error: any) {
        const errorMsg = error.response?.data?.error?.message || error.message || "Unknown OpenAI error";
        console.error(`[UserManualGenerator - ExtractInfo] OpenAI error for ${filePath} (chunk ${chunkIdx}/${totalChunks}): ${errorMsg}`);
        return `Error extracting information from chunk ${chunkIdx}/${totalChunks} of ${filePath}: ${errorMsg}`;
    }
}

// --- Helper for Assembling the User Manual ---
async function openaiAssembleUserManual(
    repoFullName: string,
    branch: string,
    extractedInfo: string[]
): Promise<string> {
    if (!OPENAI_API_KEY) {
        const errorMsg = "OpenAI API Key is not configured.";
        console.error(`[UserManualGenerator - Assemble] ${errorMsg}`);
        return `# Configuration Error\n\n${errorMsg}\n\nCannot assemble user manual for ${repoFullName}.`;
    }

    const systemPrompt = `You are a professional technical writer. Your task is to create a comprehensive and user-friendly User Manual for the software project located at the repository '${repoFullName}' on branch '${branch}'.
You have been provided with various pieces of information extracted from the repository's files.
Please structure the User Manual logically. It should typically include sections like:
- Title, Table of Contents, 1. Introduction/Overview, 2. Getting Started/Installation, 3. Key Features, 4. How to Use, 5. Configuration, 6. Troubleshooting/FAQs, 7. Conclusion.
Format in clean Markdown. Use headings, lists, and code blocks appropriately. Focus on an end-user.
If information is sparse or developer-focused, create the best user manual possible, noting missing info if critical. Do NOT invent features.
If the information seems technical, try to explain it in user-friendly terms.`;

    const userPrompt = `Repository: ${repoFullName} (branch: ${branch})\n\nExtracted Information:\n\n---\n${extractedInfo.join('\n\n---\n\n')}---`;

    try {
        const res = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 3800,
            temperature: 0.3,
        }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });

        return res.data.choices[0].message.content.trim();
    } catch (error: any) {
        const errorMsg = error.response?.data?.error?.message || error.message || "Unknown OpenAI error";
        console.error(`[UserManualGenerator - Assemble] OpenAI error for ${repoFullName}: ${errorMsg}`);
        return `# Error Assembling User Manual\n\nAn error occurred: ${errorMsg}`;
    }
}

// --- Main Exported Function ---
export async function generateUserManual(
    repoFullName: string,
    githubToken: string,
    branch: string
): Promise<{
    success: boolean;
    message: string;
    markdownContent: string;
    githubFileUrl?: string;
    githubCommitUrl?: string;
    error?: string;
}> {
    const [owner, repo] = repoFullName.split('/');
    console.log(`[UserManualGenerator] Starting USER MANUAL generation for ${repoFullName} (branch: ${branch})`);

    if (!OPENAI_API_KEY) {
        const msg = "OpenAI API Key (GPT_API_KEY) is not configured on the server.";
        console.error(`[UserManualGenerator] ${msg}`);
        return { success: false, message: msg, markdownContent: `# Configuration Error\n\n${msg}`, error: msg };
    }
    if (!githubToken) {
        const msg = "GitHub token was not provided to the UserManualGenerator.";
        console.error(`[UserManualGenerator] ${msg}`);
        return { success: false, message: msg, markdownContent: `# Error\n\n${msg}`, error: msg };
    }

    try {
        console.log(`[UserManualGenerator] Fetching file tree for ${owner}/${repo}, branch ${branch}`);
        const treeRes = await axios.get<GitTreeResponse>(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
            { headers: { Authorization: `Bearer ${githubToken}` } }
        );

        const blobs = treeRes.data.tree.filter((item) => item.type === 'blob' && item.path);
        console.log(`[UserManualGenerator] Found ${blobs.length} blobs in the tree.`);

        const fileContentsPromises = blobs.map(async (file) => {
            console.log(`[UserManualGenerator] Fetching content for: ${file.path}`);
            const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`;

            try {
                const response = await axios.get(fileUrl, { headers: { Authorization: `Bearer ${githubToken}` } });
                console.log(`[UserManualGenerator] Successfully fetched content for: ${file.path} (Size: ${response.data.size})`);

                return {
                    path: file.path!,
                    size: response.data.size as number,
                    content: Buffer.from(response.data.content, 'base64').toString('utf-8'),
                };
            } catch (err: any) {
                console.warn(`[UserManualGenerator] Failed to fetch content for ${file.path}: ${err.message}`);
                return { path: file.path!, size: 0, content: '' };
            }
        });

        const fileContents = await Promise.all(fileContentsPromises);

        // Updated filtering criteria to be more inclusive
        const SKIP_PATTERNS = [ /node_modules/i, /\.git/i, /dist\//i, /build\//i, /coverage\//i, /^\.(?!gitignore)/i, /vendor\//i, /target\//i ];
        const SKIP_EXTENSIONS = /\.(lock|log|DS_Store|png|jpe?g|gif|svg|webp|ico|bmp|mp3|mp4|avi|mov|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz|rar|7z|eot|ttf|woff|woff2|exe|dll|so|class|jar|pyc|o|obj|bin|dat|bak|tmp|swp)$/i;
        const POTENTIALLY_USEFUL_EXTENSIONS = /\.(md|txt|html|rst|adoc|asciidoc|tex|rtf|ini|toml|yaml|conf|cfg|sh|ps1|js|ts|jsx|tsx|py|java|cs|go|rb|php|swift|kt|c|cpp|h|hpp|xml|json|sql|graphql|feature|css|scss|less|sass|vue|svelte|astro|config|env)$/i;

        const relevantFiles = fileContents.filter(f => {
            if (!f.content || f.size > MAX_FILE_SIZE || f.size === 0) return false;
            if (SKIP_EXTENSIONS.test(f.path)) return false;
            if (SKIP_PATTERNS.some(re => re.test(f.path))) return false;

            const suspiciousChars = (f.content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/g) || []).length;
            if (suspiciousChars > 10 && (suspiciousChars / f.content.length > 0.01)) {
                console.warn(`[UserManualGenerator] Skipping file ${f.path} due to likely binary content or encoding issues.`);
                return false;
            }

            // More inclusive criteria for relevant files
            if (POTENTIALLY_USEFUL_EXTENSIONS.test(f.path) ||
                f.path.toLowerCase().includes('readme') ||
                f.path.toLowerCase().includes('license') ||
                f.path.toLowerCase().includes('contributing') ||
                f.path.toLowerCase().includes('doc') ||
                f.path.toLowerCase().includes('manual') ||
                f.path.toLowerCase().includes('guide') ||
                f.path.toLowerCase().includes('usage') ||
                f.path.toLowerCase().includes('tutorial')) {
                return true;
            }

            return false;
        });

        console.log(`[UserManualGenerator] Filtered down to ${relevantFiles.length} relevant files for User Manual information.`);

        if (relevantFiles.length === 0) {
            const noFilesMsg = "No suitable text-based files were found in the repository to generate a user manual from.";
            console.warn(`[UserManualGenerator] ${noFilesMsg}`);

            const placeholderContent = `# User Manual for ${repoFullName}\n\n${noFilesMsg}\n\nPlease ensure the repository contains readable files like README.md, source code, or other documentation that describe its usage.`;

            const commitResult = await commitFileToGithub(
                repoFullName, githubToken, branch, "USER_MANUAL.md",
                placeholderContent, "docs: Initialize User Manual (no suitable source content found)"
            );

            const message = commitResult.success
                ? "Placeholder User Manual created and committed."
                : `Failed to commit placeholder User Manual${commitResult.error ? `: ${commitResult.error}` : "."}`;

            return {
                success: commitResult.success,
                message: message,
                markdownContent: placeholderContent,
                githubFileUrl: commitResult.html_url,
                githubCommitUrl: commitResult.commit_url,
                error: commitResult.success ? undefined : (commitResult.error || "Failed to commit placeholder.")
            };
        }

        // Create a temporary directory to store file summaries
        const tempDir = path.join(__dirname, 'temp_summaries');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        // Process each file and generate summaries
        const extractedInfo: string[] = [];
        for (const file of relevantFiles) {
            console.log(`[UserManualGenerator] Processing file: ${file.path}`);

            // Log the first 100 characters of the file content for debugging
            console.log(`[UserManualGenerator] File content preview (first 100 chars): ${file.content.substring(0, 100)}...`);

            const tokens = encode(file.content);
            const chunks = Math.ceil(tokens.length / MAX_TOKENS_PER_CHUNK);
            const fileSummaryPath = path.join(tempDir, `${file.path.replace(/\//g, '_')}_summary.txt`);

            for (let i = 0; i < chunks; i++) {
                const textChunk = new TextDecoder().decode(Uint8Array.from(tokens.slice(i * MAX_TOKENS_PER_CHUNK, (i + 1) * MAX_TOKENS_PER_CHUNK)));
                const info = await openaiExtractUserInfo(file.path, i + 1, chunks, textChunk);
                extractedInfo.push(info);
                fs.appendFileSync(fileSummaryPath, info + '\n\n');
            }
        }

        // If we have some useful information but not all files were meaningful
        if (extractedInfo.some(info => !info.startsWith("Error:") && !info.includes("Primarily for developers") && !info.includes("unsuitable for user manual summary"))) {
            const finalUserManualContent = await openaiAssembleUserManual(repoFullName, branch, extractedInfo);
            const targetFilePath = "USER_MANUAL.md";
            const commitMessage = `docs: Generate User Manual for ${repoFullName}`;

            const commitResult = await commitFileToGithub(
                repoFullName, githubToken, branch, targetFilePath, finalUserManualContent, commitMessage
            );

            let resultMessage: string;
            if (commitResult.success) {
                resultMessage = `User Manual (${targetFilePath}) generated and committed successfully.`;
            } else {
                resultMessage = `User Manual generated, but commit to ${targetFilePath} failed${commitResult.error ? `: ${commitResult.error}` : "."}`;
            }

            // Clean up temporary files
            fs.rmSync(tempDir, { recursive: true, force: true });

            return {
                success: commitResult.success,
                message: resultMessage,
                markdownContent: finalUserManualContent,
                githubFileUrl: commitResult.html_url,
                githubCommitUrl: commitResult.commit_url,
                error: commitResult.success ? undefined : (commitResult.error || "GitHub commit failed")
            };
        } else {
            const noMeaningfulInfoMsg = "While files were processed, no meaningful user-relevant information could be extracted to build a user manual.";
            console.warn(`[UserManualGenerator] ${noMeaningfulInfoMsg}`);

            const placeholderContent = `# User Manual for ${repoFullName}\n\n${noMeaningfulInfoMsg}\n\nThe repository may need more user-facing documentation.`;

            const commitResult = await commitFileToGithub(
                repoFullName, githubToken, branch, "USER_MANUAL.md",
                placeholderContent, "docs: Initialize User Manual (no meaningful user content found)"
            );

            const message = commitResult.success
                ? "Placeholder User Manual created and committed."
                : `Failed to commit placeholder User Manual${commitResult.error ? `: ${commitResult.error}` : "."}`;

            return {
                success: commitResult.success,
                message: message,
                markdownContent: placeholderContent,
                githubFileUrl: commitResult.html_url,
                githubCommitUrl: commitResult.commit_url,
                error: commitResult.success ? undefined : (commitResult.error || "Failed to commit placeholder.")
            };
        }
    } catch (error: any) {
        const errorMsg = error.response?.data?.error?.message || error.message || "An unknown error occurred during user manual generation.";
        console.error(`[UserManualGenerator] Overall error for ${repoFullName}:`, error);

        return {
            success: false,
            message: `Failed to generate User Manual: ${errorMsg}`,
            markdownContent: `# Error Generating User Manual for ${repoFullName}\n\nAn error occurred: ${errorMsg}`,
            error: errorMsg,
        };
    }
}
