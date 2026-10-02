# Lunchbox Delivery (A SRKREC Startup): Admin Dashboard

The operations hub for a daily lunchbox delivery service. One web page, no framework, that lets a small team run hundreds of deliveries a day: assign routes, watch progress live, talk to customers, and keep a permanent record.

![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20Vanilla%20JS-F7DF1E)
![Hosting](https://img.shields.io/badge/hosting-Netlify-00C7B7)
![Live data](https://img.shields.io/badge/live%20data-Firestore-FFCA28)
![History](https://img.shields.io/badge/history-PostgreSQL-336791)

<!-- Add screenshots here: Dashboard, Deliveries, Analytics -->

## What it's for

Every morning the admin assigns routes. Through the day agents update their stops from the Android app, customers message or skip a day from their portal, and the dashboard reflects everything as it happens. Each evening the day is archived into history for reporting.

## Features

### Run the day
- **Live dashboard**: totals for pending, completed, delayed and no-box, a completion bar, and per-agent load. Every card opens a pre-filtered list.
- **Auto Assign**: allocates customers by preferred agent, then zone, then workload. Previewing changes nothing.
- **Deliveries**: search by name, phone or Box ID; filter by status or agent; add stops by hand; reassign delayed ones in a click.
- **Route order**: set the stop sequence for an agent and the order is remembered for the next day.
- **Delayed panel**: a focused list of what needs attention right now.

### Know your people
- **Customers**: master list with edit, pause, delete, unique Box ID checks and Excel export.
- **Excel import**: preview and bulk-import `.xlsx` / `.csv`; duplicate Box IDs are skipped.
- **Agents**: create accounts, edit profiles, see On Duty status.

### Stay in touch
- **Customer inbox**: a two-pane chat with unread badges.
- **Broadcast**: WhatsApp template messages via WATI to everyone, a zone, or tomorrow's no-box list, with a send history.
- **No-box requests**: who is skipping tomorrow, at a glance.

### Learn from the data
- **History**: any past day, filterable by status and agent, grouped per agent, with public holiday markers and Excel export.
- **Analytics**: customer and agent breakdowns for all time, a month or a date range; weekly completion trend; agent attendance from duty logs.

### Safe by design
- **Manual critical actions**: route assignment and the daily reset never run on a timer.
- **Confirmation dialogs**, with an extra warning during delivery hours.
- **Archive-then-delete**: the day is saved to history first; live data is removed only after that succeeds.

## Tech stack

| Concern | Choice |
|---|---|
| Front end | HTML, CSS, vanilla JavaScript (no build step) |
| Live data and auth | Firebase Authentication and Cloud Firestore |
| History and analytics | PostgreSQL on Supabase |
| API layer | Netlify Functions (Node.js) |
| Charts and Excel | Chart.js, SheetJS |
| Messaging | WATI WhatsApp API |
| Hosting | Netlify |

## Repository layout

```
index.html                 app shell, panels and modals
project/
├── css/admin.css
└── js/
    ├── firebase-init.js   configuration and shared state (not committed)
    ├── ui.js              navigation, toasts, confirm dialog
    ├── deliveries.js      live list, reassignment, route order
    ├── agents.js          agent management
    ├── customers.js       master list, import, validation
    ├── assign.js          routing logic
    ├── inbox.js  nobox.js  broadcast.js
    ├── history.js         archive and daily reset
    ├── history_v2.js      History panel
    ├── analytics.js       analytics tables and modals
    ├── analytics_v2.js    analytics data layer and chart
    └── export.js          Excel exports
netlify/functions/         serverless endpoints
```

## Getting started

1. **Create a Firebase project** with Authentication (email/password) and Firestore.
2. **Add `project/js/firebase-init.js`** with your Firebase web config, and initialise `auth` and `db`. This file is git-ignored.
3. **Create a Supabase project** and the tables described in [`docs/TECHNICAL.md`](docs/TECHNICAL.md).
4. **Deploy to Netlify** and set these environment variables:
   - `DATABASE_URL` (Supabase pooled connection string)
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
5. **Create the first admin**: add a Firebase Auth user and a `users/{uid}` document with `role: "admin"`.
6. Sign in, add agents, import customers, and run your first assignment.

## A typical day

| When | What |
|---|---|
| Morning | Auto Assign → Assign Today's Routes |
| Through the day | Watch the dashboard; reassign delayed stops |
| End of day | Mark remaining stops delivered, then Archive & Reset |

## Related projects

- **Agent App** (Android): the field companion to this dashboard
- **Customer Portal**: customers sign in with a Box ID and PIN
- Full design notes live in [`docs/TECHNICAL.md`](docs/TECHNICAL.md)

## License

Private project. All rights reserved.
