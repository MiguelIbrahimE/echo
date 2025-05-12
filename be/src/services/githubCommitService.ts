// be/src/services/githubCommitService.ts
import axios from 'axios';

interface GitHubContentResponse {
    sha?: string;
    html_url?: string;
    // other fields exist but sha and html_url are most important
}

interface GitHubCommitResponseData {
    content?: {
        html_url?: string;
        sha?: string;
    };
    commit?: {
        html_url?: string; // URL to the commit itself
        sha?: string;
    };
}


/**
 * Creates or updates a file in a GitHub repository on a specific branch.
 *
 * @param repoFullName - The full name of the repository (e.g., "owner/repo").
 * @param githubToken - The user's GitHub access token with repo scope.
 * @param branch - The branch to commit to.
 * @param filePath - The path of the file within the repository (e.g., "CONTRIBUTING.md").
 * @param content - The content of the file (string).
 * @param commitMessage - The commit message.
 * @returns Object indicating success, and URLs/SHA of the created/updated content and commit.
 */
export async function commitFileToGithub(
    repoFullName: string,
    githubToken: string,
    branch: string,
    filePath: string,
    content: string,
    commitMessage: string
): Promise<{ success: boolean; html_url?: string; commit_url?: string; file_sha?: string; error?: string }> {
    const [owner, repo] = repoFullName.split('/');
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const encodedContent = Buffer.from(content).toString('base64');

    let existingFileSha: string | undefined;

    // 1. Check if the file already exists to get its SHA for an update
    try {
        const getFileResponse = await axios.get<GitHubContentResponse>(apiUrl, {
            headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: 'application/vnd.github.v3+json',
            },
            params: { ref: branch }, // Specify the branch when checking
        });
        if (getFileResponse.data && getFileResponse.data.sha) {
            existingFileSha = getFileResponse.data.sha;
            console.log(`[GitHub Commit] File '${filePath}' exists on branch '${branch}'. SHA: ${existingFileSha}`);
        }
    } catch (error: any) {
        if (error.response && error.response.status === 404) {
            console.log(`[GitHub Commit] File '${filePath}' does not exist on branch '${branch}'. Will create new file.`);
        } else {
            console.error(`[GitHub Commit] Error checking for existing file '${filePath}' on branch '${branch}':`, error.response?.data || error.message);
            return { success: false, error: `Error checking file: ${error.response?.data?.message || error.message}` };
        }
    }

    // 2. Prepare data for creating or updating the file
    const commitData: { message: string; content: string; branch: string; sha?: string } = {
        message: commitMessage,
        content: encodedContent,
        branch: branch, // Commit directly to the specified branch
    };

    if (existingFileSha) {
        commitData.sha = existingFileSha; // Must provide SHA for updates
    }

    // 3. Create or update the file
    try {
        const putResponse = await axios.put<GitHubCommitResponseData>(apiUrl, commitData, {
            headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });

        // Status 200 for update, 201 for create
        if (putResponse.status === 200 || putResponse.status === 201) {
            console.log(`[GitHub Commit] Successfully committed '${filePath}' to ${repoFullName} on branch '${branch}'.`);
            return {
                success: true,
                html_url: putResponse.data.content?.html_url,
                commit_url: putResponse.data.commit?.html_url,
                file_sha: putResponse.data.content?.sha,
            };
        } else {
            // Should not happen if axios doesn't throw for non-2xx by default
            console.error(`[GitHub Commit] Failed to commit file. Status: ${putResponse.status}`, putResponse.data);
            return { success: false, error: `GitHub API returned status ${putResponse.status}` };
        }
    } catch (error: any) {
        console.error(`[GitHub Commit] Exception during PUT for '${filePath}':`, error.response?.data || error.message);
        return { success: false, error: `Commit failed: ${error.response?.data?.message || error.message}` };
    }
}