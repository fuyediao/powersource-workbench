package gmail

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// decodeBase64URL decodes Gmail base64url body data into a UTF-8 string.
func decodeBase64URL(b64url string) string {
	b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(b64url, "="))
	if err != nil {
		// Fall back to standard base64url with padding tolerance.
		s := strings.ReplaceAll(strings.ReplaceAll(b64url, "-", "+"), "_", "/")
		if pad := len(s) % 4; pad != 0 {
			s += strings.Repeat("=", 4-pad)
		}
		b, err = base64.StdEncoding.DecodeString(s)
		if err != nil {
			return ""
		}
	}
	return string(b)
}

type listResult struct {
	Messages []struct {
		ID       string `json:"id"`
		ThreadID string `json:"threadId"`
	} `json:"messages"`
	NextPageToken string `json:"nextPageToken"`
}

// listMessages lists message ids for a label.
func listMessages(ctx context.Context, accessToken, labelID string, maxResults int, pageToken, q string) (*listResult, error) {
	params := url.Values{}
	params.Set("labelIds", labelID)
	params.Set("maxResults", strconv.Itoa(maxResults))
	if pageToken != "" {
		params.Set("pageToken", pageToken)
	}
	if q != "" {
		params.Set("q", q)
	}
	var out listResult
	if err := gmailGet(ctx, accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages?"+params.Encode(), &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// getMessage fetches a single message (format=full).
func getMessage(ctx context.Context, accessToken, messageID string) (map[string]any, error) {
	var out map[string]any
	endpoint := "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + url.PathEscape(messageID) + "?format=full"
	if err := gmailGet(ctx, accessToken, endpoint, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// modifyLabels adds/removes labels on a single message.
func modifyLabels(ctx context.Context, accessToken, messageID string, add, remove []string) error {
	payload, _ := json.Marshal(map[string]any{"addLabelIds": add, "removeLabelIds": remove})
	endpoint := "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + url.PathEscape(messageID) + "/modify"
	_, err := gmailPost(ctx, accessToken, endpoint, payload)
	return err
}

// batchModifyLabels adds/removes labels on up to 1000 messages.
func batchModifyLabels(ctx context.Context, accessToken string, ids, add, remove []string) error {
	if len(ids) == 0 {
		return nil
	}
	payload, _ := json.Marshal(map[string]any{"ids": ids, "addLabelIds": add, "removeLabelIds": remove})
	_, err := gmailPost(ctx, accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify", payload)
	return err
}

// batchDeleteMessages permanently deletes up to 1000 Gmail messages.
func batchDeleteMessages(ctx context.Context, accessToken string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	payload, _ := json.Marshal(map[string]any{"ids": ids})
	_, err := gmailPost(ctx, accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchDelete", payload)
	return err
}

// Label is a Gmail mailbox label.
type Label struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// listLabels lists the mailbox labels.
func listLabels(ctx context.Context, accessToken string) ([]Label, error) {
	var out struct {
		Labels []Label `json:"labels"`
	}
	if err := gmailGet(ctx, accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/labels", &out); err != nil {
		return nil, err
	}
	return out.Labels, nil
}

// ListLabels returns the account's user-created Gmail labels.
func (c *Client) ListLabels(ctx context.Context, accountID string) ([]Label, error) {
	token, err := c.GetAccessToken(ctx, accountID)
	if err != nil {
		return nil, err
	}
	return listLabels(ctx, token)
}

func createLabel(ctx context.Context, accessToken, name string) (*Label, error) {
	payload, _ := json.Marshal(map[string]any{
		"name":                  name,
		"labelListVisibility":   "labelShow",
		"messageListVisibility": "show",
	})
	body, err := gmailPost(ctx, accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/labels", payload)
	if err != nil {
		return nil, err
	}
	var out Label
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func patchLabel(ctx context.Context, accessToken, labelID, name string) (*Label, error) {
	payload, _ := json.Marshal(map[string]any{"name": name})
	endpoint := "https://gmail.googleapis.com/gmail/v1/users/me/labels/" + url.PathEscape(labelID)
	body, err := gmailPatch(ctx, accessToken, endpoint, payload)
	if err != nil {
		return nil, err
	}
	var out Label
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func deleteLabel(ctx context.Context, accessToken, labelID string) error {
	endpoint := "https://gmail.googleapis.com/gmail/v1/users/me/labels/" + url.PathEscape(labelID)
	return gmailDelete(ctx, accessToken, endpoint)
}

// CreateLabel creates a user Gmail label.
func (c *Client) CreateLabel(ctx context.Context, accountID, name string) (*Label, error) {
	token, err := c.GetAccessToken(ctx, accountID)
	if err != nil {
		return nil, err
	}
	return createLabel(ctx, token, name)
}

// RenameLabel updates a user Gmail label name.
func (c *Client) RenameLabel(ctx context.Context, accountID, labelID, name string) (*Label, error) {
	token, err := c.GetAccessToken(ctx, accountID)
	if err != nil {
		return nil, err
	}
	return patchLabel(ctx, token, labelID, name)
}

// DeleteLabel removes a user Gmail label.
func (c *Client) DeleteLabel(ctx context.Context, accountID, labelID string) error {
	token, err := c.GetAccessToken(ctx, accountID)
	if err != nil {
		return err
	}
	return deleteLabel(ctx, token, labelID)
}

// FetchAttachment downloads one Gmail attachment's raw bytes.
func (c *Client) FetchAttachment(ctx context.Context, accountID, providerMessageID, attachmentID string) ([]byte, string, error) {
	token, err := c.GetAccessToken(ctx, accountID)
	if err != nil {
		return nil, "", err
	}
	endpoint := "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
		url.PathEscape(providerMessageID) + "/attachments/" + url.PathEscape(attachmentID)
	var out struct {
		Data string `json:"data"`
		Size int    `json:"size"`
	}
	if err := gmailGet(ctx, token, endpoint, &out); err != nil {
		return nil, "", err
	}
	data := decodeBase64URLBytes(out.Data)
	return data, "", nil
}

// decodeBase64URLBytes decodes Gmail base64url body data into raw bytes.
func decodeBase64URLBytes(b64url string) []byte {
	b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(b64url, "="))
	if err != nil {
		s := strings.ReplaceAll(strings.ReplaceAll(b64url, "-", "+"), "_", "/")
		if pad := len(s) % 4; pad != 0 {
			s += strings.Repeat("=", 4-pad)
		}
		b, err = base64.StdEncoding.DecodeString(s)
		if err != nil {
			return nil
		}
	}
	return b
}

// sendMessage sends a base64url-encoded RFC 2822 message.
func sendMessage(ctx context.Context, accessToken, rawBase64 string) (string, string, error) {
	payload, _ := json.Marshal(map[string]string{"raw": rawBase64})
	body, err := gmailPost(ctx, accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", payload)
	if err != nil {
		return "", "", err
	}
	var out struct {
		ID       string `json:"id"`
		ThreadID string `json:"threadId"`
	}
	_ = json.Unmarshal(body, &out)
	return out.ID, out.ThreadID, nil
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

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
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncate(string(body), 300))
	}
	return body, nil
}

func gmailGet(ctx context.Context, accessToken, endpoint string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	return doJSON(req, dest)
}

func gmailPost(ctx context.Context, accessToken, endpoint string, payload []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	return doRequest(req)
}

func gmailPatch(ctx context.Context, accessToken, endpoint string, payload []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	return doRequest(req)
}

func gmailDelete(ctx context.Context, accessToken, endpoint string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	_, err = doRequest(req)
	return err
}

func postForm(ctx context.Context, endpoint string, form url.Values) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return doRequest(req)
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

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// isHTTPNotFound reports whether err represents a Gmail HTTP 404 response.
func isHTTPNotFound(err error) bool {
	return err != nil && strings.Contains(err.Error(), "HTTP 404")
}
