import json
import requests
from tools.tool import Tool

class HttpTool(Tool):
    """Make HTTP requests and interact with APIs.

    Input contract: `data["input"]` is a JSON object/string with `method`, `url`,
    and optional `headers`, `body`, `params`, `auth`, `timeout`, `allow_redirects`.
    Returns structured JSON with status, headers, URL, and body.
    """

    def run(self, data) -> dict:
        try:
            # Parse input
            try:
                request_data = self.input_json(data)
            except json.JSONDecodeError:
                return self.fail("Input must be valid JSON with 'method' and 'url' fields")
            
            # Validate required fields
            if "method" not in request_data or "url" not in request_data:
                return self.fail("Input must contain 'method' and 'url' fields")
            
            method = request_data["method"].upper()
            url = request_data["url"]
            headers = request_data.get("headers", {})
            body = request_data.get("body")
            params = request_data.get("params")
            auth = request_data.get("auth")
            timeout = request_data.get("timeout", 30)
            allow_redirects = request_data.get("allow_redirects", True)
            
            # Validate method
            valid_methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]
            if method not in valid_methods:
                return self.fail(f"Invalid HTTP method. Must be one of: {', '.join(valid_methods)}")
            
            # Prepare request kwargs
            kwargs = {
                "headers": headers,
                "timeout": timeout,
                "allow_redirects": allow_redirects
            }
            
            # Add optional parameters
            if params:
                kwargs["params"] = params
            
            if body:
                if isinstance(body, dict):
                    kwargs["json"] = body
                else:
                    kwargs["data"] = body
            
            if auth:
                if isinstance(auth, dict) and "username" in auth and "password" in auth:
                    kwargs["auth"] = (auth["username"], auth["password"])
                else:
                    return self.fail("Auth must be a dict with 'username' and 'password' fields")
            
            # Make request
            response = requests.request(method, url, **kwargs)
            
            # Parse response
            response_data = {
                "status": response.status_code,
                "headers": dict(response.headers),
                "url": response.url
            }
            
            # Try to parse body as JSON, fall back to text
            try:
                response_data["body"] = response.json()
            except (json.JSONDecodeError, ValueError):
                response_data["body"] = response.text
            
            return self.complete(json.dumps(response_data, indent=2))
        
        except requests.exceptions.Timeout:
            return self.fail(f"Request timed out after {timeout} seconds")
        except requests.exceptions.ConnectionError as e:
            return self.fail(f"Connection error: {str(e)}")
        except requests.exceptions.RequestException as e:
            return self.fail(f"Request failed: {str(e)}")
        except Exception as e:
            return self.fail(f"Unexpected error: {str(e)}")
