package calendar

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// googleHTTPError is a non-2xx Google Calendar API response.
type googleHTTPError struct {
	Status int
	Body   string
}

func (e *googleHTTPError) Error() string {
	return fmt.Sprintf("HTTP %d: %s", e.Status, e.Body)
}

// isGoogleGone reports whether err is Google HTTP 410 (sync token expired).
func isGoogleGone(err error) bool {
	var ge *googleHTTPError
	return errors.As(err, &ge) && ge.Status == http.StatusGone
}

func doRequest(req *http.Request) ([]byte, error) {
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := string(body)
		if len(snippet) > 300 {
			snippet = snippet[:300]
		}
		return nil, &googleHTTPError{Status: resp.StatusCode, Body: snippet}
	}
	return body, nil
}

func doJSON(req *http.Request, dest any) error {
	body, err := doRequest(req)
	if err != nil {
		return err
	}
	if dest == nil {
		return nil
	}
	return json.Unmarshal(body, dest)
}

func googleGet(ctx context.Context, accessToken, endpoint string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	return doJSON(req, dest)
}

func postForm(ctx context.Context, endpoint string, form url.Values) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return doRequest(req)
}
