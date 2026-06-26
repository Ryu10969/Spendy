# SplitMate Current State

## 0. Document Information

| Item                                 | Value                                             |
| ------------------------------------ | ------------------------------------------------- |
| Product                              | SplitMate                                         |
| Document                             | Current State                                     |
| Status                               | Frontend foundation, Home UI, and Project Creation UI implemented |
| Last updated                         | 2026-06-24                                        |
| Implementation phase                 | Phase 2: Static frontend UI                       |
| Source of truth for current progress | This document                                     |

This document records the actual current state of the SplitMate repository.

It must describe:

* What currently exists
* What has been decided
* What has not been implemented
* Which documents are complete
* Which documents are still missing
* Known uncertainties
* The next approved work
* Work that must not begin yet

This document must contain verified current facts only.

Do not record planned functionality as completed functionality.

---

# 1. Current Summary

SplitMate is currently in the frontend static UI implementation stage.

The following work has been completed:

* Product requirements have been defined.
* Desktop and smartphone mockup images have been prepared.
* Mockup image paths and screen mappings have been documented.
* The initial system architecture has been defined.
* The initial architecture decision has been recorded.
* The project-wide Cursor Rule has been prepared.
* The 7 required source documents have been opened and verified.
* All 28 UI mockup images have been opened and verified.
* Mockup directories have been normalized to the documented lowercase paths.
* The Cursor Project Rule frontmatter has been normalized.
* `.gitignore` has been created.
* The repository has been initialized as a Git repository.
* One React, TypeScript, and Vite frontend has been initialized under `frontend/`.
* The approved frontend base directory structure has been created.
* Shared CSS design tokens, global base styles, and centralized breakpoint variables have been added.
* The approved route skeleton has been added.
* A responsive application shell has been added with desktop sidebar and smartphone bottom navigation.
* The Home / Project List detailed UI has been implemented from centralized typed project fixtures.
* Home now includes project search, active project cards, archived event project cards, reusable project-list components, and project-detail navigation links.
* The Project Creation detailed UI has been implemented with controlled form state, required-field validation, project type selection, fixed JPY display, rounding unit selection, member row editing, and an explicit API-unconnected submit result.

Application code has started with the frontend foundation, the Home screen, and the Project Creation screen.

The following do not currently exist as verified completed implementations:

* Spring Boot backend
* PostgreSQL schema
* Flyway migrations
* REST API
* Settlement calculation code
* Analytics calculation code
* Persistent storage
* Automated tests
* Deployment configuration

The immediate goal is to continue implementing the remaining detailed static UI screens using centralized dummy data while preserving the frontend boundaries required for later API integration.

---

# 2. Product Direction

The approved product is:

> A no-login, responsive shared-expense management web application supporting continuous and event projects.

The core product flow is:

1. View projects.
2. Create a continuous or event project.
3. Add project members.
4. Register shared expenses.
5. Review expense history.
6. Calculate who should pay whom.
7. Mark settlement transfers as completed.
8. Review analytics for continuous expenses.
9. Archive completed event projects.

The current implementation must remain focused on this flow.

---

# 3. Approved MVP Scope

The approved MVP includes:

* Home / project list
* Active project list
* Archived event project list
* Project search
* Project creation
* Project editing
* Continuous project type
* Event project type
* Member management
* Expense creation
* Expense history
* Expense filtering
* Settlement calculation
* Settlement completion status
* Continuous-project monthly filtering
* Continuous-project analytics
* Dedicated analytics screen
* Event-project completion
* Event-project archive
* Archived-project read-only behavior
* Desktop responsive UI
* Smartphone responsive UI
* Centralized dummy data
* Final Spring Boot and PostgreSQL persistence

---

# 4. Explicit MVP Exclusions

The following are not approved for the current MVP:

* Login
* Signup
* Password authentication
* OAuth
* JWT
* Email invitation
* Role-based access control
* Multi-currency calculation
* Exchange-rate conversion
* Receipt image upload
* Receipt OCR
* AI categorization
* AI spending advice
* Budget management
* Bank integration
* Credit-card integration
* Actual payment processing
* Native iOS application
* Native Android application
* Push notification
* External bill-splitting service import
* External-service scraping
* Subscription billing
* Administration console
* Dark mode

Cursor must not add these features without an explicit Product Charter change.

---

# 5. Completed Documentation

## 5.1 Product Charter

Path:

```text
PRODUCT_CHARTER.md
```

Status:

```text
Completed
```

Defines:

* Product purpose
* Target users
* MVP scope
* Continuous and event project behavior
* Currency rules
* Expense rules
* Settlement requirements
* Analytics requirements
* Responsive requirements
* Out-of-scope functionality
* Acceptance criteria
* Document priority

---

## 5.2 UI Mockup Index

Path:

```text
docs/ui/MOCKUP_INDEX.md
```

Status:

```text
Completed
```

Defines:

* Mockup file locations
* Repository-relative image paths
* Screen-to-image mapping
* Desktop and smartphone relationships
* Mockup inspection procedure
* Responsive interpretation
* Dummy-data treatment
* Missing-image handling
* Generated-mockup defect handling

---

## 5.3 Architecture

Path:

```text
docs/architecture/ARCHITECTURE.md
```

Status:

```text
Completed
```

Defines:

* React frontend structure
* Spring Boot backend structure
* PostgreSQL persistence
* REST API direction
* Dummy-data adapter boundary
* Settlement architecture
* Settlement snapshot policy
* Expense allocation
* Rounding direction
* Responsive strategy
* Testing direction
* Deployment direction

---

## 5.4 Initial Architecture ADR

Path:

```text
docs/adr/0001-initial-architecture.md
```

Status:

```text
Completed
```

Records the decision to use:

* Monorepo
* React
* TypeScript
* Vite
* Spring Boot
* Java 21
* PostgreSQL
* Flyway
* REST
* Docker Compose
* Centralized dummy-data adapters
* Server-side settlement calculation
* Immutable settlement snapshots

---

## 5.5 Cursor Project Rule

Path:

```text
.cursor/rules/splitmate-core.mdc
```

Status:

```text
Prepared and file-level verified
```

Required verification before implementation:

* Confirm that the file exists at the exact path. Completed.
* Confirm that the frontmatter is a single MDC block. Completed.
* Confirm that `alwaysApply: true` is active in the file. Completed.
* Confirm that the rule is not mistakenly stored as a global User Rule. Completed by file placement.
* Confirm that Cursor recognizes it as a Project Rule. Not directly verifiable from repository files.

The file is correctly placed under `.cursor/rules/` and has the required frontmatter:

```yaml
---
description: SplitMate全体の要件、設計、実装手順、禁止事項を強制するプロジェクト共通ルール
globs:
alwaysApply: true
---
```

Cursor UI-level activation cannot be directly verified from this document.

---

# 6. Mockup Inventory

## 6.1 Expected desktop mockups

Base path:

```text
docs/ui/mockups/pc/
```

Expected files:

```text
01_home.png
02_project_create_1.png
03_project_create_2.png
04_analytics_1.png
05_analytics_2.png
06_continuous_project_1.png
07_continuous_project_2.png
08_expense_add_modal_1.png
09_expense_add_modal_2.png
10_event_project_1.png
11_event_project_2.png
```

Expected count:

```text
11
```

---

## 6.2 Expected smartphone mockups

Base path:

```text
docs/ui/mockups/smartphone/
```

Expected files:

```text
01_home_sp_1.png
02_home_sp_2.png
03_project_create_1.png
04_project_create_2.png
05_continuous_project_1.png
06_continuous_project_2.png
07_continuous_project_3.png
08_continuous_project_4.png
09_continuous_project_5.png
10_continuous_project_6.png
11_expense_add_modal_1.png
12_expense_add_modal_2.png
13_event_project_1.png
14_event_project_2.png
15_event_project_3.png
16_home_to_expense_add_1.png
17_home_to_expense_add_2.png
```

Expected count:

```text
17
```

---

## 6.3 Verification status

Expected total:

```text
28 images
```

Current verified repository status:

```text
Verified
```

Verification result:

* Desktop expected: 11
* Desktop found: 11
* Desktop opened: 11
* Smartphone expected: 17
* Smartphone found: 17
* Smartphone opened: 17
* Total expected: 28
* Total opened and verified: 28
* Missing files: none
* Unreadable files: none
* Directory names: normalized to `docs/ui/mockups/pc/` and `docs/ui/mockups/smartphone/`
* Image filenames: match `docs/ui/MOCKUP_INDEX.md`

The mockup images are development references only and are not runtime application assets.

---

# 7. Documentation Not Yet Created

## 7.1 README

Expected path:

```text
README.md
```

Current status:

```text
created
```

Required before:

* Public GitHub presentation
* Final local setup handoff
* Portfolio completion

README is not required before the first static UI implementation, but it should be created before project setup is considered complete.

---

## 7.2 API Specification

Expected path:

```text
docs/api/API_SPEC.md
```

Current status:

```text
Not created
```

Required before:

* Spring Boot Controller implementation
* Request DTO implementation
* Response DTO implementation
* Frontend REST integration
* API error-contract implementation

No production API endpoint should be implemented before the API contract is documented.

Static UI and centralized dummy-data work may proceed without this document.

---

## 7.3 Database Design

Expected path:

```text
docs/database/DATABASE_DESIGN.md
```

Current status:

```text
Not created
```

Required before:

* JPA Entity implementation
* Flyway migration implementation
* PostgreSQL table creation
* Foreign-key implementation
* Index creation
* Delete and deactivation behavior implementation

No production database schema should be implemented before this document is approved.

---

## 7.4 Additional ADR for UI Mockups

Possible path:

```text
docs/adr/0002-ui-mockups-as-source-of-truth.md
```

Current status:

```text
Not created
```

Current requirement:

```text
Optional
```

The treatment of UI mockups is already defined by:

* `PRODUCT_CHARTER.md`
* `docs/ui/MOCKUP_INDEX.md`
* `docs/architecture/ARCHITECTURE.md`
* `.cursor/rules/splitmate-core.mdc`
* `docs/adr/0001-initial-architecture.md`

A separate ADR is not currently required unless the mockup authority policy needs to change independently.

---

# 8. Application Implementation Status

## 8.1 Frontend

Expected path:

```text
frontend/
```

Current status:

```text
Foundation initialized; Home / Project List and Project Creation implemented
```

Completed frontend foundation work:

* Vite initialization
* React configuration
* TypeScript configuration
* `npm` dependency installation
* Routing skeleton
* CSS Modules setup
* Shared design tokens
* Centralized responsive breakpoint variables
* Global reset and base typography
* App shell
* Desktop sidebar
* Smartphone bottom navigation
* Placeholder pages for approved routes

Completed Home implementation work:

* Centralized typed Home project fixture data
* Home page header
* Project search UI
* Active project section
* Archived event project section
* Archived event section collapse and expansion
* Project cards with project-detail links
* Project type badges
* Member avatar display
* No-projects empty state
* No-search-results empty state
* Desktop and smartphone responsive Home layout

Completed Project Creation implementation work:

* Project Creation placeholder replaced with detailed form UI on `/projects/new`
* Controlled React form state for project creation
* Project type card selection for continuous and event projects
* Required project-name field
* Optional description field
* Fixed read-only `JPY (¥)` currency display
* Settlement rounding unit selection for `1`, `10`, `100`, and `1000` yen
* Member input rows with stable local row IDs
* Member row addition and removal controls
* Client-side validation for required Project Charter fields
* Accessible form labels, fieldsets, legends, `aria-invalid`, `aria-describedby`, visible error summary, and focus movement to the first invalid field on submit
* Valid submit displays an explicit API-unconnected success message and does not persist data
* Desktop and smartphone responsive Project Creation layout using one shared component and CSS Modules

Installed runtime dependencies:

* `react`
* `react-dom`
* `react-router-dom`

Installed development dependencies:

* `vite`
* `typescript`
* `@vitejs/plugin-react`
* `@types/react`
* `@types/react-dom`

Created base structure:

```text
frontend/src/
├── app/
├── components/
│   ├── layout/
│   ├── navigation/
│   ├── feedback/
│   └── common/
├── features/
├── pages/
├── api/
├── mocks/
├── hooks/
├── utils/
├── types/
├── styles/
└── main.tsx
```

Approved routes currently defined:

```text
/
/projects/new
/p/:publicToken
/p/:publicToken/expenses/new
/expenses/new
/analytics
/p/:publicToken/edit
```

Verification commands run:

* `npm --prefix "/Users/masanoryuudai/Documents/SplitMate/frontend" install`
* `npm --prefix "/Users/masanoryuudai/Documents/SplitMate/frontend" run build`
* `npm --prefix frontend run build`
* Temporary Vite dev server route check using Python `urllib.request`
* Temporary Vite dev server route check for `/projects/new` using Python `urllib.request`
* `git diff --check`

Verification results:

* Install: passed
* Build: passed
* TypeScript check: passed through `tsc -b` inside `npm run build`
* Lint script: not present
* IDE diagnostics for `frontend/src`: no linter errors found
* Route HTTP responses: all approved routes returned `200`
* Diff whitespace check: passed
* Project Creation build after implementation: passed
* Project Creation diff whitespace check after implementation: passed
* Project Creation route smoke check after implementation: `/projects/new` returned `200`
* IDE diagnostics for changed Project Creation files: no linter errors found

Not yet verified or completed:

* Continuous project page
* Event project page
* Expense form
* Analytics page
* Centralized fixtures for remaining screens
* Mock repositories
* Tests
* Browser-based visual verification for Home and Project Creation
* Browser-based keyboard navigation verification for Home and Project Creation

---

## 8.2 Backend

Expected path:

```text
backend/
```

Current status:

```text
Not implemented
```

Not yet verified or completed:

* Spring Boot initialization
* Java 21 configuration
* Project feature
* Expense feature
* Settlement feature
* Analytics feature
* Validation
* Error handling
* REST API
* Tests

Backend work must not begin until the API and database documents required for the target work exist.

---

## 8.3 Database

Current status:

```text
Not implemented
```

Not yet completed:

* PostgreSQL configuration
* Flyway configuration
* Projects table
* Project members table
* Expenses table
* Expense participants table
* Settlement runs table
* Settlement balances table
* Settlement transfers table
* Constraints
* Indexes
* Seed data
* Migration tests

---

## 8.4 Infrastructure

Current status:

```text
Partially prepared
```

Completed:

* `.gitignore`
* Git repository initialization

Not yet completed:

* `docker-compose.yml`
* `.env.example`
* Frontend environment variables
* Backend environment variables
* PostgreSQL local service
* Production deployment configuration
* CI workflow
* Health checks

No Docker Compose configuration or environment variable file has been implemented yet.

---

# 9. Approved Technology Direction

The currently approved stack is:

## Frontend

* React
* TypeScript
* Vite
* React Router
* TanStack Query
* React Hook Form
* Zod
* Recharts
* CSS Modules
* Shared CSS design tokens

## Backend

* Java 21
* Spring Boot
* Spring Web
* Spring Data JPA
* Bean Validation
* JUnit
* Mockito
* Spring Boot Test

## Database

* PostgreSQL
* Flyway

## Local environment

* Docker
* Docker Compose

No unapproved framework substitutions have been made.

---

# 10. Approved Business Decisions

The following decisions are fixed for the initial implementation.

## 10.1 Access

* No login
* No account system
* Project access through a public project token
* Public token is not authentication

## 10.2 Currency

* JPY only
* Integer amounts only
* No decimal monetary display

## 10.3 Project types

* Continuous
* Event

## 10.4 Continuous projects

* Monthly settlement scope
* Historical months retained
* Analytics available
* No event-style archive completion flow

## 10.5 Event projects

* Whole-project settlement scope
* No project-detail charts
* Explicit completion and archive flow
* Read-only after archive

## 10.6 Expense allocation

* Equal split among selected participants
* Deterministic remainder distribution
* Persisted participant allocations

## 10.7 Settlement

* Server-side authoritative calculation
* Direct debtor-to-creditor matching
* Deterministic output
* Immutable settlement runs
* Completion status belongs to a transfer inside one run

## 10.8 Rounding

* Supported units: 1, 10, 100, 1000 yen
* Exact one-yen calculation before settlement rounding
* HALF_UP for final settlement transfer rounding
* Rounding difference must not be silently discarded

---

# 11. Known Open Decisions

The following details require further documentation before the relevant implementation.

## 11.1 Exact API contracts

Not yet fixed:

* Request bodies
* Response bodies
* Pagination
* Query parameters
* Exact endpoint error codes
* Analytics response structures

Resolution document:

```text
docs/api/API_SPEC.md
```

---

## 11.2 Exact database schema

Not yet fixed:

* Physical table names
* Exact column names
* Column lengths
* Nullability
* Indexes
* Enum storage
* Unique constraints
* Foreign-key deletion behavior

Resolution document:

```text
docs/database/DATABASE_DESIGN.md
```

---

## 11.3 Reference-member UX

The MVP has no authenticated current user.

The exact interaction for displaying “自分の収支” is not yet implemented.

Approved options remain:

* Defined demo member during dummy-data phase
* Local reference-member selection
* Member-balance list when no reference member is selected

Cursor must not introduce authentication to solve this issue.

---

## 11.4 Analytics inclusion policy

The dedicated Analytics screen exists in the MVP.

The exact default inclusion of event-project data is not yet finalized.

Current architectural recommendation:

```text
Default: continuous projects
Optional filter: continuous, event, or all
```

The final API and UI behavior must be documented before real analytics integration.

---

## 11.5 Rounding residual presentation

Architecture requires exact and rounded amounts to remain distinguishable.

The exact UI wording and component for non-zero rounding differences is not yet finalized.

Cursor must not hide the difference or invent an undocumented adjustment transfer.

---

# 12. Current Risks

## 12.1 Documentation becoming inconsistent

Risk:

* Requirements may be repeated differently across documents.

Control:

* Follow the documented authority order.
* Update related documents together when an approved decision changes.
* Do not change behavior through code only.

---

## 12.2 UI implementation beginning before mockup verification

Risk:

* Cursor may implement from filenames or descriptions without opening images.

Control:

* Verify all 28 paths first.
* Open all screen-specific references before code changes.
* Stop if any required file is missing.

---

## 12.3 Over-engineering before MVP completion

Risk:

* Excessive abstractions may delay the one-week implementation target.

Control:

* Use feature-specific boundaries.
* Do not add frameworks outside the approved stack.
* Do not generalize before concrete reuse exists.
* Prioritize the documented main flow.

---

## 12.4 Dummy data becoming permanent hard-coded UI

Risk:

* Values from mockups may be embedded directly in page components.

Control:

* Centralize fixtures.
* Use typed component props.
* Use mock repositories or feature hooks.
* Keep presentation components independent of data source.

---

## 12.5 Frontend-only business logic becoming authoritative

Risk:

* Settlement and archive rules may be implemented only in React.

Control:

* Frontend behavior may be simulated for dummy-data work.
* Backend becomes authoritative after integration.
* Core calculations must have backend tests.

---

# 13. Current Phase

Current phase:

```text
Phase 2: Static frontend UI
```

Phase 1 completion status:

* [x] `PRODUCT_CHARTER.md`
* [x] `docs/ui/MOCKUP_INDEX.md`
* [x] `docs/architecture/ARCHITECTURE.md`
* [x] `docs/adr/0001-initial-architecture.md`
* [x] `.cursor/rules/splitmate-core.mdc` content prepared
* [x] `.cursor/rules/splitmate-core.mdc` frontmatter normalized
* [x] `docs/current/CURRENT_STATE.md`
* [ ] Cursor Project Rule recognition verified
* [x] All 28 mockup paths verified
* [x] `README.md`
* [x] Base repository directories verified
* [x] Initial Git repository state verified
* [x] `.gitignore`

Phase 2 frontend foundation status:

* [x] React, TypeScript, and Vite frontend initialized
* [x] Frontend dependencies installed with npm
* [x] Frontend base directory structure created
* [x] Shared design tokens created
* [x] Global reset and base typography created
* [x] Centralized breakpoint variables created
* [x] Approved route skeleton created
* [x] Responsive AppShell created
* [x] DesktopSidebar created
* [x] MobileBottomNavigation created
* [x] Placeholder pages created
* [x] Detailed Home UI
* [x] Detailed Project Creation UI
* [ ] Detailed Continuous Project Detail UI
* [ ] Detailed Event Project Detail UI
* [ ] Expense form
* [ ] Analytics charts
* [x] Centralized Home project fixture data
* [x] Project Creation controlled form model and validation constants
* [ ] Centralized dummy fixture data for remaining screens
* [ ] Mock repositories
* [ ] Automated frontend tests
* [ ] Browser-based responsive visual verification

API and database specifications are not required to complete the UI-only part of Phase 1.

They are required before backend persistence implementation.

---

# 14. Next Approved Work

The next approved work is:

## Step 1: Repository verification

Verify that the repository contains:

```text
PRODUCT_CHARTER.md
docs/ui/MOCKUP_INDEX.md
docs/ui/mockups/pc/
docs/ui/mockups/smartphone/
docs/architecture/ARCHITECTURE.md
docs/adr/0001-initial-architecture.md
docs/current/CURRENT_STATE.md
.cursor/rules/splitmate-core.mdc
```

Status:

```text
Completed
```

---

## Step 2: Mockup verification

Verify all 28 paths listed in `MOCKUP_INDEX.md`.

Record:

* Existing files
* Missing files
* Naming mismatches
* Unopenable images

Do not begin UI implementation if a required image is missing.

Status:

```text
Completed
```

---

## Step 3: Cursor Rule verification

Confirm:

* The rule appears under Project Rules.
* It applies to the SplitMate repository.
* It is not stored as a global User Rule.
* `alwaysApply: true` is active.

Status:

```text
Partially completed
```

File placement and frontmatter are verified. Cursor UI-level Project Rule recognition remains not directly verifiable from repository files.

---

## Step 4: README creation

Create the initial repository entry document.

The initial README should include:

* Product overview
* Current status
* Planned stack
* Repository structure
* Document links
* Setup status
* Clear current implementation status

Do not document unverified setup commands as working commands.

Status:

```text
Completed
```

---

## Step 5: Frontend initialization

After repository and mockup verification:

* Create one Vite React TypeScript frontend.
* Do not create the backend yet unless separately instructed.
* Install only approved initial dependencies.
* Establish the documented folder structure.
* Create design tokens.
* Create routing skeleton.
* Create the app shell.

Status:

```text
Completed
```

---

## Step 6: Static UI with dummy data

Next recommended implementation order:

1. Home / Project List detailed static UI
2. Project creation detailed static UI
3. Continuous project detail static UI
4. Event project detail static UI
5. Expense creation UI
6. Analytics UI
7. Centralized dummy fixture data
8. Responsive visual verification

Use centralized typed fixtures.

Status:

```text
In progress
```

Completed:

* Home / Project List detailed static UI
* Project creation detailed static UI
* Centralized typed project fixture data for Home
* Project Creation controlled form model and validation constants
* Reusable Home project-list components
* Search filtering interaction for project names
* Active and archived event project sections
* Archived event section collapse and expansion
* No-projects and no-search-results empty states

Still pending in this static UI phase:

* Continuous project detail static UI
* Event project detail static UI
* Expense creation UI
* Analytics UI
* Dummy data for remaining screens
* Browser-based responsive visual verification

---

# 15. Work Not Yet Approved

Do not begin the following merely because they are described in Architecture:

* Spring Boot Controller implementation
* JPA Entity implementation
* Flyway migration creation
* PostgreSQL schema creation
* API integration
* Deployment
* Authentication
* Future-phase features

Backend implementation requires the relevant approved API and database specifications first.

---

# 16. Screen Implementation Tracking

## Application Shell

Status:

```text
Foundation completed
```

References inspected during frontend foundation:

```text
docs/ui/mockups/pc/01_home.png
docs/ui/mockups/smartphone/01_home_sp_1.png
docs/ui/mockups/smartphone/02_home_sp_2.png
docs/ui/mockups/pc/02_project_create_1.png
docs/ui/mockups/smartphone/03_project_create_1.png
```

Progress:

* Desktop sidebar: implemented
* Smartphone bottom navigation: implemented
* Shared page content area: implemented
* Mobile bottom-navigation spacing guard: implemented
* Horizontal overflow guard: implemented in global base styles and shell layout
* Route navigation: implemented for approved route skeleton
* Desktop sidebar route skeleton verification section: removed from user-facing sidebar
* Visual browser verification: not completed
* Detailed screen UI: not implemented

---

## Home / Project List

Status:

```text
Implemented with centralized dummy project data
```

References:

```text
docs/ui/mockups/pc/01_home.png
docs/ui/mockups/smartphone/01_home_sp_1.png
docs/ui/mockups/smartphone/02_home_sp_2.png
```

Progress:

* Desktop mockups inspected: yes, `docs/ui/mockups/pc/01_home.png`
* Smartphone mockups inspected: yes, `docs/ui/mockups/smartphone/01_home_sp_1.png` and `docs/ui/mockups/smartphone/02_home_sp_2.png`
* Static UI: implemented
* Responsive UI: implemented in CSS Modules with desktop grid and smartphone single-column layout
* Dummy data: connected through `frontend/src/mocks/fixtures/projects.ts`
* API: not connected
* Project cards: implemented through reusable `ProjectCard`
* Project type badge: implemented through reusable `ProjectTypeBadge`
* Member avatars: implemented through reusable `MemberAvatar` and `MemberAvatarGroup`
* Project search: implemented as client-side case-insensitive project-name filtering
* Search clear behavior: implemented through the clear button in `SearchInput`
* Search no-results state: implemented through `EmptyState`
* No-projects empty state: implemented for the case where project fixture data is empty, with a semantic link to `/projects/new`
* No-search-results empty state: implemented separately from no-projects, without forcing a new-project CTA
* Active projects section: implemented for active continuous and active event projects
* Archived projects section: implemented for archived event projects only
* Archived projects collapse and expansion: implemented with an initially expanded semantic `button`
* Archived projects accessibility: `aria-expanded` and `aria-controls` are connected to the archived project card panel
* Archived section search behavior: matching archived event projects are re-expanded during active search so search results are not hidden by collapsed state
* Archived read-only accessibility: archived project card link names include `アーカイブ済み・閲覧のみ`
* Archived continuous projects: not added
* Project-detail navigation: implemented as semantic links to `/p/:publicToken`
* New project navigation: preserved through Home CTA links to `/projects/new`
* Global expense navigation: preserved through the existing mobile bottom navigation route to `/expenses/new`; no desktop development link was added
* JPY compliance: all displayed money comes from integer yen fixture values and shared `formatYen` / `formatSignedYen`
* No-login compliance: no account, profile, authenticated current user, login, signup, notification, or user setting behavior was added
* Verified against mockups: source-level implementation completed; browser-based visual verification not completed
* Desktop manual verification: not completed in a real browser
* Smartphone manual verification: not completed in a real browser
* Keyboard verification for archived collapse button: not completed in a real browser

---

## Project Creation

Status:

```text
Implemented as a controlled static UI form; API not connected
```

References:

```text
docs/ui/mockups/pc/02_project_create_1.png
docs/ui/mockups/pc/03_project_create_2.png
docs/ui/mockups/smartphone/03_project_create_1.png
docs/ui/mockups/smartphone/04_project_create_2.png
```

Progress:

* Desktop mockups inspected: yes, `docs/ui/mockups/pc/02_project_create_1.png` and `docs/ui/mockups/pc/03_project_create_2.png`
* Smartphone mockups inspected: yes, `docs/ui/mockups/smartphone/03_project_create_1.png` and `docs/ui/mockups/smartphone/04_project_create_2.png`
* Static UI: implemented
* Responsive UI: implemented in CSS Modules with desktop horizontal project-type cards and smartphone stacked single-column layout
* Form state: implemented with React controlled state; React Hook Form and Zod were not introduced because they are not installed in the current frontend
* Project type behavior: continuous and event options are selectable; continuous is the initial selected value to match the inspected mockups
* Project name: required text input
* Description: optional textarea
* Currency: fixed read-only `JPY (¥)` display; no currency selector was added
* Settlement rounding unit: selectable `¥1`, `¥10`, `¥100`, and `¥1,000`; `¥10` is the initial selected value to match the inspected mockups
* Member editing: member rows use stable local row IDs, can be added, removed, and edited; member names are project-local participant names, not account users
* Validation: implemented for missing project type, empty project name, missing rounding unit, and no entered member
* Validation accessibility: errors are visible, summarized, associated with controls through `aria-invalid` and `aria-describedby`, and submit focuses the first invalid field
* Duplicate member names: not rejected because Product Charter does not define duplicate-name behavior for project creation
* Project-name length and maximum member count: not enforced because exact limits are not defined in Product Charter or Architecture
* Event-specific fields: not added because Product Charter does not define event date or archive fields for project creation
* Submit behavior: valid submit displays an explicit API-unconnected success message; it does not create a persistent project, call an API, generate a public token, or write to localStorage
* API: not connected
* Backend persistence: not implemented
* Browser-based visual verification: not completed
* Browser-based keyboard verification: not completed
* Verified against mockups: source-level structure implemented from inspected mockups; real-browser visual comparison not completed

---

## Continuous Project Detail

Status:

```text
Not started
```

References:

```text
docs/ui/mockups/pc/06_continuous_project_1.png
docs/ui/mockups/pc/07_continuous_project_2.png
docs/ui/mockups/smartphone/05_continuous_project_1.png
docs/ui/mockups/smartphone/06_continuous_project_2.png
docs/ui/mockups/smartphone/07_continuous_project_3.png
docs/ui/mockups/smartphone/08_continuous_project_4.png
docs/ui/mockups/smartphone/09_continuous_project_5.png
docs/ui/mockups/smartphone/10_continuous_project_6.png
```

Progress:

* Desktop mockups inspected: not recorded
* Smartphone mockups inspected: not recorded
* Static UI: not started
* Monthly filter: not implemented
* Settlement display: not implemented
* Analytics: not implemented
* Responsive UI: not started
* API: not connected
* Verified against mockups: no

---

## Event Project Detail

Status:

```text
Not started
```

References:

```text
docs/ui/mockups/pc/10_event_project_1.png
docs/ui/mockups/pc/11_event_project_2.png
docs/ui/mockups/smartphone/13_event_project_1.png
docs/ui/mockups/smartphone/14_event_project_2.png
docs/ui/mockups/smartphone/15_event_project_3.png
```

Progress:

* Desktop mockups inspected: not recorded
* Smartphone mockups inspected: not recorded
* Static UI: not started
* Settlement display: not implemented
* Completion action: not implemented
* Archive flow: not implemented
* Read-only state: not implemented
* Responsive UI: not started
* API: not connected
* Verified against mockups: no

---

## Expense Creation from Project

Status:

```text
Not started
```

References:

```text
docs/ui/mockups/pc/08_expense_add_modal_1.png
docs/ui/mockups/pc/09_expense_add_modal_2.png
docs/ui/mockups/smartphone/11_expense_add_modal_1.png
docs/ui/mockups/smartphone/12_expense_add_modal_2.png
```

Progress:

* Desktop mockups inspected: not recorded
* Smartphone mockups inspected: not recorded
* Shared form: not implemented
* Modal: not implemented
* Mobile sheet: not implemented
* Validation: not implemented
* Dummy submission: not implemented
* API: not connected
* Verified against mockups: no

---

## Global Expense Creation

Status:

```text
Not started
```

References:

```text
docs/ui/mockups/smartphone/16_home_to_expense_add_1.png
docs/ui/mockups/smartphone/17_home_to_expense_add_2.png
```

Desktop reference:

```text
No dedicated mockup
```

Approved desktop interpretation:

```text
Reuse the desktop expense modal and add a project selector.
```

Progress:

* Smartphone mockups inspected: not recorded
* Desktop interpretation reviewed: no
* Project selector: not implemented
* Shared form: not implemented
* Responsive UI: not started
* API: not connected

---

## Analytics

Status:

```text
Not started
```

References:

```text
docs/ui/mockups/pc/04_analytics_1.png
docs/ui/mockups/pc/05_analytics_2.png
```

Smartphone reference:

```text
No dedicated smartphone analytics mockup
```

Progress:

* Desktop mockups inspected: not recorded
* KPI cards: not implemented
* Monthly trend: not implemented
* Category breakdown: not implemented
* Project comparison: not implemented
* Member ranking: not implemented
* Centralized dummy data: not connected
* Responsive mobile adaptation: not designed
* API: not connected
* Verified against mockups: no

---

# 17. Test Status

No automated application tests currently exist.

Current test status:

| Area                           | Status                                           |
| ------------------------------ | ------------------------------------------------ |
| Frontend unit tests            | Not started                                      |
| Frontend component tests       | Not started                                      |
| Frontend build                 | Passed with `npm --prefix frontend run build` after Project Creation implementation |
| Frontend TypeScript check      | Passed through `tsc -b` inside `npm --prefix frontend run build` after Project Creation implementation |
| Frontend lint script           | Not present in `frontend/package.json`; IDE diagnostics for changed Project Creation files found no linter errors |
| Route HTTP smoke check         | Passed for `/` and `/p/demo-continuous-project` on the running Vite dev server |
| Diff whitespace check          | Passed with `git diff --check`                   |
| Backend unit tests             | Not started                                      |
| Backend integration tests      | Not started                                      |
| End-to-end tests               | Not started                                      |
| Manual responsive verification | Not completed in a real browser after Project Creation implementation |
| Home keyboard verification     | Not completed in a real browser after archived-section collapse implementation |
| Project Creation keyboard verification | Not completed in a real browser after Project Creation implementation |
| Settlement test cases          | Not started                                      |

Do not state that any tests pass until they have been executed.

---

# 18. Known Deviations

Frontend implementation now includes the foundation and the Home / Project List detailed UI.

Potential mockup-to-requirement differences already documented include:

* Mockups contain profile-related UI despite the no-login policy.
* Mockups may contain a “My balance” concept without authenticated identity.
* Mockups contain a dedicated Analytics screen that is now approved for the initial UI.
* Smartphone Analytics does not have a dedicated complete mockup.
* Some generated mockup values or settlement text may overlap or be mathematically inconsistent.
* JPY is fixed even where a mockup visually resembles a currency selector.
* Desktop Home search is intentionally placed inside the Home content below the page header instead of the desktop mockup's top header area, prioritizing alignment with project-list content and a wider search input; the smartphone placement remains aligned with the mockup and this is the current adopted approach, not an unresolved defect.
* Project Creation displays `JPY (¥)` as a fixed read-only field instead of a selector, following Product Charter currency rules.
* Project Creation does not reject duplicate member names because duplicate-name behavior is not defined by the Product Charter.
* Project Creation does not include an event date or archive-related creation field because those fields are not defined as project-creation requirements.

These must be handled according to document priority.

Current known limitations from the frontend foundation, Home implementation, and Project Creation implementation:

* Home / Project List is implemented from centralized dummy data, but it is not connected to an API.
* Project Creation is implemented as a controlled static UI form, but it is not connected to an API and does not persist project data.
* Project Creation valid submit only displays an API-unconnected success message; it does not generate a backend public token or navigate to a created project.
* Project Detail, Expense Creation, Analytics, and Project Edit pages remain intentionally minimal placeholders.
* Desktop sidebar and smartphone bottom navigation use text-only temporary navigation markers, not a final icon system.
* `/p/demo-project` is still used by pre-existing mobile navigation items and is not backed by project data.
* Home project cards use fixture public tokens such as `/p/demo-continuous-project` and navigate to the existing Project Detail placeholder route.
* Browser-based visual inspection for desktop and smartphone has not been completed after the Project Creation implementation.
* Browser-based keyboard verification has not been completed after the Project Creation implementation.
* No backend, API client, database, mock repositories, charts, or business calculations exist yet.

---

# 19. Update Rules

This document must be updated after each approved implementation unit.

At minimum, record:

* Date
* Completed work
* Files created or modified
* Tests executed
* Tests not executed
* Known limitations
* Mockups verified
* Current phase
* Next recommended work

Do not remove historical facts simply because the implementation has moved forward.

Use Git history for detailed file-level history, but keep this document accurate as a handoff summary.

---

# 20. Handoff Summary

The repository is currently prepared at the requirements, architecture, mockup-verification, basic Git, frontend foundation, Home detailed UI, and Project Creation detailed UI level.

Verified completed preparation:

1. Required source documents are present and have been opened.
2. The Cursor Project Rule file is placed under `.cursor/rules/` and has normalized frontmatter.
3. All 28 mockup paths have been verified and opened.
4. Mockup directories use the documented lowercase names.
5. The initial README exists.
6. `.gitignore` exists.
7. The repository has been initialized with Git.
8. One React, TypeScript, and Vite frontend exists under `frontend/`.
9. The responsive AppShell, DesktopSidebar, MobileBottomNavigation, and approved route skeleton exist.
10. The Home / Project List detailed UI exists under `/` and renders from centralized typed project fixtures.
11. The Project Creation detailed UI exists under `/projects/new` with controlled form state and client-side validation.

The frontend foundation exists, and the first two detailed static screens, Home / Project List and Project Creation, have been implemented.

Backend, API, and database implementation must wait until their detailed contracts are documented.

The next recommended task is:

> Implement the Continuous Project Detail static UI from inspected mockups, using shared components and centralized dummy-data boundaries where needed.
