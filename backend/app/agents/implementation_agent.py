import re

from app.agents.base import BaseAgent


IMPLEMENTATION_SCHEMA = {
    "implementation_steps": [{"step": "string", "detail": "string"}],
    "sandbox_tasks": [{"title": "string", "objective": "string"}],
    "starter_code": "string",
}


def _strip_markdown_fences(code: str) -> str:
    fenced = re.match(r"```(?:python)?\s*(.*?)```", code.strip(), re.DOTALL | re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()
    return code.strip()


def _is_bad_sandbox_code(code: str) -> bool:
    lowered = code.lower()
    bad_signals = [
        "--- scenario",
        "cache miss",
        "cache hit",
        "error pool",
        "[system]",
        "[llm]",
        "student answer",
        "replace this placeholder",
        "return inputs",
    ]
    if any(signal in lowered for signal in bad_signals):
        return True
    if len(code.splitlines()) > 120:
        return True
    return False


def _build_attention_code(title: str, formula: str, variable_notes: list[str]) -> str:
    notes = "\n".join(f"# {note}" for note in variable_notes[:3])
    return f"""# Simple educational implementation inspired by: {title}
# Scaled dot-product attention
# Formula: {formula}
{notes}
import math

def dot(a, b):
    return sum(x * y for x, y in zip(a, b))

def softmax(values):
    exps = [math.exp(v) for v in values]
    total = sum(exps)
    return [v / total for v in exps]

def scaled_dot_product_attention(query, keys, values):
    d_k = len(query)
    scores = [dot(query, key) / math.sqrt(d_k) for key in keys]
    weights = softmax(scores)
    output = [sum(weight * value[i] for weight, value in zip(weights, values)) for i in range(len(values[0]))]
    return output, weights

if __name__ == "__main__":
    q = [1.0, 0.0]
    ks = [[1.0, 0.0], [0.5, 0.5], [0.0, 1.0]]
    vs = [[1.0, 0.0], [0.4, 0.6], [0.0, 1.0]]
    output, weights = scaled_dot_product_attention(q, ks, vs)
    print("attention weights:", weights)
    print("context vector:", output)
"""


def _build_similarity_code(title: str, formula: str, variable_notes: list[str]) -> str:
    notes = "\n".join(f"# {note}" for note in variable_notes[:3])
    return f"""# Simple educational implementation inspired by: {title}
# Similarity / scoring function
# Formula: {formula}
{notes}
def score(query, document):
    return sum(q * d for q, d in zip(query, document))

def rank_documents(query, documents):
    scored = [(doc_id, score(query, embedding)) for doc_id, embedding in documents]
    return sorted(scored, key=lambda item: item[1], reverse=True)

if __name__ == "__main__":
    q = [1.0, 2.0, 0.5]
    docs = [
        ("doc_a", [1.0, 1.0, 0.5]),
        ("doc_b", [0.2, 2.5, 0.4]),
        ("doc_c", [2.0, 0.1, 0.0]),
    ]
    print(rank_documents(q, docs))
"""


def _build_softmax_code(title: str, formula: str, variable_notes: list[str]) -> str:
    notes = "\n".join(f"# {note}" for note in variable_notes[:3])
    return f"""# Simple educational implementation inspired by: {title}
# Probability scoring with softmax
# Formula: {formula}
{notes}
import math

def softmax(logits):
    shifted = [x - max(logits) for x in logits]
    exps = [math.exp(x) for x in shifted]
    total = sum(exps)
    return [x / total for x in exps]

if __name__ == "__main__":
    logits = [2.1, 0.7, -0.4]
    probabilities = softmax(logits)
    print("probabilities:", probabilities)
"""


def _build_loss_code(title: str, formula: str, variable_notes: list[str]) -> str:
    notes = "\n".join(f"# {note}" for note in variable_notes[:3])
    return f"""# Simple educational implementation inspired by: {title}
# Loss / objective demonstration
# Formula: {formula}
{notes}
def mean_squared_error(predictions, targets):
    squared_errors = [(pred - target) ** 2 for pred, target in zip(predictions, targets)]
    return sum(squared_errors) / len(squared_errors)

if __name__ == "__main__":
    preds = [0.1, 0.7, 0.9]
    targets = [0.0, 1.0, 1.0]
    print("mse:", mean_squared_error(preds, targets))
"""


def _build_generic_math_code(title: str, concept: str, formula: str, variable_notes: list[str]) -> str:
    notes = "\n".join(f"# {note}" for note in variable_notes[:3])
    return f"""# Simple educational implementation inspired by: {title}
# Concept: {concept}
# Formula: {formula or "See paper for exact notation"}
{notes}
def paper_computation(x, y, scale=1.0):
    return (x * y) / scale

if __name__ == "__main__":
    print("paper computation:", paper_computation(2.0, 3.0, scale=2.0))
"""


def _build_method_based_code(title: str, method_summary: str) -> str:
    return f"""# Simple educational implementation inspired by: {title}
# Method summary: {method_summary}
def run_method(sequence):
    # Minimal scaffold: apply a simple weighted transformation to show data flow.
    weights = [index + 1 for index, _ in enumerate(sequence)]
    weighted = [value * weight for value, weight in zip(sequence, weights)]
    return sum(weighted) / max(len(weighted), 1)

if __name__ == "__main__":
    sample = [1.0, 2.0, 3.0]
    print("method output:", run_method(sample))
"""


def _build_error_pool_code(title: str, method_summary: str) -> str:
    return f"""# Simple educational implementation inspired by: {title}
# Method summary: {method_summary}
# This sketch demonstrates the paper idea of caching repeated student errors
# so we do not re-run the full analysis pipeline every time.

error_pool = {{}}

def check_error_pool(question_id, student_answer):
    key = (question_id, student_answer.strip())
    return error_pool.get(key)

def draft_analyzer(draft_text):
    # In a full system, a multimodal model would inspect the draft image.
    return {{
        "draft_summary": draft_text,
        "step_error": "possible arithmetic carry mistake" if "carry" in draft_text.lower() else "unknown",
    }}

def analyze_error(question_id, student_answer, draft_text, problem, solution):
    cached = check_error_pool(question_id, student_answer)
    if cached:
        return {{
            "source": "cache",
            "result": cached,
        }}

    draft_info = draft_analyzer(draft_text)
    error_cause = {{
        "error_found": "Yes" if student_answer.strip() != solution.strip() else "No",
        "draft_summary": draft_info["draft_summary"],
        "analysis": f"Based on the draft, the likely issue is: {{draft_info['step_error']}}.",
        "suggestion": "Compare each intermediate step with the correct solution and store recurring mistakes.",
        "corrected_answer": solution,
    }}
    error_pool[(question_id, student_answer.strip())] = error_cause
    return {{
        "source": "new_analysis",
        "result": error_cause,
    }}

if __name__ == "__main__":
    result = analyze_error(
        question_id="q001",
        student_answer="598",
        draft_text="student carried incorrectly in the multiplication step",
        problem="23 * 26 + 89",
        solution="687",
    )
    print(result)
"""


def _build_simple_fallback_code(context: dict) -> str:
    math_explanations = context.get("math_explanations", [])
    title = context.get("title", "paper")
    method_summary = context.get("chunks", {}).get("method_summary", "Core method from the paper")
    combined_context = f"{title}\n{method_summary}\n{context.get('chunks', {}).get('methods', '')}".lower()

    if any(token in combined_context for token in ["error pool", "student error", "draft", "virtual ai teacher", "error analysis"]):
        return _build_error_pool_code(title, method_summary)

    if math_explanations:
        item = math_explanations[0]
        concept = item.get("concept", "paper concept")
        formula = item.get("formula", "").strip()
        explanation = item.get("explanation", "").strip()
        variable_notes = item.get("variable_notes", [])[:3]
        lowered = f"{concept} {formula} {explanation}".lower()

        if "attention" in lowered or "qk" in lowered or "sqrt(d_k)" in lowered:
            return _build_attention_code(title, formula or concept, variable_notes)
        if "softmax" in lowered or "probability" in lowered or "p(" in lowered:
            return _build_softmax_code(title, formula or concept, variable_notes)
        if any(token in lowered for token in ["loss", "objective", "mse", "cross entropy", "cross-entropy"]):
            return _build_loss_code(title, formula or concept, variable_notes)
        if any(token in lowered for token in ["score", "similarity", "dot product", "retrieval"]):
            return _build_similarity_code(title, formula or concept, variable_notes)
        return _build_generic_math_code(title, concept, formula, variable_notes)

    return _build_method_based_code(title, method_summary)


class ImplementationAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        math_explanations = context.get("math_explanations", [])
        prompt = f"""
You are the Implementation and Sandbox Agent for PaperLab.
Translate the paper into practical implementation steps and a concise runnable Python starter.
Only return the fields requested by the schema.

Critical rules for `starter_code`:
- it must be a single simple Python file
- it must contain actual runnable code, not placeholders
- it must implement or demonstrate the paper's core idea, scoring rule, loss, update rule, or data flow
- it must be educational and easy to understand for a reader seeing the paper for the first time
- prefer plain Python and basic math over large frameworks unless the paper absolutely requires a library
- include a tiny `if __name__ == "__main__":` example so the sandbox prints something meaningful
- do not invent unrelated apps, simulations, cache systems, chatbots, grading systems, or fake evaluation harnesses
- do not produce multi-scenario demos, long logs, or explanatory prose outside Python comments
- do not wrap the code in markdown fences
- keep it short enough to understand quickly

Use the extracted math to shape the implementation.
If there are equations, objectives, losses, or scoring functions, make the starter code demonstrate at least one of them directly.

Paper title:
{context.get('title', 'Untitled paper')}

Methods:
{context['chunks']['methods']}

Results:
{context['chunks']['results']}

Math explanations:
{math_explanations}
"""
        result = self.gemini_service.generate_object(prompt, IMPLEMENTATION_SCHEMA)
        starter_code = _strip_markdown_fences(result.get("starter_code", ""))
        if not starter_code or _is_bad_sandbox_code(starter_code):
            starter_code = _build_simple_fallback_code(context)
        result["starter_code"] = starter_code
        return result
