/* ===========================================================
   init.sql  –  schema bootstrap for the “Echo” platform
   This file executes inside the database named by
   POSTGRES_DB (set to “echodb” in docker‑compose.yml).
   -----------------------------------------------------------
   The script is idempotent – running it again will NOT throw
   errors or duplicate objects.  Feel free to extend it with
   new tables / columns / indexes later.                    */
/* =========================================================== */

-------------------------------
-- 1)  users
-------------------------------
CREATE TABLE IF NOT EXISTS users (
  id        SERIAL        PRIMARY KEY,
  username  VARCHAR(50)   UNIQUE NOT NULL,
  email     VARCHAR(100)  UNIQUE NOT NULL,
  password  VARCHAR(200)  NOT NULL,          -- bcrypt hash
  chatgpt_key TEXT                                        -- optional per‑user key
);

-------------------------------
-- 2)  documents  (Markdown / manuals)
-------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id             SERIAL        PRIMARY KEY,
  owner_id       INT           NOT NULL
                               REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(255)  NOT NULL,
  content        TEXT          NOT NULL DEFAULT '',
  repo_full_name TEXT,                       -- e.g. "octocat/hello‑world"
  branch_name    TEXT,                       -- e.g. "main"
  created_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_owner
  ON documents(owner_id);

-------------------------------
-- 3)  document_shares  (ACL)
-------------------------------
CREATE TABLE IF NOT EXISTS document_shares (
  id                  SERIAL  PRIMARY KEY,
  document_id         INT     NOT NULL
                             REFERENCES documents(id) ON DELETE CASCADE,
  shared_with_user_id INT     NOT NULL
                             REFERENCES users(id) ON DELETE CASCADE,
  permission          VARCHAR(50) NOT NULL DEFAULT 'view'  -- view | edit
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_docshare_unique
  ON document_shares(document_id, shared_with_user_id);

-------------------------------
-- 4)  audit trigger (optional)
-------------------------------
-- Keeps “updated_at” current on every UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_updated
  ON documents;

CREATE TRIGGER trg_documents_updated
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

/* ===========================================================
   Done – Postgres will report “database system is ready…”
   and the container health‑check will pass.   🚀
=========================================================== */
