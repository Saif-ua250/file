"use strict";

// This imports Node's file system tools for reading and writing log files.
const fs = require("fs");
// This imports path helpers so folder/file paths work across operating systems.
const path = require("path");

// This defines the folder where usage logs will be stored.
const LOGS_DIR = path.join(__dirname, "..", "logs");
// This defines the exact JSON file path that stores usage entries.
const USAGE_FILE = path.join(LOGS_DIR, "usage.json");

// This safely converts any value to a number, falling back to zero when invalid.
function toNumber(value) {
	// This converts the incoming value into a numeric form.
	const parsed = Number(value);
	// This returns the parsed value when it is a finite number, otherwise zero.
	return Number.isFinite(parsed) ? parsed : 0;
}

// This creates the logs folder and usage file if they do not already exist.
function ensureStorage() {
	// This checks whether the logs folder is already present on disk.
	if (!fs.existsSync(LOGS_DIR)) {
		// This creates the logs folder (and parents if needed).
		fs.mkdirSync(LOGS_DIR, { recursive: true });
	}

	// This checks whether the usage JSON file is already present.
	if (!fs.existsSync(USAGE_FILE)) {
		// This creates the usage file with an empty array as valid JSON content.
		fs.writeFileSync(USAGE_FILE, "[]", "utf8");
	}
}

// This loads all usage entries from disk as an array.
function readEntries() {
	// This guarantees folder and file exist before reading.
	ensureStorage();

	// This reads the raw JSON text from the usage file.
	const raw = fs.readFileSync(USAGE_FILE, "utf8");

	// This tries to parse JSON safely.
	try {
		// This parses the file text into JavaScript data.
		const parsed = JSON.parse(raw);
		// This ensures we always return an array for downstream logic.
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		// This recovers from corrupted JSON by returning an empty list.
		return [];
	}
}

// This writes the full entries array back to disk in pretty JSON format.
function writeEntries(entries) {
	// This guarantees folder and file exist before writing.
	ensureStorage();
	// This serializes the entries with indentation for easy manual inspection.
	const json = JSON.stringify(entries, null, 2);
	// This saves the serialized entries to the usage file.
	fs.writeFileSync(USAGE_FILE, json, "utf8");
}

// This calculates running totals used to build summaries and per-call totals.
function calculateTotals(entries) {
	// This prepares an accumulator object with all needed running metrics.
	return entries.reduce(
		// This updates the running totals using each stored entry.
		(acc, entry) => {
			// This reads saved tokens from the current entry safely.
			const savedTokens = toNumber(entry.tokensSavedByCompression);
			// This reads cost savings from the current entry safely.
			const moneySaved = toNumber(entry.moneySaved);
			// This reads cache-hit state from the current entry safely.
			const cacheHit = Boolean(entry.cacheHit);

			// This adds one to the total call count.
			acc.totalCalls += 1;
			// This adds current entry's saved tokens to the running token total.
			acc.totalSavedTokens += savedTokens;
			// This adds current entry's money saved to the running money total.
			acc.totalMoneySaved += moneySaved;
			// This increments cache-hit count when the current entry is a hit.
			acc.cacheHits += cacheHit ? 1 : 0;

			// This returns the updated accumulator for the next reduce step.
			return acc;
		},
		// This provides starting values before any entries are processed.
		{
			// This starts total call count at zero.
			totalCalls: 0,
			// This starts total saved token count at zero.
			totalSavedTokens: 0,
			// This starts total money saved at zero.
			totalMoneySaved: 0,
			// This starts cache-hit count at zero.
			cacheHits: 0,
		}
	);
}

// This saves one new AI-call log entry and returns the saved record.
function logCall(data) {
	// This loads existing entries from disk.
	const entries = readEntries();

	// This builds a normalized record with all required fields.
	const entry = {
		// This stores the call time using provided value or current timestamp.
		timestamp: data && data.timestamp ? data.timestamp : new Date().toISOString(),
		// This stores original token count for the call.
		originalTokenCount: toNumber(data && data.originalTokenCount),
		// This stores compressed token count for the call.
		compressedTokenCount: toNumber(data && data.compressedTokenCount),
		// This stores tokens saved due to compression.
		tokensSavedByCompression: toNumber(data && data.tokensSavedByCompression),
		// This stores the model used for the AI call.
		modelUsed: data && data.modelUsed ? String(data.modelUsed) : "unknown",
		// This stores whether response was served from cache.
		cacheHit: Boolean(data && data.cacheHit),
		// This stores actual money spent for this call.
		actualCostOfCall: toNumber(data && data.actualCostOfCall),
		// This stores estimated cost without TokenSmart optimizations.
		estimatedCostWithoutTokenSmart: toNumber(data && data.estimatedCostWithoutTokenSmart),
	};

	// This computes money saved for this single entry.
	entry.moneySaved = Number(
		// This subtracts actual cost from baseline and prevents negative savings.
		Math.max(entry.estimatedCostWithoutTokenSmart - entry.actualCostOfCall, 0).toFixed(8)
	);

	// This appends the new entry to the in-memory list.
	entries.push(entry);

	// This calculates totals including the newly added entry.
	const totals = calculateTotals(entries);
	// This sets running sum of total savings so far on the saved entry.
	entry.totalSavingsSoFar = Number(totals.totalMoneySaved.toFixed(8));

	// This writes updated entries array back to disk.
	writeEntries(entries);

	// This returns the full saved entry to the caller.
	return entry;
}

// This returns an aggregate summary across all logged calls.
function getSummary() {
	// This loads all entries currently stored in usage.json.
	const entries = readEntries();
	// This computes totals from all loaded entries.
	const totals = calculateTotals(entries);

	// This computes cache hit rate as a percentage.
	const cacheHitRate =
		totals.totalCalls === 0
			? 0
			: Number(((totals.cacheHits / totals.totalCalls) * 100).toFixed(2));

	// This returns the summary object requested by the module contract.
	return {
		// This returns total number of calls logged so far.
		totalCalls: totals.totalCalls,
		// This returns total number of tokens saved via compression.
		totalSavedTokens: totals.totalSavedTokens,
		// This returns total amount of money saved so far.
		totalMoneySaved: Number(totals.totalMoneySaved.toFixed(8)),
		// This returns percentage of calls that were cache hits.
		cacheHitRate,
	};
}

// This exports the public API required by the TokenSmart project.
module.exports = {
	// This exports the function that records a new call entry.
	logCall,
	// This exports the function that computes high-level usage summary.
	getSummary,
};
