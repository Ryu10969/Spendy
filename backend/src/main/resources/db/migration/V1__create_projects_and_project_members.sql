CREATE TABLE projects (
    id UUID CONSTRAINT pk_projects PRIMARY KEY,
    public_token VARCHAR(43) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(1000),
    type VARCHAR(10) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    rounding_unit INTEGER NOT NULL,
    status VARCHAR(8) NOT NULL,
    archived_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_projects_public_token UNIQUE (public_token),
    CONSTRAINT chk_projects_public_token_format CHECK (
        char_length(public_token) = 43
        AND public_token ~ '^[A-Za-z0-9_-]+$'
    ),
    CONSTRAINT chk_projects_name_not_blank CHECK (name !~ '^[[:space:]]*$'),
    CONSTRAINT chk_projects_type CHECK (type IN ('CONTINUOUS', 'EVENT')),
    CONSTRAINT chk_projects_currency CHECK (currency = 'JPY'),
    CONSTRAINT chk_projects_rounding_unit CHECK (rounding_unit IN (1, 10, 100, 1000)),
    CONSTRAINT chk_projects_status CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT chk_projects_archive_state CHECK (
        (status = 'ACTIVE' AND archived_at IS NULL)
        OR
        (status = 'ARCHIVED' AND type = 'EVENT' AND archived_at IS NOT NULL)
    )
);

CREATE TABLE project_members (
    id UUID CONSTRAINT pk_project_members PRIMARY KEY,
    project_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_project_members_project
        FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT uq_project_members_project_display_order
        UNIQUE (project_id, display_order),
    CONSTRAINT chk_project_members_name_not_blank CHECK (name !~ '^[[:space:]]*$'),
    CONSTRAINT chk_project_members_display_order CHECK (display_order >= 1)
);
