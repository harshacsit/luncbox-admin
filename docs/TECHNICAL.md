# Lunchbox Delivery (A SRKREC Startup): Technical Documentation

This document explains how the platform is put together and why. It is written for developers who need to understand, extend or maintain it.

**Contents**
1. Overview
2. Architecture
3. Data model
4. Core workflows
5. Backend functions
6. Security
7. Reliability and cost design
8. Development and deployment
9. Testing
10. Roadmap

---

## 1. Overview

Lunchbox Delivery manages a daily lunchbox pickup-and-delivery operation. Three clients share one backend:

| Client | Audience | Technology |
|---|---|---|
| Admin Dashboard | Operations team | HTML, CSS, vanilla JS |
| Agent App | Delivery agents | Android (Java) |
| Customer Portal | Customers | Mobile-first web page |

Design priorities, in order: **reliability during delivery hours**, **low running cost**, **simplicity** (no build tooling on the web side), and **forgiving UX** for people working on the move.

## 2. Architecture

```
Admin Dashboard ─┐
Agent App ───────┼──► Cloud Firestore     live, today's operations
Customer Portal ─┘

Admin Dashboard ──► Netlify Functions ──► PostgreSQL (Supabase)   archived history
Admin Dashboard ──► WATI                                          WhatsApp broadcasts
Agent App ──► Firebase Cloud Messaging                            push notifications
```

### Two stores, one rule

- **Firestore** holds only what changes today: deliveries, messages, requests, profiles.
- **PostgreSQL** holds everything that has finished: archived deliveries and daily summaries.

Early on, history lived in Firestore and analytics scanned every archived document, so read costs grew with every day of history. Moving finished data to PostgreSQL made analytics a set of SQL aggregations and made Firestore usage depend only on the current day.

## 3. Data model

### Firestore (live)

| Collection | Purpose | Key fields |
|---|---|---|
| `users` | Admins and agents | `role`, `name`, `zone`, `phone`, `maxDeliveries`, `fcmToken`, `onDuty` |
| `customers` | Permanent master list | `boxId`, `name`, `phone`, `pickupLocation`, `deliveryAddress`, `zone`, `assignedAgent`, `routeOrder`, `active` |
| `deliveries` | One document per customer per day | `customerId`, `boxId`, `assignedTo`, `status`, `wasDelayed`, `pickupOrder`, `deliveryDate` |
| `messages` | Customer–admin chat | `customerId`, `text`, `from`, `read`, `timestamp` |
| `nobox_requests` | Customers skipping a day | `customerId`, `date`, `requestedAt` |
| `config` | App settings | customer PIN, scheduling markers |
| `duty_logs` | Agent on/off duty events | `agentId`, `type`, `timestamp` |
| `broadcast_logs` | Broadcast audit trail | `templateName`, `sent`, `failed`, `timestamp` |

**Delivery status** is one of `Pending`, `Picked`, `Delayed`, `NoBox`, `Delivered`. `wasDelayed` is set once when a stop is delayed and never cleared, which preserves the fact even after the status changes.

### PostgreSQL (history)

**`archived_deliveries`**: one row per past delivery. The primary key is the original Firestore document ID, which makes every import safe to repeat.

**`daily_summary`**: one row per archived date (`archive_date` as key) holding totals, delivered, delayed, pending and completion rate.

Delivery date and Box ID are deliberately **not** unique: both legitimately repeat across rows.

## 4. Core workflows

### 4.1 Morning assignment
1. Confirm (with an extra warning during delivery hours).
2. Archive any leftover deliveries from earlier days.
3. Load active customers; if today already has deliveries, require two further confirmations before replacing them.
4. Allocate: preferred agent, then matching zone (within `maxDeliveries`), then the agent with the lightest load.
5. Order each agent's stops by their saved `routeOrder`, then pickup location.
6. Write deliveries in batches below Firestore's 500-operation limit.

### 4.2 Status updates in the field
1. The agent taps a status; an Undo snackbar appears.
2. After about 3.5 seconds the change is committed to Firestore.
3. If the device is offline or the write fails, the update is queued locally and replayed when connectivity returns.
4. Delayed and No Box also create a notification record for the admin.

### 4.3 End-of-day archive
1. Group live deliveries by their own `deliveryDate`.
2. Send each date's summary and rows to the history function.
3. Only after that succeeds, delete those documents from Firestore.

If any step fails, live data is untouched and the reset can be retried.

### 4.4 Customer access
Customers sign in with a Box ID and a PIN. Their portal shows today's delivery timeline, the assigned agent, and a chat with the office, and lets them skip tomorrow.

### 4.5 Broadcasts
The admin picks recipients, then the dashboard sends an approved WATI template per recipient with name and Box ID parameters and logs the result. WhatsApp only delivers approved templates outside a 24-hour chat window.

## 5. Backend functions

Netlify Functions in Node.js. Each verifies the caller's Firebase ID token before touching the database.

| Function | Method | Purpose |
|---|---|---|
| `sync-history` | POST | Atomically store a day's summary and rows |
| `history` | GET `?date=` | Summary and deliveries for one day |
| `analytics-history` | GET `?scope=all` or `?scope=month&month=YYYY-MM` | Per-customer and per-agent counts computed in SQL |
| `weekly-trend` | GET | Daily totals for the weekly chart |
| `backfill-history` | GET `?date=` | One-time migration helper |

Database connections go through the **Supabase transaction pooler**, which is required for serverless runtimes because direct connections can exhaust the connection limit.

## 6. Security

- Staff authenticate with Firebase Authentication; the API validates ID tokens server-side.
- Firestore security rules restrict writes to core operational data to authenticated users.
- Credentials (service account, database URL, third-party tokens) live in environment variables or git-ignored local files, never in source control.
- Agent MPINs are stored as SHA-256 hashes on the device and never leave it.
- Deployment recommendations: keep the repository private, restrict database policies to the minimum needed, rotate keys on a schedule, and review Firestore rules whenever a new client is added.

## 7. Reliability and cost design

- **Manual critical actions.** An earlier auto-scheduler could fire twice with multiple tabs open or loop when quotas ran out. Assignment and reset are now explicit admin actions with confirmation.
- **Bounded reads.** The live deliveries listener is restricted to today's date, and inbox and no-box listeners are capped.
- **Idempotent history writes.** Keying on the original document ID means retries and backfills can't create duplicates.
- **Offline-tolerant agents.** The Android app combines Firestore persistence with its own write queue.
- **Aggregation in SQL.** Analytics counts are computed in the database rather than by looping over raw rows in the browser.

## 8. Development and deployment

**Web:** no build step. Serve `index.html` and the `project/` folder, supply `firebase-init.js` for your environment, and deploy to Netlify with the functions directory configured in `netlify.toml`.

**Android:** open in Android Studio, add `google-services.json`, sync Gradle, run.

**Environment variables**

| Name | Used by |
|---|---|
| `DATABASE_URL` | All history functions |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Token verification |
| `BACKFILL_SECRET` | Optional, backfill only |

**Conventions**
- Shared state (`agents`, `allDeliveries`, `curFilter`, and others) is declared once in `firebase-init.js`; other modules only read and write it.
- Prefer small, targeted edits to individual modules.
- Treat local runs as production-connected unless you are using emulators.

## 9. Testing

Before releasing a change, walk through:

1. Create an agent and assign routes; confirm the agent sees them.
2. Mark Picked, Delayed and No Box; check the dashboard and the delayed flag.
3. Go offline, change a status, reconnect, and confirm the sync.
4. Run Archive & Reset; verify the history tables and that live data is cleared.
5. Open History and Analytics for that date.
6. Send a broadcast to a one-person test group.

## 10. Roadmap

- Progressive web app for agents on iPhone
- Role-based authorization enforced in the API
- Fully server-side analytics
- Firebase Emulator Suite for safe local development
- Scheduled, opt-in automation behind explicit safeguards
