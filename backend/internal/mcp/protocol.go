package mcp

import "encoding/json"

// protocolVersion is the MCP revision this server implements.
const protocolVersion = "2025-06-18"

// serverName and serverVersion identify the implementation to clients.
const (
	serverName    = "geocrm"
	serverTitle   = "GeoCRM"
	serverVersion = "1.0.0"
)

// JSON-RPC 2.0 error codes used by the MCP endpoint.
const (
	codeParseError     = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
	codeInternalError  = -32603
)

// rpcRequest is an incoming JSON-RPC 2.0 request or notification. A request
// without an ID is a notification and must not be answered.
type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// rpcResponse is a JSON-RPC 2.0 response.
type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

// rpcError carries a JSON-RPC failure.
type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// newResult builds a successful response for the given request id.
func newResult(id json.RawMessage, result any) *rpcResponse {
	return &rpcResponse{JSONRPC: "2.0", ID: id, Result: result}
}

// newError builds a failure response for the given request id.
func newError(id json.RawMessage, code int, message string) *rpcResponse {
	return &rpcResponse{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: code, Message: message}}
}

// toolDescriptor is one entry of the tools/list result.
type toolDescriptor struct {
	Name        string           `json:"name"`
	Title       string           `json:"title,omitempty"`
	Description string           `json:"description"`
	InputSchema map[string]any   `json:"inputSchema"`
	Annotations *toolAnnotations `json:"annotations,omitempty"`
}

// toolAnnotations describe a tool's side effects to MCP clients. Clients can
// use these hints to auto-approve safe reads while continuing to confirm
// mutations. The hints are advisory; server-side authorization remains the
// source of truth for every call.
type toolAnnotations struct {
	ReadOnlyHint    bool `json:"readOnlyHint"`
	DestructiveHint bool `json:"destructiveHint"`
	IdempotentHint  bool `json:"idempotentHint"`
	OpenWorldHint   bool `json:"openWorldHint"`
}

// toolResult is the tools/call result envelope.
type toolResult struct {
	Content []toolContent `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

// toolContent is a single content block; this server only emits text.
type toolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// textResult wraps a value as pretty-printed JSON text content.
func textResult(value any) *toolResult {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return errorResult("failed to encode result")
	}
	return &toolResult{Content: []toolContent{{Type: "text", Text: string(encoded)}}}
}

// errorResult reports a tool-level failure. Per the MCP spec this is a
// successful JSON-RPC response carrying isError, so the model can react to it.
func errorResult(message string) *toolResult {
	return &toolResult{Content: []toolContent{{Type: "text", Text: message}}, IsError: true}
}
