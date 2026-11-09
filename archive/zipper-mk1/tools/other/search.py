import json
import os
import urllib.request
import urllib.parse
from tools.tool import Tool


class SearchTool(Tool):
    """Search the web using Brave Search and return top results.

    Input contract:
    - text mode: `data["input"]` is a plain query string
    - JSON mode: `data["input"]` includes `query` and optional `limit` (default 5)
    """

    def run(self, data) -> dict:
        raw_input = self.input_text(data)

        try:
            params = self.input_json(data, fallback={})
        except json.JSONDecodeError as e:
            return self.fail(f"Invalid JSON input: {e}")

        query = params.get("query", raw_input)
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
