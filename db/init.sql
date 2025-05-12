/* ===========================================================
   init.sql  –  schema bootstrap for the “Echo” platform
   (CORRECTED VERSION with all necessary columns)
=========================================================== */

-- Function to set updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-------------------------------
-- 1) users
-------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL       PRIMARY KEY,
  username              VARCHAR(50)  UNIQUE NOT NULL,
  email                 VARCHAR(100) UNIQUE NOT NULL,
  password              VARCHAR(200), -- Nullable if you allow only OAuth sign-up initially
  chatgpt_key           TEXT,         -- User's personal OpenAI key (optional)
  github_id             TEXT UNIQUE,  -- GitHub user ID (TEXT can accommodate various ID formats)
  github_access_token   TEXT,         -- Encrypted GitHub OAuth access token
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for users table updated_at
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-------------------------------
-- 1-bis) user_repositories
-------------------------------
CREATE TABLE IF NOT EXISTS user_repositories (
  id                   SERIAL PRIMARY KEY,
  user_id              INT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_full_name       TEXT   NOT NULL,
  -- github_token   TEXT, -- Removed as main token is on users table. Add back if per-repo token needed.
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, repo_full_name)
);

-------------------------------
-- 2) documents
-------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id                   SERIAL        PRIMARY KEY,
  owner_id             INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository_id        INT           REFERENCES user_repositories(id) ON DELETE SET NULL,
  title                VARCHAR(255)  NOT NULL,
  content              TEXT          NOT NULL DEFAULT '',
  repo_full_name       TEXT,
  branch_name          TEXT,
  doc_type             VARCHAR(50), -- For 'USER_MANUAL', 'API_REFERENCE', etc.
  github_file_url      TEXT,        -- URL to the file committed to GitHub
  github_commit_url    TEXT,        -- URL to the commit on GitHub
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_repo ON documents(repository_id);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type); -- Optional but good for filtering by type

-- Trigger for documents table updated_at (you already had this, just ensure function is defined first)
DROP TRIGGER IF EXISTS trg_documents_updated ON documents;
CREATE TRIGGER trg_documents_updated
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-------------------------------
-- 3) document_shares
-------------------------------
CREATE TABLE IF NOT EXISTS document_shares (
  id                  SERIAL  PRIMARY KEY,
  document_id         INT     NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  shared_with_user_id INT     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission          VARCHAR(50) NOT NULL DEFAULT 'view'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_docshare_unique ON document_shares(document_id, shared_with_user_id);