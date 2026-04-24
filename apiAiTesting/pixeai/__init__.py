"""Perplexity AI client (pixeai) — wraps perplexity.ai's web /rest/sse/perplexity_ask."""

from .client import PixeAIClient, PixeAIError

__all__ = ["PixeAIClient", "PixeAIError"]
