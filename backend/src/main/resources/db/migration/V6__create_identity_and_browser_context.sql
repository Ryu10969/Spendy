-- P1b identity/context only. Existing ledger tables and data remain unchanged.

CREATE TABLE browser_context_roots (
  id UUID PRIMARY KEY, -- non-secret IndexedDB locator, authentication evidenceではない
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE browser_context_channels (
  id UUID PRIMARY KEY,
  root_id UUID NOT NULL REFERENCES browser_context_roots(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('SUBJECT','SHARE')),
  epoch BIGINT NOT NULL CHECK (epoch >= 0),
  state TEXT NOT NULL CHECK (state IN ('OPEN','RETIRED')),
  current_slot_id UUID, pending_attempt_id UUID,
  created_at TIMESTAMPTZ NOT NULL, retired_at TIMESTAMPTZ,
  UNIQUE(root_id, purpose), UNIQUE(id, purpose),
  CHECK ((state = 'RETIRED') = (retired_at IS NOT NULL)),
  CHECK (state <> 'RETIRED' OR (current_slot_id IS NULL AND pending_attempt_id IS NULL)),
  CHECK (purpose = 'SUBJECT' OR pending_attempt_id IS NULL)
);

CREATE TABLE anonymous_subjects (
  id UUID PRIMARY KEY,
  status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING','ACTIVE','DISABLED')),
  recovery_generation BIGINT NOT NULL CHECK (recovery_generation >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  CHECK ((status = 'PENDING' AND recovery_generation = 0)
      OR (status = 'ACTIVE' AND recovery_generation >= 1)
      OR (status = 'DISABLED' AND recovery_generation >= 0))
);

CREATE TABLE subject_sessions (
  id UUID PRIMARY KEY,
  context_channel_id UUID NOT NULL,
  context_purpose TEXT NOT NULL DEFAULT 'SUBJECT' CHECK (context_purpose = 'SUBJECT'),
  UNIQUE(id, context_channel_id),
  FOREIGN KEY(context_channel_id, context_purpose)
    REFERENCES browser_context_channels(id, purpose),
  UNIQUE(id, subject_id, context_channel_id),
  subject_id UUID NOT NULL REFERENCES anonymous_subjects(id),
  selector TEXT NOT NULL UNIQUE, secret_verifier BYTEA NOT NULL UNIQUE,
  credential_generation BIGINT NOT NULL CHECK (credential_generation >= 0),
  created_at TIMESTAMPTZ NOT NULL, last_used_at TIMESTAMPTZ,
  idle_expires_at TIMESTAMPTZ NOT NULL, absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ, device_label TEXT,
  CHECK (created_at < idle_expires_at AND idle_expires_at <= absolute_expires_at),
  CHECK (isfinite(idle_expires_at) AND isfinite(absolute_expires_at)),
  CHECK (last_used_at IS NULL OR last_used_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (selector !~ '^[[:space:]]*$'),
  CHECK (octet_length(secret_verifier) > 0)
);

CREATE TABLE share_sessions (
  id UUID PRIMARY KEY,
  context_channel_id UUID NOT NULL,
  context_purpose TEXT NOT NULL DEFAULT 'SHARE' CHECK (context_purpose = 'SHARE'),
  UNIQUE(id, context_channel_id),
  FOREIGN KEY(context_channel_id, context_purpose)
    REFERENCES browser_context_channels(id, purpose), selector TEXT NOT NULL UNIQUE, secret_verifier BYTEA NOT NULL UNIQUE,
  credential_generation BIGINT NOT NULL CHECK (credential_generation >= 0),
  created_at TIMESTAMPTZ NOT NULL, last_used_at TIMESTAMPTZ,
  idle_expires_at TIMESTAMPTZ NOT NULL, absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (created_at < idle_expires_at AND idle_expires_at <= absolute_expires_at),
  CHECK (isfinite(idle_expires_at) AND isfinite(absolute_expires_at)),
  CHECK (last_used_at IS NULL OR last_used_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (selector !~ '^[[:space:]]*$'),
  CHECK (octet_length(secret_verifier) > 0)
);

CREATE TABLE subject_recovery_credentials (
  id UUID PRIMARY KEY, subject_id UUID NOT NULL REFERENCES anonymous_subjects(id),
  selector TEXT NOT NULL UNIQUE, secret_verifier BYTEA NOT NULL UNIQUE,
  generation BIGINT NOT NULL CHECK (generation >= 1),
  activated_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
  UNIQUE(subject_id, generation), UNIQUE(id, subject_id),
  CHECK (consumed_at IS NULL OR consumed_at >= activated_at),
  CHECK (revoked_at IS NULL OR revoked_at >= activated_at),
  CHECK (selector !~ '^[[:space:]]*$'),
  CHECK (octet_length(secret_verifier) > 0)
);

CREATE TABLE subject_recovery_attempts (
  id UUID PRIMARY KEY, subject_id UUID NOT NULL REFERENCES anonymous_subjects(id),
  context_channel_id UUID NOT NULL,
  context_purpose TEXT NOT NULL DEFAULT 'SUBJECT' CHECK (context_purpose = 'SUBJECT'),
  expected_context_epoch BIGINT NOT NULL CHECK (expected_context_epoch > 0),
  result_context_epoch BIGINT CHECK (result_context_epoch > 0),
  result_slot_id UUID,
  UNIQUE(id, context_channel_id),
  FOREIGN KEY(context_channel_id, context_purpose)
    REFERENCES browser_context_channels(id, purpose),
  FOREIGN KEY(initiating_session_id, context_channel_id)
    REFERENCES subject_sessions(id, context_channel_id),
  FOREIGN KEY(result_session_id, subject_id, context_channel_id)
    REFERENCES subject_sessions(id, subject_id, context_channel_id),
  CHECK ((consumed_at IS NULL AND result_session_id IS NULL AND result_session_generation IS NULL
            AND result_slot_id IS NULL AND result_context_epoch IS NULL AND receipt_expires_at IS NULL)
      OR (consumed_at IS NOT NULL AND result_session_id IS NOT NULL AND result_session_generation IS NOT NULL
            AND result_slot_id IS NOT NULL AND result_context_epoch IS NOT NULL AND receipt_expires_at IS NOT NULL)),
  purpose VARCHAR(16) NOT NULL
    CHECK (purpose IN ('BOOTSTRAP','ADD_DEVICE','RECOVER','REPLACE_CODE')),
  expected_generation BIGINT NOT NULL,
  current_credential_id UUID,
  provisional_selector TEXT NOT NULL UNIQUE, provisional_verifier BYTEA NOT NULL UNIQUE,
  pending_selector TEXT NOT NULL UNIQUE, pending_verifier BYTEA NOT NULL UNIQUE,
  operation_id UUID NOT NULL UNIQUE,
  initiating_session_id UUID,
  initiating_session_generation BIGINT,
  switch_intent BOOLEAN NOT NULL,
  result_session_id UUID, result_session_generation BIGINT,
  created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ, invalidated_at TIMESTAMPTZ, receipt_expires_at TIMESTAMPTZ,
  failed_confirmations INTEGER NOT NULL DEFAULT 0 CHECK (failed_confirmations >= 0),
  FOREIGN KEY(current_credential_id, subject_id)
    REFERENCES subject_recovery_credentials(id, subject_id),
  CHECK ((purpose = 'BOOTSTRAP' AND expected_generation = 0 AND current_credential_id IS NULL)
      OR (purpose <> 'BOOTSTRAP' AND expected_generation >= 1 AND current_credential_id IS NOT NULL)),
  CHECK ((initiating_session_id IS NULL) = (initiating_session_generation IS NULL)),
  CHECK (initiating_session_generation IS NULL OR initiating_session_generation >= 0),
  CHECK (purpose <> 'REPLACE_CODE' OR initiating_session_id IS NOT NULL),
  CHECK ((result_session_id IS NULL) = (result_session_generation IS NULL)),
  CHECK (result_session_generation IS NULL OR result_session_generation >= 0),
  CHECK ((consumed_at IS NULL) = (result_session_id IS NULL)),
  CHECK ((consumed_at IS NULL) = (receipt_expires_at IS NULL)),
  CHECK (receipt_expires_at IS NULL OR receipt_expires_at > consumed_at),
  CHECK (receipt_expires_at IS NULL OR isfinite(receipt_expires_at)),
  CHECK (expires_at > created_at),
  CHECK (isfinite(expires_at)),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CHECK (invalidated_at IS NULL OR invalidated_at >= created_at),
  CHECK (provisional_selector !~ '^[[:space:]]*$'),
  CHECK (pending_selector !~ '^[[:space:]]*$'),
  CHECK (octet_length(provisional_verifier) > 0),
  CHECK (octet_length(pending_verifier) > 0)
);

CREATE TABLE browser_cookie_slots (
  id UUID PRIMARY KEY, -- canonical UUID suffix; never recycled
  context_channel_id UUID NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('SUBJECT','SHARE')),
  kind TEXT NOT NULL CHECK (kind IN ('SUBJECT','SHARE','PROVISIONAL')),
  subject_session_id UUID, share_session_id UUID, attempt_id UUID,
  credential_generation BIGINT NOT NULL CHECK (credential_generation >= 0),
  issued_epoch BIGINT NOT NULL CHECK (issued_epoch > 0),
  created_at TIMESTAMPTZ NOT NULL, cookie_expires_at TIMESTAMPTZ NOT NULL,
  terminal_at TIMESTAMPTZ,
  UNIQUE(id, context_channel_id, kind),
  UNIQUE(id, context_channel_id, subject_session_id, credential_generation, issued_epoch),
  UNIQUE(subject_session_id, credential_generation),
  UNIQUE(share_session_id, credential_generation), UNIQUE(attempt_id),
  FOREIGN KEY(context_channel_id, purpose) REFERENCES browser_context_channels(id, purpose),
  FOREIGN KEY(subject_session_id, context_channel_id) REFERENCES subject_sessions(id, context_channel_id),
  FOREIGN KEY(share_session_id, context_channel_id) REFERENCES share_sessions(id, context_channel_id),
  FOREIGN KEY(attempt_id, context_channel_id) REFERENCES subject_recovery_attempts(id, context_channel_id),
  CHECK ((kind = 'SUBJECT' AND purpose = 'SUBJECT' AND subject_session_id IS NOT NULL
            AND share_session_id IS NULL AND attempt_id IS NULL)
      OR (kind = 'SHARE' AND purpose = 'SHARE' AND share_session_id IS NOT NULL
            AND subject_session_id IS NULL AND attempt_id IS NULL)
      OR (kind = 'PROVISIONAL' AND purpose = 'SUBJECT' AND attempt_id IS NOT NULL
            AND subject_session_id IS NULL AND share_session_id IS NULL)),
  CHECK (cookie_expires_at > created_at),
  CHECK (isfinite(cookie_expires_at)),
  CHECK (terminal_at IS NULL OR terminal_at >= created_at)
);

ALTER TABLE browser_context_channels
  ADD CONSTRAINT fk_channel_current FOREIGN KEY(current_slot_id, id, purpose)
    REFERENCES browser_cookie_slots(id, context_channel_id, kind),
  ADD CONSTRAINT fk_channel_pending FOREIGN KEY(pending_attempt_id, id)
    REFERENCES subject_recovery_attempts(id, context_channel_id);
ALTER TABLE subject_recovery_attempts
  ADD CONSTRAINT fk_attempt_result_slot FOREIGN KEY
    (result_slot_id, context_channel_id, result_session_id, result_session_generation, result_context_epoch)
    REFERENCES browser_cookie_slots
    (id, context_channel_id, subject_session_id, credential_generation, issued_epoch);
CREATE UNIQUE INDEX uq_recovery_live ON subject_recovery_credentials(subject_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX ix_subject_sessions_subject ON subject_sessions(subject_id, revoked_at);
CREATE INDEX ix_subject_sessions_context ON subject_sessions(context_channel_id);
CREATE INDEX ix_share_sessions_context ON share_sessions(context_channel_id);
CREATE INDEX ix_subject_session_expiry ON subject_sessions(idle_expires_at, absolute_expires_at);
CREATE INDEX ix_share_session_expiry ON share_sessions(idle_expires_at, absolute_expires_at);
CREATE INDEX ix_attempt_subject_generation ON subject_recovery_attempts(subject_id, expected_generation);
CREATE INDEX ix_attempt_expiry ON subject_recovery_attempts(expires_at);
CREATE INDEX ix_attempts_context ON subject_recovery_attempts(context_channel_id);
CREATE INDEX ix_attempts_result_slot ON subject_recovery_attempts(result_slot_id);
CREATE INDEX ix_attempts_credential ON subject_recovery_attempts(current_credential_id);
CREATE INDEX ix_attempts_initiating ON subject_recovery_attempts(initiating_session_id);
CREATE INDEX ix_attempts_result_session ON subject_recovery_attempts(result_session_id);
CREATE INDEX ix_channels_pending ON browser_context_channels(pending_attempt_id);
CREATE INDEX ix_channels_current ON browser_context_channels(current_slot_id);
CREATE INDEX ix_slots_terminal ON browser_cookie_slots(terminal_at, cookie_expires_at);
CREATE INDEX ix_slots_context ON browser_cookie_slots(context_channel_id, purpose);
CREATE INDEX ix_slots_subject ON browser_cookie_slots(subject_session_id);
CREATE INDEX ix_slots_share ON browser_cookie_slots(share_session_id);
