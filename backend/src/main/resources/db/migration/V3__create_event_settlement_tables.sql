CREATE TABLE settlement_runs (
    id UUID CONSTRAINT pk_settlement_runs PRIMARY KEY,
    project_id UUID NOT NULL,
    run_sequence BIGINT NOT NULL,
    scope_type VARCHAR(20) NOT NULL,
    strategy VARCHAR(30) NOT NULL,
    source_state_fingerprint CHAR(64) NOT NULL,
    state VARCHAR(10) NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL,
    staled_at TIMESTAMPTZ,
    CONSTRAINT fk_settlement_runs_project
        FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT uq_settlement_runs_id_project UNIQUE (id, project_id),
    CONSTRAINT uq_settlement_runs_project_sequence UNIQUE (project_id, run_sequence),
    CONSTRAINT chk_settlement_runs_sequence CHECK (run_sequence >= 1),
    CONSTRAINT chk_settlement_runs_scope CHECK (scope_type = 'PROJECT'),
    CONSTRAINT chk_settlement_runs_strategy
        CHECK (strategy IN ('FEWER_TRANSFERS', 'UNDERSTANDABLE')),
    CONSTRAINT chk_settlement_runs_fingerprint
        CHECK (source_state_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_settlement_runs_state CHECK (state IN ('CURRENT', 'STALE')),
    CONSTRAINT chk_settlement_runs_lifecycle CHECK (
        (state = 'CURRENT' AND staled_at IS NULL)
        OR (state = 'STALE' AND staled_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_settlement_runs_current_project_strategy
    ON settlement_runs (project_id, strategy)
    WHERE state = 'CURRENT';

CREATE INDEX idx_settlement_runs_project_state_strategy
    ON settlement_runs (project_id, state, strategy);

CREATE TABLE settlement_balances (
    id UUID CONSTRAINT pk_settlement_balances PRIMARY KEY,
    settlement_run_id UUID NOT NULL,
    project_id UUID NOT NULL,
    member_id UUID NOT NULL,
    paid_amount BIGINT NOT NULL,
    burden_amount BIGINT NOT NULL,
    exact_balance BIGINT NOT NULL,
    rounded_transfer_net BIGINT NOT NULL,
    rounding_difference BIGINT NOT NULL,
    CONSTRAINT fk_settlement_balances_run_project
        FOREIGN KEY (settlement_run_id, project_id)
        REFERENCES settlement_runs (id, project_id),
    CONSTRAINT fk_settlement_balances_member
        FOREIGN KEY (member_id) REFERENCES project_members (id),
    CONSTRAINT uq_settlement_balances_run_member
        UNIQUE (settlement_run_id, member_id),
    CONSTRAINT chk_settlement_balances_paid_non_negative CHECK (paid_amount >= 0),
    CONSTRAINT chk_settlement_balances_burden_non_negative CHECK (burden_amount >= 0),
    CONSTRAINT chk_settlement_balances_exact
        CHECK (exact_balance = paid_amount - burden_amount),
    CONSTRAINT chk_settlement_balances_rounding
        CHECK (rounding_difference = exact_balance - rounded_transfer_net)
);

CREATE INDEX idx_settlement_balances_run_member
    ON settlement_balances (settlement_run_id, member_id);

CREATE TABLE settlement_transfers (
    id UUID CONSTRAINT pk_settlement_transfers PRIMARY KEY,
    settlement_run_id UUID NOT NULL,
    project_id UUID NOT NULL,
    transfer_order INTEGER NOT NULL,
    from_member_id UUID NOT NULL,
    to_member_id UUID NOT NULL,
    exact_amount BIGINT NOT NULL,
    initially_rounded_amount BIGINT NOT NULL,
    final_rounded_amount BIGINT NOT NULL,
    rounding_adjustment BIGINT NOT NULL,
    explanation_kind VARCHAR(30) NOT NULL,
    from_exact_balance_before BIGINT NOT NULL,
    to_exact_balance_before BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    completed_at TIMESTAMPTZ,
    CONSTRAINT fk_settlement_transfers_run_project
        FOREIGN KEY (settlement_run_id, project_id)
        REFERENCES settlement_runs (id, project_id),
    CONSTRAINT fk_settlement_transfers_from_member
        FOREIGN KEY (from_member_id) REFERENCES project_members (id),
    CONSTRAINT fk_settlement_transfers_to_member
        FOREIGN KEY (to_member_id) REFERENCES project_members (id),
    CONSTRAINT uq_settlement_transfers_run_order
        UNIQUE (settlement_run_id, transfer_order),
    CONSTRAINT chk_settlement_transfers_order CHECK (transfer_order >= 1),
    CONSTRAINT chk_settlement_transfers_members CHECK (from_member_id <> to_member_id),
    CONSTRAINT chk_settlement_transfers_exact_positive CHECK (exact_amount > 0),
    CONSTRAINT chk_settlement_transfers_initial_non_negative
        CHECK (initially_rounded_amount >= 0),
    CONSTRAINT chk_settlement_transfers_final_positive CHECK (final_rounded_amount > 0),
    CONSTRAINT chk_settlement_transfers_adjustment
        CHECK (final_rounded_amount = initially_rounded_amount + rounding_adjustment),
    CONSTRAINT chk_settlement_transfers_final_exact
        CHECK (final_rounded_amount = exact_amount),
    CONSTRAINT chk_settlement_transfers_explanation
        CHECK (explanation_kind = 'NET_BALANCE_MATCH'),
    CONSTRAINT chk_settlement_transfers_status
        CHECK (status IN ('OUTSTANDING', 'COMPLETED')),
    CONSTRAINT chk_settlement_transfers_completion CHECK (
        (status = 'OUTSTANDING' AND completed_at IS NULL)
        OR (status = 'COMPLETED' AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idx_settlement_transfers_run_order
    ON settlement_transfers (settlement_run_id, transfer_order);
