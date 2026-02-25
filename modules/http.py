import json
import requests
from modules.module import Module

class HttpModule(Module):
    """Make HTTP requests and interact with APIs. Input: JSON with 'method' (GET/POST/PUT/DELETE/PATCH), 'url', optional 'headers', 'body', 'params', 'auth', 'timeout'. Returns structured response with status, headers, and body."""

    def run(self, data) -> dict:
        try:
            # Parse input
            if isinstance(data["input"], str):
                try:
                    request_data = json.loads(data["input"])
                except json.JSONDecodeError:
                    return self.fail("Input must be valid JSON with 'method' and 'url' fields")
            else:
                request_data = data["input"]
            
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
