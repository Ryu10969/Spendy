# SplitMate UI Mockup Index

## 1. Purpose

This document maps each SplitMate screen, viewport, and UI state to its reference mockup images.

The mockups are the visual source of truth for:

* Page layout
* Information hierarchy
* Component placement
* Navigation placement
* Form structure
* Responsive behavior
* Desktop and smartphone differences
* Continuous-project-specific UI
* Event-project-specific UI
* Modal and full-page interaction patterns
* Collapsed and expanded states

This document must be read before implementing or modifying any SplitMate UI.

---

## 2. Mockup Asset Location

All mockup paths in this document are relative to the repository root.

The repository must contain the following directories:

```text
docs/ui/mockups/pc/
docs/ui/mockups/smartphone/
```

Desktop mockups must be stored under:

```text
docs/ui/mockups/pc/
```

Smartphone mockups must be stored under:

```text
docs/ui/mockups/smartphone/
```

Example repository structure:

```text
splitmate/
├── PRODUCT_CHARTER.md
├── README.md
├── docs/
│   ├── architecture/
│   │   └── ARCHITECTURE.md
│   ├── current/
│   │   └── CURRENT_STATE.md
│   ├── adr/
│   │   └── 0001-initial-architecture.md
│   └── ui/
│       ├── MOCKUP_INDEX.md
│       └── mockups/
│           ├── pc/
│           │   ├── 01_home.png
│           │   ├── 02_project_create_1.png
│           │   ├── 03_project_create_2.png
│           │   ├── 04_analytics_1.png
│           │   ├── 05_analytics_2.png
│           │   ├── 06_continuous_project_1.png
│           │   ├── 07_continuous_project_2.png
│           │   ├── 08_expense_add_modal_1.png
│           │   ├── 09_expense_add_modal_2.png
│           │   ├── 10_event_project_1.png
│           │   └── 11_event_project_2.png
│           └── smartphone/
│               ├── 01_home_sp_1.png
│               ├── 02_home_sp_2.png
│               ├── 03_project_create_1.png
│               ├── 04_project_create_2.png
│               ├── 05_continuous_project_1.png
│               ├── 06_continuous_project_2.png
│               ├── 07_continuous_project_3.png
│               ├── 08_continuous_project_4.png
│               ├── 09_continuous_project_5.png
│               ├── 10_continuous_project_6.png
│               ├── 11_expense_add_modal_1.png
│               ├── 12_expense_add_modal_2.png
│               ├── 13_event_project_1.png
│               ├── 14_event_project_2.png
│               ├── 15_event_project_3.png
│               ├── 16_home_to_expense_add_1.png
│               └── 17_home_to_expense_add_2.png
└── .cursor/
    └── rules/
```

The mockup files must exist at the exact repository-relative paths defined in this document.

The AI coding assistant must not:

* Search for similarly named files in another directory
* Infer a path from the filename
* Use mockups stored outside the repository
* Continue UI implementation when a required image is missing
* Rely only on the filename without opening the image

If any referenced image cannot be opened, implementation must stop and the missing path must be reported.

---

## 3. File Naming Policy

Mockup files must use:

* Lowercase English letters
* Numbers
* Underscores
* `.png` extension

Do not use:

* Japanese characters
* Spaces
* Parentheses
* Full-width characters
* Finder-generated duplicate suffixes
* Ambiguous filenames

Correct:

```text
06_continuous_project_1.png
```

Incorrect:

```text
6_継続プロジェクト画面①.png
continuous project (1).png
continuous-project-final-final.png
```

The files currently stored in external `PC` and `SmartPhone` folders must be copied into the repository and renamed to match the paths in this document.

---

## 4. Source Priority

When implementing or modifying UI, use the following priority:

1. `PRODUCT_CHARTER.md`
2. `docs/ui/MOCKUP_INDEX.md`
3. Referenced mockup images
4. `docs/architecture/ARCHITECTURE.md`
5. Relevant ADRs
6. Existing reusable components and design tokens
7. Existing implementation

Responsibilities are divided as follows:

### `PRODUCT_CHARTER.md`

Defines:

* Product purpose
* Business requirements
* MVP scope
* Project-type behavior
* Settlement behavior
* Included and excluded features

### `docs/ui/MOCKUP_INDEX.md`

Defines:

* Which image belongs to which screen
* Which images must be inspected
* Screen and state relationships
* Responsive mapping
* Mockup interpretation rules

### Mockup images

Define:

* Visual layout
* Relative spacing
* Content hierarchy
* Component placement
* Responsive presentation
* Navigation positioning
* Desktop and smartphone visual differences

### `docs/architecture/ARCHITECTURE.md`

Defines:

* Technical structure
* Component boundaries
* State management
* Routing
* Responsive implementation strategy
* Data access
* Reuse policy

---

## 5. Conflict Resolution

Mockups do not override business rules.

When a mockup conflicts with a requirement:

1. `PRODUCT_CHARTER.md` takes priority for business behavior.
2. The mockup takes priority for visual structure.
3. `ARCHITECTURE.md` takes priority for technical implementation rules.
4. The conflict must be reported before implementation.
5. The AI coding assistant must not silently invent a solution.

Example:

* If a mockup shows a currency selector but the Product Charter says JPY is fixed for MVP, implement fixed JPY.
* If a mockup contains a standalone analytics page but the Product Charter excludes it from MVP, do not implement the route unless explicitly instructed.
* If a mockup contains user account information but authentication is excluded, treat it as visual dummy data only.
* If a mockup shows a visual defect such as overlapping text, do not reproduce the defect.

---

## 6. Required Inspection Procedure

Before implementing or modifying a screen, the developer or AI coding assistant must:

1. Read `PRODUCT_CHARTER.md`.
2. Read this entire `docs/ui/MOCKUP_INDEX.md`.
3. Locate the target screen in this document.
4. Resolve every listed path from the repository root.
5. Verify that every referenced image exists.
6. Open every listed desktop image.
7. Open every listed smartphone image.
8. Compare desktop and smartphone layouts.
9. Identify shared components.
10. Identify elements that move, collapse, hide, resize, or change presentation.
11. Identify continuous-project and event-project differences.
12. Identify unclear, contradictory, or visually broken parts.
13. List the files expected to be modified.
14. Explain the implementation plan.
15. Wait for approval when the user explicitly requested planning before modification.

The implementation must not begin from only one mockup when multiple mockups are listed for the screen.

Images with sequential suffixes represent:

* Different scroll positions
* Different viewport sections
* Different UI states
* Expanded or collapsed sections
* Modal continuation
* Form continuation

They must be interpreted together.

---

# 7. Desktop Mockups

## 7.1 Home / Project List

### Required reference

```text
docs/ui/mockups/pc/01_home.png
```

### Screen purpose

The application entry screen that displays all projects.

### Mockup represents

* Desktop sidebar
* SplitMate logo
* Home navigation
* Analytics navigation reference
* Project shortcuts
* Active project cards
* Project search
* New project action
* Project type badges
* Member avatars
* Member count
* Total expense
* Expense count
* Outstanding settlement information
* Last updated date
* Settlement waiting count
* Multi-column card layout

### Implementation notes

* Project values are dummy data.
* The project list must be data-driven.
* Project cards must not be hard-coded as separate components.
* Archived projects must be supported according to the Product Charter, even if the archived section is outside the captured viewport.
* Account information in the sidebar is visual reference only and does not imply authentication.

---

## 7.2 Project Creation

### Required references

```text
docs/ui/mockups/pc/02_project_create_1.png
docs/ui/mockups/pc/03_project_create_2.png
```

### Screen purpose

Creates a continuous or event project.

### Mockups represent

* Breadcrumb
* Back navigation
* Project type selection
* Continuous-project card
* Event-project card
* Project name
* Description
* Fixed JPY display
* Settlement rounding unit
* Member entry
* Validation placement
* Create action
* Form continuation below the viewport

### Inspection requirement

Both files must be opened.

Do not implement only the fields visible in the first image.

### Business-rule corrections

* Currency is fixed to JPY during MVP.
* Currency must not be selectable.
* At least one member is required.
* Project type is required.
* Project name is required.
* Rounding unit is required.

---

## 7.3 Analytics Visual Reference

### Required references

```text
docs/ui/mockups/pc/04_analytics_1.png
docs/ui/mockups/pc/05_analytics_2.png
```

### Purpose

Provides visual reference for analytics components and dummy-data presentation.

### Mockups represent

* KPI cards
* Monthly expense trend
* Category breakdown
* Donut chart
* Project comparison
* Member payment ranking
* Analytics card spacing
* Chart typography
* Dashboard hierarchy

### MVP rule

A dedicated analytics page is not part of the core MVP unless explicitly instructed.

These files should be used primarily as references for analytics displayed inside continuous-project details.

Do not automatically create:

```text
/analytics
```

solely because the mockups exist.

### Allowed use

* Dummy-data demo page when explicitly requested
* Shared chart components
* Continuous-project analytics sections
* Future phase reference

---

## 7.4 Continuous Project Detail

### Required references

```text
docs/ui/mockups/pc/06_continuous_project_1.png
docs/ui/mockups/pc/07_continuous_project_2.png
```

### Screen purpose

Main workspace for ongoing shared expenses.

### Mockups represent

* Project breadcrumb
* Project header
* Project type badge
* Fixed JPY label
* Project description
* Members
* Add-expense action
* KPI summary cards
* Total expense
* Average per member
* Current-person balance
* Settlement transaction count
* Expense search
* Period filter
* Category filter
* Expense history
* Settlement result panel
* Member balance panel
* Continuous-project analytics sections
* Desktop multi-column layout
* Scroll continuation

### Continuous-only behavior

* Monthly filtering
* Category analytics
* Member contribution analytics
* Monthly summary
* Historical monthly navigation

### Important rule

The UI may display a demo concept such as “current user balance,” but the MVP has no authentication.

Any “current user” behavior must be implemented as:

* A defined demo member
* A locally selected member
* A clearly documented temporary assumption

It must not introduce authentication.

---

## 7.5 Expense Add Modal

### Required references

```text
docs/ui/mockups/pc/08_expense_add_modal_1.png
docs/ui/mockups/pc/09_expense_add_modal_2.png
```

### Screen purpose

Adds an expense from inside a project.

### Mockups represent

* Desktop modal
* Modal header
* Close action
* Payer selection
* Participant checkboxes
* Default all-selected state
* Integer amount input
* Required expense content
* Payment date
* Category
* Notes
* Save action
* Form scrolling
* Modal continuation

### Context rule

Because the modal is opened from a project detail screen:

* Project selection is not shown.
* The current project is already known.

### Validation

Required:

* Payer
* At least one participant
* Positive integer amount
* Expense content
* Payment date

Optional:

* Category
* Notes

---

## 7.6 Event Project Detail

### Required references

```text
docs/ui/mockups/pc/10_event_project_1.png
docs/ui/mockups/pc/11_event_project_2.png
```

### Screen purpose

Manages one-time shared expenses.

### Mockups represent

* Event project header
* Event badge
* Fixed JPY label
* Members
* Add-expense action
* KPI summary cards
* Settlement result
* Member balance
* Expense history
* Settlement completion action
* Archive flow placement
* Simplified layout
* No analytics charts

### Event-only behavior

* One settlement cycle per project
* Settlement completion
* Archive confirmation
* Read-only state after archive
* No analytics charts in MVP

---

# 8. Smartphone Mockups

## 8.1 Home / Project List

### Required references

```text
docs/ui/mockups/smartphone/01_home_sp_1.png
docs/ui/mockups/smartphone/02_home_sp_2.png
```

### Screen purpose

Mobile project list and application entry screen.

### Mockups represent

* Mobile title
* Project search
* Prominent new-project action
* Single-column project cards
* Project type badge
* Member avatars
* Total expense
* Expense count
* Balance
* Settlement waiting count
* Bottom navigation
* Central global add action
* Vertical scrolling
* Additional project and archived sections

### Responsive differences

Compared with desktop:

* Sidebar is replaced by bottom navigation.
* Project cards become single-column.
* Search becomes full-width.
* New-project action becomes compact or icon-based.
* Card information wraps vertically.
* Navigation remains accessible at the bottom.

---

## 8.2 Project Creation

### Required references

```text
docs/ui/mockups/smartphone/03_project_create_1.png
docs/ui/mockups/smartphone/04_project_create_2.png
```

### Screen purpose

Mobile project creation flow.

### Mockups represent

* Full-page form
* Back navigation
* Stacked project-type cards
* Large touch targets
* Project name
* Description
* Fixed JPY display
* Rounding unit
* Member entry
* Create action
* Form continuation
* Bottom navigation relationship

### Responsive differences

Compared with desktop:

* Project-type cards are stacked vertically.
* Form fields use full width.
* Vertical spacing is increased for touch use.
* The form is scrollable.
* Core form controls must not be hidden behind bottom navigation.

---

## 8.3 Continuous Project Detail

### Required references

```text
docs/ui/mockups/smartphone/05_continuous_project_1.png
docs/ui/mockups/smartphone/06_continuous_project_2.png
docs/ui/mockups/smartphone/07_continuous_project_3.png
docs/ui/mockups/smartphone/08_continuous_project_4.png
docs/ui/mockups/smartphone/09_continuous_project_5.png
docs/ui/mockups/smartphone/10_continuous_project_6.png
```

### Screen purpose

Mobile workspace for continuous shared expenses.

### Mockups collectively represent

* Back navigation
* Project header
* Continuous badge
* Fixed JPY label
* Project description
* Member avatars
* Prominent add-expense button
* Two-column KPI cards
* Settlement result
* Member balance
* Expense history
* Monthly filtering
* Keyword search
* Category filtering
* Category chart
* Member contribution chart
* Monthly summary
* Collapsed analytics
* Expanded analytics
* Long-page order
* Bottom navigation

### Inspection requirement

All six files must be opened before implementation.

They represent different vertical sections and possibly different expanded states of the same screen.

### Mobile priority order

The mobile screen should prioritize:

1. Add expense
2. Settlement result
3. KPI summary
4. Expense history
5. Analytics

Analytics must be collapsible and collapsed by default unless the relevant mockup explicitly defines another state.

---

## 8.4 Expense Add Modal from Project

### Required references

```text
docs/ui/mockups/smartphone/11_expense_add_modal_1.png
docs/ui/mockups/smartphone/12_expense_add_modal_2.png
```

### Screen purpose

Adds an expense while the user is inside a project.

### Mockups represent

* Mobile sheet or modal
* Modal header
* Close action
* Payer selection
* Participant checkboxes
* Amount
* Expense content
* Payment date
* Category
* Notes
* Save action
* Scroll continuation
* Background overlay
* Bottom navigation interaction

### Context rule

The current project is already known.

A project selector must not be shown in this flow.

---

## 8.5 Event Project Detail

### Required references

```text
docs/ui/mockups/smartphone/13_event_project_1.png
docs/ui/mockups/smartphone/14_event_project_2.png
docs/ui/mockups/smartphone/15_event_project_3.png
```

### Screen purpose

Mobile workspace for one-time event expenses.

### Mockups collectively represent

* Back navigation
* Event project header
* Event badge
* Fixed JPY label
* Members
* Prominent add-expense action
* KPI summary cards
* Settlement result
* Member balances
* Expense history
* Settlement completion
* Archive confirmation entry point
* Bottom navigation
* No analytics charts

### Inspection requirement

All three files must be opened before implementation.

---

## 8.6 Global Expense Creation from Home

### Required references

```text
docs/ui/mockups/smartphone/16_home_to_expense_add_1.png
docs/ui/mockups/smartphone/17_home_to_expense_add_2.png
```

### Screen purpose

Adds an expense after opening the form from the global add button rather than from a specific project.

### Mockups represent

* Full-page mobile expense form
* Back navigation
* Project selector
* Payer selection
* Participant selection
* Amount
* Expense content
* Payment date
* Category
* Notes
* Persistent save action
* Form continuation

### Context difference

Unlike the project-detail modal, this flow must include project selection.

The selected project determines:

* Available members
* Currency display
* Category behavior
* Project type
* Rounding settings

---

# 9. Screen-to-Mockup Mapping

| Screen or state            | Desktop reference paths                                                                              | Smartphone reference paths                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Home / Project List        | `docs/ui/mockups/pc/01_home.png`                                                                     | `docs/ui/mockups/smartphone/01_home_sp_1.png`<br>`docs/ui/mockups/smartphone/02_home_sp_2.png`                            |
| Project Creation           | `docs/ui/mockups/pc/02_project_create_1.png`<br>`docs/ui/mockups/pc/03_project_create_2.png`         | `docs/ui/mockups/smartphone/03_project_create_1.png`<br>`docs/ui/mockups/smartphone/04_project_create_2.png`              |
| Analytics Visual Reference | `docs/ui/mockups/pc/04_analytics_1.png`<br>`docs/ui/mockups/pc/05_analytics_2.png`                   | No dedicated smartphone analytics page                                                                                    |
| Continuous Project Detail  | `docs/ui/mockups/pc/06_continuous_project_1.png`<br>`docs/ui/mockups/pc/07_continuous_project_2.png` | `docs/ui/mockups/smartphone/05_continuous_project_1.png` through `docs/ui/mockups/smartphone/10_continuous_project_6.png` |
| Expense Add from Project   | `docs/ui/mockups/pc/08_expense_add_modal_1.png`<br>`docs/ui/mockups/pc/09_expense_add_modal_2.png`   | `docs/ui/mockups/smartphone/11_expense_add_modal_1.png`<br>`docs/ui/mockups/smartphone/12_expense_add_modal_2.png`        |
| Event Project Detail       | `docs/ui/mockups/pc/10_event_project_1.png`<br>`docs/ui/mockups/pc/11_event_project_2.png`           | `docs/ui/mockups/smartphone/13_event_project_1.png` through `docs/ui/mockups/smartphone/15_event_project_3.png`           |
| Global Expense Creation    | No dedicated desktop reference                                                                       | `docs/ui/mockups/smartphone/16_home_to_expense_add_1.png`<br>`docs/ui/mockups/smartphone/17_home_to_expense_add_2.png`    |

---

# 10. Missing Counterpart Rule

Some flows may not have both desktop and smartphone mockups.

Current known example:

* Global expense creation has smartphone mockups but no dedicated desktop mockup.

When a counterpart is missing:

1. Do not silently invent an unrelated layout.
2. Reuse the nearest established interaction pattern.
3. Preserve the business flow.
4. Preserve the desktop or smartphone design system.
5. Record the decision in an ADR or implementation plan when it materially affects architecture.
6. Ask for clarification if multiple substantially different designs are possible.

For desktop global expense creation, the preferred default is:

* Reuse the desktop expense-add modal
* Add a project selector at the top
* Do not create a new unrelated form layout

This is a documented interpretation and may be changed only by explicit instruction.

---

# 11. Dummy Data Policy

The mockups contain dummy data.

Examples include:

* Alice
* Bob
* Carol
* シェアハウス生活費
* 沖縄旅行
* ヨーロッパ旅行
* 家族の共同費用
* ¥687,200
* ¥229,600
* Jun 6
* May 28

Dummy data may be used through:

* Fixtures
* Seed data
* Mock API responses
* Test data
* Storybook stories
* Demo-only constants

Dummy data must not be:

* Embedded directly throughout presentation components
* Treated as authenticated-user data
* Used as immutable business rules
* Duplicated across unrelated files
* Mixed with production configuration

Preferred location examples:

```text
frontend/src/mocks/
frontend/src/fixtures/
backend/src/main/resources/db/migration/
backend/src/test/resources/
```

The final location must follow `ARCHITECTURE.md`.

---

# 12. Mockup Defect Policy

Generated mockups may contain accidental defects.

Possible defects include:

* Overlapping text
* Cropped values
* Incorrect alignment
* Contradictory totals
* Inconsistent names
* Inconsistent dates
* Mixed Japanese and English labels
* Invalid arithmetic
* Impossible settlement values
* Elements hidden by navigation
* Inconsistent icon usage

Do not reproduce obvious defects.

The implementation must preserve the intended design while correcting presentation-level problems.

Examples:

* Prevent settlement amount text from overlapping member names.
* Prevent fixed bottom navigation from covering form controls.
* Ensure long project names are truncated or wrapped intentionally.
* Ensure currency amounts use integer formatting.
* Ensure card grids align consistently.
* Ensure touch targets remain usable.
* Ensure charts resize without clipping.
* Ensure labels use the product’s selected language consistently.

When a possible defect could instead represent an intentional UI decision, report it before implementation.

---

# 13. Reusable Component Expectations

Mockups should be implemented through reusable components.

Expected reusable UI concepts include:

* App shell
* Desktop sidebar
* Mobile bottom navigation
* Top bar
* Project card
* Project type badge
* Member avatar group
* KPI card
* Settlement result card
* Settlement transaction row
* Member balance row
* Expense list
* Expense row
* Search input
* Period filter
* Category filter
* Project type selector
* Rounding unit selector
* Expense form
* Modal or sheet
* Chart card
* Empty state
* Archived-project section

Do not create separate duplicate components for each mockup image.

A mockup image represents a screen state, not a requirement to create an isolated implementation.

---

# 14. Responsive Interpretation Rules

Responsive behavior must be derived by comparing the desktop and smartphone mockups.

Do not implement responsiveness by simply shrinking the desktop layout.

Expected changes include:

* Desktop sidebar becomes mobile bottom navigation.
* Multi-column project cards become a single-column list.
* Desktop multi-column project detail becomes vertically stacked.
* Right-side settlement panels move into the main vertical flow.
* Desktop modals may become mobile sheets or full-page forms.
* Analytics become collapsible on mobile.
* Primary actions become larger and easier to reach.
* Search and filters wrap or stack.
* Charts resize to the available width.
* Long tables become cards or compact rows.
* Desktop hover-only behavior must have a touch equivalent.

Exact breakpoint values belong in `ARCHITECTURE.md`, not this file.

---

# 15. Navigation Interpretation

## Desktop navigation

Reference behavior includes:

* Left sidebar
* Home
* Analytics visual reference
* Project shortcuts
* Top search
* Contextual add-expense action

Authentication is not part of MVP.

Any profile section shown in the mockup is visual-only unless explicitly implemented as local demo identity selection.

## Smartphone navigation

Reference behavior includes:

* Bottom navigation
* Home
* Projects
* Central global add action
* Settlement
* My Page visual reference

Because authentication and user accounts are excluded:

* “My Page” must not introduce account management.
* It may be omitted, disabled, replaced, or treated as a future placeholder according to approved implementation decisions.
* The presence of the visual item does not override the Product Charter.

---

# 16. Implementation Instruction Template

Use the following prompt before asking Cursor to implement or modify a UI screen:

```text
Before making any UI code changes:

1. Read PRODUCT_CHARTER.md.
2. Read docs/ui/MOCKUP_INDEX.md.
3. Read docs/architecture/ARCHITECTURE.md.
4. Identify the target screen in MOCKUP_INDEX.md.
5. Resolve all listed mockup paths from the repository root.
6. Verify that every required image exists.
7. Open every listed desktop and smartphone mockup for the target screen.
8. Compare the desktop and smartphone versions.
9. Summarize:
   - screen purpose
   - desktop layout
   - smartphone layout
   - shared components
   - responsive differences
   - continuous/event-specific differences
   - required UI states
   - mockup defects that should not be reproduced
   - conflicts or ambiguities
10. Identify affected files.
11. Explain the implementation plan.

Do not modify code until the inspection summary and plan are complete.

Do not:
- add screens or features not defined in PRODUCT_CHARTER.md
- infer the UI from filenames alone
- proceed when a referenced mockup is missing
- reproduce obvious visual defects
- hard-code mockup dummy data inside reusable components
- add authentication because a mockup displays a profile
- create a dedicated analytics route unless explicitly instructed
- create duplicate desktop and smartphone business logic
```

---

# 17. Missing File Handling

If a referenced image is missing, Cursor must respond using this format:

```text
UI implementation stopped.

Missing mockup:
- docs/ui/mockups/<expected-path>.png

Target screen:
- <screen name>

No UI code was modified.
```

Cursor must not:

* Use another image as an unapproved substitute
* Search outside the repository
* Generate a replacement design
* Continue based only on written descriptions

---

# 18. Completion Tracking

Implementation status must be tracked in:

```text
docs/current/CURRENT_STATE.md
```

Each screen should record:

* Desktop mockups inspected
* Smartphone mockups inspected
* Static UI status
* Responsive UI status
* Dummy data status
* Interaction status
* API connection status
* Visual verification status
* Known differences
* Remaining tasks

Recommended format:

```text
## Home / Project List

Status:
- Desktop mockups inspected: yes
- Smartphone mockups inspected: yes
- Static UI: completed
- Responsive UI: completed
- Dummy data: connected
- API: not connected
- Verified against mockups: partial

References:
- docs/ui/mockups/pc/01_home.png
- docs/ui/mockups/smartphone/01_home_sp_1.png
- docs/ui/mockups/smartphone/02_home_sp_2.png

Known differences:
- Archived project section not yet implemented
- Mobile bottom navigation icons are temporary
```

---

# 19. Current Mockup Inventory

## Desktop

Expected number of files:

```text
11
```

Required files:

```text
docs/ui/mockups/pc/01_home.png
docs/ui/mockups/pc/02_project_create_1.png
docs/ui/mockups/pc/03_project_create_2.png
docs/ui/mockups/pc/04_analytics_1.png
docs/ui/mockups/pc/05_analytics_2.png
docs/ui/mockups/pc/06_continuous_project_1.png
docs/ui/mockups/pc/07_continuous_project_2.png
docs/ui/mockups/pc/08_expense_add_modal_1.png
docs/ui/mockups/pc/09_expense_add_modal_2.png
docs/ui/mockups/pc/10_event_project_1.png
docs/ui/mockups/pc/11_event_project_2.png
```

## Smartphone

Expected number of files:

```text
17
```

Required files:

```text
docs/ui/mockups/smartphone/01_home_sp_1.png
docs/ui/mockups/smartphone/02_home_sp_2.png
docs/ui/mockups/smartphone/03_project_create_1.png
docs/ui/mockups/smartphone/04_project_create_2.png
docs/ui/mockups/smartphone/05_continuous_project_1.png
docs/ui/mockups/smartphone/06_continuous_project_2.png
docs/ui/mockups/smartphone/07_continuous_project_3.png
docs/ui/mockups/smartphone/08_continuous_project_4.png
docs/ui/mockups/smartphone/09_continuous_project_5.png
docs/ui/mockups/smartphone/10_continuous_project_6.png
docs/ui/mockups/smartphone/11_expense_add_modal_1.png
docs/ui/mockups/smartphone/12_expense_add_modal_2.png
docs/ui/mockups/smartphone/13_event_project_1.png
docs/ui/mockups/smartphone/14_event_project_2.png
docs/ui/mockups/smartphone/15_event_project_3.png
docs/ui/mockups/smartphone/16_home_to_expense_add_1.png
docs/ui/mockups/smartphone/17_home_to_expense_add_2.png
```

Total expected mockup files:

```text
28
```

Before the first UI implementation, verify that all 28 files exist.

---

# 20. Final Rule

No SplitMate UI screen may be implemented or materially modified without inspecting the exact repository-relative mockup paths assigned to that screen in this document.

The presence of a filename in this document is not sufficient.

The referenced image itself must be opened and inspected.
