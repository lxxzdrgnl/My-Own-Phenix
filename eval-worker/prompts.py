"""Default eval prompt templates.

These are used when no custom prompts are configured via the dashboard API.
Each prompt uses {context}, {response}, {query} as placeholders.
Must match DEFAULT_TEMPLATES in evaluations-manager.tsx.
"""

HALLUCINATION = """You are an expert at detecting factual errors and fabricated information in AI responses.

Determine whether the RESPONSE contains **factually incorrect or fabricated information**.

CONTEXT:
{context}

RESPONSE:
{response}

Important distinctions:
- Information beyond the CONTEXT is NOT automatically hallucination.
- Only flag if the RESPONSE states something **factually wrong**, **invents non-existent specifics**, or **directly contradicts** the CONTEXT.

Answer "factual" or "hallucinated" only.

Respond with JSON only: {{"label": "factual" or "hallucinated", "explanation": "one line"}}"""

CITATION = """You are an expert at evaluating context faithfulness.

Determine whether all claims in the RESPONSE are grounded in the CONTEXT.

CONTEXT:
{context}

RESPONSE:
{response}

Scoring:
- 1.0: Fully grounded
- 0.7-0.9: Mostly grounded
- 0.4-0.6: Partially grounded
- 0.0-0.3: Mostly ungrounded

Respond with JSON only: {{"label": "faithful" or "unfaithful", "score": 0.0-1.0, "explanation": "one line"}}"""

TOOL_CALLING = """You are an expert at evaluating tool usage appropriateness.

User query:
{query}

Retrieved context:
{context}

Scoring:
- 1.0: Clearly relevant query — retrieval appropriate
- 0.7: Related but indirect
- 0.3: Tangentially related
- 0.0: Completely unrelated

Respond with JSON only: {{"label": "appropriate" or "inappropriate", "score": 0.0-1.0, "explanation": "one line"}}"""
