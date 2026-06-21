# SplitMate Product Charter

## 0. Document Information

| Item                          | Value                               |
| ----------------------------- | ----------------------------------- |
| Product                       | SplitMate                           |
| Document                      | Product Charter                     |
| Status                        | Approved for initial implementation |
| Scope                         | MVP and documented future phases    |
| Primary requirement source    | This document                       |
| UI reference source           | `docs/ui/MOCKUP_INDEX.md`           |
| Current implementation source | `docs/current/CURRENT_STATE.md`     |

This document defines what SplitMate is, which behavior it must provide, what is included in the MVP, and what must not be implemented yet.

When implementation, UI mockups, architecture, or existing code conflict with this document, the conflict must be reported before code is changed.

---

# 1. Product Overview

## 1.1 Product Name

**SplitMate**

---

## 1.2 Product Purpose

SplitMate is a responsive shared-expense management web application.

It supports both:

* Ongoing shared expenses
* One-time event expenses

The product allows a group to:

* Create expense-management projects
* Register who paid an expense
* Select who shares each expense
* Review expense history
* Calculate who should pay whom
* Track completed and outstanding settlements
* Review spending analytics
* Preserve historical expense data

SplitMate is not limited to one-time bill splitting.

Its primary differentiation is the combination of:

* Bill splitting
* Continuous expense logging
* Monthly expense management
* Spending analytics
* Multiple project management

---

## 1.3 Target Users

Primary users include:

* Couples living together
* Roommates
* Families sharing household expenses
* Travel groups
* Friend groups
* Small groups managing shared costs

---

## 1.4 Primary Use Cases

### Continuous shared living

Examples:

* Food
* Utilities
* Daily necessities
* Household equipment
* Transportation
* Rent-related shared costs

Users continuously record expenses and review them by month.

### One-time events

Examples:

* Travel
* Drinking parties
* Camping
* Group activities
* Short-term events

Users record all expenses, calculate one final settlement, and archive the project after completion.

---

# 2. Product Principles

SplitMate must prioritize:

1. Fast expense registration
2. Immediately understandable settlement results
3. Low user-operation cost
4. Long-term data preservation
5. Clear differences between continuous and event projects
6. Responsive usability on desktop and smartphone
7. Simple and predictable business rules
8. Fast MVP delivery without unnecessary features

The application must not become a general accounting system, payment platform, or household budgeting platform during the MVP.

---

# 3. Development Policy

The first implementation will be built using:

* Realistic dummy data
* Personal real-life usage assumptions
* Early interactive UI
* Incremental implementation
* Actual usage feedback

The development order is:

1. Documentation
2. Static responsive UI
3. Centralized dummy data
4. UI interactions
5. Core expense and settlement logic
6. Persistent backend storage
7. API integration
8. Tests and final verification

Dummy data is intentionally included in the initial implementation so that:

* Every screen can be reviewed before backend completion
* Charts can be visually verified
* Responsive behavior can be tested
* Business flows can be demonstrated
* Portfolio presentation can begin early

Dummy data must later be replaceable by API responses without rewriting presentation components.

---

# 4. MVP Definition

The MVP is the first usable version of SplitMate.

The MVP must support the complete flow from project creation to settlement review.

## 4.1 MVP includes

* No-login usage
* Active and archived project lists
* Continuous and event project types
* Project creation
* Project editing
* Member management
* Expense registration
* Expense history
* Expense search and filtering
* Settlement calculation
* Settlement transaction completion status
* Continuous-project monthly management
* Continuous-project analytics
* Event-project completion and archive flow
* Dedicated analytics screen using dummy data and later real data
* Desktop responsive UI
* Smartphone responsive UI
* Persistent data after backend integration

---

## 4.2 MVP does not include

* Authentication
* User registration
* OAuth
* Email invitations
* Permission management
* Multi-currency expense calculation
* Exchange-rate conversion
* Receipt OCR
* Receipt image analysis
* AI categorization
* AI spending advice
* Budget management
* Bank integration
* Card integration
* Actual money transfer
* Native iOS application
* Native Android application
* Push notifications
* External bill-splitting service scraping
* External bill-splitting service import
* Subscription billing
* Administration console
* Dark mode

These features must not be added unless the Product Charter is explicitly updated.

---

# 5. Authentication and Access Policy

## 5.1 No-login model

Authentication is not part of the MVP.

The MVP must not implement:

* Signup
* Login
* Passwords
* OAuth
* User accounts
* Email verification
* Account profiles
* Role-based access control

This decision reduces:

* Development time
* User onboarding friction
* Authentication complexity
* Portfolio implementation scope

---

## 5.2 Project access

Projects may be accessed through project-specific URLs.

Anyone who has access to the URL may be able to view or edit the project.

The application should display an appropriate warning:

> Anyone who knows this project URL may be able to view or edit the project. Do not enter sensitive personal information.

Security details and token design will be defined in `docs/architecture/ARCHITECTURE.md`.

---

## 5.3 “My balance” without authentication

Because the MVP has no authenticated user identity, the application must not automatically assume which project member represents the current user.

Where a mockup displays “My balance” or equivalent:

* Dummy-data mode may use a clearly defined demo member.
* Interactive mode may use a locally selected reference member.
* If no reference member is selected, the UI must show member balances instead of inventing a current user.

This must not introduce authentication.

---

# 6. Currency and Money Rules

## 6.1 MVP currency

The MVP currency is fixed to:

```text
JPY
```

The project-creation screen may display JPY, but users must not select another currency.

Multi-currency support belongs to a later phase.

---

## 6.2 Integer-only amounts

All monetary values must be handled and displayed as integers.

Decimal values must never be displayed.

Incorrect:

```text
¥182,433.333
```

Correct:

```text
¥182,433
```

Expense amount input must accept positive integers only.

---

## 6.3 Number formatting

Displayed JPY amounts must:

* Use the yen symbol or an agreed Japanese currency format
* Use thousands separators
* Contain no decimal places
* Use consistent negative and positive balance notation

Examples:

```text
¥182,433
+¥12,000
-¥8,500
```

---

# 7. Project Types

Project type is a required business concept.

Every project must be created as one of:

* Continuous project
* Event project

Project type determines:

* Settlement cycle
* Available analytics
* Archive behavior
* Project-detail presentation
* Filtering behavior
* Completion flow

Project type must not be changed silently after expenses exist.

Any rules for allowing or preventing type changes will be defined in Architecture and UI implementation planning.

---

# 8. Continuous Projects

## 8.1 Purpose

Continuous projects are used for shared expenses without a predetermined end.

Examples:

* Couples living together
* Roommates
* Families
* Shared houses
* Ongoing household spending

---

## 8.2 Core behavior

Continuous projects:

* Do not require an end date
* Remain active until explicitly deleted or otherwise managed
* Preserve all historical expenses
* Support month-by-month navigation
* Support monthly settlement review
* Support analytics
* Accumulate data across months
* Do not lose previous-month records

---

## 8.3 Settlement cycle

The settlement cycle is monthly.

Users must be able to:

* Select a month
* View expenses in that month
* View settlement results for that month
* Review past months
* Preserve all historical monthly data

The selected month must consistently control:

* Expense history
* KPI values
* Settlement calculations
* Category analytics
* Member contribution analytics
* Monthly summary

---

## 8.4 Continuous-project analytics

Continuous projects must support:

* Monthly total
* Per-person average
* Previous-month comparison
* Category breakdown
* Member payment comparison
* Member balances
* Monthly expense trend where relevant

Analytics may be displayed:

* Inside the continuous-project detail screen
* On the dedicated Analytics screen

On smartphone, analytics sections must be collapsible when required by the mockups.

---

# 9. Event Projects

## 9.1 Purpose

Event projects are used for expenses with a clear end.

Examples:

* Travel
* Drinking parties
* Camping
* Group outings
* Temporary events

---

## 9.2 Core behavior

Event projects:

* Use one settlement cycle for the entire project
* Do not use monthly settlement cycles
* Focus on rapid expense registration
* Show final settlement results
* Do not show project-detail analytics charts in the MVP
* Can be completed and archived

---

## 9.3 Settlement completion

An event project must provide a settlement-completion action.

The flow is:

1. User selects settlement completion.
2. The application displays a confirmation dialog.
3. User confirms completion.
4. The project is archived.
5. The project becomes read-only.

---

## 9.4 Archived event project

After archiving:

* The project remains viewable.
* The project appears in the archived-project section.
* Existing expenses remain visible.
* Settlement results remain visible.
* New expenses cannot be added.
* Existing expenses cannot be edited.
* Existing expenses cannot be deleted.
* Project settings cannot be edited.
* Members cannot be added or removed.
* Settlement status cannot be modified unless an explicit restore function is introduced later.

A restore function is not part of the MVP.

---

# 10. Screen Inventory

The MVP includes the following screen families:

1. Home / Project List
2. Project Creation
3. Continuous Project Detail
4. Event Project Detail
5. Expense Creation from Project
6. Global Expense Creation
7. Analytics
8. Archive Confirmation Dialog
9. Project Edit UI
10. Responsive smartphone variants

The exact visual references and image paths are defined in:

```text
docs/ui/MOCKUP_INDEX.md
```

---

# 11. Home / Project List

## 11.1 Purpose

The Home screen is the primary application entry point.

It allows users to:

* Review all projects
* Identify active and archived projects
* Open a project
* Search projects
* Create a project
* Start global expense registration

---

## 11.2 Active-project section

Active projects must be displayed as cards.

Each project card should display:

* Project name
* Project type
* Member count
* Total expense
* Outstanding balance
* Expense count
* Last updated information
* Outstanding settlement count when available

The final displayed values must be derived from project data rather than duplicated static values.

---

## 11.3 Archived-project section

Archived event projects must appear in a separate section.

The section should:

* Be visually separated from active projects
* Support collapse and expansion
* Allow archived projects to be opened in read-only mode

Continuous projects must not automatically appear here.

---

## 11.4 Project search

Users must be able to search projects by project name.

The MVP does not require advanced project search.

---

## 11.5 Primary actions

The Home screen must provide:

* New project creation
* Project opening
* Global expense creation where represented in the mockups

---

# 12. Project Creation

## 12.1 Required fields

The project-creation flow must include:

* Project type
* Project name
* Members
* Settlement rounding unit

---

## 12.2 Optional fields

The flow may include:

* Description

---

## 12.3 Fixed fields

Currency must be displayed as:

```text
JPY
```

It must not be selectable during the MVP.

---

## 12.4 Project type selection

Users must choose:

* Continuous
* Event

Project type must be selected before creation.

---

## 12.5 Project name

Project name is required.

Example values:

* シェアハウス生活費
* 沖縄旅行
* 家族の共同費用

---

## 12.6 Description

Description is optional.

It may contain supplementary information about the project.

---

## 12.7 Members

Members are entered as names.

Requirements:

* At least one member is required.
* Multiple members can be added.
* Members can be added later through project editing.
* Members do not require accounts.
* Member names must not be treated as globally unique users.

---

## 12.8 Settlement rounding unit

The project creator must select one of:

* 1 yen
* 10 yen
* 100 yen
* 1000 yen

The unit is used for settlement results.

---

## 12.9 Validation

Project creation must fail when:

* Project type is missing
* Project name is empty
* No member exists
* Rounding unit is missing

Validation errors must be visible and understandable.

---

# 13. Project Editing

Project editing must support:

* Project-name changes
* Description changes
* Member addition
* Applicable setting changes that remain safe after expense creation

Project editing must not:

* Modify an archived project
* Delete historical expense data as a side effect
* Silently change settlement behavior
* Silently change project type

Rules for member removal and settings changes after expenses exist must be explicitly decided before implementation.

Until that decision is documented, Cursor must not invent destructive member-removal behavior.

---

# 14. Project Detail — Common Requirements

Both project types must display:

* Project name
* Project type
* Description
* Currency
* Members
* Add-expense action
* KPI summary
* Settlement result
* Expense history
* Project-edit action
* Search and filtering
* Settlement-completion status where applicable

---

## 14.1 Information priority

The most important information is:

> Who should pay whom, and how much?

Settlement results must therefore be easy to find near the top of the main content or in a clearly visible primary panel.

---

## 14.2 KPI summary

Depending on project type and selected period, KPI cards may display:

* Total expenses
* Average burden per participant
* Selected member balance
* Number of outstanding settlement transactions
* Previous-period comparison

KPI values must use the same active period as the expense list and settlement results.

---

## 14.3 Expense history

Expenses must be displayed newest first.

Each expense row or card must display:

* Expense content
* Payer
* Participants
* Amount
* Category
* Payment date
* Per-person share where useful

The UI may display additional metadata defined in the mockups, provided it does not introduce new business behavior.

---

## 14.4 Expense-history search

Expense history must support keyword search.

Keyword targets include:

* Expense content
* Notes
* Payer name
* Participant names

Search behavior must be documented in implementation code and tests.

---

## 14.5 Period filtering

The final UI may support:

* Month selection
* All-period selection
* From-to date filtering

Continuous projects must prioritize month selection.

Event projects may use all-period or date-range filtering.

The UI must not require users to remember an exact payment date to find an expense.

---

## 14.6 Category filtering

Users must be able to filter expense history by category.

---

# 15. Expense Creation

## 15.1 Purpose

Expense creation must allow a shared expense to be registered quickly.

The most common operation should require as few interactions as practical.

---

## 15.2 Required fields

An expense requires:

* Project context
* Payer
* At least one participant
* Amount
* Expense content
* Payment date

---

## 15.3 Optional fields

An expense may include:

* Category
* Notes

---

## 15.4 Project context

When expense creation begins inside a project:

* The project is already selected.
* A project selector must not be shown.

When expense creation begins from the global action:

* A project selector is required.
* Selecting the project determines the available members.
* Archived projects must not be selectable.

---

## 15.5 Payer

The payer must be selected from the selected project’s members.

---

## 15.6 Participants

Participants are selected from project members.

Requirements:

* Multiple selection is supported.
* At least one participant is required.
* All members are selected by default.
* The payer is not automatically included unless selected.
* The UI must clearly show who will share the expense.

---

## 15.7 Amount

Amount must:

* Be required
* Be greater than zero
* Be an integer
* Reject decimal input
* Use JPY display formatting

---

## 15.8 Expense content

Expense content is required.

Examples:

* スーパーでの買い物
* ホテル予約
* 電気代
* 航空券
* レストランでの夕食

---

## 15.9 Payment date

Payment date is required.

Default value:

```text
Today
```

The user may change it because expenses may be registered after the actual payment date.

The payment date, not the registration date, controls monthly classification.

---

## 15.10 Categories

MVP categories are:

* Food
* Utilities
* Transportation
* Accommodation
* Daily Necessities
* Entertainment
* Other

The Japanese UI may display localized category names.

Internal category identifiers should remain stable even if display labels change.

---

## 15.11 Notes

Notes are optional.

Notes are included in keyword search.

---

## 15.12 Validation

Expense registration must fail when:

* No active project is selected
* Payer is missing
* No participant is selected
* Amount is empty
* Amount is zero or negative
* Amount contains decimals
* Expense content is empty
* Payment date is missing
* The project is archived

---

# 16. Expense Calculation

## 16.1 Expense share

Each expense is divided equally among its selected participants.

Example:

```text
Expense amount: ¥9,000
Participants: Alice, Bob, Carol
Per-person base share: ¥3,000
```

A project member who is not selected as a participant has no share in that expense.

---

## 16.2 Member paid amount

For each member:

```text
Paid amount = Sum of expenses paid by that member
```

---

## 16.3 Member burden

For each member:

```text
Burden amount = Sum of that member’s shares across participating expenses
```

---

## 16.4 Member balance

For each member:

```text
Balance = Paid amount - Burden amount
```

Interpretation:

* Positive balance: member should receive money
* Negative balance: member should pay money
* Zero balance: no payment required

---

# 17. Rounding Specification

## 17.1 Expense-level allocation

The application must preserve the total expense amount.

When an expense cannot be divided evenly:

* Integer shares must be assigned.
* The sum of participant shares must equal the original expense amount.
* Any remainder must be distributed deterministically.
* The same input must always produce the same result.

The precise deterministic remainder-allocation algorithm must be documented in Architecture and covered by tests.

Cursor must not independently choose a changing or random remainder recipient.

---

## 17.2 Settlement-unit rounding

Final settlement transactions are adjusted according to the project’s rounding unit.

Available units:

* 1 yen
* 10 yen
* 100 yen
* 1000 yen

MVP rule:

> Final settlement values use standard rounding to the nearest configured unit.

Examples:

| Original amount |   Unit | Displayed settlement |
| --------------: | -----: | -------------------: |
|          ¥1,234 |     ¥1 |               ¥1,234 |
|          ¥1,234 |    ¥10 |               ¥1,230 |
|          ¥1,234 |   ¥100 |               ¥1,200 |
|          ¥1,600 | ¥1,000 |               ¥2,000 |

The implementation must ensure that rounding does not create unexplained decimal values.

Any residual amount caused by final settlement rounding must be visible through documented calculation behavior and must not silently corrupt member balances.

The detailed residual-handling strategy must be decided in Architecture and protected by automated tests before production logic is finalized.

---

# 18. Settlement Optimization

## 18.1 Goal

Settlement transactions should be minimized.

The system should prefer direct payments between debtors and creditors.

Example balances:

```text
Alice: +¥10,000
Bob: -¥6,000
Carol: -¥4,000
```

Preferred settlement:

```text
Bob → Alice ¥6,000
Carol → Alice ¥4,000
```

The application should avoid unnecessary intermediate payments such as:

```text
Bob → Carol
Carol → Alice
```

when a direct settlement is possible.

---

## 18.2 Determinism

Settlement calculation must be deterministic.

The same:

* Project
* Expense set
* Period
* Rounding settings

must produce the same settlement result.

Tie-breaking behavior must be documented and tested.

---

# 19. Settlement Completion Status

## 19.1 Transaction-level status

Each settlement transaction must support a completion state.

Example:

```text
Bob → Alice ¥6,000: completed
Carol → Alice ¥4,000: outstanding
```

This allows partial settlement completion.

---

## 19.2 Visual state

Completed settlement transactions must be visibly distinguishable from outstanding transactions.

The UI must not remove completed transactions from history without an explicit filter or business rule.

---

## 19.3 Recalculation concern

Expenses may be added or changed after some calculated settlements were marked completed.

The implementation must not silently map completion flags onto unrelated recalculated transactions.

The persistence and reconciliation strategy for settlement completion must be defined in Architecture before backend implementation.

Until that rule is documented, Cursor must not create an unsafe transaction-status mapping based only on display order.

---

# 20. Continuous Project Detail

Continuous-project detail must include:

* Month selector
* KPI summary
* Settlement result for the selected month
* Expense history for the selected month
* Category breakdown
* Member-paid comparison
* Monthly summary
* Project editing
* Add-expense action

Analytics should be collapsible on smartphone.

Historical months must remain accessible.

---

# 21. Event Project Detail

Event-project detail must include:

* Project-wide KPI summary
* Project-wide settlement result
* Expense history
* Project editing while active
* Add-expense action while active
* Settlement-completion action
* Archive confirmation

Event project detail must not display analytics charts during the MVP.

After archive, all mutation controls must be disabled or removed.

---

# 22. Analytics Screen

## 22.1 MVP inclusion

A dedicated Analytics screen is included in the initial UI implementation.

The screen must initially work with centralized dummy data.

It must later support real project and expense data without major UI restructuring.

---

## 22.2 Purpose

The Analytics screen provides an overview across continuous projects and time periods.

It is intended for long-term expense understanding, not settlement execution.

---

## 22.3 Analytics content

The Analytics screen may display:

* Total spending
* Monthly spending trend
* Previous-period comparison
* Category breakdown
* Project comparison
* Member payment ranking
* Continuous-project comparison
* Selected-period summary

---

## 22.4 Filters

The Analytics screen may support:

* Period
* Project
* Category

Event projects may be excluded from long-term analytics by default, but their data must not be silently included or excluded without a visible rule.

The exact inclusion policy must be documented during implementation.

---

## 22.5 Dummy-data requirement

The initial Analytics screen must:

* Render realistic sample values
* Render charts
* Demonstrate loading-ready component structure
* Use centralized fixtures or mock data
* Avoid hard-coded data inside chart presentation components

---

## 22.6 Smartphone behavior

The mockup set does not currently define a complete dedicated smartphone Analytics screen.

Until a smartphone analytics mockup is added:

* The screen must remain responsive.
* It must use established mobile card and chart patterns.
* It must not invent a substantially different information architecture.
* Major mobile UX decisions must be documented before implementation.

---

# 23. Responsive Requirements

## 23.1 Supported presentation

SplitMate must support:

* Desktop
* Smartphone

Desktop is the primary design reference.

Smartphone is a required responsive implementation, not an optional later phase.

---

## 23.2 Desktop behavior

Desktop may use:

* Left sidebar
* Multi-column project cards
* Multi-column project detail
* Right-side settlement panels
* Desktop modals
* Wide chart layouts
* Inline filter controls

---

## 23.3 Smartphone behavior

Smartphone may use:

* Bottom navigation
* Single-column layouts
* Prominent add-expense actions
* Full-width cards
* Full-screen forms or sheets
* Collapsible analytics
* Stacked filters
* Touch-friendly controls

---

## 23.4 Responsive priority

On smartphone, content priority is:

1. Add expense
2. Settlement result
3. KPI summary
4. Expense history
5. Analytics

Desktop layout must not simply be scaled down.

Responsive implementation rules and breakpoints belong in:

```text
docs/architecture/ARCHITECTURE.md
```

---

# 24. UI and Design Direction

SplitMate uses:

* Light mode
* Clean card-based UI
* Clear financial hierarchy
* Restrained visual density
* Modern SaaS presentation
* Consistent spacing
* Accessible typography
* Understandable charts
* Professional portfolio quality

Design references include the general quality level of:

* Notion
* Linear
* Splitwise
* Revolut
* Modern financial dashboards

These names are design-quality references only.

SplitMate must not copy:

* Proprietary logos
* Protected branding
* Exact visual assets
* Exact product layouts
* Service-specific text

---

# 25. UI Mockup Source of Truth

The UI mockup index is located at:

```text
docs/ui/MOCKUP_INDEX.md
```

The mockup image files are stored under:

```text
docs/ui/mockups/pc/
docs/ui/mockups/smartphone/
```

All paths in `MOCKUP_INDEX.md` are repository-root-relative.

Before implementing or materially modifying a screen, Cursor must:

1. Read this Product Charter.
2. Read `docs/ui/MOCKUP_INDEX.md`.
3. Verify the required image paths.
4. Open all desktop references for the target screen.
5. Open all smartphone references for the target screen.
6. Compare the responsive differences.
7. Report missing images, conflicts, and visual defects.
8. Explain the implementation plan before changing code when requested.

Mockups define visual structure.

This Product Charter defines business behavior.

Architecture defines technical implementation.

---

# 26. Mockup Interpretation Rules

Mockups may contain:

* Dummy names
* Dummy amounts
* Generated dates
* Contradictory totals
* Text overlap
* Cropped content
* Visual inconsistencies
* User-profile elements despite the no-login policy
* Future navigation items

Cursor must not treat all visible mockup content as a business requirement.

Cursor must not reproduce obvious image-generation defects.

Examples:

* Overlapping settlement amounts must be corrected.
* Decimal yen values must not be reproduced.
* Profile UI must not create authentication.
* Analytics navigation must follow the approved MVP scope.
* Dummy values must not become permanent business constants.

---

# 27. Data Persistence

## 27.1 Final MVP persistence

Final MVP data must be stored server-side.

The intended implementation is:

* Spring Boot API
* PostgreSQL database

Data must survive:

* Browser refresh
* Browser restart
* Device change when the project URL is available
* Frontend redeployment

---

## 27.2 Temporary local data

Browser storage may be used only for temporary purposes such as:

* UI state
* Selected month
* Collapsed sections
* Recently opened project
* Draft form values
* Locally selected reference member

Browser cache or localStorage must not be the final source of truth for project expense history.

---

## 27.3 Deletion

Data must not disappear unless an explicit delete action is performed.

Detailed delete policy, soft-delete policy, and referential behavior will be defined in Architecture and database design documentation.

Cursor must not introduce cascading destructive deletion without an approved rule.

---

# 28. Dummy Data Policy

Dummy data is required for early UI implementation and demonstration.

Dummy data may be stored in:

* Fixtures
* Mock-service modules
* Seed data
* Test resources
* Development-only database migrations where approved

Dummy data must not be:

* Repeated across many components
* Embedded in reusable presentation components
* Mixed with production configuration
* Treated as authenticated identity
* Used to define business rules

The intended dummy-data location will be defined by Architecture.

---

# 29. Non-Functional Requirements

## 29.1 Usability

The primary flow must be understandable without instructions.

Expense registration should minimize unnecessary input.

---

## 29.2 Performance

Normal project screens should load without avoidable blocking operations.

Large images, unnecessary libraries, and repeated network calls must be avoided.

Precise performance targets may be added later.

---

## 29.3 Accessibility

Implementation should include:

* Keyboard-accessible interactive controls
* Proper form labels
* Visible focus states
* Sufficient contrast
* Semantic buttons
* Accessible dialogs
* Chart text alternatives or summaries where practical

---

## 29.4 Reliability

Core calculations must be covered by automated tests.

High-priority test areas include:

* Expense allocation
* Remainder handling
* Member balances
* Settlement optimization
* Rounding
* Monthly filtering
* Archive read-only enforcement
* Settlement completion persistence

---

## 29.5 Error handling

The UI must clearly report:

* Invalid form input
* Missing project
* Archived-project mutation attempts
* Failed data loading
* Failed save operations
* Missing required data

Errors must not be silently ignored.

---

## 29.6 Language

The initial user-facing UI is Japanese.

Internal source-code identifiers may use English.

Mockups containing mixed Japanese and English text must be normalized according to the approved UI wording.

---

# 30. Future Phases

## Phase 2 candidates

* Budget management
* Expanded analytics
* Optional project restoration
* Additional archive management
* Multi-currency project foundations
* Receipt image attachment
* Improved project sharing

## Phase 3 candidates

* Receipt OCR
* Receipt-line-item extraction
* Automatic category suggestions
* AI spending analysis
* Spending anomaly detection

## Later candidates

* Native mobile application
* Authentication
* Invitations
* Permissions
* Push notifications
* Payment-service integration

A candidate feature is not approved merely because it appears in this section.

It still requires an explicit scope decision before implementation.

---

# 31. Portfolio Objectives

SplitMate should demonstrate:

* Product requirement definition
* Scope control
* Responsive UI implementation
* React and TypeScript
* Java and Spring Boot
* PostgreSQL data modeling
* REST API design
* Expense calculation
* Settlement optimization
* Data aggregation
* Chart implementation
* Test design
* Documentation-driven development
* AI-assisted development control
* Maintainable project organization

The portfolio value comes from the quality and consistency of the implementation, not from maximizing the number of features.

---

# 32. MVP Acceptance Criteria

The MVP is accepted when all of the following are true.

## Projects

* A project can be created.
* Continuous or event type can be selected.
* At least one member is required.
* JPY is fixed.
* A rounding unit can be selected.
* Active projects appear on Home.
* Archived event projects appear separately.

## Expenses

* An active project accepts expense registration.
* A payer can be selected.
* One or more participants can be selected.
* Participants default to all members.
* Positive integer amounts are accepted.
* Decimal amounts are rejected.
* Expense content is required.
* Payment date defaults to today.
* Past payment dates can be entered.
* Expense history is displayed.
* Keyword and category filtering work.
* Required period filtering works.

## Settlement

* Member paid totals are correct.
* Member burden totals are correct.
* Member balances are correct.
* Settlement transactions are minimized.
* Settlement results are deterministic.
* Configured rounding is applied.
* No decimal monetary values appear.
* Settlement transactions can be marked completed.

## Continuous projects

* Month selection works.
* Expense history follows the selected month.
* Settlement results follow the selected month.
* Category analytics render.
* Member payment analytics render.
* Historical months remain available.

## Event projects

* Project-wide settlement works.
* Analytics charts are not shown in project detail.
* Settlement completion requires confirmation.
* Completion archives the project.
* Archived projects are read-only.

## Analytics

* The dedicated Analytics screen renders with centralized dummy data.
* KPI cards render.
* Charts render.
* Data is not hard-coded inside reusable chart components.
* The screen can later accept API data.

## Responsive UI

* Required desktop mockups are implemented.
* Required smartphone mockups are implemented.
* Mobile navigation is usable.
* Forms are not obscured by fixed navigation.
* Charts do not overflow.
* Analytics can collapse where required.
* Core actions remain easy to reach.

## Persistence

* Final project and expense data survive page reload.
* Server-side persistence is used in the completed MVP.
* Archived status persists.
* Settlement completion status persists.

---

# 33. Rules for Cursor and AI-Assisted Development

Cursor must follow these rules:

1. Read `PRODUCT_CHARTER.md` before implementation.
2. Read relevant architecture and UI documents.
3. Do not add requirements that are not approved.
4. Do not silently resolve requirement conflicts.
5. Do not implement future-phase functionality during MVP work.
6. Do not introduce authentication.
7. Do not introduce multi-currency logic.
8. Do not introduce OCR.
9. Do not introduce external-service scraping.
10. Do not create duplicate implementations.
11. Do not hard-code mockup dummy data throughout components.
12. Do not reproduce obvious mockup defects.
13. Do not modify archived-project data.
14. Do not use decimal monetary values.
15. Do not invent settlement or rounding behavior.
16. Do not create destructive member or project behavior without documentation.
17. Prefer simple, testable, maintainable code.
18. Reuse components without over-generalizing them.
19. Update `docs/current/CURRENT_STATE.md` after approved implementation work.
20. Record architecture-changing decisions in an ADR.

When required information is missing, Cursor must stop and report the missing requirement instead of guessing.

---

# 34. Document Priority

The project uses the following authority order:

1. `PRODUCT_CHARTER.md`
2. Approved ADRs
3. `docs/architecture/ARCHITECTURE.md`
4. `docs/ui/MOCKUP_INDEX.md`
5. Referenced mockup images
6. API and database specifications
7. `docs/current/CURRENT_STATE.md`
8. Existing implementation
9. AI-generated suggestions

Clarification:

* Product Charter controls product behavior and scope.
* ADRs control accepted technical decisions.
* Architecture controls system structure.
* Mockup Index and images control visual structure.
* Current State records what currently exists.
* Existing code is not automatically correct when it conflicts with higher-priority documentation.

---

# 35. Current Priority

The current implementation priority is:

> Build SplitMate as a no-login, responsive shared-expense web application using centralized dummy data first, then connect the same UI to Spring Boot and PostgreSQL persistence.

The first implementation must focus on:

* Home
* Project creation
* Continuous project detail
* Event project detail
* Expense creation
* Settlement results
* Settlement completion status
* Analytics
* Event archive flow
* Desktop and smartphone responsiveness

No out-of-scope feature may delay completion of this flow.
