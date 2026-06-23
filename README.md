# SplitMate

SplitMate is a responsive shared-expense management web application for couples, roommates, families, travel groups, and friend groups.

It supports both long-term shared living expenses and one-time event expenses.

The product combines:

* Shared expense registration
* Bill splitting
* Settlement calculation
* Expense history
* Monthly expense management
* Spending analytics
* Multiple project management

---

## Current Status

SplitMate is currently in the early static frontend UI implementation phase.

The React, TypeScript, and Vite frontend foundation has been initialized, and the Home / Project List screen has a detailed dummy-data UI.

Completed documents:

* `PRODUCT_CHARTER.md`
* `docs/ui/MOCKUP_INDEX.md`
* `docs/architecture/ARCHITECTURE.md`
* `docs/adr/0001-initial-architecture.md`
* `docs/current/CURRENT_STATE.md`
* `.cursor/rules/splitmate-core.mdc`

Prepared UI assets:

* Desktop mockups
* Smartphone mockups
* Continuous-project screens
* Event-project screens
* Expense-registration screens
* Analytics screens

Not yet implemented:

* Spring Boot backend
* PostgreSQL schema
* Flyway migrations
* REST API
* Automated tests
* Deployment configuration

The remaining detailed frontend screens are still in progress.

For the verified current progress, see:

```text
docs/current/CURRENT_STATE.md
```

---

## Product Concept

SplitMate manages shared expenses through projects.

Each project represents one shared-expense context.

Examples:

* Shared household expenses
* Roommate living costs
* Family expenses
* Domestic travel
* Overseas travel
* Group events

Each project contains:

* Project information
* Members
* Expenses
* Settlement results
* Settlement completion status
* Expense history
* Analytics where applicable

---

## Project Types

SplitMate supports two project types.

### Continuous Project

Continuous projects are intended for shared expenses without a predetermined end.

Examples:

* Couples living together
* Roommates
* Families
* Shared houses

Main behavior:

* Monthly expense management
* Historical month navigation
* Monthly settlement calculation
* Category analytics
* Member payment comparison
* Long-term expense trends

---

### Event Project

Event projects are intended for one-time shared expenses.

Examples:

* Travel
* Drinking parties
* Camping
* Group outings

Main behavior:

* One settlement scope per project
* Simple expense registration
* Final settlement calculation
* Settlement completion
* Project archive
* Read-only access after archive

Event-project detail screens do not display analytics charts in the MVP.

---

## MVP Features

The planned MVP includes:

* No-login project access
* Active project list
* Archived event project list
* Project search
* Project creation
* Project editing
* Member management
* Expense registration
* Expense history
* Keyword, category, and period filtering
* Settlement calculation
* Settlement completion tracking
* Monthly filtering for continuous projects
* Continuous-project analytics
* Dedicated analytics screen
* Event-project completion and archive
* Responsive desktop and smartphone UI
* Server-side persistence

---

## Out of Scope for MVP

The following are not included in the current MVP:

* Login
* Signup
* OAuth
* JWT authentication
* Email invitation
* Role-based access control
* Multi-currency calculation
* Exchange-rate conversion
* Receipt image upload
* Receipt OCR
* AI categorization
* AI spending analysis
* Budget management
* Bank integration
* Credit-card integration
* Actual payment transfer
* Native iOS application
* Native Android application
* Push notifications
* External bill-splitting service import
* External-service scraping
* Subscription billing
* Administration console
* Dark mode

These features must not be implemented unless the Product Charter is explicitly updated.

---

## Planned Technology Stack

### Frontend

* React
* TypeScript
* Vite
* React Router
* TanStack Query
* React Hook Form
* Zod
* Recharts
* CSS Modules

### Backend

* Java 21
* Spring Boot
* Spring Web
* Spring Data JPA
* Bean Validation

### Database

* PostgreSQL
* Flyway

### Testing

* JUnit
* Mockito
* Spring Boot Test
* Frontend component tests
* End-to-end tests for critical flows

### Local Development

* Docker
* Docker Compose

The frontend foundation dependency versions are managed in `frontend/package.json`.
Backend and database dependency versions are not yet fixed in this README.

---

## High-Level Architecture

The approved architecture is:

```text
Browser
  ↓ HTTPS / JSON
React + TypeScript frontend
  ↓ REST API
Spring Boot backend
  ↓ JPA / SQL
PostgreSQL
```

The initial frontend will use centralized dummy-data adapters.

The same UI will later connect to the Spring Boot REST API without requiring a full component rewrite.

For technical details, see:

```text
docs/architecture/ARCHITECTURE.md
```

---

## Repository Structure

Planned repository structure:

```text
splitmate/
├── PRODUCT_CHARTER.md
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── frontend/
│   └── Application source code
│
├── backend/
│   └── Application source code
│
├── docs/
│   ├── architecture/
│   │   └── ARCHITECTURE.md
│   ├── ui/
│   │   ├── MOCKUP_INDEX.md
│   │   └── mockups/
│   │       ├── pc/
│   │       └── smartphone/
│   ├── api/
│   │   └── API_SPEC.md
│   ├── database/
│   │   └── DATABASE_DESIGN.md
│   ├── adr/
│   │   └── 0001-initial-architecture.md
│   └── current/
│       └── CURRENT_STATE.md
│
└── .cursor/
    └── rules/
        └── splitmate-core.mdc
```

Some planned files and application directories do not exist yet.

See `docs/current/CURRENT_STATE.md` for the verified current repository state.

---

## Documentation

### Product Requirements

```text
PRODUCT_CHARTER.md
```

Defines:

* Product purpose
* MVP scope
* Business rules
* Continuous and event project behavior
* Expense and settlement requirements
* Analytics requirements
* Explicit exclusions
* Acceptance criteria

---

### UI Mockups

```text
docs/ui/MOCKUP_INDEX.md
```

Defines:

* Mockup file paths
* Screen-to-image mapping
* Desktop and smartphone references
* Responsive interpretation rules
* Mockup inspection procedure

Reference images are stored under:

```text
docs/ui/mockups/pc/
docs/ui/mockups/smartphone/
```

---

### Architecture

```text
docs/architecture/ARCHITECTURE.md
```

Defines:

* Frontend structure
* Backend structure
* Database boundaries
* API direction
* Dummy-data replacement strategy
* Settlement calculation architecture
* Responsive implementation
* Testing and deployment direction

---

### Architecture Decisions

```text
docs/adr/0001-initial-architecture.md
```

Records:

* Adopted stack
* Monorepo decision
* Considered alternatives
* Consequences
* Risks
* Change conditions

---

### Current Progress

```text
docs/current/CURRENT_STATE.md
```

Records:

* Verified current state
* Completed work
* Missing documents
* Unimplemented areas
* Open decisions
* Next approved work

---

### Cursor Project Rule

```text
.cursor/rules/splitmate-core.mdc
```

Controls AI-assisted implementation by enforcing:

* Required document reading
* Scope restrictions
* Architecture rules
* Mockup inspection
* No-guessing behavior
* No duplicate implementation
* Calculation safety
* Documentation updates

---

## UI Mockups

The project contains reference mockups for:

* Home / project list
* Project creation
* Continuous project detail
* Event project detail
* Expense registration
* Analytics
* Desktop layouts
* Smartphone layouts

Mockups are implementation references only.

They must not be loaded as runtime application assets.

Business rules are controlled by `PRODUCT_CHARTER.md`.

Visual structure is controlled by `docs/ui/MOCKUP_INDEX.md` and the referenced images.

---

## Money Rules

The MVP uses:

* JPY only
* Integer monetary values
* No decimal monetary display

Approved internal representation:

```text
Java: long / Long
PostgreSQL: BIGINT
JSON: integer
```

Floating-point monetary values must not be used.

---

## Settlement Direction

The planned settlement flow is:

1. Divide each expense among its selected participants.
2. Store deterministic integer participant shares.
3. Calculate each member’s paid amount.
4. Calculate each member’s burden amount.
5. Calculate each member’s balance.
6. Generate direct debtor-to-creditor transfers.
7. Minimize unnecessary transfer transactions.
8. Apply the project rounding unit to final transfers.
9. Preserve settlement calculations as immutable runs.
10. Track completion status per settlement transfer.

Detailed rules are defined in:

```text
PRODUCT_CHARTER.md
docs/architecture/ARCHITECTURE.md
```

---

## Development Phases

### Phase 1: Documentation and Repository Preparation

* Product Charter
* Mockup Index
* Architecture
* ADR
* Cursor Rule
* Current State
* README
* Repository and mockup verification

### Phase 2: Static Frontend

* App shell
* Home
* Project creation
* Continuous project detail
* Event project detail
* Expense form
* Analytics
* Responsive layouts

### Phase 3: Centralized Dummy Data

* Typed project fixtures
* Expense fixtures
* Settlement fixtures
* Analytics fixtures
* Mock repository adapters

### Phase 4: Frontend Behavior

* Form validation
* Filters
* Modal and sheet behavior
* Mobile analytics collapse
* Local dummy-data interactions

### Phase 5: Backend and Persistence

Before this phase:

* Create `docs/api/API_SPEC.md`
* Create `docs/database/DATABASE_DESIGN.md`

Then implement:

* Spring Boot
* PostgreSQL
* Flyway
* Project API
* Expense API
* Settlement calculation
* Analytics aggregation

### Phase 6: Integration and Completion

* Replace mock repositories with API repositories
* Add loading and error states
* Add automated tests
* Verify responsive behavior
* Deploy the application
* Add screenshots and working setup instructions

---

## Setup

The frontend has been initialized under `frontend/`.

Verified frontend command:

```bash
npm --prefix frontend run build
```

Full local setup is not complete yet. This section must be expanded after:

* `backend/` is initialized
* Environment variables are defined
* Local startup commands are verified

---

## Environment Variables

Environment variables have not yet been finalized.

Planned examples include:

```text
VITE_API_BASE_URL
VITE_DATA_SOURCE
SPRING_DATASOURCE_URL
SPRING_DATASOURCE_USERNAME
SPRING_DATASOURCE_PASSWORD
FRONTEND_ALLOWED_ORIGIN
PROJECT_TOKEN_SECRET
```

The final variables must be documented only after they are implemented and verified.

Real secrets must never be committed.

---

## Testing

No automated application tests currently exist yet.

Planned critical test areas include:

* Expense allocation
* Remainder distribution
* Member-balance calculation
* Settlement optimization
* Settlement rounding
* Settlement snapshot behavior
* Monthly filtering
* Event archive restrictions
* Project-form validation
* Expense-form validation
* Responsive UI behavior

Do not state that tests pass until they have actually been executed.

---

## Development Rules

Before making code changes:

1. Read `PRODUCT_CHARTER.md`.
2. Read `docs/architecture/ARCHITECTURE.md`.
3. Read `docs/current/CURRENT_STATE.md`.
4. Read applicable ADRs.
5. Read `.cursor/rules/splitmate-core.mdc`.
6. For UI work, read `docs/ui/MOCKUP_INDEX.md`.
7. Open all mockups assigned to the target screen.
8. Search for an existing implementation before creating a new one.
9. Explain affected files and the implementation plan.
10. Do not add unapproved functionality.

When required information is missing, stop and report the missing requirement instead of guessing.

---

## Next Approved Work

The next approved step is:

1. Implement the Project Creation detailed static UI from inspected mockups.

Backend, API, and database implementation must not begin before the corresponding API and database specifications are created.

---

## License

A license has not yet been selected.

Do not assume that the repository is open source until a license file is explicitly added.
