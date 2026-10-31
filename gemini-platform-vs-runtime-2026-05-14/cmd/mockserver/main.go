// mockserver is a tiny HTTP server that imitates two surfaces of the
// Gemini Enterprise Agent Platform so that the two demo clients can run
// offline:
//
//   - /v1/models/{model}:generateContent  (Platform: stateless model API)
//   - /v1/reasoningEngines/{id}:createSession                (Runtime)
//   - /v1/reasoningEngines/{id}/sessions/{sid}:query         (Runtime)
//
// The "model" itself is a deterministic regex-based fake so the demos
// produce stable output without API keys.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"example.com/geminidemo/internal/api"
)

// runtimeSession is the state the Runtime keeps on behalf of the caller.
type runtimeSession struct {
	userID      string
	turnCounter int
	expenses    map[string]int
	history     []api.Content
}

var (
	mu       sync.Mutex
	sessions = map[string]*runtimeSession{}
	nextID   = 0
)

var addExpenseRE = regexp.MustCompile(`(?i)add\s+(\d+)\s+for\s+([a-z]+)`)

// fakeModel turns a flat list of user/model turns into the next assistant
// reply. It "tools-calls" by scanning the entire visible history for
// `add N for X` statements and summing them, so it reflects whatever
// history the caller chose to share.
func fakeModel(history []api.Content) (reply string, expenses map[string]int) {
	expenses = map[string]int{}
	var lastUser string
	for _, c := range history {
		if c.Role != "user" {
			continue
		}
		for _, p := range c.Parts {
			lastUser = p.Text
			for _, m := range addExpenseRE.FindAllStringSubmatch(p.Text, -1) {
				amount, _ := strconv.Atoi(m[1])
				expenses[strings.ToLower(m[2])] += amount
			}
		}
	}
	total := 0
	for _, v := range expenses {
		total += v
	}
	switch {
	case strings.Contains(strings.ToLower(lastUser), "total"):
		parts := []string{}
		for k, v := range expenses {
			parts = append(parts, fmt.Sprintf("%s=%d", k, v))
		}
		reply = fmt.Sprintf("Total spent: %d (breakdown: %s)", total, strings.Join(parts, ", "))
	case addExpenseRE.MatchString(lastUser):
		reply = fmt.Sprintf("Recorded. Running total: %d.", total)
	default:
		reply = "I track expenses. Try: 'add 30 for taxi' or 'what is the total?'."
	}
	return reply, expenses
}

// ---- Platform handler: completely stateless --------------------------------

func handleGenerateContent(w http.ResponseWriter, r *http.Request) {
	var req api.GenerateContentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	reply, _ := fakeModel(req.Contents)
	resp := api.GenerateContentResponse{}
	resp.Candidates = append(resp.Candidates, struct {
		Content api.Content `json:"content"`
	}{Content: api.Content{Role: "model", Parts: []api.Part{{Text: reply}}}})
	writeJSON(w, resp)
}

// ---- Runtime handlers: server holds the session ----------------------------

func handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req api.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	mu.Lock()
	nextID++
	sid := fmt.Sprintf("sess-%d", nextID)
	sessions[sid] = &runtimeSession{userID: req.UserID, expenses: map[string]int{}}
	mu.Unlock()
	writeJSON(w, api.CreateSessionResponse{SessionID: sid})
}

func handleQuery(sid string, w http.ResponseWriter, r *http.Request) {
	var req api.QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	mu.Lock()
	defer mu.Unlock()
	s, ok := sessions[sid]
	if !ok {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	s.history = append(s.history, api.Content{Role: "user", Parts: []api.Part{{Text: req.Input}}})
	reply, expenses := fakeModel(s.history)
	s.history = append(s.history, api.Content{Role: "model", Parts: []api.Part{{Text: reply}}})
	s.expenses = expenses
	s.turnCounter++
	snap := map[string]string{}
	for k, v := range s.expenses {
		snap[k] = strconv.Itoa(v)
	}
	var toolCalls []string
	if addExpenseRE.MatchString(req.Input) {
		toolCalls = append(toolCalls, "record_expense")
	}
	writeJSON(w, api.QueryResponse{
		Output:      reply,
		ToolCalls:   toolCalls,
		MemorySnap:  snap,
		TurnCounter: s.turnCounter,
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func main() {
	addr := ":8080"
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/models/", func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, ":generateContent") {
			http.NotFound(w, r)
			return
		}
		handleGenerateContent(w, r)
	})
	mux.HandleFunc("/v1/reasoningEngines/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.HasSuffix(path, ":createSession"):
			handleCreateSession(w, r)
		case strings.Contains(path, "/sessions/") && strings.HasSuffix(path, ":query"):
			// .../sessions/{sid}:query
			i := strings.LastIndex(path, "/sessions/") + len("/sessions/")
			j := strings.LastIndex(path, ":query")
			handleQuery(path[i:j], w, r)
		default:
			http.NotFound(w, r)
		}
	})
	log.Printf("mock Agent Platform/Runtime listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
