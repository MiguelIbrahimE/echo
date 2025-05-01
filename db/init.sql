/* ===========================================================
   init.sql  –  schema bootstrap for the “Echo” platform
   (2025-05-01 patch – repo tracking)                       */
/* =========================================================== */

-------------------------------
-- 1) users  (unchanged)
-------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL       PRIMARY KEY,
  username    VARCHAR(50)  UNIQUE NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  password    VARCHAR(200) NOT NULL,
  chatgpt_key TEXT
);

-------------------------------
-- 1-bis) user_repositories ★
-- one user ↔ many repos
-------------------------------
CREATE TABLE IF NOT EXISTS user_repositories (
  id             SERIAL PRIMARY KEY,
  user_id        INT    NOT NULL
                       REFERENCES users(id) ON DELETE CASCADE,
  repo_full_name TEXT   NOT NULL,
  github_token   TEXT,                   -- encrypted PAT (optional)
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, repo_full_name)
);

-------------------------------
-- 2) documents  (add FK → repo)
-------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id             SERIAL        PRIMARY KEY,
  owner_id       INT           NOT NULL
                               REFERENCES users(id) ON DELETE CASCADE,
  repository_id  INT           REFERENCES user_repositories(id)
                               ON DELETE SET NULL,
  title          VARCHAR(255)  NOT NULL,
  content        TEXT          NOT NULL DEFAULT '',
  repo_full_name TEXT,         -- kept for convenience
  branch_name    TEXT,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_owner
  ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_repo
  ON documents(repository_id);

-------------------------------
-- 3) document_shares (unchanged)
-------------------------------
CREATE TABLE IF NOT EXISTS document_shares (
  id                  SERIAL  PRIMARY KEY,
  document_id         INT     NOT NULL
                             REFERENCES documents(id) ON DELETE CASCADE,
  shared_with_user_id INT     NOT NULL
                             REFERENCES users(id) ON DELETE CASCADE,
  permission          VARCHAR(50) NOT NULL DEFAULT 'view'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_docshare_unique
  ON document_shares(document_id, shared_with_user_id);

-------------------------------
-- 4) audit trigger (unchanged)
-------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_updated ON documents;
CREATE TRIGGER trg_documents_updated
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
