// runtime is the "Agent Runtime" demo (formerly Vertex AI Agent Engine,
// renamed in the April 2026 Gemini Enterprise Agent Platform rebrand).
//
// Hits the managed-agent endpoints:
//
//	POST /v1/reasoningEngines/{id}:createSession
//	POST /v1/reasoningEngines/{id}/sessions/{sid}:query
//
// Key point: the runtime holds the session, conversation history, memory
// bank, and tool execution. The caller sends ONE user message per turn and
// receives back the assistant reply plus a snapshot of whatever state the
// runtime decided to persist. Multi-turn reasoning, running totals and
// long-term memory just work, without the client tracking anything.
//
// In production this is what `adk deploy` puts behind an HTTPS endpoint
// and what the ADK client SDK (`reasoning_engine.query(...)`) wraps.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"example.com/geminidemo/internal/api"
)

const reasoningEngineID = "trip-budget-agent"

func endpoint() string {
	if v := os.Getenv("ENDPOINT"); v != "" {
		return v
	}
	return "http://localhost:8080"
}

func postJSON(url string, in, out any) error {
	body, _ := json.Marshal(in)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s: %s", resp.Status, b)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func createSession(userID string) (string, error) {
	url := fmt.Sprintf("%s/v1/reasoningEngines/%s:createSession", endpoint(), reasoningEngineID)
	var out api.CreateSessionResponse
	if err := postJSON(url, api.CreateSessionRequest{UserID: userID}, &out); err != nil {
		return "", err
	}
	return out.SessionID, nil
}

func query(sid, input string) (api.QueryResponse, error) {
	url := fmt.Sprintf("%s/v1/reasoningEngines/%s/sessions/%s:query", endpoint(), reasoningEngineID, sid)
	var out api.QueryResponse
	err := postJSON(url, api.QueryRequest{Input: input}, &out)
	return out, err
}

func main() {
	sid, err := createSession("alice@example.com")
	if err != nil {
		log.Fatalf("createSession: %v", err)
	}
	fmt.Printf("=== Agent Runtime: session %s opened ===\n", sid)

	prompts := []string{
		"add 30 for taxi",
		"add 50 for lunch",
		"what is the total?",
	}
	// Note: only the latest user message is sent each call. No history is
	// included; the runtime is keeping it for us.
	for i, p := range prompts {
		resp, err := query(sid, p)
		if err != nil {
			log.Fatalf("turn %d: %v", i+1, err)
		}
		fmt.Printf("user [%d]: %s\n", i+1, p)
		fmt.Printf("model[%d]: %s\n", i+1, resp.Output)
		fmt.Printf("           tools=%v  memory=%v  turn=%d\n",
			resp.ToolCalls, resp.MemorySnap, resp.TurnCounter)
	}

	fmt.Println("\n[runtime] client sent 3 single-message requests;")
	fmt.Println("          history + memory + tool execution lived on the server.")
}
