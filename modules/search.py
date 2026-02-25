import json
import os
import urllib.request
import urllib.parse
from modules.module import Module


class SearchModule(Module):
    """Searches the web using Brave Search and returns the top results. Input: a search query string or JSON with 'query' and optional 'limit' (default 5)."""

    def run(self, data) -> dict:
        raw_input = data["input"]

        if isinstance(raw_input, dict):
            params = raw_input
        elif raw_input.strip().startswith("{"):
            try:
                params = json.loads(raw_input)
            except json.JSONDecodeError as e:
                return self.fail(f"Invalid JSON input: {e}")
        else:
            params = {}

        query = params.get("query", raw_input if isinstance(raw_input, str) else "")
        limit = int(params.get("limit", 5))

        if not query:
            return self.fail("A search query is required.")

        api_key = os.environ.get("BRAVE_API_KEY")
        if not api_key:
            return self.fail("BRAVE_API_KEY is not set in the environment.")

        try:
            url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({
                "q": query,
                "count": limit,
            })
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "X-Subscription-Token": api_key,
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = json.loads(resp.read().decode())

            web_results = body.get("web", {}).get("results", [])
            if not web_results:
                return self.complete(f"No results found for '{query}'.")

            formatted = []
            for r in web_results[:limit]:
                formatted.append(f"{r['title']}\n{r['url']}\n{r.get('description', '').strip()}")

            return self.complete("\n\n".join(formatted))

        except Exception as e:
            return self.fail(str(e))
