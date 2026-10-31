// Package api defines the request/response shapes used by the two demo clients
// and the mock server. The shapes are simplified imitations of the real Gemini
// Enterprise Agent Platform APIs:
//
//   - "Gemini on Agent Platform" (model surface, stateless):
//     POST /v1/models/{model}:generateContent
//     This mirrors the generative-language / Vertex AI generative SDK call:
//     the caller sends the full conversation each turn; the server returns one
//     completion. There is no session, memory, or tool execution on the server.
//
//   - "Agent Runtime" (formerly Agent Engine, managed runtime):
//     POST /v1/reasoningEngines/{id}:createSession
//     POST /v1/reasoningEngines/{id}/sessions/{sid}:query
//     The server holds the session, the conversation history, the memory bank
//     state, and runs tools on the caller's behalf. The caller just sends a
//     single user message per turn and reads the assistant reply plus any
//     state the runtime decided to persist.
package api

// ---- Platform: stateless model surface ------------------------------------

// Content is a single role-tagged turn ("user" | "model").
type Content struct {
	Role  string `json:"role"`
	Parts []Part `json:"parts"`
}

// Part is one chunk of a turn. We only model text here.
type Part struct {
	Text string `json:"text"`
}

// GenerateContentRequest is what the client POSTs to the model endpoint.
// The caller must pass the FULL prior conversation every call.
type GenerateContentRequest struct {
	Contents []Content `json:"contents"`
}

// GenerateContentResponse is one assistant turn.
type GenerateContentResponse struct {
	Candidates []struct {
		Content Content `json:"content"`
	} `json:"candidates"`
}

// ---- Runtime: managed session surface -------------------------------------

// CreateSessionRequest opens a managed session against a deployed agent.
type CreateSessionRequest struct {
	UserID string `json:"userId"`
}

// CreateSessionResponse returns the session id the client must reuse.
type CreateSessionResponse struct {
	SessionID string `json:"sessionId"`
}

// QueryRequest sends ONE user message. No history is included; the runtime
// already has it.
type QueryRequest struct {
	Input string `json:"input"`
}

// QueryResponse is the assistant reply plus a snapshot of the memory the
// runtime is keeping for this session.
type QueryResponse struct {
	Output      string            `json:"output"`
	ToolCalls   []string          `json:"toolCalls"`
	MemorySnap  map[string]string `json:"memorySnap"`
	TurnCounter int               `json:"turnCounter"`
}
