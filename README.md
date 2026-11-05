# CartOut

Order and materials organiser for home-based businesses.

IS216 Web Application Development 2, Group G1T4.

## Overview

Home-based sellers (bakers, candle makers, cafe-style drink sellers and the like) usually take orders through chat apps and track stock in their heads. Orders get missed, materials run out unexpectedly, and customers are left without updates.

CartOut is a mobile-friendly web app that acts as the administrative backbone home-based sellers lack, streamlining their workload so they miss fewer orders and avoid running out of stock.


## Links

- Git repository: https://github.com/D3besh/WAD2_Project_CartOut
- Presentation video: https://youtu.be/EMcuKukBZO8

## Demo login

| Username   | Password    |
|------------|-------------|
| amycandles | password123 |
| benbakes   | password123 |

Each demo seller comes with sample materials and products, a few recent orders, and about 12 weeks of past orders so the forecast has history to learn from.

## Features

**Accounts**
- Register, log in and log out. Passwords are hashed with bcrypt and sessions are stored in MongoDB.
- Edit shop name, email and password, or delete the account.
- Every page except login, register and a few static pages requires a logged-in seller. Each seller can only see and change their own orders, products and materials.

**Orders**
- Log an order by filling in a form, or paste a customer's chat message and let AI suggest the fields (customer, items, fulfilment method, due date). The seller reviews everything before saving.
- Each order gets a per-seller order number. Orders can be self-collect or delivery (delivery needs an address), and past due dates are refused.
- Stock check while logging: shows how many items you can make, warns if materials are short (but still lets you save), and flags the busiest day for due dates.
- Order log with search (customer name, order number), tabs and filters, payment filter, due-date sort, 12 orders per page, and bulk status updates.
- Order detail with a stage tracker (in progress, ready, completed) and payment tracking (unpaid, deposit, paid).
- Cancellations and refunds require a reason. A cancelled order puts materials back in stock only if they were not used; otherwise it counts as wastage. Completed orders cannot be cancelled or refunded.
- Customer messages are generated for each stage (confirmation, ready, receipt, cancelled, refund). The seller can copy and edit them for WhatsApp or Instagram, and they are emailed automatically when the order has a customer email.

**Products**
- Products with recipes (materials needed per unit), optional variants with their own price and extra materials, cost and making time.
- "Can make now" count for each product and variant, and a check on whether stock covers tomorrow's orders.
- Deleting a product that past orders use archives it instead of removing it.

**Materials**
- Track each material either by exact quantity (g, ml, pieces, cm) or by a rough level (low, medium, high), with an optional low-stock threshold.
- Stock is deducted when an order is created (quantity-tracked materials only).
- Search, low-stock filter, paging, "Mark as bought" restocking, and a "What to buy" list.
- A material used in a recipe cannot be deleted.

**Forecast (Home dashboard)**
- Predicts when each material will run low over the next 30 days, using a weighted average of the last 8 weeks of completed orders by weekday, with public holidays excluded.
- Includes a backtest against the last 28 days to show how accurate the forecast is.

## Tech stack

| Layer | Technology |
|-------|------------|
| Front end | Vue 3, Vue Router, Bootstrap 5, Axios, built with Vite |
| Back end | Node.js (ES modules), Express 4, express-session with connect-mongo, bcrypt |
| Database | MongoDB with Mongoose |
| Search | Fuse.js (fuzzy matching of product names in pasted messages) |
| Email | Nodemailer with Gmail SMTP |
| Testing | Playwright (end-to-end) |

### External APIs

| API | Used for |
|-----|----------|
| Google Gemini | Reading a pasted customer message into order fields |
| Groq | Fallback if Gemini fails or is out of quota |
| data.gov.sg (public holidays) | Leaving holidays out of the forecast's weekday averages |
| Gmail (via Nodemailer) | Sending order emails to customers |

## Project structure

```
.
├── client/                  Vue 3 front end
│   └── src/
│       ├── views/           Pages (login, home, orders, products, materials, profile)
│       ├── components/      Reusable UI, plus forecast/ widgets for the dashboard
│       ├── router/          Routes and login guard
│       └── utils/           Capacity, forecast and formatting helpers
├── server/                  Express API
│   ├── routes/              auth, orders, products, materials, deliveries
│   ├── models/              User, Product, Material, Order, Counter
│   ├── services/            inventory, forecast, extraction (AI), holidays, messages, email
│   ├── middleware/          requireAuth, errorHandler
│   └── seed/seed.js         Demo sellers, products, materials and order history
├── tests/
│   ├── e2e/                 Playwright specs and helpers
│   ├── unit/                Unit tests
│   └── mocks/               Sample extraction and holiday data
└── playwright.config.js
```

## Setup

Requirements: Node.js 20 or later, [pnpm](https://pnpm.io/installation), and MongoDB (local or MongoDB Atlas).

1. Open a terminal in the `client` folder and install its dependencies:

   ```
   cd client
   pnpm install
   ```

2. Open a terminal in the `server` folder and install its dependencies:

   ```
   cd server
   pnpm install
   ```

3. Create a `.env` file in the project root (the folder that contains `client` and `server`) with these values:

   | Variable | Purpose |
   |----------|---------|
   | `PORT` | Server port (defaults to 3000) |
   | `MONGODB_URI` | MongoDB connection string |
   | `SESSION_SECRET` | Secret used to sign session cookies |
   | `GEMINI_API_KEY2`, `GEMINI_MODEL` | Gemini key and model for message parsing |
   | `GROQ_API_KEY`, `GROQ_MODEL` | Groq key and model (fallback) |
   | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail address and app password for customer emails. If missing, emails are skipped. |

4. Load the sample data from the `server` terminal. This deletes existing data for the 2 demo accounts:

   ```
   pnpm seed
   ```

## Run

Run the server and the client in two separate terminals.

Server (from the `server` folder):

```
pnpm dev
```

Client (from the `client` folder):

```
pnpm dev
```

Then open http://localhost:5173. The client proxies `/api` requests to the server on port 3000.

## Test

The end-to-end tests run against the setup above, so keep both `pnpm dev` terminals running. Make sure the client is running on http://localhost:5173, and the server is running on http://localhost:3000. Then, in a third terminal in the project root:

```
pnpm install                   # first time only
pnpm exec playwright install   # first time only
pnpm test:e2e
```

The tests use the database in `MONGODB_URI`. Test accounts are named `e2e_...` and are cleaned up after each test, so seed data is left alone. The E2E suite runs on Chromium, Firefox and WebKit at desktop size, and the home page has a check that it does not overflow horizontally at 575px wide.

| Spec file | User journeys covered |
|-----------|-----------------------|
| `userAuth.spec.js` | Register, edit profile, log out and in, delete account; wrong password, short password, username taken, passwords do not match |
| `logOrder.spec.js` | Required fields turn red only after Save; past due dates refused (browser and server); busiest-day note; stock check (enough, short, shared materials, shortfall list); success, warning and error banners |
| `order.spec.js` | Create and find orders (search by name or number); bulk status updates; Ready and Completed; deposit and paid; cancel and refund rules, including stock restored vs wastage; locked payments after refund or cancellation; copy and update customer message; paging, filters and sorting; another seller cannot access my order; logged-out visitors go to login |
| `products.spec.js` | Add a product with a recipe and see "Can make"; buying stock raises it; variants; tomorrow's stock check and What to buy; search and delete; wrong input; another seller cannot access my product |
| `materials.spec.js` | Add, edit and delete; Mark as bought; What to buy; search, low-stock filter and paging; wrong input; a material in a recipe cannot be deleted; another seller cannot access my material |
| `home.spec.js` | Dashboard loads, a new order appears on Home, Order log link works, no horizontal overflow at 575px |


## Use of AI
Gen AI tools, namely ChatGPT and Claude, were used as supplementary resources during the development of this project. We used AI assistance where applicable when clarifying key technical concepts, reviewing code, critiquing our design, and some help with troubleshooting.

All AI-generated suggestions were reviewed, adapted, and validated by our team before we incorporate them into our project. The team remains responsible for any final implementaion, testing, design decisions, and the final submitted deliverable.

Gen AI tools, namely ChatGPT and Claude, were used as supplementary resources during the development of this project. We used AI assistance where applicable when clarifying key technical concepts, reviewing code, critiquing our design, and some help with troubleshooting.

All AI-generated suggestions were reviewed, adapted, and validated by our team before we incorporate them into our project. The team remains responsible for any final implementaion, testing, design decisions, and the final submitted deliverable.

As required by the IS216 AI policy, these are the parts that relied on AI/LLM:

- The initial project skeleton (folder structure, configuration files, empty route and page stubs, database schemas, seed data) was generated with Claude and then reviewed and modified by the team.
- The order-parsing feature calls Google Gemini (with Groq as a fallback) at runtime to turn a pasted customer message into suggested order fields. The server checks the result against the seller's product catalogue.
- The initial draft of the README was generated using Claude and then reviewed and modified by the team.
- Seed data in seed.js was generated using Claude.
- AI was used to assist us in checking our code functionality and correctness.


## Credits

- [Vue 3](https://vuejs.org/), [Vue Router](https://router.vuejs.org/) and [Vite](https://vitejs.dev/)
- [Bootstrap 5](https://getbootstrap.com/)
- [Express](https://expressjs.com/), [Mongoose](https://mongoosejs.com/), [express-session](https://github.com/expressjs/session), [connect-mongo](https://github.com/jdesboeufs/connect-mongo), [bcrypt](https://github.com/kelektiv/node.bcrypt.js), [Axios](https://axios-http.com/), [Fuse.js](https://www.fusejs.io/), [Nodemailer](https://nodemailer.com/)
- [Playwright](https://playwright.dev/)
- Public holidays data from [data.gov.sg](https://data.gov.sg/)