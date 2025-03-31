import requests
from bs4 import BeautifulSoup
import sys

def duckduck_search(query):
    headers = {
        "User-Agent": "Mozilla/5.0"
    }

    params = {
        "q": query,
        "kl": "us-en"
    }

    response = requests.get("https://html.duckduckgo.com/html/", params=params, headers=headers)

    if response.status_code != 200:
        return f"Error: DuckDuckGo search failed with status {response.status_code}"

    soup = BeautifulSoup(response.text, "html.parser")
    results = soup.find_all("a", class_="result__a", limit=3)

    snippets = []
    for result in results:
        title = result.get_text()
        # link = result.get("href")
        snippet_tag = result.find_parent("div", class_="result").find("a", class_="result__snippet")
        snippet = snippet_tag.get_text() if snippet_tag else "No snippet found"
        snippets.append((title, snippet))

    return snippets


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python duckduck_search.py \"your search query here\"")
        sys.exit(1)

    query = " ".join(sys.argv[1:])
    results = duckduck_search(query)

    for i, (title, snippet) in enumerate(results, 1):
        print(f"\nResult {i}: {title}\nSnippet: {snippet}")
