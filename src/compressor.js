"use strict";

// This list contains common "filler" expressions that usually do not change meaning.
const FILLER_PATTERNS = [
	// This pattern removes the word "please" when it appears as a separate word.
	/\bplease\b/gi,
	// This pattern removes the word "kindly" when it appears as a separate word.
	/\bkindly\b/gi,
	// This pattern removes "could you" to make requests direct and shorter.
	/\bcould you\b/gi,
	// This pattern removes "would you" for the same reason as above.
	/\bwould you\b/gi,
	// This pattern removes "can you" because it is often unnecessary framing.
	/\bcan you\b/gi,
	// This pattern removes "I was wondering" because it is polite padding.
	/\bi was wondering\b/gi,
	// This pattern removes "if you can" which often repeats the request tone.
	/\bif you can\b/gi,
	// This pattern removes "just" when used as softening filler.
	/\bjust\b/gi,
	// This pattern removes "actually" when used as conversational filler.
	/\bactually\b/gi,
	// This pattern removes "basically" when used as conversational filler.
	/\bbasically\b/gi,
	// This pattern removes "I think" because it is often non-essential context.
	/\bi think\b/gi,
];

// This mapping rewrites long, common phrases into shorter, intent-preserving forms.
const PHRASE_SHORTENERS = [
	// This converts "Can you please explain" into the direct action "Explain".
	[/\bcan you please explain\b/gi, "Explain"],
	// This converts "Could you please explain" into "Explain".
	[/\bcould you please explain\b/gi, "Explain"],
	// This converts "Can you explain" into "Explain".
	[/\bcan you explain\b/gi, "Explain"],
	// This converts "Could you explain" into "Explain".
	[/\bcould you explain\b/gi, "Explain"],
	// This converts "I need you to" into a direct imperative form.
	[/\bi need you to\b/gi, ""],
	// This converts "I want you to" into a direct imperative form.
	[/\bi want you to\b/gi, ""],
	// This converts "Would you mind" into a direct request.
	[/\bwould you mind\b/gi, ""],
	// This converts "It would be great if you could" into a direct request.
	[/\bit would be great if you could\b/gi, ""],
	// This converts "Can you help me" into "Help me".
	[/\bcan you help me\b/gi, "Help me"],
	// This converts "Could you help me" into "Help me".
	[/\bcould you help me\b/gi, "Help me"],
];

// This helper estimates token count using the rule: tokens ~= characters / 4.
function estimateTokens(text) {
	// This safely handles null/undefined by converting to an empty string.
	const safeText = typeof text === "string" ? text : "";
	// This computes an estimated token count and rounds up so partial tokens count.
	return Math.ceil(safeText.length / 4);
}

// This helper normalizes a sentence so we can compare duplicates reliably.
function normalizeSentenceForComparison(sentence) {
	// This trims spaces and lowercases text so minor formatting differences do not matter.
	return sentence.trim().toLowerCase();
}

// This helper removes duplicate sentences while preserving first appearance order.
function dedupeSentences(text) {
	// This splits content by sentence-ending punctuation and keeps the punctuation token.
	const parts = text.split(/([.!?]+)/);
	// This array will store rebuilt sentences in their original order.
	const rebuilt = [];
	// This set tracks normalized sentence content we have already kept.
	const seen = new Set();

	// This loops through text chunks two at a time: sentence text + punctuation.
	for (let i = 0; i < parts.length; i += 2) {
		// This gets the sentence text chunk at the current index.
		const sentenceText = (parts[i] || "").trim();
		// This gets punctuation (like ".", "?", "!") if it exists.
		const punctuation = (parts[i + 1] || "").trim();

		// This skips empty chunks that can occur from splitting.
		if (!sentenceText) {
			// This continues to the next loop item when there is nothing meaningful.
			continue;
		}

		// This creates a comparison key so similar formatting still counts as duplicate.
		const key = normalizeSentenceForComparison(sentenceText);

		// This only keeps the sentence if we have not seen it before.
		if (!seen.has(key)) {
			// This marks the sentence as seen so later duplicates are dropped.
			seen.add(key);
			// This rebuilds the sentence with its punctuation and stores it.
			rebuilt.push(`${sentenceText}${punctuation}`.trim());
		}
	}

	// This rejoins unique sentences into a clean single string.
	return rebuilt.join(" ").trim();
}

// This helper applies phrase-shortening replacements.
function shortenPhrases(text) {
	// This starts with the original text and updates it progressively.
	let output = text;

	// This loops through each [pattern, replacement] pair.
	for (const [pattern, replacement] of PHRASE_SHORTENERS) {
		// This applies the current phrase replacement globally.
		output = output.replace(pattern, replacement);
	}

	// This returns the phrase-shortened result.
	return output;
}

// This helper removes filler words and filler phrases.
function removeFillers(text) {
	// This starts with the input text and updates it pattern by pattern.
	let output = text;

	// This loops through each filler pattern in the list.
	for (const pattern of FILLER_PATTERNS) {
		// This removes the matched filler from the text.
		output = output.replace(pattern, "");
	}

	// This returns the text after filler removal.
	return output;
}

// This helper cleans spacing and punctuation artifacts created during compression.
function cleanupFormatting(text) {
	// This starts from the provided text so we can apply cleanup steps in sequence.
	let output = text;
	// This removes extra spaces that may appear before punctuation.
	output = output.replace(/\s+([,.!?;:])/g, "$1");
	// This compresses multiple spaces into a single space.
	output = output.replace(/\s{2,}/g, " ");
	// This removes accidental double punctuation like ".." or "??".
	output = output.replace(/([.!?]){2,}/g, "$1");
	// This trims leading and trailing whitespace.
	output = output.trim();
	// This returns the cleaned text.
	return output;
}

// This is the main API that compresses a raw prompt and returns compression metrics.
function compressPrompt(rawPrompt) {
	// This ensures the function always works with a string input.
	const originalPrompt = typeof rawPrompt === "string" ? rawPrompt : "";
	// This runs phrase shortening first to quickly collapse common long forms.
	let compressedPrompt = shortenPhrases(originalPrompt);
	// This removes filler words and filler expressions from the shortened text.
	compressedPrompt = removeFillers(compressedPrompt);
	// This removes repeated sentence context when the same sentence appears again.
	compressedPrompt = dedupeSentences(compressedPrompt);
	// This cleans up whitespace and punctuation after all transformations.
	compressedPrompt = cleanupFormatting(compressedPrompt);

	// This estimates token usage for the original prompt.
	const originalTokenEstimate = estimateTokens(originalPrompt);
	// This estimates token usage for the compressed prompt.
	const compressedTokenEstimate = estimateTokens(compressedPrompt);
	// This calculates how many estimated tokens were saved.
	const savedTokens = Math.max(originalTokenEstimate - compressedTokenEstimate, 0);
	// This calculates compression ratio as percent saved, guarding divide-by-zero.
	const compressionRatioPercentage =
		originalTokenEstimate === 0
			? 0
			: Number(((savedTokens / originalTokenEstimate) * 100).toFixed(2));

	// This returns all requested fields plus compression ratio percentage.
	return {
		// This echoes the original input so callers can compare before/after.
		originalPrompt,
		// This provides the compressed prompt to send to the model.
		compressedPrompt,
		// This provides estimated token count before compression.
		originalTokenEstimate,
		// This provides estimated token count after compression.
		compressedTokenEstimate,
		// This provides the estimated number of tokens saved.
		savedTokens,
		// This provides percent reduction in estimated tokens.
		compressionRatioPercentage,
	};
}

// This exports the main compression function and helpers for testing/integration.
module.exports = {
	// This is the primary function used by the rest of TokenSmart.
	compressPrompt,
	// This helper export is useful for tests or analytics modules.
	estimateTokens,
};
