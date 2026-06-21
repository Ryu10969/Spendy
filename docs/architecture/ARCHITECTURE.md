# SplitMate Architecture

## 0. Document Information

| Item                         | Value                               |
| ---------------------------- | ----------------------------------- |
| Product                      | SplitMate                           |
| Document                     | Architecture                        |
| Status                       | Approved for initial implementation |
| Product requirements         | `PRODUCT_CHARTER.md`                |
| UI specification             | `docs/ui/MOCKUP_INDEX.md`           |
| Technical decisions          | `docs/adr/`                         |
| Current implementation state | `docs/current/CURRENT_STATE.md`     |

This document defines the technical structure of SplitMate.

It controls:

* Repository structure
* Frontend architecture
* Backend architecture
* Database boundaries
* API communication
* State management
* Settlement calculation
* Dummy-data migration
* Responsive implementation
* Testing strategy
* Error handling
* Security boundaries
* Deployment structure

This document must be read before creating or materially modifying application code.

---

# 1. Architectural Goals

SplitMate must be:

* Fast to implement
* Easy to understand
* Safe to modify with Cursor
* Testable
* Responsive
* Replaceable from dummy data to API data
* Suitable as a portfolio project
* Maintainable without unnecessary abstraction

The architecture must support:

* Continuous projects
* Event projects
* Monthly expense scopes
* Project-wide event scopes
* Settlement calculation
* Settlement completion state
* Event archiving
* Analytics
* Desktop and smartphone UI
* Server-side data persistence

---

# 2. Architectural Non-Goals

The MVP architecture does not need to support:

* Microservices
* Event-driven distributed systems
* Kubernetes
* Multiple databases
* CQRS
* Event sourcing
* GraphQL
* WebSocket synchronization
* Authentication providers
* Complex permission hierarchies
* Native mobile applications
* Multi-region deployment
* AI infrastructure
* OCR pipelines

Do not introduce these technologies during MVP implementation.

---

# 3. System Architecture

SplitMate uses a three-layer web application architecture.

```text
Browser
  ↓ HTTPS / JSON
React + TypeScript frontend
  ↓ REST API
Spring Boot backend
  ↓ JPA / SQL
PostgreSQL
```

Supporting components:

```text
Flyway
  → Database schema migration

Docker Compose
  → Local frontend, backend, and database orchestration

Centralized fixtures
  → Initial UI and demo data

Recharts
  → Analytics visualization
```

---

# 4. Technology Stack

## 4.1 Frontend

* React
* TypeScript
* Vite
* React Router
* TanStack Query
* React Hook Form
* Zod
* Recharts
* CSS Modules or a single approved styling strategy

The project must not mix multiple styling systems without an explicit decision.

For example, do not combine all of the following:

* CSS Modules
* Tailwind CSS
* styled-components
* Emotion
* large global stylesheet

Select one primary styling approach before implementation.

Initial approved approach:

> CSS Modules with shared design tokens and limited global base styles.

---

## 4.2 Backend

* Java 21
* Spring Boot
* Spring Web
* Spring Data JPA
* Bean Validation
* Flyway
* PostgreSQL JDBC driver
* JUnit
* Mockito
* Spring Boot Test

Spring Security is not required during the no-login MVP unless it is used only for basic transport-level configuration.

Do not introduce authentication filters, JWT handling, or OAuth configuration.

---

## 4.3 Database

* PostgreSQL

Database values must use:

* `BIGINT` for JPY amounts
* UUIDs for internal primary identifiers
* Separate public access tokens for project URLs
* `DATE` for payment dates
* Timestamp types for creation and update metadata

Do not use floating-point types for monetary values.

Forbidden monetary column types:

* `REAL`
* `FLOAT`
* `DOUBLE PRECISION`

---

## 4.4 Infrastructure

* Docker
* Docker Compose
* Environment-variable configuration
* Separate development and production settings

The local environment should be startable through one documented command or a small documented command set.

---

# 5. Repository Structure

Approved repository structure:

```text
splitmate/
├── PRODUCT_CHARTER.md
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│
├── backend/
│   ├── build.gradle
│   ├── settings.gradle
│   └── src/
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
│   └── current/
│       └── CURRENT_STATE.md
│
└── .cursor/
    └── rules/
        └── splitmate-core.mdc
```

Frontend and backend are separate applications inside one repository.

Do not create:

* A second frontend
* A second backend
* Duplicate experimental implementations
* Legacy and new implementations of the same feature

---

# 6. Frontend Architecture

## 6.1 Frontend responsibility

The frontend is responsible for:

* Rendering the UI
* User input
* Client-side validation
* Responsive presentation
* Navigation
* Calling backend APIs
* Displaying loading and error states
* Chart rendering
* Temporary local UI state
* Dummy-data mode during initial development

The frontend is not the source of truth for:

* Persistent projects
* Persistent expenses
* Settlement completion state
* Archive state
* Final settlement calculations

Final business calculations must be provided or validated by the backend.

---

## 6.2 Frontend directory structure

```text
frontend/src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   ├── queryClient.ts
│   └── providers/
│
├── components/
│   ├── layout/
│   ├── navigation/
│   ├── feedback/
│   └── common/
│
├── features/
│   ├── projects/
│   ├── expenses/
│   ├── settlements/
│   └── analytics/
│
├── pages/
│   ├── HomePage/
│   ├── ProjectCreatePage/
│   ├── ContinuousProjectPage/
│   ├── EventProjectPage/
│   ├── GlobalExpenseCreatePage/
│   └── AnalyticsPage/
│
├── api/
│   ├── client.ts
│   ├── projectApi.ts
│   ├── expenseApi.ts
│   ├── settlementApi.ts
│   └── analyticsApi.ts
│
├── mocks/
│   ├── fixtures/
│   └── mockRepositories/
│
├── hooks/
├── utils/
├── types/
├── styles/
│   ├── globals.css
│   ├── tokens.css
│   └── breakpoints.css
│
└── main.tsx
```

---

## 6.3 Feature boundaries

### `features/projects`

Contains:

* Project cards
* Project forms
* Project type display
* Member management UI
* Archive-related project UI

### `features/expenses`

Contains:

* Expense form
* Expense list
* Expense filters
* Expense formatting
* Expense validation schema

### `features/settlements`

Contains:

* Settlement result cards
* Settlement transaction rows
* Completion actions
* Member balance display
* Rounding-difference display

### `features/analytics`

Contains:

* KPI cards
* Category charts
* Member charts
* Monthly trend charts
* Analytics filters
* Analytics data adapters

Feature directories must not import page-specific components from `pages/`.

Pages may compose feature components.

---

# 7. Frontend Routing

Approved route structure:

```text
/
  → Home / Project List

/projects/new
  → Project Creation

/p/:publicToken
  → Project Detail dispatcher

/p/:publicToken/expenses/new
  → Optional full-page expense creation

/expenses/new
  → Global Expense Creation

/analytics
  → Analytics

/p/:publicToken/edit
  → Project Edit
```

The project-detail dispatcher must determine whether the project is:

* Continuous
* Event
* Archived event

It then renders the appropriate presentation.

Do not expose internal database UUIDs as primary user-facing route identifiers.

Use the project’s public access token in URLs.

---

# 8. Project URL and Public Token

Each project has:

* Internal UUID
* Public access token

Example URL:

```text
/p/2fQ8mK7xP4vN9cR6
```

The public token must:

* Be generated by the backend
* Be sufficiently difficult to guess
* Be unique
* Not contain sequential database IDs
* Be treated as a secret-like access capability

The token is not authentication.

Anyone with the URL may access the project according to MVP policy.

The UI must not display the internal project UUID.

---

# 9. Frontend State Management

State must be separated into three categories.

## 9.1 Server state

Managed through TanStack Query.

Examples:

* Project list
* Project detail
* Expenses
* Settlement runs
* Analytics data
* Archive state

Server state must not be duplicated into a global client store without a specific reason.

---

## 9.2 Form state

Managed through React Hook Form and Zod.

Examples:

* Project creation
* Project editing
* Expense creation
* Analytics filters where appropriate

Client-side validation must correspond with backend validation.

Client-side validation does not replace backend validation.

---

## 9.3 Local UI state

Managed with component state or narrowly scoped context.

Examples:

* Open or closed modal
* Expanded analytics section
* Selected mobile tab
* Temporary filter panel state
* Selected reference member
* Confirmation dialog state

Do not create a large global state store for simple UI state.

Redux is not required for the MVP.

---

# 10. Frontend Data Access Boundary

Components must not call `fetch` directly.

All network access must pass through:

```text
frontend/src/api/
```

Feature components consume typed API functions or query hooks.

Presentation components must not know whether data comes from:

* Dummy fixtures
* Mock repository
* REST API

Use a repository or adapter boundary where required.

Approved initial transition:

```text
UI
  ↓
Feature hook
  ↓
ProjectRepository interface
  ├── MockProjectRepository
  └── ApiProjectRepository
```

Do not build a large generic repository framework.

Only create boundaries needed to replace dummy data safely.

---

# 11. Dummy Data Architecture

## 11.1 Initial mode

The first UI implementation may run entirely from centralized dummy data.

Approved locations:

```text
frontend/src/mocks/fixtures/
frontend/src/mocks/mockRepositories/
```

Example:

```text
frontend/src/mocks/fixtures/projects.ts
frontend/src/mocks/fixtures/expenses.ts
frontend/src/mocks/fixtures/analytics.ts
```

---

## 11.2 Rules

Dummy data must be:

* Centralized
* Typed
* Reusable
* Realistic
* Deterministic
* Replaceable

Dummy data must not be embedded directly into:

* Project cards
* Chart components
* Expense rows
* Settlement components
* Page JSX

---

## 11.3 API migration

The UI must migrate from mock repositories to API repositories without changing component contracts.

Bad migration:

```text
Rewrite every component after backend completion.
```

Required migration:

```text
Mock repository
  ↓ replaced by
API repository

Page and feature component contracts remain stable.
```

---

# 12. UI Component Architecture

Expected shared components include:

```text
AppShell
DesktopSidebar
MobileBottomNavigation
PageHeader
ProjectCard
ProjectTypeBadge
MemberAvatar
MemberAvatarGroup
KpiCard
SettlementCard
SettlementTransferRow
MemberBalanceList
ExpenseList
ExpenseRow
SearchInput
MonthSelector
DateRangeFilter
CategoryFilter
ProjectTypeSelector
RoundingUnitSelector
ExpenseForm
ConfirmDialog
Modal
MobileSheet
ChartCard
EmptyState
ErrorState
LoadingState
ArchivedProjectSection
```

Do not create separate duplicate business components for desktop and smartphone.

Preferred approach:

```text
Shared data and behavior
+
Responsive presentation variants where necessary
```

A desktop modal and mobile sheet may have separate containers while sharing the same `ExpenseForm`.

---

# 13. Styling Architecture

## 13.1 Styling strategy

Approved strategy:

* CSS Modules for component styles
* Global reset and typography in `globals.css`
* Shared variables in `tokens.css`
* Breakpoint definitions in one shared file
* No inline styling for ordinary layouts

---

## 13.2 Design tokens

Tokens must include at minimum:

* Typography scale
* Spacing scale
* Border radius
* Border colors
* Surface colors
* Text colors
* Status colors
* Shadow levels
* Layout widths
* Navigation heights
* Z-index layers

Components should use tokens instead of arbitrary repeated values.

---

## 13.3 Breakpoints

Initial approved breakpoints:

```text
Mobile: below 768px
Tablet / compact desktop: 768px to 1199px
Desktop: 1200px and above
```

The mockups, not breakpoint numbers alone, define behavior.

Breakpoints may be adjusted after visual verification, but the change must be centralized.

---

## 13.4 Desktop and smartphone behavior

### Desktop

* Sidebar navigation
* Multi-column cards
* Wider content area
* Modal expense form
* Side-by-side settlement and history panels
* Expanded analytics where mockups require

### Smartphone

* Bottom navigation
* Single-column flow
* Large touch targets
* Mobile sheet or full-page form
* Collapsible analytics
* Stacked filters
* No horizontal page overflow

Do not implement smartphone UI by applying only `width: 100%` to desktop layouts.

---

# 14. Mockup Implementation Policy

Before implementing a screen:

1. Read `PRODUCT_CHARTER.md`.
2. Read `docs/ui/MOCKUP_INDEX.md`.
3. Open all referenced desktop images.
4. Open all referenced smartphone images.
5. Compare layout differences.
6. Identify mockup defects.
7. Identify reusable components.
8. Identify affected files.
9. Explain the plan.

The application must not load mockup images at runtime.

Mockups are development references only.

Do not place mockup files in:

```text
frontend/public/
frontend/src/assets/
```

unless they are separately approved production assets.

---

# 15. Backend Architecture

## 15.1 Backend responsibility

The backend is responsible for:

* Project persistence
* Member persistence
* Expense persistence
* Expense allocation
* Settlement calculation
* Settlement snapshots
* Settlement completion status
* Archive enforcement
* Analytics aggregation
* Business validation
* Public-token resolution
* Error responses

---

## 15.2 Backend package structure

```text
backend/src/main/java/.../splitmate/
├── project/
│   ├── controller/
│   ├── service/
│   ├── domain/
│   ├── repository/
│   └── dto/
│
├── expense/
│   ├── controller/
│   ├── service/
│   ├── domain/
│   ├── repository/
│   └── dto/
│
├── settlement/
│   ├── controller/
│   ├── service/
│   ├── domain/
│   ├── repository/
│   └── dto/
│
├── analytics/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   └── dto/
│
├── common/
│   ├── exception/
│   ├── validation/
│   ├── config/
│   └── response/
│
└── SplitMateApplication.java
```

Package-by-feature is preferred over one global package for all controllers, services, and repositories.

---

# 16. Backend Layer Responsibilities

## 16.1 Controller

Controllers must:

* Accept HTTP requests
* Validate request DTOs
* Call application services
* Return response DTOs
* Select correct HTTP status codes

Controllers must not:

* Contain settlement algorithms
* Access repositories directly
* Return JPA entities
* Implement archive rules
* Construct complex analytics queries

---

## 16.2 Service

Services must:

* Enforce business rules
* Coordinate repositories
* Define transaction boundaries
* Call calculation components
* Map domain results to response DTOs

---

## 16.3 Domain

Domain objects and calculation components contain:

* Project-type rules
* Expense-allocation rules
* Member-balance rules
* Settlement optimization
* Rounding behavior
* Archive mutation checks

Calculation logic should be testable without starting Spring.

---

## 16.4 Repository

Repositories are responsible only for persistence access.

Do not place presentation formatting or HTTP decisions in repositories.

---

## 16.5 DTO

Request and response DTOs must be separate from persistence entities.

Do not expose:

* Internal entity structure
* Lazy-loaded relationships
* Internal UUIDs when unnecessary
* Database-specific fields

---

# 17. Domain Model

Core entities:

```text
Project
ProjectMember
Expense
ExpenseParticipant
SettlementRun
SettlementBalance
SettlementTransfer
```

Optional supporting value objects:

```text
MoneyAmount
ProjectPublicToken
SettlementScope
ExpenseCategory
RoundingUnit
```

---

# 18. Project Entity

Proposed fields:

```text
Project
- id: UUID
- publicToken: String
- name: String
- description: String?
- type: CONTINUOUS | EVENT
- currency: JPY
- roundingUnit: 1 | 10 | 100 | 1000
- status: ACTIVE | ARCHIVED
- createdAt: Timestamp
- updatedAt: Timestamp
- archivedAt: Timestamp?
```

Rules:

* Currency is JPY during MVP.
* Archived projects cannot be mutated.
* Only event projects use the MVP archive flow.
* Public token is unique.
* Project type cannot change after expenses exist.

---

# 19. Project Member Entity

Proposed fields:

```text
ProjectMember
- id: UUID
- projectId: UUID
- name: String
- displayOrder: Integer
- active: Boolean
- createdAt: Timestamp
```

Members are project-local identities.

A member named “Alice” in one project is not the same entity as “Alice” in another project.

---

## 19.1 Member deletion policy

Physical deletion is not allowed after a member is referenced by an expense.

Approved behavior:

* Unused member: may be removed
* Referenced member: may only be deactivated
* Deactivated member remains visible in historical expenses
* Deactivated member cannot be selected for new expenses

This prevents historical corruption.

---

# 20. Expense Entity

Proposed fields:

```text
Expense
- id: UUID
- projectId: UUID
- payerMemberId: UUID
- amount: Long
- content: String
- category: FOOD | UTILITIES | TRANSPORTATION |
            ACCOMMODATION | DAILY_NECESSITIES |
            ENTERTAINMENT | OTHER | null
- note: String?
- paidOn: Date
- createdAt: Timestamp
- updatedAt: Timestamp
```

Rules:

* Amount must be greater than zero.
* Amount must be an integer.
* Payer must belong to the project.
* Archived projects reject creation and modification.
* `paidOn` controls monthly scope.
* `createdAt` controls audit ordering only.

---

# 21. Expense Participant Entity

Proposed fields:

```text
ExpenseParticipant
- id: UUID
- expenseId: UUID
- memberId: UUID
- allocatedShare: Long
- allocationOrder: Integer
```

The allocated share must be stored.

Reason:

* Preserves exact historical calculation
* Prevents changed ordering from altering old expenses
* Makes analytics reproducible
* Makes settlement recalculation deterministic
* Keeps the sum equal to the original expense amount

Constraint:

```text
Sum of allocatedShare for one expense
=
Expense.amount
```

---

# 22. Expense Allocation Algorithm

Expense amounts are divided equally among selected participants.

Given:

```text
amount = A
participant count = N
```

Calculate:

```text
baseShare = floor(A / N)
remainder = A mod N
```

Each participant receives `baseShare`.

The remaining yen are distributed one yen at a time to the first `remainder` participants.

The participant order is deterministic:

1. Project member `displayOrder`
2. Member UUID as a final tie-breaker

Example:

```text
Amount: ¥1,000
Participants: A, B, C

Base share: ¥333
Remainder: ¥1

Allocated shares:
A: ¥334
B: ¥333
C: ¥333
```

The allocation must be calculated and persisted when the expense is created or updated.

Random allocation is forbidden.

---

# 23. Settlement Scope

Settlement scope differs by project type.

## 23.1 Continuous project

Scope:

```text
YEAR_MONTH
```

Example:

```text
2026-06
```

Only expenses whose `paidOn` falls inside the selected month are included.

---

## 23.2 Event project

Scope:

```text
PROJECT
```

All project expenses are included.

---

# 24. Member Balance Calculation

For each member in a settlement scope:

```text
paidAmount
=
sum of expense amounts where the member is payer

burdenAmount
=
sum of stored allocated shares for the member

exactBalance
=
paidAmount - burdenAmount
```

Interpretation:

* Positive: should receive
* Negative: should pay
* Zero: settled before transfer calculation

All values use integer yen.

---

# 25. Settlement Optimization Algorithm

## 25.1 Input

A list of members with non-zero exact balances.

Separate into:

* Creditors: positive balances
* Debtors: negative balances

---

## 25.2 Ordering

For deterministic output:

Creditors are ordered by:

1. Highest receivable amount
2. Member display order
3. Member UUID

Debtors are ordered by:

1. Highest payable amount
2. Member display order
3. Member UUID

---

## 25.3 Matching

Use a two-pointer greedy matching algorithm.

For each debtor and creditor:

```text
transfer =
min(debtor remaining debt, creditor remaining credit)
```

Create a direct transfer.

Continue until all exact balances are resolved.

This produces at most:

```text
number of non-zero members - 1
```

transfers in ordinary cases.

The algorithm must be implemented as a pure calculation component and covered by unit tests.

---

# 26. Settlement Rounding

## 26.1 Exact calculation first

All member balances and optimized transfers are first calculated at one-yen precision.

Project rounding is applied only after the exact transfer plan exists.

---

## 26.2 Rounded transfer

Each exact transfer is rounded to the nearest configured project unit.

Approved rule:

```text
HALF_UP
```

Examples:

```text
¥1,234 at ¥10 unit   → ¥1,230
¥1,235 at ¥10 unit   → ¥1,240
¥1,499 at ¥1,000 unit → ¥1,000
¥1,500 at ¥1,000 unit → ¥2,000
```

---

## 26.3 Rounding difference

Rounding can produce a difference between:

* Exact member balance
* Rounded transfer total

The system must calculate and expose this difference.

Proposed response fields:

```text
exactAmount
roundedAmount
roundingDifference
```

The UI may primarily display `roundedAmount`.

If a non-zero difference exists, the UI must show a clear rounding note or adjustment summary.

The difference must not be silently discarded from stored calculation data.

---

## 26.4 Conservation rule

Each rounded transfer always has one sender and one receiver with the same amount.

Therefore:

```text
total rounded outgoing
=
total rounded incoming
```

Member-level residual differences may remain because of configured rounding.

These residuals are informational and do not create hidden transactions.

---

# 27. Settlement Snapshot Architecture

Settlement results must use immutable calculation snapshots.

Entity:

```text
SettlementRun
- id: UUID
- projectId: UUID
- scopeType: YEAR_MONTH | PROJECT
- scopeKey: String
- calculationVersion: Integer
- status: CURRENT | STALE | SUPERSEDED
- generatedAt: Timestamp
```

Related entities:

```text
SettlementBalance
- id: UUID
- settlementRunId: UUID
- memberId: UUID
- paidAmount: Long
- burdenAmount: Long
- exactBalance: Long
- roundedTransferNet: Long
- roundingDifference: Long
```

```text
SettlementTransfer
- id: UUID
- settlementRunId: UUID
- fromMemberId: UUID
- toMemberId: UUID
- exactAmount: Long
- roundedAmount: Long
- status: OUTSTANDING | COMPLETED
- completedAt: Timestamp?
```

---

# 28. Settlement Recalculation Policy

When a relevant expense is:

* Added
* Updated
* Deleted

the current settlement run for that scope becomes:

```text
STALE
```

The system then generates a new settlement run either:

* Immediately after the mutation, or
* On the next settlement request

Initial approved approach:

> Recalculate immediately inside the same backend transaction after successful expense mutation.

The new run becomes `CURRENT`.

The previous run becomes `SUPERSEDED`.

---

## 28.1 Completion status rule

Completed transfer statuses belong only to the settlement run where they were recorded.

They must not be silently copied to a newly calculated transfer.

Reason:

* Participants may change
* Amounts may change
* Transfer direction may change
* Transfer order may change

The UI must warn when recalculation creates a new settlement plan after completed transfers exist.

Historical completed transfers remain available for audit and display.

Cursor must not map completion by array index or row order.

---

# 29. Event Project Archive Architecture

Archiving an event project requires:

* Event project type
* Active project status
* Explicit confirmation from the client

Archive service behavior:

1. Verify project exists.
2. Verify project type is EVENT.
3. Verify project is ACTIVE.
4. Mark project ARCHIVED.
5. Store `archivedAt`.
6. Reject future mutation requests.

All mutation services must call a shared guard:

```text
assertProjectMutable(project)
```

Do not rely only on hiding frontend buttons.

Backend enforcement is mandatory.

---

# 30. Analytics Architecture

## 30.1 Analytics responsibility

The backend provides aggregated analytics DTOs.

The frontend renders them.

The frontend must not download all historical expenses only to calculate every chart in the browser once the backend is connected.

---

## 30.2 Continuous-project analytics

Backend aggregation may include:

```text
ProjectMonthlyAnalytics
- month
- totalExpense
- averagePerActiveMember
- previousMonthDifference
- previousMonthPercentage
- categoryBreakdown[]
- memberPaidAmounts[]
- memberBurdenAmounts[]
```

---

## 30.3 Cross-project analytics

Dedicated Analytics screen may use:

```text
AnalyticsOverview
- period
- totalExpense
- previousPeriodDifference
- monthlyTrend[]
- categoryBreakdown[]
- projectComparison[]
- memberRanking[]
```

Event-project inclusion must be explicit in the request and response.

Suggested filter:

```text
projectType:
- CONTINUOUS
- EVENT
- ALL
```

Default for long-term analytics:

```text
CONTINUOUS
```

---

## 30.4 Division by zero

Percentage comparisons must handle zero previous-period values.

Do not return:

* Infinity
* NaN
* Invalid decimal values

Response may use:

```text
percentageChange: null
comparisonState: NO_PREVIOUS_DATA
```

---

# 31. API Architecture

REST endpoints use JSON.

Initial resource structure:

```text
GET    /api/projects
POST   /api/projects

GET    /api/projects/{publicToken}
PATCH  /api/projects/{publicToken}

POST   /api/projects/{publicToken}/members
PATCH  /api/projects/{publicToken}/members/{memberId}

GET    /api/projects/{publicToken}/expenses
POST   /api/projects/{publicToken}/expenses
PATCH  /api/projects/{publicToken}/expenses/{expenseId}
DELETE /api/projects/{publicToken}/expenses/{expenseId}

GET    /api/projects/{publicToken}/settlements
PATCH  /api/projects/{publicToken}/settlements/transfers/{transferId}

POST   /api/projects/{publicToken}/archive

GET    /api/projects/{publicToken}/analytics
GET    /api/analytics
```

Exact request and response schemas belong in:

```text
docs/api/API_SPEC.md
```

---

# 32. API Response Rules

## 32.1 Money

Money is transferred as JSON integers.

Example:

```json
{
  "amount": 182433
}
```

Do not transfer formatted currency strings as the only value.

Formatting belongs to the frontend.

---

## 32.2 Dates

Payment dates use:

```text
YYYY-MM-DD
```

Timestamps use ISO 8601.

---

## 32.3 Enums

API enums use stable uppercase English identifiers.

Example:

```text
CONTINUOUS
EVENT
ACTIVE
ARCHIVED
FOOD
UTILITIES
```

Frontend maps them to Japanese labels.

---

## 32.4 Error format

All backend errors should follow one structure.

Example:

```json
{
  "code": "PROJECT_ARCHIVED",
  "message": "Archived projects cannot be modified.",
  "fieldErrors": [],
  "timestamp": "2026-06-21T12:00:00Z"
}
```

Validation example:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "fieldErrors": [
    {
      "field": "amount",
      "message": "Amount must be greater than zero."
    }
  ],
  "timestamp": "2026-06-21T12:00:00Z"
}
```

---

# 33. Database Architecture

Database migrations are managed only through Flyway.

Approved migration location:

```text
backend/src/main/resources/db/migration/
```

Example:

```text
V1__create_projects.sql
V2__create_project_members.sql
V3__create_expenses.sql
V4__create_expense_participants.sql
V5__create_settlement_tables.sql
```

Do not edit an already-applied migration.

Create a new migration for every schema change.

---

## 33.1 Referential integrity

Database foreign keys must protect:

* Member-to-project relationship
* Expense-to-project relationship
* Payer-to-project-member relationship
* Participant-to-expense relationship
* Settlement-to-project relationship
* Transfer-member relationships

Application validation and database constraints must work together.

---

## 33.2 Deletion policy

Initial approved behavior:

* Projects: no physical deletion in MVP UI
* Referenced members: deactivate, do not delete
* Expenses: physical deletion allowed only while project is active
* Archived projects: no mutation
* Settlement runs: retained for history
* Settlement transfers: retained with their run

If project deletion is introduced later, use a documented soft-delete policy.

---

# 34. Transaction Boundaries

The following operations must be transactional:

* Project creation with initial members
* Expense creation with participant allocation
* Expense update with allocation replacement
* Expense deletion and settlement recalculation
* Settlement-run generation
* Settlement-transfer completion
* Event project archive

A failed operation must not leave partially persisted data.

---

# 35. Concurrency and Versioning

Projects and mutable aggregate entities should use optimistic locking.

Proposed field:

```text
version: Long
```

Use JPA `@Version` where appropriate.

This protects against:

* Two users editing the same expense
* Concurrent settlement-status updates
* Archive and expense creation occurring at the same time

Conflict responses should use:

```text
409 Conflict
```

The frontend must show a clear reload-and-retry message.

---

# 36. Validation Architecture

Validation occurs at three levels.

## Frontend

Provides immediate user feedback.

## Backend DTO

Rejects structurally invalid requests.

## Domain/service

Rejects business-rule violations.

Examples of domain validation:

* Payer does not belong to project
* Participant does not belong to project
* Archived project mutation
* Event-only archive operation
* Invalid project-type change
* Duplicate participants
* No active members
* Expense amount mismatch

Frontend validation must not be trusted as the only validation.

---

# 37. Security Architecture

The MVP has no login, but still requires basic security.

Required protections:

* Unpredictable public project tokens
* Server-side input validation
* SQL injection protection through parameterized persistence
* Maximum input lengths
* CORS restricted to approved frontend origins
* No sensitive data in logs
* No internal IDs exposed unnecessarily
* Production HTTPS
* Environment variables for secrets
* Rate limiting considered before public launch

The product must clearly communicate that a project URL grants access.

Do not describe the no-login model as private authentication.

---

# 38. Logging and Observability

Backend logs should include:

* Request correlation ID
* Error code
* Project internal ID where safe
* Operation name
* Execution failure details

Backend logs must not include:

* Full public tokens
* Notes containing user-entered sensitive text
* Entire request bodies
* Database passwords
* Environment secrets

Frontend should show user-facing errors without exposing stack traces.

---

# 39. Error Handling

## Frontend states

Every data-driven page must support:

* Loading
* Success
* Empty
* Error

Examples:

```text
Project not found
No expenses for selected month
Analytics unavailable
Save failed
Project is archived
```

Do not leave blank screens after API failure.

---

## Backend exceptions

Use centralized exception handling.

Suggested exception types:

```text
ResourceNotFoundException
ValidationException
ProjectArchivedException
ConflictException
SettlementCalculationException
```

Do not catch generic exceptions in every controller.

---

# 40. Testing Strategy

## 40.1 Backend unit tests

Required for:

* Expense allocation
* Remainder distribution
* Member-balance calculation
* Settlement optimization
* Tie-breaking
* Rounding
* Rounding differences
* Settlement snapshot generation
* Archive mutation guard

---

## 40.2 Backend integration tests

Required for:

* Project creation
* Expense persistence
* Monthly filtering
* Event project-wide settlement
* Settlement completion
* Recalculation after expense mutation
* Archived-project rejection
* Flyway migrations

Use a real PostgreSQL-compatible test environment where practical.

---

## 40.3 Frontend tests

Required for critical behavior:

* Project form validation
* Expense form validation
* Participant default selection
* Archived project control removal
* Mobile analytics collapse
* API error display
* Money formatting

---

## 40.4 End-to-end tests

At least the following flows should be automated before final portfolio completion:

### Continuous project

1. Create project.
2. Add members.
3. Add expenses.
4. Change month.
5. Review settlement.
6. Review analytics.

### Event project

1. Create project.
2. Add expenses.
3. Review final settlement.
4. Mark transfer completed.
5. Complete settlement.
6. Confirm archive.
7. Verify read-only state.

---

# 41. Money Formatting

Frontend money formatting must use one shared utility.

Example API:

```text
formatYen(182433)
→ ¥182,433
```

The utility must:

* Reject non-finite numbers
* Never show decimals
* Format negative balances consistently
* Avoid duplicated formatting logic

Do not manually format yen inside individual components.

---

# 42. Date and Time Handling

Payment dates are business dates and must not shift because of timezone conversion.

Use:

```text
LocalDate
```

on the backend for `paidOn`.

Do not store payment dates as UTC timestamps.

Creation and update timestamps use timezone-aware timestamps.

The frontend should send payment dates as `YYYY-MM-DD`.

---

# 43. Accessibility Architecture

Reusable components must support:

* Semantic HTML
* Keyboard navigation
* Visible focus
* Accessible form labels
* Dialog focus trapping
* Escape-to-close where appropriate
* Screen-reader-friendly error messages
* Button labels for icon-only actions

Charts must include a textual summary or accessible data representation where practical.

---

# 44. Deployment Architecture

Initial deployment consists of:

```text
Frontend hosting
+
Backend hosting
+
Managed PostgreSQL
```

The provider is not fixed by this document.

Deployment configuration must support:

* Environment-specific API URL
* Database connection URL
* CORS origin configuration
* Production HTTPS
* Flyway migration on deployment
* Health-check endpoint

Suggested backend health endpoint:

```text
/actuator/health
```

Do not expose unnecessary actuator endpoints publicly.

---

# 45. Environment Variables

Example frontend variables:

```text
VITE_API_BASE_URL
VITE_DATA_SOURCE
```

Example backend variables:

```text
SPRING_DATASOURCE_URL
SPRING_DATASOURCE_USERNAME
SPRING_DATASOURCE_PASSWORD
FRONTEND_ALLOWED_ORIGIN
PROJECT_TOKEN_SECRET
```

`.env.example` must contain names and safe examples only.

Real secrets must never be committed.

---

# 46. Implementation Phases

## Phase 1: Documentation and files

* Product Charter
* Mockup Index
* Architecture
* ADR
* Cursor Rules
* README
* Current State

## Phase 2: Static frontend

* App shell
* Desktop navigation
* Smartphone navigation
* Home
* Project creation
* Continuous project
* Event project
* Expense forms
* Analytics

## Phase 3: Centralized dummy data

* Project fixtures
* Expense fixtures
* Settlement fixtures
* Analytics fixtures
* Screen interactions

## Phase 4: Frontend domain behavior

* Form validation
* Filters
* Responsive states
* Modal and sheet behavior
* Local mock repository operations

## Phase 5: Backend foundation

* Spring Boot application
* PostgreSQL
* Flyway
* Project API
* Expense API

## Phase 6: Core calculations

* Expense allocation
* Member balances
* Settlement optimization
* Rounding
* Settlement snapshots

## Phase 7: Integration

* Replace mock repositories
* Connect API
* Error handling
* Loading states
* Cache invalidation

## Phase 8: Completion

* Archive flow
* Analytics API
* Automated tests
* Deployment
* README screenshots
* Demo verification

---

# 47. Prohibited Architectural Patterns

Cursor must not:

* Create a second application for mobile
* Duplicate desktop and smartphone business logic
* Put settlement logic in React components
* Put business logic in controllers
* Return JPA entities directly
* Use floating-point monetary values
* Store final project data only in localStorage
* Hard-code mockup data into reusable components
* Recalculate historical expense shares from mutable member order
* Reassign completed settlement flags by row index
* Allow frontend-only archive enforcement
* Add authentication
* Add multi-currency conversion
* Add OCR
* Add unrelated frameworks
* Create generic abstractions before two concrete uses exist
* Rewrite working architecture without an ADR

---

# 48. Architecture Change Policy

A change requires an ADR when it affects:

* Technology stack
* Repository structure
* Data persistence model
* Public URL strategy
* Money calculation
* Settlement snapshot behavior
* Authentication policy
* API style
* State-management strategy
* Styling strategy
* Deployment architecture

Minor implementation details do not require an ADR.

Cursor must not modify this architecture indirectly through code without updating documentation.

---

# 49. Required Reading Before Code Changes

Before modifying code, Cursor must read:

```text
PRODUCT_CHARTER.md
docs/architecture/ARCHITECTURE.md
docs/current/CURRENT_STATE.md
.cursor/rules/splitmate-core.mdc
```

For UI work, it must also read:

```text
docs/ui/MOCKUP_INDEX.md
```

and open every mockup referenced for the target screen.

For API or database work, it must also read:

```text
docs/api/API_SPEC.md
docs/database/DATABASE_DESIGN.md
```

when those documents exist.

---

# 50. Current Architectural Decision

The approved initial architecture is:

```text
Monorepo
+
React / TypeScript / Vite frontend
+
Spring Boot / Java 21 backend
+
PostgreSQL
+
Flyway
+
REST API
+
Centralized dummy-data adapters
+
Server-side settlement calculation
+
Immutable settlement snapshots
+
Responsive shared-component UI
```

The immediate next goal is:

> Implement the documented SplitMate screens from centralized dummy data without creating structures that must be discarded when the Spring Boot API is connected.
