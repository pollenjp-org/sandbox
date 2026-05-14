// platform is the "Gemini on Agent Platform" demo.
//
// Hits the stateless model endpoint:
//
//	POST /v1/models/gemini-3.1-flash:generateContent
//
// Key point: every turn the CLIENT must rebuild the conversation history
// and send it in full. There is no session, no server-side memory, and no
// server-side tool execution. If you want running totals, multi-turn
// reasoning, or persistent memory, you implement them yourself.
//
// In production this is the surface the `google.golang.org/genai` SDK
// wraps -- `client.Models.GenerateContent(ctx, model, contents, cfg)`.
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

const model = "gemini-3.1-flash"

func endpoint() string {
	if v := os.Getenv("ENDPOINT"); v != "" {
		return v
	}
	return "http://localhost:8080"
}

// generateContent is the one HTTP call the Platform surface offers.
// Note: the entire `history` is sent every time.
func generateContent(history []api.Content) (string, error) {
	body, _ := json.Marshal(api.GenerateContentRequest{Contents: history})
	url := fmt.Sprintf("%s/v1/models/%s:generateContent", endpoint(), model)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("%s: %s", resp.Status, b)
	}
	var out api.GenerateContentResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if len(out.Candidates) == 0 || len(out.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("empty response")
	}
	return out.Candidates[0].Content.Parts[0].Text, nil
}

// chatWithLocalHistory is the multi-turn pattern. The client owns the
// history slice; the server has no idea this is a "conversation".
func chatWithLocalHistory(prompts []string) {
	var history []api.Content
	for i, p := range prompts {
		history = append(history, api.Content{
			Role: "user", Parts: []api.Part{{Text: p}},
		})
		reply, err := generateContent(history)
		if err != nil {
			log.Fatalf("turn %d: %v", i+1, err)
		}
		fmt.Printf("user [%d]:  %s\n", i+1, p)
		fmt.Printf("model[%d]:  %s\n", i+1, reply)
		// Client must append model turn into local history so the NEXT
		// generateContent call still has the context.
		history = append(history, api.Content{
			Role: "model", Parts: []api.Part{{Text: reply}},
		})
	}
	fmt.Printf("\n[platform] history kept locally: %d turns; server is stateless.\n", len(history))
}

// chatStateless shows what happens if you forget that the model is
// stateless: each call sees only the latest user message. The "running
// total" forgets the previous turn because we never resent it.
func chatStateless(prompts []string) {
	for i, p := range prompts {
		reply, err := generateContent([]api.Content{
			{Role: "user", Parts: []api.Part{{Text: p}}},
		})
		if err != nil {
			log.Fatalf("turn %d: %v", i+1, err)
		}
		fmt.Printf("user [%d]:  %s\n", i+1, p)
		fmt.Printf("model[%d]:  %s   <-- only this turn's data is visible\n", i+1, reply)
	}
}

func main() {
	prompts := []string{
		"add 30 for taxi",
		"add 50 for lunch",
		"what is the total?",
	}

	fmt.Println("=== Gemini on Agent Platform: WITH client-side history ===")
	chatWithLocalHistory(prompts)

	fmt.Println("\n=== Gemini on Agent Platform: WITHOUT client-side history (broken) ===")
	chatStateless(prompts)
}
