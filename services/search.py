"""Looks up real, web-sourced facts: reported interview questions and role requirements.
 
Provider: Tavily (free tier, no card required — app.tavily.com).
This module never invents content; it only returns what a search actually
found, so the analyzer can ground its answer in real snippets instead of
guessing from the model's training data.
"""
import os
 
import requests
 
SEARCH_URL = "https://api.tavily.com/search"
QUESTION_DOMAINS = [
    "glassdoor.com", "glassdoor.co.in", "ambitionbox.com",
    "geeksforgeeks.org", "interviewbit.com", "leetcode.com", "reddit.com",
]
SKILL_DOMAINS = [
    "geeksforgeeks.org", "indeed.com", "naukri.com", "simplilearn.com",
    "scaler.com", "interviewbit.com", "glassdoor.com",
]
 
 
class SearchError(Exception):
    """An error whose message is safe to show to the user."""
 
 
def _search(query: str, domains: list, max_results: int) -> list[dict]:
    key = os.getenv("TAVILY_API_KEY")
    if not key:
        raise SearchError("TAVILY_API_KEY is missing. Add it to your .env file and restart the app.")
    try:
        resp = requests.post(SEARCH_URL, json={
            "api_key": key, "query": query, "search_depth": "advanced",
            "include_domains": domains, "max_results": max_results,
        }, timeout=20)
    except requests.RequestException as exc:
        raise SearchError("Could not reach the search service. Check your internet connection.") from exc
 
    if resp.status_code == 401:
        raise SearchError("Tavily rejected the request. Check TAVILY_API_KEY in your .env file.")
    if resp.status_code == 429:
        raise SearchError("Search usage limit reached for now. Try again later.")
    if not resp.ok:
        raise SearchError("The search service is unavailable right now. Please try again.")
 
    results = resp.json().get("results", [])
    return [{"title": r.get("title", ""), "url": r.get("url", ""),
              "snippet": (r.get("content") or "")[:800]} for r in results]
 
 
def find_interview_questions(company: str, role: str, max_results: int = 6) -> list[dict]:
    return _search(f"{company} {role} interview questions technical round experience",
                    QUESTION_DOMAINS, max_results)
 
 
def find_role_requirements(company: str, role: str, max_results: int = 6) -> list[dict]:
    query = f"{role} skills required qualifications" + (f" {company}" if company and company.lower() != "the company" else "")
    return _search(query, SKILL_DOMAINS, max_results)
 