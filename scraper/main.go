package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// loadEnv reads a .env file and sets environment variables (no external deps needed)
func loadEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}

type response struct {
	ProfileText string `json:"profileText,omitempty"`
	Error       string `json:"error,omitempty"`
	Partial     bool   `json:"partial,omitempty"`
	Email       string `json:"email,omitempty"`
	Debug       string `json:"debug,omitempty"`
}

func walkNodes(n *html.Node, fn func(*html.Node)) {
	fn(n)
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		walkNodes(c, fn)
	}
}

func getAttr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func extractMeta(doc *html.Node) map[string]string {
	meta := make(map[string]string)
	walkNodes(doc, func(n *html.Node) {
		if n.Type != html.ElementNode || n.Data != "meta" {
			return
		}
		content := getAttr(n, "content")
		if name := getAttr(n, "name"); name != "" {
			meta[name] = content
		}
		if prop := getAttr(n, "property"); prop != "" {
			meta[prop] = content
		}
	})
	return meta
}

func extractTitle(doc *html.Node) string {
	var title string
	walkNodes(doc, func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "title" && n.FirstChild != nil {
			title = strings.TrimSpace(n.FirstChild.Data)
		}
	})
	return title
}

func extractJSONLD(doc *html.Node) []map[string]any {
	var result []map[string]any
	walkNodes(doc, func(n *html.Node) {
		if n.Type != html.ElementNode || n.Data != "script" || n.FirstChild == nil {
			return
		}
		if getAttr(n, "type") != "application/ld+json" {
			return
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(n.FirstChild.Data), &m); err == nil {
			result = append(result, m)
		}
	})
	return result
}

// extractEmbeddedProfile looks for LinkedIn's server-side rendered JSON blobs.
func extractEmbeddedProfile(doc *html.Node) map[string]any {
	var found map[string]any
	walkNodes(doc, func(n *html.Node) {
		if found != nil || n.Type != html.ElementNode || n.Data != "script" || n.FirstChild == nil {
			return
		}
		raw := n.FirstChild.Data
		if !strings.Contains(raw, `"firstName"`) && !strings.Contains(raw, `"headline"`) {
			return
		}
		start := strings.Index(raw, "{")
		if start < 0 {
			return
		}
		var m map[string]any
		if err := json.NewDecoder(strings.NewReader(raw[start:])).Decode(&m); err == nil {
			found = m
		}
	})
	return found
}

func strVal(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func isValidLinkedInURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := u.Hostname()
	return (host == "www.linkedin.com" || host == "linkedin.com") &&
		strings.HasPrefix(u.Path, "/in/")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func scrapeLinkedIn(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		writeJSON(w, http.StatusBadRequest, response{Error: "LinkedIn URL is required."})
		return
	}
	if !isValidLinkedInURL(rawURL) {
		writeJSON(w, http.StatusBadRequest, response{
			Error: "Please provide a valid LinkedIn profile URL (e.g. https://linkedin.com/in/username).",
		})
		return
	}

	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, response{Error: err.Error()})
		return
	}
	// Mimic a real desktop browser to get past basic bot detection
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Accept-Encoding", "identity")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Upgrade-Insecure-Requests", "1")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, response{Error: "Failed to reach LinkedIn: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	// Always read the body — even blocked/authwall pages contain useful meta tags
	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)

	blocked := resp.StatusCode == 999 || resp.StatusCode == 429 || resp.StatusCode == 403 ||
		strings.Contains(bodyStr, "authwall") ||
		strings.Contains(bodyStr, "checkpoint/challenge") ||
		(resp.Request != nil && strings.Contains(resp.Request.URL.Path, "authwall"))

	doc, err := html.Parse(strings.NewReader(bodyStr))
	if err != nil {
		writeJSON(w, http.StatusOK, response{
			ProfileText: fmt.Sprintf("LinkedIn profile: %s", rawURL),
			Partial:     true,
		})
		return
	}

	meta := extractMeta(doc)
	pageTitle := extractTitle(doc)
	// Always extract JSON-LD and embedded data — LinkedIn includes these even on restricted pages
	jsonLDs := extractJSONLD(doc)
	var embedded map[string]any
	if !blocked {
		embedded = extractEmbeddedProfile(doc)
	}

	var lines []string
	var extractedName, extractedWebsite string

	// Name + headline from og:title format: "First Last - Headline | LinkedIn"
	ogTitle := meta["og:title"]
	if ogTitle == "" {
		ogTitle = pageTitle
	}
	ogTitle = strings.TrimSuffix(strings.TrimSuffix(ogTitle, " | LinkedIn"), " - LinkedIn")
	if ogTitle != "" {
		parts := strings.SplitN(ogTitle, " - ", 2)
		extractedName = strings.TrimSpace(parts[0])
		lines = append(lines, "Name: "+extractedName)
		if len(parts) > 1 {
			headline := strings.TrimSpace(parts[1])
			lines = append(lines, "Headline: "+headline)
		}
	}

	// Brief description from og:description
	if desc := meta["og:description"]; desc != "" &&
		!strings.Contains(desc, "Log in") && !strings.Contains(desc, "Sign in") {
		lines = append(lines, "\nAbout: "+desc)
	}

	// JSON-LD Person schema (LinkedIn includes this on some public profiles)
	for _, ld := range jsonLDs {
		if t, _ := ld["@type"].(string); t != "Person" {
			continue
		}
		if jt := strVal(ld, "jobTitle"); jt != "" {
			lines = append(lines, "Job Title: "+jt)
		}
		if org, ok := ld["worksFor"].(map[string]any); ok {
			if co := strVal(org, "name"); co != "" {
				lines = append(lines, "Current Company: "+co)
			}
		}
		if addr, ok := ld["address"].(map[string]any); ok {
			loc := joinNonEmpty(", ",
				strVal(addr, "addressLocality"),
				strVal(addr, "addressRegion"),
				strVal(addr, "addressCountry"),
			)
			if loc != "" {
				lines = append(lines, "Location: "+loc)
			}
		}
		if alumni, ok := ld["alumniOf"].([]any); ok {
			for _, a := range alumni {
				if org, ok := a.(map[string]any); ok {
					if edu := strVal(org, "name"); edu != "" {
						lines = append(lines, "Education: "+edu)
					}
				}
			}
		}
		// Capture personal website from JSON-LD
		if site := strVal(ld, "url"); site != "" && strings.HasPrefix(site, "http") && !strings.Contains(site, "linkedin.com") {
			extractedWebsite = site
		}
	}

	// For all pages (including blocked) — extract website from LinkedIn redirect links in HTML
	// LinkedIn encodes external links as /redir/redirect?url=https%3A%2F%2Fexample.com...
	if extractedWebsite == "" {
		extractedWebsite = extractWebsiteFromLinks(doc)
	}

	// Last resort: scan raw HTML text for bare URLs near website-related keywords
	if extractedWebsite == "" {
		extractedWebsite = extractWebsiteFromText(bodyStr)
	}

	// Embedded JSON (best case — LinkedIn server-side renders some profile data)
	if embedded != nil {
		if fn := strVal(embedded, "firstName"); fn != "" && !strings.Contains(strings.Join(lines, ""), "Name:") {
			lines = append(lines, "Name: "+strings.TrimSpace(fn+" "+strVal(embedded, "lastName")))
		}
		if h := strVal(embedded, "headline"); h != "" {
			lines = append(lines, "Headline (detail): "+h)
		}
		if s := strVal(embedded, "summary"); s != "" {
			lines = append(lines, "\nSummary:\n"+s)
		}
		if loc := strVal(embedded, "locationName"); loc != "" {
			lines = append(lines, "Location: "+loc)
		}
	}

	if len(lines) == 0 {
		writeJSON(w, http.StatusOK, response{
			ProfileText: fmt.Sprintf("LinkedIn profile: %s", rawURL),
			Partial:     true,
		})
		return
	}

	lines = append(lines, "\n[Note: LinkedIn limits public scraping — full work history requires manual paste.]")

	var debugLog []string
	debugLog = append(debugLog, fmt.Sprintf("blocked=%v", blocked))

	foundEmail := ""

	// Priority 1: LinkedIn internal contact-info API (needs session cookie)
	if liAt := os.Getenv("LINKEDIN_COOKIE"); liAt != "" {
		jsessionID := os.Getenv("LINKEDIN_JSESSIONID")
		if slug := extractProfileSlug(rawURL); slug != "" {
			email, site := fetchLinkedInContactInfo(slug, liAt, jsessionID)
			foundEmail = email
			if site != "" {
				extractedWebsite = site
			}
			debugLog = append(debugLog, fmt.Sprintf("voyager_email=%q voyager_site=%q", email, site))
		}
	} else {
		debugLog = append(debugLog, "no LINKEDIN_COOKIE")
	}

	debugLog = append(debugLog, fmt.Sprintf("extractedWebsite=%q", extractedWebsite))

	// Priority 2: scrape the website explicitly listed on the profile
	if foundEmail == "" && extractedWebsite != "" {
		foundEmail = scrapeWebsiteForEmail(extractedWebsite)
		debugLog = append(debugLog, fmt.Sprintf("website_scrape_email=%q", foundEmail))
	}

	writeJSON(w, http.StatusOK, response{
		ProfileText: strings.Join(lines, "\n"),
		Partial:     true,
		Email:       foundEmail,
		Debug:       strings.Join(debugLog, "; "),
	})
}

// extractWebsiteFromText scans raw HTML text for bare website URLs (e.g. "www.kalemi.com")
// that appear near website-related keywords. Handles profiles where the URL is rendered
// as plain text rather than in an <a> tag.
func extractWebsiteFromText(body string) string {
	// Match bare domains: www.example.com or https://example.com
	urlRe := regexp.MustCompile(`(?i)(?:https?://|www\.)[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+(?:/[^\s"'<>]*)?`)
	matches := urlRe.FindAllStringIndex(body, -1)
	for _, idx := range matches {
		raw := body[idx[0]:idx[1]]
		// Normalise to full URL
		if !strings.HasPrefix(raw, "http") {
			raw = "https://" + raw
		}
		// Skip LinkedIn's own domains and common noise
		if strings.Contains(raw, "linkedin.com") ||
			strings.Contains(raw, "schema.org") ||
			strings.Contains(raw, "javascript.") ||
			strings.Contains(raw, "w3.org") ||
			strings.Contains(raw, "google.com") ||
			strings.Contains(raw, "facebook.com") ||
			strings.Contains(raw, "twitter.com") ||
			strings.Contains(raw, "apple.com") ||
			strings.Contains(raw, "microsoft.com") {
			continue
		}
		// Only pick URLs that appear close to a website-related keyword in the surrounding context
		start := idx[0] - 200
		if start < 0 {
			start = 0
		}
		end := idx[1] + 200
		if end > len(body) {
			end = len(body)
		}
		context := strings.ToLower(body[start:end])
		if strings.Contains(context, "website") ||
			strings.Contains(context, "websiteLabel") ||
			strings.Contains(context, "\"url\"") ||
			strings.Contains(context, "contact") ||
			strings.Contains(context, "homepage") {
			return raw
		}
	}
	return ""
}

// extractWebsiteFromLinks scans all <a> tags for LinkedIn's external redirect links
// (format: /redir/redirect?url=https%3A%2F%2Fexample.com) and returns the first
// non-LinkedIn external URL found. This works on both full and blocked pages.
func extractWebsiteFromLinks(doc *html.Node) string {
	var found string
	walkNodes(doc, func(n *html.Node) {
		if found != "" || n.Type != html.ElementNode || n.Data != "a" {
			return
		}
		href := getAttr(n, "href")
		if href == "" {
			return
		}
		// LinkedIn wraps external links as /redir/redirect?url=...
		if strings.Contains(href, "/redir/redirect") || strings.Contains(href, "/redir/external-link") {
			parsed, err := url.Parse(href)
			if err != nil {
				return
			}
			external := parsed.Query().Get("url")
			if external == "" {
				return
			}
			// Decode and validate
			decoded, err := url.QueryUnescape(external)
			if err != nil {
				return
			}
			if strings.HasPrefix(decoded, "http") && !strings.Contains(decoded, "linkedin.com") {
				found = decoded
			}
		}
	})
	return found
}

// extractProfileSlug pulls the username from a /in/username LinkedIn URL.
func extractProfileSlug(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) >= 2 && parts[0] == "in" {
		return parts[1]
	}
	return ""
}

// fetchLinkedInContactInfo calls LinkedIn's internal Voyager API.
// Returns the contact email and personal website URL visible on the profile.
func fetchLinkedInContactInfo(slug, liAt, jsessionID string) (email, siteURL string) {
	apiURL := fmt.Sprintf("https://www.linkedin.com/voyager/api/identity/profiles/%s/profileContactInfo", slug)
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return "", ""
	}
	cookieVal := fmt.Sprintf(`li_at=%s`, liAt)
	if jsessionID != "" {
		cookieVal += fmt.Sprintf(`; JSESSIONID="%s"`, strings.Trim(jsessionID, `"`))
	}
	req.Header.Set("Cookie", cookieVal)
	if jsessionID != "" {
		req.Header.Set("Csrf-Token", strings.Trim(jsessionID, `"`))
	}
	req.Header.Set("X-RestLi-Protocol-Version", "2.0.0")
	req.Header.Set("Accept", "application/vnd.linkedin.normalized+json+2.1")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("X-Li-Lang", "en_US")
	req.Header.Set("X-Li-Track", `{"clientVersion":"1.13.1","mpVersion":"1.13.1","osName":"web","timezoneOffset":0,"timezone":"UTC","deviceFormFactor":"DESKTOP"}`)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()

	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", ""
	}

	extractFromContact := func(m map[string]any) {
		if e, ok := m["emailAddress"].(string); ok && e != "" && email == "" {
			email = e
		}
		// websites is an array of {url, type} objects
		if ws, ok := m["websites"].([]any); ok {
			for _, w := range ws {
				if wm, ok := w.(map[string]any); ok {
					if u := strVal(wm, "url"); u != "" && strings.HasPrefix(u, "http") && siteURL == "" {
						siteURL = u
					}
				}
			}
		}
	}

	extractFromContact(data)
	if included, ok := data["included"].([]any); ok {
		for _, item := range included {
			if m, ok := item.(map[string]any); ok {
				extractFromContact(m)
			}
		}
	}
	return email, siteURL
}

var emailRegexp = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)

// scrapeWebsiteForEmail fetches the homepage and common contact/about paths
// and returns the first real email address found in the page.
func scrapeWebsiteForEmail(baseURL string) string {
	// Normalise — strip trailing slashes, ensure scheme
	baseURL = strings.TrimRight(baseURL, "/")
	if !strings.HasPrefix(baseURL, "http") {
		baseURL = "https://" + baseURL
	}
	client := &http.Client{
		Timeout: 8 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
	pages := []string{"/contact", "/contact-us", "/about", "/about-us", "/team", ""}
	for _, path := range pages {
		if email := fetchEmailFromPage(client, baseURL+path); email != "" {
			return email
		}
	}
	return ""
}

func fetchEmailFromPage(client *http.Client, pageURL string) string {
	req, err := http.NewRequest("GET", pageURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		if resp != nil {
			resp.Body.Close()
		}
		return ""
	}
	defer resp.Body.Close()

	doc, err := html.Parse(resp.Body)
	if err != nil {
		return ""
	}

	// 1. Prefer explicit mailto: links — most reliable
	var mailtoEmail string
	walkNodes(doc, func(n *html.Node) {
		if mailtoEmail != "" {
			return
		}
		if n.Type == html.ElementNode && n.Data == "a" {
			href := getAttr(n, "href")
			if strings.HasPrefix(href, "mailto:") {
				e := strings.TrimPrefix(href, "mailto:")
				// Strip any query params like ?subject=...
				if idx := strings.Index(e, "?"); idx >= 0 {
					e = e[:idx]
				}
				if emailRegexp.MatchString(e) {
					mailtoEmail = strings.ToLower(strings.TrimSpace(e))
				}
			}
		}
	})
	if mailtoEmail != "" {
		return mailtoEmail
	}

	// 2. Scan all text nodes for email patterns
	var textEmail string
	walkNodes(doc, func(n *html.Node) {
		if textEmail != "" || n.Type != html.TextNode {
			return
		}
		if m := emailRegexp.FindString(n.Data); m != "" {
			textEmail = strings.ToLower(m)
		}
	})
	return textEmail
}

func joinNonEmpty(sep string, parts ...string) string {
	var out []string
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, sep)
}

func main() {
	// Load .env from the project root (one level up from scraper/)
	loadEnv("../.env")
	loadEnv(".env")

	mux := http.NewServeMux()
	mux.HandleFunc("/api/scrape-linkedin", scrapeLinkedIn)

	port := "3001"
	fmt.Println("LinkedIn scraper running on http://localhost:" + port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		fmt.Fprintln(os.Stderr, "Server error:", err)
		os.Exit(1)
	}
}
