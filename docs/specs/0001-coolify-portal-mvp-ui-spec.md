---
id: 0001-coolify-portal-mvp-ui-spec
title: Coolify Portal MVP UI Specification
status: implemented
owner: designer
date: 2026-09-24
design: docs/designs/2026-09-24-coolify-portal-mvp-design.md
adr: docs/adr/0001-coolify-portal-mvp-architecture.md
---

# Coolify Portal MVP UI Specification

> **Current implementation amendment (2026-10-01):** This historical MVP
> baseline is superseded where it describes GitHub as the portal login or
> per-app Basic Auth. Portal access now uses administrator-issued email and
> password accounts. GitHub is connected only after portal login, deployment
> is repository/version based, and deployed services use public HTTPS with
> `noindex`. See the in-app Korean guide and staging runbook for the current
> user journey.

### 2026-10-02 security completion amendment

- A temporary password is a hard gate: pages, server actions, GitHub APIs,
  deployment creation, and deployment-status reads remain unavailable until
  the user sets a new password.
- Administrator account-create and password-reset responses may contain the
  one-time temporary password, but never a password hash or other credential
  material.
- Repository analysis that cannot identify Dockerfile, Node/package, or static
  HTML behavior stops before Coolify creation and tells the user which simple
  repository file is required.

## Purpose and principles

This specification defines the MVP interface for a private, single-tenant Coolify portal. It covers the five approved routes and gives the code-writer an implementation contract.

- Make deployment state, next actions, and recovery paths explicit while separating privileged administration.
- Pair text and icons with color, preserve input and focus, and meet WCAG 2.1 Level AA without exceptions.

## User journeys

| Journey | Required flow |
|---|---|
| Deploy | Sign in with email/password -> change the temporary password if required -> connect GitHub when prompted -> choose a repository/version -> open `/deployments/[id]` -> show the healthy public URL. |
| Recover | Show a sanitized failure and last update -> retain any healthy URL -> user corrects and pushes -> **Refresh status** reconciles the newest deployment at the same URL. |
| Manage access | Open `/admin/users` -> create an email account with a temporary password and role -> confirm creation -> change role, reset a password, deactivate, or reactivate. Deactivation ends sessions immediately. |
| Review activity | Open `/admin/audit-logs` -> filter redacted events -> paginate newest-first results while preserving filters and focusing the results heading. |
| Denied access | Return an unknown or inactive identity to the denied login state. Show authenticated non-admins a data-free forbidden page with **Return to dashboard**. |

## Information architecture and navigation

### Navigation model

| Item | User | Admin | Destination |
|---|---:|---:|---|
| Dashboard | Yes | Yes | `/dashboard` |
| Users | No | Yes | `/admin/users` |
| Audit logs | No | Yes | `/admin/audit-logs` |
| Account menu | Yes | Yes | GitHub login, role, and sign out |

Use a skip link as the first focusable element. Use `header`, `nav`, and `main` landmarks. Mark the current navigation item with both a visible treatment and `aria-current="page"`.

### Responsive layout

| Viewport | Layout |
|---|---|
| `< 640px` | Single column. Use a compact header and a menu button that opens a modal navigation drawer. Stack actions full-width. Render data rows as labeled cards. |
| `640px-1023px` | Single content column with a top navigation bar. Use two-column form rows only when labels and errors remain readable. |
| `>= 1024px` | Use a 240px persistent side navigation and a content area up to 1200px. Use two-column dashboard panels when space permits. |

Use 16px page gutters on small screens, 24px on medium screens, and 32px on large screens. Do not rely on horizontal scrolling for primary actions. Audit metadata may wrap within its cell. Tables must switch to labeled cards below 640px.

## Screen wireframes and behavior

### `/login`

```text
┌──────────────────────────────────────────────┐
│ Coolify Portal                              │
├──────────────────────────────────────────────┤
│       Deploy approved GitHub projects        │
│       Private access only                    │
│       [ GitHub icon  Continue with GitHub ]  │
│       Sign-in status or access message       │
└──────────────────────────────────────────────┘
```

- Center a sign-in card with a maximum width of 440px.
- Keep the page heading and private-access explanation visible in every state.
- Default: Enable **Continue with GitHub**.
- Loading: Disable the button, show **Connecting to GitHub...**, and set `aria-busy="true"` on the card.
- Access denied: Show an error alert with **Access is not enabled for this GitHub account. Contact an administrator.** Do not reveal whether a grant exists.
- Rate limited: Show the available retry time from `Retry-After`. Keep the button disabled until retry is allowed.
- Service error: Show **GitHub sign-in is unavailable. Try again.** and a **Try again** button.

### `/dashboard`

```text
┌──────────────┬────────────────────────────────────────────┐
│ Navigation   │ Dashboard                    [Account ▾]   │
│ • Dashboard  ├────────────────────────────────────────────┤
│ • Users*     │ Deploy a repository                        │
│ • Audit*     │ [Repository       ] [Branch             ]  │
│              │ [Application name ] [Port               ]  │
│              │ Build pack: (• Auto) ( Nixpacks) ( Docker) │
│              │                         [Deploy repository] │
│              ├────────────────────────────────────────────┤
│              │ Recent deployments                         │
│              │ [Status] Repository / Branch  Updated  [>] │
└──────────────┴────────────────────────────────────────────┘
* Admin only
```

- Use a labeled form with repository example `JJiseong/sample-agent` and default branch `main`.
- Explain that CPU, memory, generated URL, automatic deployments, and Basic Authentication are managed by the portal.
- Use a radio group for `Auto`, `Nixpacks`, and `Dockerfile`. Select `Auto` initially.
- On submit, validate all fields at once. Show a linked error summary before the form and inline field errors.
- While submitting, keep values visible, disable all controls, and label the button **Creating deployment...**.
- On success, navigate to the detail page. Do not use a transient success toast as the only confirmation.
- Show recent deployments newest first. Each row includes status, repository, branch, application name, updated time, and a descriptive **View deployment** link.
- Empty: Show **No deployments yet** and point to the form heading.
- List error: Preserve the deployment form and show a retry panel only in the recent-deployments region.

### `/deployments/[id]`

```text
┌──────────────┬────────────────────────────────────────────┐
│ Navigation   │ Deployments / sample-agent                 │
│              ├────────────────────────────────────────────┤
│              │ [Icon] In progress     Updated 12s ago     │
│              │ Building the application                  │
│              │ [Refresh status]                           │
│              │ Repository  JJiseong/sample-agent          │
│              │ Branch      main                           │
│              │ Build pack  Auto                           │
│              │ URL         Pending                        │
│              │ Application access                         │
│              │ [Reveal credentials]                       │
└──────────────┴────────────────────────────────────────────┘
```

- Use the application name as the page heading and the repository as supporting text.
- Show one status banner with icon, label, explanation, and last successful update time.
- Show the deployment URL only when available. Use **Open application** and identify that it opens a new tab.
- Show `Requested`, `Provisioning`, `Queued`, and `In progress` as ordered progress steps. Do not imply an exact percentage.
- Show a sanitized failure summary for `Failed`. Never show raw Coolify responses or logs.
- For `Unknown`, explain that the portal cannot confirm the current state. Offer **Refresh status**.
- For `Cancelled`, explain that the deployment did not complete. Do not offer cancellation or rollback actions.
- Keep the previous healthy URL visible after a failed push deployment. Label it **Current healthy application**.
- Credential reveal opens an inline disclosure. Announce success, focus its heading, provide **Copy password** and **Hide credentials**, and never place the password in a toast.
- Forbidden or missing deployment: Use the same neutral **Deployment not found** page for unauthorized IDs and unknown IDs. Offer **Return to dashboard**.

#### Polling feedback

- Poll every three seconds only for active states: `REQUESTED`, `PROVISIONING`, `QUEUED`, and `IN_PROGRESS`.
- Display **Checking for updates...** only after a request lasts longer than 500ms. Do not replace the status content with a spinner.
- Announce only status transitions through one `aria-live="polite"` region. Do not announce unchanged polls or relative-time changes.
- Stop automatic polling at `HEALTHY`, `FAILED`, `CANCELLED`, or `UNKNOWN`.
- Pause requests while the document is hidden. Refresh immediately when focus returns to an active deployment.
- On a polling failure, retain the last known status and time. Show **Updates paused** with **Try again**.
- On `429`, honor `Retry-After`, show **Next check in N seconds**, and prevent manual refresh until allowed.
- A manual refresh never moves focus. Announce its result in the same live region.

### `/admin/users`

```text
┌──────────────┬────────────────────────────────────────────┐
│ Navigation   │ Users                         [Account ▾]  │
│              ├────────────────────────────────────────────┤
│              │ Add allowed user                           │
│              │ [GitHub login       ] [Role ▾] [Add user]  │
│              │ [Search users                         ]    │
│              │ Login      Role   Status   Last login      │
│              │ octocat    User   Active   2 hours ago [⋯] │
└──────────────┴────────────────────────────────────────────┘
```

- Add users by GitHub login only. State that the login binds to the GitHub identity at first sign-in.
- Role options are `User` and `Admin`. Use `User` by default.
- Each user row includes login, role, status, last login, created time, and actions.
- Role change uses a labeled select and **Save role**. Disable both during submission.
- Activation uses **Reactivate user** and a success message tied to the row.
- Deactivation uses **Deactivate user** and requires confirmation.
- Empty: Show **No access grants match these filters**. Keep **Add allowed user** available.
- Mutation error: Keep the edited value, show a row-level error, and return focus to the failed control.
- Non-admin access: Show the shared forbidden page without rendering user data.

#### Deactivation confirmation

```text
Deactivate @octocat?
This ends the user's active sessions immediately. You can reactivate the user later.

[Cancel] [Deactivate user]
```

- Use a modal dialog with the user login in the title.
- Move initial focus to **Cancel**. Trap focus within the dialog and close it with `Escape`.
- Return focus to the triggering button after cancellation.
- During submission, disable both buttons and label the destructive action **Deactivating...**.
- On success, close the dialog, move focus to the updated row heading, and announce **@octocat deactivated**.
- On failure, keep the dialog open and show a recoverable inline error.

### `/admin/audit-logs`

```text
┌──────────────┬────────────────────────────────────────────┐
│ Navigation   │ Audit logs                    [Account ▾]  │
│              ├────────────────────────────────────────────┤
│              │ [Action ▾] [Outcome ▾] [Date range]        │
│              │ [Apply filters] [Clear]                    │
│              │ Time   Actor   Action   Outcome   Target    │
│              │ ...redacted event rows...                  │
│              │ [Previous] Page 1 of N [Next]              │
└──────────────┴────────────────────────────────────────────┘
```

- Display events newest first in a semantic table.
- Show time in the user's locale and expose the full timestamp in accessible text.
- Use readable action labels such as **Deployment requested** instead of raw enum values.
- Pair outcome text with an icon. Do not expose sensitive metadata.
- Filters submit explicitly. The URL query string stores filter and page state.
- Loading: Keep table headers visible and set the results region to busy.
- Empty: Show **No audit events match these filters** and offer **Clear filters**.
- Error: Keep the selected filters and show **Audit logs could not be loaded** with **Try again**.
- Non-admin access: Show the shared forbidden page without rendering event data.

## Reusable components and exact states

| Component | Required states | Behavior contract |
|---|---|---|
| `AppShell` | default, mobile menu open | Owns skip link, landmarks, responsive navigation, and account menu. |
| `Button` | default, hover, focus-visible, active, disabled, loading | Variants: primary, secondary, danger, text. Loading retains width and accessible name. |
| `TextField` | default, hover, focus, filled, invalid, disabled | Always show a label. Link help and errors with `aria-describedby`. |
| `SelectField` | default, focus, selected, invalid, disabled | Use a native select for role and filters. |
| `RadioGroup` | default, focus-within, selected, invalid, disabled | Use `fieldset` and `legend`. Make the complete option label clickable. |
| `StatusBadge` | requested, provisioning, queued, in-progress, healthy, failed, cancelled, unknown | Always render icon and text. Use semantic color only as a secondary cue. |
| `StatusBanner` | active, success, warning, error, unknown | Contains state explanation, update time, and relevant recovery action. |
| `Alert` | info, success, warning, error | Use `role="alert"` only for urgent errors. Use `role="status"` for non-urgent feedback. |
| `ErrorSummary` | hidden, visible | Heading receives programmatic focus. Each item links to its invalid field. |
| `DataTable` | loading, populated, empty, error | Uses caption, column headers, and row-scoped labels. Converts to labeled cards on small screens. |
| `Pagination` | first, middle, last, loading | Uses descriptive labels. Disabled controls are not links. |
| `ConfirmDialog` | closed, open, submitting, error | Owns focus trap, focus return, title, description, and recovery behavior. |
| `SensitiveDisclosure` | concealed, loading, revealed, copy-success, error | Does not preload credentials. Copy feedback is visible and announced. |
| `Skeleton` | loading | Mirrors final layout, is hidden from assistive technology, and never replaces page headings. |
| `EmptyState` | no data, no filter results | States what happened and offers one relevant next action. |

## Shared page states and error recovery

| State | Required presentation | Recovery |
|---|---|---|
| Initial loading | Keep the page heading. Use skeletons for content regions. | None. Do not show a blank page or full-screen spinner. |
| Empty | Explain why content is absent. | Link to the primary creation action or clear active filters. |
| Validation error | Show error summary and inline messages. Preserve all safe input. | Focus the summary, then support links to each field. |
| Server error | Show a sanitized message and request ID when available. | Provide **Try again** without clearing input. |
| Offline | Show **You appear to be offline** and retain last known data. | Retry automatically after the browser reconnects and provide manual retry. |
| Success | Confirm the completed action near its source. | Move focus only when navigation or a dialog close requires it. |
| Forbidden | Show a heading, short explanation, and **Return to dashboard**. | Do not render restricted page content. |
| Session expired | Explain that the session ended before redirecting. | Offer **Sign in again** and do not replay a mutation automatically. |
| Rate limited | Explain when the action becomes available. | Honor `Retry-After` and preserve input. |

Toasts may supplement visible feedback. They must not be the only location for errors, credentials, or completed destructive actions.

## Design tokens

### Color

| Token | Value | Use |
|---|---|---|
| `color.bg` | `#F8FAFC` | Page background |
| `color.surface` | `#FFFFFF` | Cards, tables, dialogs |
| `color.text` | `#0F172A` | Primary text |
| `color.text-muted` | `#475569` | Supporting text |
| `color.border` | `#CBD5E1` | Borders and dividers |
| `color.primary` | `#1D4ED8` | Primary actions and links |
| `color.primary-hover` | `#1E40AF` | Hover and pressed primary actions |
| `color.focus` | `#2563EB` | Focus ring |
| `color.success-bg` / `color.success-text` | `#F0FDF4` / `#166534` | Healthy and success |
| `color.warning-bg` / `color.warning-text` | `#FFFBEB` / `#92400E` | Queued, unknown, caution |
| `color.error-bg` / `color.error-text` | `#FEF2F2` / `#B91C1C` | Failed, invalid, destructive |
| `color.info-bg` / `color.info-text` | `#F0F9FF` / `#075985` | Requested, provisioning, in progress |

Verified foreground/background contrast ratios:

| Pairing | Ratio |
|---|---:|
| `color.text` on `color.surface` | 17.85:1 |
| `color.text-muted` on `color.surface` | 7.58:1 |
| white on `color.primary` | 6.70:1 |
| `color.success-text` on `color.success-bg` | 6.81:1 |
| `color.warning-text` on `color.warning-bg` | 6.84:1 |
| `color.error-text` on `color.error-bg` | 5.91:1 |
| `color.info-text` on `color.info-bg` | 7.09:1 |
| `color.focus` against white | 5.17:1 |

Do not place muted text on semantic tinted backgrounds without a separate contrast check. Borders, focus indicators, and meaningful icons must reach 3:1 against adjacent colors.

### Type, spacing, and shape

| Category | Tokens |
|---|---|
| Font | System sans: `ui-sans-serif`, `system-ui`, `sans-serif`; system monospace for identifiers |
| Type sizes | `12`, `14`, `16`, `20`, `24`, `32`px |
| Line height | 1.5 for body; 1.25 for headings; 1.4 for labels and captions |
| Font weights | 400 regular; 500 medium; 600 semibold; 700 bold |
| Spacing | `4`, `8`, `12`, `16`, `24`, `32`, `48`, `64`px |
| Radius | 4px controls; 8px cards; 12px dialogs |
| Border | 1px default; 2px high-emphasis and error |
| Focus ring | 3px `color.focus` with 2px surface offset |
| Elevation | Cards use border only. Dialogs use `0 20px 25px rgb(15 23 42 / 0.15)`. |
| Target size | 44 by 44 CSS pixels preferred; never below 24 by 24 CSS pixels; keep 8px spacing between compact targets |

## Accessibility requirements

### Keyboard and focus

- Support every action with keyboard input and no keyboard trap.
- Follow DOM order: skip link, header, navigation, page heading, main controls, supporting content.
- Show focus only with `:focus-visible`. Do not remove native focus without an equivalent ring.
- Move focus to the page heading after client-side navigation.
- Move focus to an error summary after failed form validation.
- Preserve focus during polling, background refresh, list updates, and status transitions.
- Use `Escape` to close menus, disclosures where appropriate, and dialogs.
- Return focus to the invoking control after a non-navigating overlay closes.

### Screen readers and semantics

- Provide one `h1` per page and keep heading levels sequential.
- Use native buttons, links, inputs, tables, dialogs, and landmarks before ARIA alternatives.
- Give icon-only buttons an accessible name and hide decorative icons.
- Mark required fields in visible text and with the native `required` attribute when applicable.
- Associate field errors and help with their fields.
- Announce deployment status transitions in one polite live region.
- Announce urgent submission failures once with `role="alert"`.
- Give table captions enough context, such as **Recent deployments** or **Audit events**.
- Include visually hidden text for new-tab links and full localized timestamps.

### Motion and visual presentation

- Limit state transitions to opacity and color changes of 150ms or less.
- Under `prefers-reduced-motion: reduce`, remove non-essential transitions, spinners, and skeleton shimmer.
- Keep a static text label during all loading states, including reduced-motion mode.
- Support 200% browser zoom without lost content or actions at 320 CSS pixels wide.
- Do not encode status, validity, role, or outcome by color alone.
- Keep body text at 16px by default. Do not disable user zoom.

## Developer handoff acceptance checklist

- [ ] All five routes match their specified wireframe hierarchy and responsive behavior. (Desktop browser structure is verified; 320px and 200% zoom verification remains.)
- [x] Navigation hides admin items for users, marks the current item, and blocks direct non-admin access.
- [ ] Every form has visible labels, inline errors, an error summary, and preserved input. (Deployment and add-user mutation forms now implement focusable summaries, field associations, and preserved values; live invalid-submit browser flows remain to be exercised.)
- [x] Core components implement loading, empty, error, success, forbidden, offline, expired, and rate-limited recovery states.
- [x] Polling uses a three-second minimum, honors `Retry-After`, preserves focus, announces transitions only, stops at terminal states, and retains a healthy URL after failure.
- [x] Deactivation uses the specified confirmation, focus trap, Escape close, and focus lifecycle.
- [x] Credential reveal does not preload, cache, toast, or log the password.
- [ ] Statuses include text and icons; targets meet 44px preferred or 24px minimum sizing; required contrast ratios pass. (Desktop target-size spot check passes; full contrast and responsive target audit remains.)
- [ ] Keyboard-only paths cover sign-in, deployment, refresh, credential reveal, user management, filters, and pagination. (Login, admin dialog Escape/focus return, and credential reveal/hide focus were browser-verified; complete path run remains.)
- [x] `prefers-reduced-motion` removes non-essential animation without hiding progress feedback.
- [x] Automated axe-core checks report zero WCAG 2.1 AA violations on every route and major state. (Public login/access-denied and authenticated dashboard, users, audit-log, and deployment-detail routes passed; JSDOM reports one known incomplete canvas check per page.)
- [ ] Playwright verifies logical focus order, dialog focus trapping, focus return, and error-summary links.
- [ ] Manual screen-reader review verifies headings, labels, status changes, tables, and destructive-action confirmation.
- [ ] Tests confirm 200% zoom and a 320 CSS pixel viewport without clipped content or horizontal page scrolling.

## References

- [Coolify Portal MVP design](../designs/2026-09-24-coolify-portal-mvp-design.md)
- [ADR-0001: Coolify Portal MVP Architecture](../adr/0001-coolify-portal-mvp-architecture.md)
- [Prototype handoff](../../memory/archive/2026-09-22-coolify-portal-prototype-handoff.md)
