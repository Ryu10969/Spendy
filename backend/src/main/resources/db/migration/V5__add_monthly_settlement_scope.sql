ALTER TABLE settlement_runs ADD COLUMN scope_key VARCHAR(7);
UPDATE settlement_runs SET scope_key = 'PROJECT';
ALTER TABLE settlement_runs ALTER COLUMN scope_key SET NOT NULL;

ALTER TABLE settlement_runs DROP CONSTRAINT chk_settlement_runs_scope;
ALTER TABLE settlement_runs ADD CONSTRAINT chk_settlement_runs_scope
    CHECK (scope_type IN ('PROJECT', 'YEAR_MONTH'));
ALTER TABLE settlement_runs ADD CONSTRAINT chk_settlement_runs_scope_key CHECK (
    (scope_type = 'PROJECT' AND scope_key = 'PROJECT')
    OR (scope_type = 'YEAR_MONTH'
        AND scope_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        AND substring(scope_key, 1, 4) <> '0000')
);

DROP INDEX uq_settlement_runs_current_project_strategy;
CREATE UNIQUE INDEX uq_settlement_runs_current_scope_strategy
    ON settlement_runs (project_id, scope_type, scope_key, strategy)
    WHERE state = 'CURRENT';
CREATE INDEX idx_settlement_runs_scope_state_strategy
    ON settlement_runs (project_id, scope_type, scope_key, state, strategy);
