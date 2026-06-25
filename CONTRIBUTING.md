# Contributing to Mobilewright Inspector

Thanks for taking the time to contribute.

## Ground rules

- This project wraps [mobilewright](https://github.com/mobile-next/mobilewright) and is not affiliated with MobileNext. Keep the scope focused on the inspector itself — don't reach for mobilecli or mobile-mcp directly.
- Keep the frontend free of frameworks and build steps. Plain HTML/CSS/JS only.
- Keep the backend plain JavaScript (no TypeScript compilation). JSDoc for type hints is fine.
- One responsibility per file. New screens go in `src/server` or `public/js` following the existing class structure.
- Tests live in `tests/`. Locator logic, device manager behaviour, and route contracts all have test coverage — keep them passing and extend them for new behaviour.

## Locator derivation

`src/server/lib/locator-derivation.js` is the single source of truth for how element locators are computed. Its logic must stay in sync with mobilewright's `query-engine.ts`. If mobilewright is upgraded and role mappings or matching rules change, update this file and its tests together.

## Development setup

```bash
git clone https://github.com/marcomaes/mobilewright-inspector.git
cd mobilewright-inspector
npm install
npm run dev   # starts server with auto-restart on file changes
```

Run tests (no device needed):

```bash
npm test
```

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Make your change. If it touches locator derivation, add or update tests in `tests/locator-derivation.test.js`.
3. Run `npm test` — all tests must pass.
4. Open a pull request with a clear description of what changed and why.

## Reporting bugs

Open an issue and include:

- Node.js version (`node --version`)
- Platform (iOS / Android) and device/simulator name
- mobilewright version (`npm list mobilewright`)
- Steps to reproduce
- What you expected vs. what happened
