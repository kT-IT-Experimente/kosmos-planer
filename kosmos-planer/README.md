# Kosmos Planer Setup

## Prerequisites

- Node.js (v18 or later recommended)
- Netlify CLI (recommended for local development)

## Installation

1.  Navigate to the project directory:
    ```bash
    cd kosmos-planer/kosmos-planer
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

## Environment Variables

Create a `.env` file in `kosmos-planer/kosmos-planer` with the following variables:

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_API_KEY=your_api_key (optional)
```

## Running Locally

### Option 1: Using Netlify Dev (Recommended)

This runs both the frontend and the backend functions.

```bash
netlify dev
```

### Option 2: Using Vite (Frontend Only)

If you only need to work on the UI, you can run:

```bash
npm run dev
```

Note: API calls will be proxied to `http://localhost:8888/.netlify/functions`. You must have the functions server running separately (e.g. `netlify functions:serve`) for API calls to work involving backend logic.

## Troubleshooting

-   **"npm not found"**: Ensure Node.js is installed and in your PATH.
-   **Auth Errors**: Verify `GOOGLE_CLIENT_ID`/`SECRET` are correct and match your Google Cloud Console configuration (Authorized Origins/Redirect URIs).
