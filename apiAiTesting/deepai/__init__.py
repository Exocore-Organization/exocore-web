"""DeepAI chat client — wraps deepai.org's free 'standard' chat (no cookies)."""

from .client import DeepAIClient, DeepAIError

__all__ = ["DeepAIClient", "DeepAIError"]
