package auth

import (
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var (
	oaUserField     = regexp.MustCompile(`(?i)id=["']txtUserName["']`)
	oaPasswordField = regexp.MustCompile(`(?i)id=["']txtPassword["']`)
	oaLoginButton   = regexp.MustCompile(`(?i)id=["']btnLogin["']`)
	oaAuthFailed    = regexp.MustCompile(`验证失败`)
	oaMainPage      = regexp.MustCompile(`(?i)V_Main\.aspx`)
	oaEmployeeID    = regexp.MustCompile(`^ps\d+$`)
	oaInputValue    = func(name string) *regexp.Regexp {
		escaped := regexp.QuoteMeta(name)
		return regexp.MustCompile(`(?i)(?:name=["']` + escaped + `["'][^>]*value=["']([^"']*)["']|value=["']([^"']*)["'][^>]*name=["']` + escaped + `["'])`)
	}
)

var oaHiddenFields = []string{
	"__RefreshPageGuid",
	"__RefreshHiddenField",
	"__EVENTTARGET",
	"__EVENTARGUMENT",
	"__VIEWSTATE",
	"__VIEWSTATEGENERATOR",
	"__EVENTVALIDATION",
	"hidip",
	"hidpsip",
}

// VerifyOA posts the employee id and password to the POWERSOURCE OA login form.
// It does not create a Workbench user. The caller must not persist the password.
// @param loginURL - OA origin, typically http://61.29.250.144:86/
// @param username - Normalized employee id (ps####)
// @param password - Plaintext password
// @returns True when OA accepts the credentials.
func VerifyOA(loginURL, username, password string) (bool, error) {
	origin, err := url.Parse(strings.TrimSpace(loginURL))
	if err != nil || origin.Scheme == "" || origin.Host == "" {
		return false, err
	}
	origin.Path = "/"
	origin.RawQuery = ""
	origin.Fragment = ""
	loginHref := origin.String()

	jar, err := cookiejar.New(nil)
	if err != nil {
		return false, err
	}
	client := &http.Client{
		Timeout: 15 * time.Second,
		Jar:     jar,
	}

	getResp, err := client.Get(loginHref)
	if err != nil {
		return false, err
	}
	defer getResp.Body.Close()
	getHTML, err := io.ReadAll(io.LimitReader(getResp.Body, 2<<20))
	if err != nil {
		return false, err
	}
	getBody := string(getHTML)
	if !looksLikeOALoginForm(getBody) {
		if getResp.StatusCode >= 200 && getResp.StatusCode < 400 && oaMainPage.MatchString(getResp.Request.URL.String()) {
			return true, nil
		}
		return false, nil
	}

	form := url.Values{}
	for _, name := range oaHiddenFields {
		form.Set(name, extractOAInputValue(getBody, name))
	}
	form.Set("txtUserName", oaLoginUsername(username))
	form.Set("txtPassword", password)
	form.Set("btnLogin", "登 录")

	postReq, err := http.NewRequest(http.MethodPost, loginHref, strings.NewReader(form.Encode()))
	if err != nil {
		return false, err
	}
	postReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	postReq.Header.Set("Origin", origin.Scheme+"://"+origin.Host)
	postReq.Header.Set("Referer", loginHref)
	postReq.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	postResp, err := client.Do(postReq)
	if err != nil {
		return false, err
	}
	defer postResp.Body.Close()
	postHTML, err := io.ReadAll(io.LimitReader(postResp.Body, 2<<20))
	if err != nil {
		return false, err
	}
	postBody := string(postHTML)
	finalURL := ""
	if postResp.Request != nil && postResp.Request.URL != nil {
		finalURL = postResp.Request.URL.String()
	}
	if oaAuthFailed.MatchString(postBody) && looksLikeOALoginForm(postBody) {
		return false, nil
	}
	if looksLikeOALoginForm(postBody) && !oaMainPage.MatchString(finalURL) {
		return false, nil
	}
	return true, nil
}

func looksLikeOALoginForm(html string) bool {
	return oaUserField.MatchString(html) && oaPasswordField.MatchString(html) && oaLoginButton.MatchString(html)
}

func extractOAInputValue(html, name string) string {
	match := oaInputValue(name).FindStringSubmatch(html)
	if match == nil {
		return ""
	}
	if match[1] != "" {
		return match[1]
	}
	return match[2]
}

func oaLoginUsername(username string) string {
	if oaEmployeeID.MatchString(username) {
		return strings.ToUpper(username)
	}
	return username
}
