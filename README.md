# CartOut

Order and materials organiser for home-based businesses.
IS216 Web Application Development 2, Group G1T4.

> Replace everything marked TODO before submission.

## Links

- Deployed app: TODO
- Git repository: TODO
- Presentation video: TODO

## Demo login

| Email | Password |
|---|---|
| demo@sidekick.test | demo1234 |

## Tech stack

- Front end: Vue 3, Vue Router, Bootstrap 5 (built with Vite)
- Back end: Node.js, Express
- Data store: MongoDB (Mongoose)
- External APIs: TODO (e.g. Gemini, OneMap, data.gov.sg public holidays)

## Setup

Requirements: Node.js 20 or later, and MongoDB (local or MongoDB Atlas).

1. Install dependencies:
   ```
   npm run install:all
   ```
2. Copy `.env.example` to `.env` and fill in the values.
3. Load sample data (this deletes existing data):
   ```
   npm run seed
   ```

## Run

Production-style (one server, as graders will use it):
```
npm run build
npm start
```
Then open http://localhost:3000

Development (auto-reload):
```
npm run dev
```
Then open http://localhost:5173

## Test

```
npm run test:unit   # algorithm unit tests
npx playwright install   # first time only
npm run test:e2e    # end-to-end tests on mobile and desktop sizes
```
E2E tests use mocked external APIs (`USE_MOCK_APIS=true`) so results are repeatable.

TODO: list each test case and the user journey it covers.

## Use of AI

As required by the IS216 AI policy, these are the parts that relied on AI/LLM:

- Initial project skeleton (folder structure, configuration files, empty route
  and page stubs, database schemas, seed data) was generated with Claude and
  then reviewed and modified by the team.
- TODO: list any other AI use.

## Credits

TODO: list third-party libraries and code sources used (FAQ 6).
