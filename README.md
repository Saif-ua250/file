# TokenSmart

AI Cost Optimization Layer for teams shipping production AI.

[![Book a Demo](https://img.shields.io/badge/Book%20a%20Demo-00ff88?style=for-the-badge&logo=calendly&logoColor=0f0f0f)](https://calendly.com/tokensmart/demo)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-1f2937?style=for-the-badge&logo=node.js)
![Express](https://img.shields.io/badge/Express-API-1f2937?style=for-the-badge&logo=express)

## What TokenSmart Does

TokenSmart sits between your app and AI providers to automatically reduce waste in every request. It shortens prompts before they are sent, reuses previous answers when users ask similar questions, and routes each task to the right model so you do not overpay for simple jobs. The result is a smoother user experience with meaningfully lower AI spend, without changing how your product team works day to day.

## The Problem It Solves

Most teams scale AI usage faster than they scale cost controls. As usage grows, prompt bloat, repeated queries, and unnecessary use of premium models can compound into large monthly bills. TokenSmart addresses these leaks in real time. In practice, an average SaaS company can save **40-60% on AI costs** by adding optimization and routing controls at the middleware layer.

## Features

- Prompt compression to remove filler language and duplicate context.
- Similarity-based response caching for repeated and near-duplicate prompts.
- Smart model routing for cost-aware model selection.
- Usage and savings tracking for operational visibility.
- Dashboard and API-first architecture for easy integration.

## Install and Run

### Prerequisites

- Node.js 20+
- npm 10+
- Google Gemini API key

### 1. Install dependencies

    npm install

### 2. Configure environment

Create a .env file in the project root:

    PORT=3000
    GEMINI_API_KEY=your_gemini_api_key_here
    CACHE_TTL_SECONDS=86400
    SIMILARITY_THRESHOLD=0.85
    DEFAULT_MODEL=gemini-flash-latest
    COMPLEX_MODEL=gemini-flash-latest

### 3. Start the server

    node server.js

Server URL: http://localhost:3000  
Dashboard URL: http://localhost:3000/

## API Documentation

### POST /api/chat

Runs the full TokenSmart pipeline in one call: compress prompt, check cache, route model, call AI (if needed), and log savings.

Request body:

    {
      "prompt": "Explain token optimization for startup teams",
      "systemPrompt": "Optional system instruction"
    }

Request notes:

- prompt is required.
- systemPrompt is optional.

Success response:

    {
      "response": "...model output...",
      "savings": {
        "tokensaved": 42,
        "moneySaved": 0.000126,
        "modelUsed": "gemini-flash-latest",
        "cacheHit": false
      }
    }

Error response:

    {
      "error": "Chat processing failed.",
      "details": "Error detail"
    }

### GET /api/stats

Returns aggregated usage and savings metrics.

Success response:

    {
      "totalCalls": 1243,
      "totalSavedTokens": 982103,
      "totalMoneySaved": 12.582431,
      "cacheHitRate": 38.7
    }

## Pricing

### Starter - $299/month

- For teams with up to $1,000 monthly AI spend.
- Includes compression, caching, routing, and dashboard analytics.

### Pro - $699/month

- For teams with up to $5,000 monthly AI spend.
- Includes advanced controls, deeper analytics, and priority support.

### Enterprise - Custom

- For high-scale organizations with custom technical and security requirements.
- Includes tailored onboarding, architecture guidance, and SLA options.

## Book a Demo

See TokenSmart on your own use case and estimate projected savings in one session.

Book here: https://calendly.com/tokensmart/demo

---

Built for product and engineering teams that want AI growth without runaway AI bills.
