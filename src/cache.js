"use strict";

// This imports the in-memory cache library used to store prompt-response data.
const NodeCache = require("node-cache");
// This imports the natural language toolkit to compute text similarity.
const natural = require("natural");

// This defines how long cache entries live: 24 hours in seconds.
const CACHE_TTL_SECONDS = 24 * 60 * 60;
// This defines the similarity threshold (85%) required for a cache hit.
const SIMILARITY_THRESHOLD = 0.85;
// This defines the saved-cost rate per token for cache hits.
const COST_PER_TOKEN = 0.000003;

// This creates a cache instance with a default TTL of 24 hours.
const responseCache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS, checkperiod: 600 });

// This helper estimates token count using the simple rule: characters divided by 4.
function estimateTokens(text) {
	// This makes sure non-string values do not break token estimation.
	const safeText = typeof text === "string" ? text : "";
	// This rounds up so partial tokens are counted as whole tokens.
	return Math.ceil(safeText.length / 4);
}

// This helper normalizes text so similarity comparison is more consistent.
function normalizePrompt(prompt) {
	// This safely converts unknown inputs to an empty string.
	const safePrompt = typeof prompt === "string" ? prompt : "";
	// This trims edges, lowercases text, and collapses extra spaces.
	return safePrompt.trim().toLowerCase().replace(/\s{2,}/g, " ");
}

// This stores a response in cache using the prompt as the key.
function storeResponse(prompt, response) {
	// This computes a normalized cache key from the prompt text.
	const key = normalizePrompt(prompt);
	// This ignores empty prompts so the cache stays clean and predictable.
	if (!key) {
		// This returns false to signal that nothing was saved.
		return false;
	}

	// This builds the object we want to keep for future retrieval.
	const entry = {
		// This keeps the original prompt for future similarity scans.
		prompt: key,
		// This stores the AI response payload as-is.
		response,
		// This records when the item was cached for optional diagnostics.
		storedAt: Date.now(),
	};

	// This writes the entry into the cache with the default 24-hour TTL.
	return responseCache.set(key, entry, CACHE_TTL_SECONDS);
}

// This searches for a similar prompt in cache before making a new AI call.
function getCachedResponse(prompt) {
	// This normalizes the incoming prompt for fair comparison.
	const normalizedIncomingPrompt = normalizePrompt(prompt);
	// This returns an immediate miss when the input prompt is empty.
	if (!normalizedIncomingPrompt) {
		// This returns the required response shape for a cache miss.
		return { hit: false, response: null, savedCost: 0 };
	}

	// This gets all existing cache keys to compare against.
	const keys = responseCache.keys();
	// This prepares variables to track the best matching cached prompt.
	let bestKey = null;
	// This starts with zero so any real similarity can beat it.
	let bestSimilarity = 0;

	// This loops over every cached prompt key for similarity scoring.
	for (const cachedKey of keys) {
		// This computes similarity between incoming prompt and cached prompt.
		const similarity = natural.JaroWinklerDistance(normalizedIncomingPrompt, cachedKey);
		// This keeps the highest-scoring key found so far.
		if (similarity > bestSimilarity) {
			// This updates the best similarity score.
			bestSimilarity = similarity;
			// This remembers the cache key associated with that score.
			bestKey = cachedKey;
		}
	}

	// This checks whether the best match meets the 85% threshold.
	if (bestKey && bestSimilarity >= SIMILARITY_THRESHOLD) {
		// This fetches the cached entry for the best matching prompt.
		const cachedEntry = responseCache.get(bestKey);
		// This handles rare cases where key exists but value is unavailable.
		if (!cachedEntry) {
			// This returns a miss if the entry cannot be read.
			return { hit: false, response: null, savedCost: 0 };
		}

		// This estimates tokens in the cached response payload as text.
		const tokenCount = estimateTokens(
			// This converts object responses to JSON so size can still be estimated.
			typeof cachedEntry.response === "string"
				? cachedEntry.response
				: JSON.stringify(cachedEntry.response)
		);
		// This computes saved cost from estimated tokens and the fixed rate.
		const savedCost = Number((tokenCount * COST_PER_TOKEN).toFixed(8));

		// This returns the required hit payload including response and savings.
		return {
			// This marks that cache successfully answered the request.
			hit: true,
			// This returns the cached AI response to the caller.
			response: cachedEntry.response,
			// This returns the estimated dollars saved by avoiding a new call.
			savedCost,
		};
	}

	// This returns a miss when no similar prompt meets the threshold.
	return { hit: false, response: null, savedCost: 0 };
}

// This clears all cache entries, useful for tests and admin operations.
function clearCache() {
	// This empties the in-memory cache immediately.
	responseCache.flushAll();
}

// This exports cache functions and constants for other modules to use.
module.exports = {
	// This stores prompt-response pairs in the cache.
	storeResponse,
	// This checks cache for similar prompts and returns hit/miss payloads.
	getCachedResponse,
	// This allows callers to clear cache data when needed.
	clearCache,
	// This exposes token estimation utility for optional reuse.
	estimateTokens,
	// This exposes TTL settings so other modules can stay consistent.
	CACHE_TTL_SECONDS,
	// This exposes threshold settings for visibility and tests.
	SIMILARITY_THRESHOLD,
};
