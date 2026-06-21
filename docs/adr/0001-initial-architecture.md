# ADR-0001: Adopt a Monorepo with React, Spring Boot, and PostgreSQL

* Status: Accepted
* Date: 2026-06-21
* Decision owners: SplitMate project
* Related documents:

  * `PRODUCT_CHARTER.md`
  * `docs/architecture/ARCHITECTURE.md`
  * `docs/ui/MOCKUP_INDEX.md`
  * `docs/current/CURRENT_STATE.md`

---

## 1. Context

SplitMate is a responsive shared-expense management web application.

The product supports two different project types:

* Continuous projects for couples, roommates, and families
* Event projects for travel, parties, and temporary group activities

The MVP must support:

* Project creation
* Member management
* Expense registration
* Expense history
* Settlement calculation
* Settlement completion tracking
* Monthly filtering for continuous projects
* Analytics
* Event-project archiving
* Desktop and smartphone layouts
* Persistent server-side storage

The project will be developed mainly with AI-assisted coding through Cursor.

The architecture must therefore satisfy both product needs and development-control needs.

Important constraints include:

* The MVP should be completed quickly.
* The codebase must remain understandable.
* Cursor must not create duplicate implementations.
* Dummy-data UI must later connect to a backend without requiring a full rewrite.
* Money calculations must be deterministic and testable.
* Authentication is not included in the MVP.
* Native mobile applications are not included in the MVP.
* The project is intended to demonstrate modern frontend and Java backend skills as a portfolio.

---

## 2. Decision

SplitMate will use the following initial architecture:

```text
Monorepo
+
React / TypeScript / Vite frontend
+
Java 21 / Spring Boot backend
+
PostgreSQL database
+
Flyway migrations
+
REST API
+
Docker Compose for local development
+
Centralized dummy-data adapters
+
Server-side settlement calculation
+
Immutable settlement snapshots
```

The frontend and backend will be separate applications within one repository.

Approved high-level structure:

```text
splitmate/
├── PRODUCT_CHARTER.md
├── README.md
├── frontend/
├── backend/
├── docs/
├── .cursor/
├── docker-compose.yml
└── .env.example
```

---

## 3. Decision Details

### 3.1 Repository model

Use one Git repository containing:

* Frontend application
* Backend application
* Project documentation
* Database migrations
* Cursor Rules
* Docker Compose configuration

The frontend and backend remain independently buildable.

They must not be merged into one framework or one runtime.

---

### 3.2 Frontend

Use:

* React
* TypeScript
* Vite
* React Router
* TanStack Query
* React Hook Form
* Zod
* Recharts
* CSS Modules
* Shared design tokens

Frontend responsibilities include:

* UI rendering
* Responsive behavior
* Forms
* Client-side validation
* Navigation
* Loading and error states
* Chart rendering
* API communication
* Temporary local UI state

The frontend must not be the final source of truth for:

* Persistent projects
* Persistent expenses
* Archive status
* Settlement completion status
* Final settlement calculations

---

### 3.3 Backend

Use:

* Java 21
* Spring Boot
* Spring Web
* Spring Data JPA
* Bean Validation
* JUnit
* Mockito
* Spring Boot Test

Backend responsibilities include:

* Business-rule enforcement
* Data persistence
* Project-token resolution
* Expense allocation
* Member-balance calculation
* Settlement optimization
* Settlement snapshots
* Archive enforcement
* Analytics aggregation
* Validation
* Error responses

Business calculation logic must be testable independently of controllers and the Spring runtime where practical.

---

### 3.4 Database

Use PostgreSQL.

Database changes are managed only through Flyway migrations.

Money values use integer yen.

Approved monetary representation:

```text
Java: long / Long
PostgreSQL: BIGINT
JSON: integer
```

Floating-point values must not be used for money.

Primary database entities include:

* Project
* ProjectMember
* Expense
* ExpenseParticipant
* SettlementRun
* SettlementBalance
* SettlementTransfer

---

### 3.5 API style

Use REST over HTTPS with JSON.

Reasons:

* Easy integration with React
* Natural fit with Spring Boot
* Simple debugging
* Clear portfolio presentation
* Sufficient for the MVP
* No requirement for real-time bidirectional communication

The exact endpoint and DTO definitions belong in:

```text
docs/api/API_SPEC.md
```

---

### 3.6 Dummy-data transition

The first frontend implementation may use centralized dummy data.

Dummy data must be accessed behind a replaceable boundary.

Target flow:

```text
Page or feature component
    ↓
Feature hook
    ↓
Repository interface
    ├── Mock repository
    └── API repository
```

This boundary exists to allow the UI to be completed before the backend.

It must remain small and feature-specific.

Do not build a generic enterprise repository framework.

---

### 3.7 Calculation ownership

Final settlement calculation belongs to the backend.

The frontend may use temporary calculations during isolated mock development, but backend results become authoritative after API integration.

Core calculation responsibilities include:

* Equal expense allocation
* Deterministic remainder distribution
* Paid amount calculation
* Burden amount calculation
* Member balance calculation
* Minimum-transfer settlement generation
* Settlement-unit rounding
* Rounding-difference reporting

Calculation logic must not be embedded in React components.

---

### 3.8 Settlement persistence

Calculated settlements will use immutable snapshots.

A settlement run represents one calculation result for:

* A selected month in a continuous project
* The entire project in an event project

Settlement completion status belongs to the settlement transfer inside that run.

When expenses change:

* The existing run becomes stale or superseded.
* A new run is generated.
* Completion flags are not silently transferred to unrelated recalculated rows.

This prevents incorrect completion-state mapping after recalculation.

---

### 3.9 Project access

The MVP has no login.

Projects use:

* Internal UUID
* Public access token

The public token is used in user-facing URLs.

Example:

```text
/p/2fQ8mK7xP4vN9cR6
```

The token must be:

* Unique
* Backend-generated
* Difficult to guess
* Separate from the internal database ID

The public token is an access capability, not user authentication.

---

### 3.10 Responsive implementation

Use one React application for both desktop and smartphone.

Do not create:

* A separate mobile frontend
* Duplicate mobile business logic
* A native mobile application during MVP

Responsive behavior is implemented through:

* Shared components
* CSS breakpoints
* Desktop and mobile layout containers
* Desktop modal and mobile sheet variants where required

Business logic and form logic must remain shared.

---

### 3.11 Styling strategy

Use:

* CSS Modules for component styles
* Global reset and typography
* Centralized design tokens
* Centralized breakpoints

Do not mix multiple styling frameworks without a new decision.

Tailwind CSS, styled-components, Emotion, and other competing primary styling systems are not approved by this ADR.

---

### 3.12 Local development

Use Docker Compose to coordinate local infrastructure.

The intended local components are:

* Frontend
* Backend
* PostgreSQL

The development environment must also allow frontend and backend processes to run directly on the host when useful.

Docker must not make ordinary debugging unnecessarily difficult.

---

## 4. Decision Drivers

This architecture was selected based on the following priorities.

### 4.1 Existing developer experience

Java and relational database experience can be used directly in the backend.

React and TypeScript add a modern frontend skill set without abandoning existing strengths.

---

### 4.2 Portfolio value

The architecture demonstrates:

* Modern responsive frontend development
* Java backend development
* REST API design
* Relational data modeling
* Migration management
* Business-rule implementation
* Automated testing
* Full-stack integration

---

### 4.3 Fast MVP implementation

The selected stack allows:

* UI-first development with fixtures
* Independent frontend and backend work
* Progressive API integration
* Reuse of established frameworks
* Avoidance of unnecessary infrastructure

---

### 4.4 AI-assisted development control

A monorepo keeps:

* Requirements
* Architecture
* Mockups
* Frontend
* Backend
* Migrations
* Current state

inside one workspace.

This makes it easier for Cursor to inspect the required context while following explicit document priority.

---

### 4.5 Deterministic financial logic

Java services and PostgreSQL provide clear boundaries for:

* Integer money handling
* Transactions
* Constraints
* Settlement snapshots
* Archive enforcement
* Calculation tests

---

## 5. Alternatives Considered

### 5.1 Frontend-only application using localStorage

#### Description

Build the complete application only with React and store projects and expenses in browser storage.

#### Advantages

* Fastest initial implementation
* No backend deployment
* No database setup
* Simple local demonstration

#### Disadvantages

* Data is tied to one browser and device
* Shared project URLs cannot provide reliable shared data
* Browser clearing can remove data
* Weak portfolio demonstration of backend skills
* Archive and settlement state are not centrally authoritative
* Difficult to support long-term use

#### Decision

Rejected as the final MVP architecture.

Allowed only as a temporary prototype or mock stage.

---

### 5.2 Next.js full-stack application

#### Description

Use Next.js for frontend, server routes, and server-side persistence.

#### Advantages

* One framework
* Easy frontend/backend colocation
* Good deployment options
* Reduced repository complexity

#### Disadvantages

* Does not use Java/Spring Boot
* Reduces direct connection to the developer’s backend experience
* Makes the portfolio less representative of the intended Java full-stack direction
* Server and client responsibilities may become mixed during AI-assisted implementation

#### Decision

Rejected.

---

### 5.3 React frontend with Node.js backend

#### Description

Use TypeScript for both frontend and backend.

#### Advantages

* Shared language
* Potentially faster context switching
* Easy DTO and type sharing
* Large package ecosystem

#### Disadvantages

* Does not reinforce Java/Spring Boot experience
* Reduces the opportunity to demonstrate enterprise Java design
* The primary portfolio objective includes Java backend development

#### Decision

Rejected.

---

### 5.4 Spring Boot with server-rendered templates

#### Description

Use Spring Boot with Thymeleaf or another server-side HTML template engine.

#### Advantages

* Single deployment
* Simple backend-centered structure
* Reduced API layer
* Good for traditional CRUD applications

#### Disadvantages

* Less suitable for highly interactive responsive UI
* Harder to reproduce the supplied Figma-style application shell
* Weaker demonstration of modern React and TypeScript skills
* Chart and modal interactions become less natural

#### Decision

Rejected.

---

### 5.5 Native iOS and Android applications

#### Description

Build dedicated native or cross-platform mobile applications.

#### Advantages

* Strong mobile experience
* Camera and notification integration
* App-store distribution

#### Disadvantages

* Higher implementation cost
* Store-release overhead
* Additional platform-specific testing
* Desktop use becomes separate
* Not required for MVP use cases

#### Decision

Rejected for MVP.

A responsive web application is sufficient.

---

### 5.6 React Native with Expo

#### Description

Build a cross-platform mobile application using React Native.

#### Advantages

* Shared iOS and Android code
* Strong mobile UX
* Potential future camera and notification support

#### Disadvantages

* Desktop web is not the primary strength
* Additional native-platform behavior
* Store deployment remains necessary
* The current mockups and product direction are web-oriented

#### Decision

Rejected for MVP.

May be reconsidered after the web product is stable.

---

### 5.7 Microservices

#### Description

Separate project, expense, settlement, and analytics services.

#### Advantages

* Independent service scaling
* Strong service boundaries
* Independent deployment

#### Disadvantages

* Excessive operational complexity
* Distributed transactions
* More difficult debugging
* More difficult AI-assisted consistency
* No current scaling requirement
* Slower MVP delivery

#### Decision

Rejected.

Use one Spring Boot application organized by feature.

---

### 5.8 GraphQL

#### Description

Expose a GraphQL API between frontend and backend.

#### Advantages

* Flexible client queries
* Typed schema
* Potential reduction of over-fetching

#### Disadvantages

* Adds schema and resolver complexity
* No current data-fetching problem requires it
* REST is easier to document and demonstrate
* Spring Boot REST support is sufficient

#### Decision

Rejected.

---

### 5.9 NoSQL database

#### Description

Use MongoDB, Firebase, or another document database.

#### Advantages

* Flexible document structure
* Rapid prototyping
* Some providers include convenient hosting

#### Disadvantages

* The domain has strong relationships
* Expense participants require relational integrity
* Settlement history requires consistent references
* PostgreSQL better demonstrates SQL and data modeling
* Transactional behavior is important

#### Decision

Rejected.

---

### 5.10 Store only generated settlement rows

#### Description

Calculate settlements and overwrite the existing result each time expenses change.

#### Advantages

* Simple persistence
* Fewer tables
* Easy current-state display

#### Disadvantages

* Completed-transfer history can be lost
* Recalculation can incorrectly reassign status
* No audit trail
* Difficult to explain what changed
* Unsafe after partial settlement completion

#### Decision

Rejected.

Use immutable settlement runs and transfers.

---

### 5.11 Calculate all analytics in the browser

#### Description

Download every expense and aggregate charts in React.

#### Advantages

* Simple backend
* Fast early development
* Fewer analytics endpoints

#### Disadvantages

* Poor scalability
* Repeated client calculations
* Large payloads
* Duplicate business logic
* Different clients may produce inconsistent totals

#### Decision

Rejected for the completed MVP.

Allowed only for temporary dummy-data UI development.

---

### 5.12 Use floating-point money values

#### Description

Use Java `double`, JavaScript decimal numbers, and database floating-point columns.

#### Advantages

* Straightforward arithmetic
* Familiar primitive types

#### Disadvantages

* Precision errors
* Incorrect financial totals
* Decimal display defects
* Unstable rounding results

#### Decision

Rejected.

Use integer yen throughout the MVP.

---

## 6. Consequences

### 6.1 Positive consequences

* Frontend and backend responsibilities are clear.
* Existing Java skills remain relevant.
* React and TypeScript provide modern UI experience.
* Dummy-data development can begin before backend completion.
* PostgreSQL supports relational integrity and transactions.
* Calculation logic can be unit tested.
* The same repository contains all documentation and implementation.
* Responsive desktop and smartphone UI share business logic.
* Settlement history is protected from unsafe recalculation.
* The result is strong as a full-stack portfolio project.

---

### 6.2 Negative consequences

* Two application runtimes must be managed.
* API DTOs and frontend types must remain synchronized.
* Deployment requires separate frontend and backend configuration.
* Settlement snapshots increase database complexity.
* No-login access through project URLs is less secure than authenticated access.
* CSS Modules require manual design-token discipline.
* The initial documentation burden is larger than a simple prototype.
* Mock and API repository implementations require an explicit boundary.

These costs are accepted because they improve maintainability, portfolio quality, and calculation safety.

---

## 7. Risks and Mitigations

### Risk: Over-engineering before MVP completion

Mitigation:

* Do not introduce abstractions without concrete use.
* Keep one backend application.
* Keep repository adapters feature-specific.
* Implement only approved requirements.
* Use the Product Charter to control scope.

---

### Risk: Cursor creates duplicate implementations

Mitigation:

* Use one active frontend and one active backend.
* Require reading `CURRENT_STATE.md`.
* Search existing code before creating files.
* Prohibit parallel legacy and replacement implementations.
* Record architecture changes in ADRs.

---

### Risk: Mock UI must be rewritten after backend completion

Mitigation:

* Centralize fixtures.
* Use typed feature hooks.
* Keep presentation components independent of data source.
* Replace mock repositories with API repositories.

---

### Risk: Completed settlement status is corrupted after recalculation

Mitigation:

* Use immutable settlement runs.
* Keep completion status attached to one transfer in one run.
* Never remap status by array order.
* Preserve superseded runs.

---

### Risk: Public project URLs are guessed or leaked

Mitigation:

* Use strong random public tokens.
* Do not expose sequential IDs.
* Display access warnings.
* Restrict sensitive information entry.
* Consider rate limiting before public launch.
* Revisit authentication in a later ADR if required.

---

### Risk: Desktop and mobile code diverge

Mitigation:

* Use one React application.
* Share forms and feature logic.
* Separate only layout containers when necessary.
* Follow `MOCKUP_INDEX.md`.
* Test responsive states.

---

### Risk: Rounding produces confusing differences

Mitigation:

* Calculate at one-yen precision first.
* Apply project-unit rounding only to final transfers.
* Store exact and rounded values.
* Expose rounding differences.
* Cover edge cases with automated tests.

---

## 8. Implementation Constraints

The following are mandatory under this ADR:

* One repository
* One React frontend
* One Spring Boot backend
* One PostgreSQL database
* REST API
* Integer JPY amounts
* Flyway-managed schema
* Server-side authoritative calculations
* Centralized dummy data
* Responsive shared-component implementation
* Immutable settlement runs
* Public project tokens instead of sequential route IDs
* No authentication during MVP

---

## 9. Prohibited Changes Without a New ADR

A new or superseding ADR is required before changing any of the following:

* Replace React with another frontend framework
* Replace Spring Boot with another backend runtime
* Replace PostgreSQL with another primary database
* Replace REST with GraphQL
* Split the backend into microservices
* Introduce authentication
* Introduce native mobile applications
* Change integer-money representation
* Remove settlement snapshots
* Change the public-token access model
* Introduce a global frontend state-management framework
* Replace CSS Modules as the primary styling strategy
* Split the monorepo into separate repositories

---

## 10. Validation of the Decision

This decision is considered successful when:

* Static UI can run from centralized fixtures.
* Mock data can be replaced by API data without rewriting screen components.
* Project and expense data persist in PostgreSQL.
* Continuous and event projects share core structures but preserve different behavior.
* Settlement calculations are deterministic.
* Settlement completion history survives recalculation.
* Desktop and smartphone implementations share feature logic.
* Cursor can identify one authoritative implementation for each feature.
* The MVP can be deployed and demonstrated as a full-stack portfolio.

---

## 11. Follow-up Documentation

The following documents must be created or maintained after this ADR:

```text
.cursor/rules/splitmate-core.mdc
README.md
docs/current/CURRENT_STATE.md
docs/api/API_SPEC.md
docs/database/DATABASE_DESIGN.md
```

Potential future ADRs include:

```text
0002-use-mockups-as-ui-source-of-truth.md
0003-settlement-rounding-and-remainder-policy.md
0004-public-project-token-access.md
0005-settlement-snapshot-persistence.md
```

Separate ADRs should be created only when the decision requires more detail or changes independently from this initial architecture.

---

## 12. Final Decision Summary

SplitMate will be implemented as a monorepo containing a React and TypeScript frontend, a Java 21 and Spring Boot backend, and a PostgreSQL database.

The frontend will initially use centralized dummy-data adapters and later connect to REST APIs without changing its primary component contracts.

The backend will be authoritative for business rules, expense allocation, settlement calculation, archive enforcement, analytics aggregation, and persistent state.

Money will be represented as integer yen.

Settlement calculations will be persisted as immutable snapshots so that completed transfers are not incorrectly reassigned after expense changes.

This architecture is accepted as the baseline for MVP implementation.
