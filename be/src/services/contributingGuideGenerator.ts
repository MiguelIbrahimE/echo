// contributingGuideGenerator.ts
import axios from 'axios';

const OPENAI_API_KEY = process.env.GPT_API_KEY;

interface FileData {
    path: string;
    content: string;
}

// Files that often contain clues for contribution guidelines
const CONTRIBUTION_HINT_FILES = [
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', // JS/TS project setup, scripts
    'requirements.txt', 'Pipfile', 'poetry.lock', 'pyproject.toml', // Python
    'Gemfile', 'Gemfile.lock', // Ruby
    'composer.json', 'composer.lock', // PHP
    'pom.xml', 'build.gradle', // Java/Kotlin
    'Makefile', 'Dockerfile', 'docker-compose.yml', // Build/env setup
    '.eslintrc.js', '.eslintrc.json', '.eslintrc.yaml', '.prettierrc.js', '.prettierrc.json', // Linters/Formatters
    '.github/workflows/', // CI/CD pipelines for test/lint commands
    'CONTRIBUTING.md', // Existing contributing file (to enhance or use as base)
    'README.md' // Often contains setup/test instructions
];

export async function generateContributingGuide(
    repoFullName: string,
    githubToken: string,
    branch: string
): Promise<{ contributingMarkdown: string }> {
    const [owner, repo] = repoFullName.split('/');
    console.log(`[Contrib Guide] Starting for ${repoFullName}, branch ${branch}`);

    let fetchedFileContents: FileData[] = [];

    // 1. Attempt to fetch content of known hint files
    for (const filePathPattern of CONTRIBUTION_HINT_FILES) {
        if (filePathPattern.endsWith('/')) { // It's a directory pattern (e.g., .github/workflows/)
            try {
                const treeRes = await axios.get(
                    `https://api.github.com/repos/${owner}/${repo}/contents/${filePathPattern}?ref=${branch}`,
                    { headers: { Authorization: `Bearer ${githubToken}` } }
                );
                if (Array.isArray(treeRes.data)) {
                    for (const item of treeRes.data) {
                        if (item.type === 'file' && item.download_url) {
                            try {
                                const fileRes = await axios.get(item.download_url, { headers: { Authorization: `Bearer ${githubToken}` } });
                                fetchedFileContents.push({ path: item.path, content: fileRes.data.toString() });
                                console.log(`[Contrib Guide] Fetched ${item.path}`);
                            } catch (e:any) { console.warn(`[Contrib Guide] Minor error fetching ${item.path}: ${e.message}`);}
                        }
                    }
                }
            } catch (e: any) {
                console.warn(`[Contrib Guide] Could not list directory ${filePathPattern}: ${e.message}`);
            }
        } else { // It's a specific file
            try {
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePathPattern}?ref=${branch}`;
                const r = await axios.get(url, {
                    headers: { Authorization: `Bearer ${githubToken}` },
                });
                if (r.data.content) {
                    fetchedFileContents.push({
                        path: filePathPattern,
                        content: Buffer.from(r.data.content, 'base64').toString('utf-8'),
                    });
                    console.log(`[Contrib Guide] Fetched ${filePathPattern}`);
                }
            } catch (e: any) {
                // It's okay if some files are not found
                console.log(`[Contrib Guide] File not found or error fetching ${filePathPattern}, skipping.`);
            }
        }
    }
    console.log(`[Contrib Guide] Fetched ${fetchedFileContents.length} hint files.`);

    if (fetchedFileContents.length === 0) {
        return { contributingMarkdown: `# Contributing to ${repoFullName}\n\nCould not automatically determine contribution guidelines. Please refer to the project maintainers.` };
    }

    // 2. Ask OpenAI to generate the contributing guide based on these files
    const guide = await openaiGenerateContributingGuide(repoFullName, fetchedFileContents);
    console.log('[Contrib Guide] Contributing guide generation complete.');
    return { contributingMarkdown: guide };
}

async function openaiGenerateContributingGuide(repoFullName: string, filesData: FileData[]): Promise<string> {
    if (!OPENAI_API_KEY) throw new Error("OpenAI API key is not configured.");
    console.log('[Contrib Guide] OpenAI: Generating guide from fetched files.');

    const relevantFileSnippets = filesData.map(f =>
        `File: ${f.path}\n\`\`\`\n${f.content.substring(0, 2000)}...\n\`\`\`\n(Content might be truncated)`
    ).join('\n\n');

    try {
        const res = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a helpful assistant that writes CONTRIBUTING.md files for open-source projects.
Based on the provided file snippets (like package.json, Dockerfile, CI workflows, README), generate a comprehensive CONTRIBUTING.md.
It should typically include sections like:
- Project Setup (how to install dependencies, set up the environment)
- Running Tests (commands to run tests)
- Code Style/Linting (any linters or formatters used and how to run them)
- Submitting Changes (e.g., fork, branch, make PRs, conventional commits if discernible)
- (Optional) Code of Conduct (if not found, suggest adding a standard one like Contributor Covenant)
- (Optional) How to Report Bugs or Request Features.
Infer as much as possible from the files. If information for a section isn't available, state that or make a sensible generic suggestion.
Format the output in Markdown. Start with a title like "# Contributing to ${repoFullName}".`,
                    },
                    {
                        role: 'user',
                        content: `Repository: ${repoFullName}\n\nHere are snippets from relevant files:\n\n${relevantFileSnippets}`,
                    },
                ],
                max_tokens: 2000,
                temperature: 0.3,
            },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
        );
        return res.data.choices[0].message.content.trim();
    } catch (e: any) {
        console.error(`[Contrib Guide] OpenAI API error: ${e.message}`);
        return `# Contributing to ${repoFullName}\n\nError generating contribution guidelines: ${e.message}. Please check project files manually or contact maintainers.`;
    }
}