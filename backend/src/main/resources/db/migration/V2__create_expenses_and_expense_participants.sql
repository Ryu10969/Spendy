CREATE TABLE expenses (
    id UUID CONSTRAINT pk_expenses PRIMARY KEY,
    project_id UUID NOT NULL,
    payer_member_id UUID NOT NULL,
    amount BIGINT NOT NULL,
    content VARCHAR(100) NOT NULL,
    category VARCHAR,
    note VARCHAR(1000),
    paid_on DATE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_expenses_project
        FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_expenses_payer_member
        FOREIGN KEY (payer_member_id) REFERENCES project_members (id),
    CONSTRAINT chk_expenses_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_expenses_content_not_blank CHECK (content !~ '^[[:space:]]*$'),
    CONSTRAINT chk_expenses_category CHECK (
        category IS NULL
        OR category IN (
            'FOOD',
            'UTILITIES',
            'TRANSPORTATION',
            'ACCOMMODATION',
            'DAILY_NECESSITIES',
            'ENTERTAINMENT',
            'OTHER'
        )
    )
);

CREATE INDEX idx_expenses_project_id ON expenses (project_id);

CREATE TABLE expense_participants (
    id UUID CONSTRAINT pk_expense_participants PRIMARY KEY,
    expense_id UUID NOT NULL,
    member_id UUID NOT NULL,
    allocated_share BIGINT NOT NULL,
    allocation_order INTEGER NOT NULL,
    CONSTRAINT fk_expense_participants_expense
        FOREIGN KEY (expense_id) REFERENCES expenses (id),
    CONSTRAINT fk_expense_participants_member
        FOREIGN KEY (member_id) REFERENCES project_members (id),
    CONSTRAINT chk_expense_participants_allocated_share_non_negative
        CHECK (allocated_share >= 0),
    CONSTRAINT chk_expense_participants_allocation_order
        CHECK (allocation_order >= 1),
    CONSTRAINT uq_expense_participants_expense_member
        UNIQUE (expense_id, member_id),
    CONSTRAINT uq_expense_participants_expense_allocation_order
        UNIQUE (expense_id, allocation_order)
);
