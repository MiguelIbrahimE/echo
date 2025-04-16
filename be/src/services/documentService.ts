/* =====================================================
   documentService.ts
   (analyzes the repo and calls OpenAI)
===================================================== */
import axios, { AxiosError } from 'axios';
import { encode } from 'gpt-tokenizer';

// Instead of dotenv here, we rely on server.ts calling dotenv.config() early
// But you *could* also do:
// import dotenv from 'dotenv';
// dotenv.config();

// [ADDED] Debug log to confirm environment variable
console.log('>>> [documentService.ts] Checking GPT_API_KEY:', process.env.GPT_API_KEY
    ? `Loaded, length=${process.env.GPT_API_KEY.length}`
    : 'Undefined!'
);

const OPENAI_API_KEY = process.env.GPT_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY is undefined. Make sure it is set in GitHub/ENV');
}

interface TreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitTreeResponse {
  sha: string;
  url: string;
  tree: TreeItem[];
  truncated: boolean;
}

const MAX_TOKENS_PER_CHUNK = 3000;

/**
 * Summarize an entire repository branch
 */
export async function analyzeRepository(
    repoFullName: string,
    githubToken: string,
    selectedBranch: string
) {
  console.log('[analyzeRepository] Starting with:', {
    repoFullName,
    githubTokenProvided: githubToken ? 'YES' : 'NO',
    selectedBranch,
  });

  const [owner, repoName] = repoFullName.split('/');
  const treeUrl = `https://api.github.com/repos/${owner}/${repoName}/git/trees/${selectedBranch}?recursive=1`;
  console.log('[analyzeRepository] Fetching tree from =>', treeUrl);

  // 1) Fetch file tree
  const treeResp = await axios.get<GitTreeResponse>(treeUrl, {
    headers: { Authorization: `Bearer ${githubToken}` },
  });
  console.log('[analyzeRepository] Status from GitHub tree:', treeResp.status, treeResp.statusText);

  const data = treeResp.data;
  console.log('[analyzeRepository] Found total files:', data.tree.length);

  const files = data.tree.filter((item) => item.type === 'blob');
  console.log('[analyzeRepository] Filtered blob files only. Count:', files.length);

  // 2) For each file, fetch contents
  console.log('[analyzeRepository] Fetching content for each file...');
  const fileContents = await Promise.all(
      files.map(async (file) => {
        const fileUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${file.path}?ref=${selectedBranch}`;
        try {
          const fileResp = await axios.get(fileUrl, {
            headers: { Authorization: `Bearer ${githubToken}` },
          });
          const fileData = fileResp.data;
          return {
            path: file.path,
            content: Buffer.from(fileData.content, 'base64').toString('utf-8'),
          };
        } catch (err: unknown) {
          if (axios.isAxiosError(err)) {
            console.error(
                '[analyzeRepository] Axios error fetching file:', file.path,
                'status:', err.response?.status,
                'data:', err.response?.data
            );
          } else if (err instanceof Error) {
            console.error('[analyzeRepository] Generic error fetching file:', file.path, err.message);
          } else {
            console.error('[analyzeRepository] Unknown error fetching file:', file.path, err);
          }
          return {
            path: file.path,
            content: '',
          };
        }
      })
  );

  // 3) Filter out unimportant or large files
  const skipPatterns = [
    /node_modules/, /\.git/, /venv/, /\.dockerfile/i, /\.gitignore/i,
    /package(-lock)?\.json/i, /\.env/i, /dist/i, /.*\.md$/i
  ];
  const filteredFiles = fileContents.filter(f => {
    if (!f.content) return false;
    const skip = skipPatterns.some(p => p.test(f.path));
    return !skip;
  });
  console.log('[analyzeRepository] Filtered out "unimportant" patterns. Remaining:', filteredFiles.length);

  // 4) Summarize each file in chunks
  const allSummaries: string[] = [];

  for (const file of filteredFiles) {
    console.log(`\n[analyzeRepository] Summarizing file: ${file.path}`);
    const tokens = encode(file.content);
    console.log(`[analyzeRepository] Token count for ${file.path}:`, tokens.length);
    const totalChunks = Math.ceil(tokens.length / MAX_TOKENS_PER_CHUNK);

    const fileSummaries: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunk = tokens.slice(
          i * MAX_TOKENS_PER_CHUNK,
          (i + 1) * MAX_TOKENS_PER_CHUNK
      );
      const chunkText = decode(chunk);
      console.log(
          `[analyzeRepository] Summarizing chunk ${i + 1}/${totalChunks} for ${file.path}. chunk length=`,
          chunk.length
      );

      try {
        const summary = await getSummaryFromOpenAI(chunkText, file.path, i + 1);
        fileSummaries.push(summary);
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          console.error(
              `[analyzeRepository] getSummaryFromOpenAI Axios error chunk ${i + 1} of ${file.path}`,
              'status:', err.response?.status,
              'data:', err.response?.data
          );
        } else if (err instanceof Error) {
          console.error(
              `[analyzeRepository] getSummaryFromOpenAI Generic error chunk ${i + 1} of ${file.path}`,
              err.message
          );
        } else {
          console.error(
              `[analyzeRepository] getSummaryFromOpenAI Unknown error chunk ${i + 1} of ${file.path}`,
              err
          );
        }
        fileSummaries.push(`(Error summarizing chunk ${i + 1})`);
      }
    }

    allSummaries.push(...fileSummaries);
  }

  // 5) Merge chunk-level summaries
  console.log('[analyzeRepository] Merging all summaries. Summaries count=', allSummaries.length);

  const finalPrompt = `
You are an expert software documentation writer.

Based on the following extracted code summaries, write a final clean, structured user manual that explains the architecture, purpose, and how developers can use and contribute to the project:

${allSummaries.map((s, i) => `Summary ${i + 1}:\n${s}`).join('\n\n')}
  `;
  console.log('[analyzeRepository] Sending final prompt to OpenAI. Prompt length=', finalPrompt.length);

  const manualResponse = await callOpenAI(finalPrompt);
  console.log('[analyzeRepository] Received final user manual from OpenAI. length=', manualResponse.length);

  return { userManual: manualResponse };
}

/** Summarize a single chunk via OpenAI */
async function getSummaryFromOpenAI(
    chunkText: string,
    filePath: string,
    chunkNum: number
): Promise<string> {
  console.log(
      '[getSummaryFromOpenAI] Summarizing chunk for',
      filePath,
      'chunkNum=',
      chunkNum,
      'OpenAI Key Present=',
      !!OPENAI_API_KEY
  );

  const messages = [
    {
      role: 'system',
      content: 'You are a senior software engineer helping write technical documentation.',
    },
    {
      role: 'user',
      content: `This is chunk ${chunkNum} from the file "${filePath}":\n\n${chunkText}\n\nSummarize what this code does.`,
    },
  ];

  try {
    const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages,
          temperature: 0.2,
          max_tokens: 512,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
    );
    return res.data.choices[0].message.content.trim();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error('[getSummaryFromOpenAI] Axios error from OpenAI:', error.response?.data);
    } else if (error instanceof Error) {
      console.error('[getSummaryFromOpenAI] Generic error from OpenAI:', error.message);
    } else {
      console.error('[getSummaryFromOpenAI] Unknown error from OpenAI:', error);
    }
    throw error;
  }
}

/** Final call to OpenAI to merge everything into a single user manual */
async function callOpenAI(prompt: string): Promise<string> {
  console.log('[callOpenAI] Merging final summary. Key present?', !!OPENAI_API_KEY);

  const messages = [
    { role: 'system', content: 'You are a professional documentation writer.' },
    { role: 'user', content: prompt },
  ];

  try {
    const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages,
          temperature: 0.4,
          max_tokens: 1500,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
    );
    return res.data.choices[0].message.content.trim();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error('[callOpenAI] Axios error from OpenAI final merge:', error.response?.data);
    } else if (error instanceof Error) {
      console.error('[callOpenAI] Generic error from OpenAI final merge:', error.message);
    } else {
      console.error('[callOpenAI] Unknown error from OpenAI final merge:', error);
    }
    throw error;
  }
}

/** Decode GPT tokens */
function decode(tokens: number[]): string {
  const text = new TextDecoder().decode(Uint8Array.from(tokens));
  return text;
}
