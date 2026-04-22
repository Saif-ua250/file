"use strict";

// This imports Node's path utilities for safe cross-platform file paths.
const path = require("path");
// This imports Node's file utilities for startup environment diagnostics.
const fs = require("fs");
// This loads environment variables from a .env file when available.
const dotenv = require("dotenv");
// This imports the Express framework used to build the API server.
const express = require("express");
// This imports the Google Gemini SDK package.
const { GoogleGenerativeAI } = require("@google/generative-ai");
// This imports the compressor module to reduce prompt token usage.
const { compressPrompt } = require("./src/compressor");
// This imports cache functions for similar-prompt cache lookup and storage.
const { getCachedResponse, storeResponse } = require("./src/cache");
// This imports tracker functions for call logging and summary stats.
const { logCall, getSummary } = require("./src/tracker");

// This sets the fixed server port requested for this project.
const PORT = 3000;
// This resolves the expected .env file path in the project root.
const ENV_PATH = path.join(__dirname, ".env");
// This checks whether the .env file exists before loading it.
const envFileExists = fs.existsSync(ENV_PATH);
// This loads environment variables using the resolved .env path and allows .env to override empty inherited values.
const dotenvResult = dotenv.config({ path: ENV_PATH, override: true });
// This sets a simple per-token cost for savings calculations.
const COST_PER_TOKEN = 0.000003;
// This defines the model name used for simpler prompts.
const SIMPLE_MODEL = process.env.DEFAULT_MODEL || "gemini-flash-latest";
// This defines the model name used for more complex prompts.
const COMPLEX_MODEL = process.env.COMPLEX_MODEL || "gemini-flash-latest";

// This creates the Express application instance.
const app = express();

// This logs startup diagnostics so environment issues are easy to spot.
console.log(`[TokenSmart] .env path: ${ENV_PATH}`);
// This logs whether the .env file exists in the expected location.
console.log(`[TokenSmart] .env exists: ${envFileExists}`);
// This logs whether dotenv loaded the file without an error.
console.log(`[TokenSmart] dotenv loaded: ${dotenvResult && !dotenvResult.error}`);
// This logs if GEMINI_API_KEY is available without printing the secret value.
console.log(`[TokenSmart] GEMINI_API_KEY present: ${Boolean(process.env.GEMINI_API_KEY)}`);

// This adds basic CORS headers so any frontend origin can call this API.
app.use((req, res, next) => {
	// This allows requests from all origins.
	res.header("Access-Control-Allow-Origin", "*");
	// This allows common request headers used by web apps.
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
	// This allows common HTTP methods used by API clients.
	res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
	// This quickly answers CORS preflight checks.
	if (req.method === "OPTIONS") {
		// This returns a success response for preflight requests.
		return res.sendStatus(204);
	}
	// This passes control to the next middleware/route handler.
	return next();
});

// This enables JSON request body parsing for incoming API payloads.
app.use(express.json());

// This logs incoming API requests for quick request-path debugging.
app.use((req, res, next) => {
	// This prints method and URL for each incoming request.
	console.log(`[TokenSmart] ${req.method} ${req.url}`);
	// This continues request processing through the middleware chain.
	return next();
});

// This helper chooses a model based on prompt complexity signals.
function chooseModel(promptText) {
	// This ensures the prompt is always treated as a string.
	const text = typeof promptText === "string" ? promptText : "";
	// This lowercases text so keyword checks are case-insensitive.
	const lowered = text.toLowerCase();
	// This checks for complexity keywords often seen in advanced tasks.
	const hasComplexKeyword = /\b(architecture|optimi[sz]e|security|benchmark|trade-?off|analy[sz]e|multi-step|algorithm|reasoning)\b/.test(
		lowered
	);
	// This checks for longer prompts that usually need stronger reasoning.
	const isLongPrompt = text.length > 400;
	// This checks for multiple question markers suggesting layered asks.
	const hasMultipleQuestions = (text.match(/\?/g) || []).length > 1;
	// This returns the complex model when complexity indicators are present.
	if (hasComplexKeyword || isLongPrompt || hasMultipleQuestions) {
		// This chooses Sonnet for higher complexity requests.
		return COMPLEX_MODEL;
	}
	// This chooses Haiku for shorter and simpler requests.
	return SIMPLE_MODEL;
}

// This helper creates a Gemini client using the configured API key.
function createGeminiClient() {
	// This validates that a Gemini API key is present.
	if (!process.env.GEMINI_API_KEY) {
		// This returns null when configuration is missing.
		return null;
	}

	// This creates and returns the Gemini SDK client instance.
	return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// This helper calls Gemini and returns plain response text.
async function callGeminiModel({ prompt, systemPrompt, model }) {
	// This creates the Gemini client instance.
	const client = createGeminiClient();
	// This validates that a Gemini client was successfully created.
	if (!client) {
		// This throws a clear configuration error when key is missing.
		throw new Error("Missing GEMINI_API_KEY environment variable.");
	}

	// This builds ordered model candidates so we can recover from model-id changes.
	const modelCandidates = [model, "gemini-flash-latest", "gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash"];
	// This removes duplicates while preserving candidate order.
	const uniqueCandidates = [...new Set(modelCandidates.filter(Boolean))];

	// This tracks the last error in case all candidates fail.
	let lastError = null;

	// This attempts each model candidate until one works.
	for (const candidateModel of uniqueCandidates) {
		try {
			// This creates a model-scoped client with optional system instruction.
			const modelClient = client.getGenerativeModel({
				// This sets the current candidate model for this attempt.
				model: candidateModel,
				// This passes optional system instruction when provided.
				systemInstruction: systemPrompt || undefined,
			});

			// This sends prompt text to Gemini and waits for completion.
			const result = await modelClient.generateContent(prompt);
			// This extracts plain text from Gemini response.
			const text = result && result.response && typeof result.response.text === "function" ? result.response.text() : "";
			// This returns text when available and ends the retry loop.
			if (text) {
				return text;
			}
			// This returns a safe fallback when response has no text.
			return "No response text returned by model.";
		} catch (error) {
			// This stores the latest error for potential final throw.
			lastError = error;
			// This checks if the failure likely indicates unsupported/missing model id.
			const message = error && error.message ? String(error.message) : "";
			const isModelIdIssue = /not found|not supported|models\//i.test(message);
			// This retries next candidate only for model-id issues.
			if (isModelIdIssue) {
				continue;
			}
			// This rethrows non-model-id failures immediately.
			throw error;
		}
	}

	// This throws the last captured error if all candidates failed.
	throw lastError || new Error("Gemini call failed for all model candidates.");
}

// This handles chat requests and applies compression, caching, routing, and tracking.
app.post("/api/chat", async (req, res) => {
	// This logs that the chat endpoint was reached.
	console.log("[TokenSmart] /api/chat handler started.");
	// This safely reads the prompt from request body.
	const prompt = req.body && typeof req.body.prompt === "string" ? req.body.prompt : "";
	// This safely reads optional system prompt from request body.
	const systemPrompt = req.body && typeof req.body.systemPrompt === "string" ? req.body.systemPrompt : "";
	// This logs input sizes to help debug body parsing issues.
	console.log(`[TokenSmart] Prompt length: ${prompt.length}, System prompt length: ${systemPrompt.length}`);

	// This rejects empty prompts with a clear client error.
	if (!prompt.trim()) {
		// This logs validation failure for empty prompts.
		console.log("[TokenSmart] /api/chat rejected: empty prompt.");
		// This returns HTTP 400 with a helpful validation message.
		return res.status(400).json({ error: "'prompt' is required and must be a non-empty string." });
	}

	// This runs prompt compression to reduce token usage.
	const compression = compressPrompt(prompt);
	// This logs compression metrics for visibility.
	console.log(
		`[TokenSmart] Compression -> original: ${compression.originalTokenEstimate}, compressed: ${compression.compressedTokenEstimate}, saved: ${compression.savedTokens}`
	);
	// This checks cache for similar compressed prompts before any model call.
	const cacheResult = getCachedResponse(compression.compressedPrompt);
	// This logs whether the cache produced a hit.
	console.log(`[TokenSmart] Cache hit: ${cacheResult.hit}`);

	// This handles cache hits by returning cached response immediately.
	if (cacheResult.hit) {
		// This logs that the response is being served from cache.
		console.log("[TokenSmart] Returning cached response.");
		// This estimates baseline cost without TokenSmart optimizations.
		const estimatedCostWithoutTokenSmart = Number((compression.originalTokenEstimate * COST_PER_TOKEN).toFixed(8));
		// This sets actual cost to zero because no model call is made on cache hit.
		const actualCostOfCall = 0;
		// This logs cache-hit call details into persistent usage tracking.
		const logged = logCall({
			// This stores original prompt token estimate.
			originalTokenCount: compression.originalTokenEstimate,
			// This stores compressed prompt token estimate.
			compressedTokenCount: compression.compressedTokenEstimate,
			// This stores tokens saved by prompt compression.
			tokensSavedByCompression: compression.savedTokens,
			// This tags model as cache-hit for traceability.
			modelUsed: "cache-hit",
			// This marks cache usage for hit-rate analytics.
			cacheHit: true,
			// This stores real cost spent on this request.
			actualCostOfCall,
			// This stores what cost would likely have been without TokenSmart.
			estimatedCostWithoutTokenSmart,
		});

		// This returns cached response with requested savings details.
		return res.json({
			// This returns the cached model response content.
			response: cacheResult.response,
			// This returns savings and optimization metadata.
			savings: {
				// This returns tokens saved by prompt compression.
				tokensaved: compression.savedTokens,
				// This returns money saved as calculated by tracker for this call.
				moneySaved: logged.moneySaved,
				// This returns source used for this response path.
				modelUsed: "cache-hit",
				// This confirms that cache was used.
				cacheHit: true,
			},
		});
	}

	// This wraps miss-path logic in try/catch for robust error handling.
	try {
		// This routes the compressed prompt to an appropriate model.
		const modelUsed = chooseModel(compression.compressedPrompt);
		// This logs which model routing selected.
		console.log(`[TokenSmart] Model selected: ${modelUsed}`);
		// This calls Gemini with compressed prompt and optional system prompt.
		const responseText = await callGeminiModel({
			// This sends the compressed prompt to lower token usage.
			prompt: compression.compressedPrompt,
			// This forwards optional system guidance unchanged.
			systemPrompt,
			// This uses the selected model from routing logic.
			model: modelUsed,
		});
		// This logs response size from the model call.
		console.log(`[TokenSmart] Model response length: ${responseText.length}`);

		// This stores the response against compressed prompt for future cache hits.
		storeResponse(compression.compressedPrompt, responseText);

		// This computes estimated real call cost based on compressed tokens.
		const actualCostOfCall = Number((compression.compressedTokenEstimate * COST_PER_TOKEN).toFixed(8));
		// This computes estimated baseline cost without TokenSmart.
		const estimatedCostWithoutTokenSmart = Number((compression.originalTokenEstimate * COST_PER_TOKEN).toFixed(8));

		// This logs call details for historical tracking and summaries.
		const logged = logCall({
			// This stores original prompt token estimate.
			originalTokenCount: compression.originalTokenEstimate,
			// This stores compressed prompt token estimate.
			compressedTokenCount: compression.compressedTokenEstimate,
			// This stores token savings from compression.
			tokensSavedByCompression: compression.savedTokens,
			// This stores selected model for analytics.
			modelUsed,
			// This marks this request as a non-cache path.
			cacheHit: false,
			// This stores estimated actual spend for this call.
			actualCostOfCall,
			// This stores estimated baseline spend without optimization.
			estimatedCostWithoutTokenSmart,
		});

		// This returns model response and savings metadata to the caller.
		return res.json({
			// This returns the generated AI response text.
			response: responseText,
			// This groups savings and path details under one object.
			savings: {
				// This returns tokens saved by prompt compression.
				tokensaved: compression.savedTokens,
				// This returns money saved for this single call.
				moneySaved: logged.moneySaved,
				// This returns which model was selected by router logic.
				modelUsed,
				// This confirms this was not a cache hit.
				cacheHit: false,
			},
		});
	} catch (error) {
		// This logs the full error for server-side debugging.
		console.error("[TokenSmart] /api/chat failed:", error);
		// This returns a consistent server error response on failures.
		return res.status(500).json({
			// This provides a stable error label for clients.
			error: "Chat processing failed.",
			// This provides extra context for debugging in development.
			details: error && error.message ? error.message : "Unknown server error.",
		});
	}
});

// This returns aggregate usage and savings statistics from tracker.
app.get("/api/stats", (req, res) => {
	// This fetches the full computed summary from persistent logs.
	const summary = getSummary();
	// This sends the summary as JSON response.
	return res.json(summary);
});

// This serves the dashboard HTML for the project root path.
app.get("/", (req, res) => {
	// This resolves the dashboard file path relative to project root.
	const dashboardPath = path.join(__dirname, "dashboard", "index.html");
	// This sends the dashboard file to the browser.
	return res.sendFile(dashboardPath);
});

// This starts the HTTP server only when this file is run directly.
if (require.main === module) {
	// This begins listening for incoming requests on the configured port.
	const server = app.listen(PORT, () => {
		// This prints a startup message for quick local visibility.
		console.log(`TokenSmart server running on http://localhost:${PORT}`);
	});

	// This handles startup/runtime server errors with clear messages.
	server.on("error", (error) => {
		// This checks for the common case where the port is already in use.
		if (error && error.code === "EADDRINUSE") {
			// This explains the exact issue and how to resolve it.
			console.error(`Port ${PORT} is already in use. Stop the existing server before starting a new one.`);
			// This exits with failure status after reporting the issue.
			process.exit(1);
		}

		// This reports unexpected server errors for debugging.
		console.error("Server failed to start:", error);
		// This exits with failure status on unexpected startup errors.
		process.exit(1);
	});
}

// This exports the app and helpers for testing or external usage.
module.exports = {
	// This exposes the Express app instance.
	app,
	// This exposes the model chooser for testability.
	chooseModel,
	// This exposes Gemini-call helper for testability.
	callGeminiModel,
};
