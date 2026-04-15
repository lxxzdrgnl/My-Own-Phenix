"""Default eval prompt templates.

These are used when no custom prompts are configured via the dashboard API.
Each prompt uses {context}, {response}, {query} as placeholders.
"""

HALLUCINATION = """You are an expert at detecting hallucinations in AI responses.

Determine whether the RESPONSE contains information NOT present in the CONTEXT.

CONTEXT:
{context}

RESPONSE:
{response}

Evaluation criteria:
- Does the RESPONSE make claims, cite specifics, or state facts not found in the CONTEXT?
- Does the RESPONSE distort or exaggerate information from the CONTEXT?
- Does the RESPONSE assert specific details (numbers, names, procedures) without basis in the CONTEXT?

Scoring:
- 0.0: No hallucination — all content is grounded in CONTEXT
- 0.3: Minor hallucination — slight additions beyond CONTEXT
- 0.6: Significant hallucination — substantial unsupported claims
- 1.0: Complete hallucination — mostly fabricated content

Respond with JSON only: {{"label": "factual" or "hallucinated", "score": 0.0-1.0, "explanation": "one line"}}"""

CITATION = """You are an expert at evaluating context faithfulness.

Determine whether all claims in the RESPONSE are grounded in the CONTEXT.

CONTEXT:
{context}

RESPONSE:
{response}

Evaluation criteria:
- Are all claims/information in the RESPONSE supported by the CONTEXT?
- Did the RESPONSE add or fabricate content not present in the CONTEXT?
- Do specific details (facts, figures, procedures) in the RESPONSE match the CONTEXT?

Scoring:
- 1.0: Fully grounded — all content accurately reflects CONTEXT
- 0.7-0.9: Mostly grounded — minor uncertainties
- 0.4-0.6: Partially grounded — significant unsupported content
- 0.0-0.3: Mostly ungrounded — largely unsupported claims

Respond with JSON only: {{"label": "faithful" or "unfaithful", "score": 0.0-1.0, "explanation": "one line"}}"""

TOOL_CALLING = """You are an expert at evaluating tool usage appropriateness in AI systems.

This system uses RAG (Retrieval-Augmented Generation) to answer user queries by retrieving documents from a knowledge base.
The system automatically retrieves documents for every query.

User query:
{query}

Retrieved documents (partial):
{context}

Evaluation criteria:
- Is the user's query relevant to the knowledge domain of this system?
- Would retrieving documents help answer this query?
- Even fictional or hypothetical scenarios count as appropriate if they involve the system's domain
- Only queries completely unrelated to the knowledge base are inappropriate

Scoring:
- 1.0: Clearly relevant query — retrieval is appropriate
- 0.7: Related but indirect — retrieval may help
- 0.3: Tangentially related — retrieval unlikely to help
- 0.0: Completely unrelated — retrieval is inappropriate

Respond with JSON only: {{"label": "appropriate" or "inappropriate", "score": 0.0-1.0, "explanation": "one line"}}"""
