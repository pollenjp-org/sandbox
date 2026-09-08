package authz

import "testing"

func TestParseSubject(t *testing.T) {
	tests := []struct {
		in      string
		want    Subject
		wantErr bool
	}{
		{in: "user:alice", want: Subject{Type: "user", ID: "alice"}},
		{in: "group:eng#member", want: Subject{Type: "group", ID: "eng", Relation: "member"}},
		{in: "alice", wantErr: true},
		{in: "user:", wantErr: true},
		{in: ":alice", wantErr: true},
		{in: "", wantErr: true},
	}
	for _, tt := range tests {
		got, err := ParseSubject(tt.in)
		if tt.wantErr {
			if err == nil {
				t.Errorf("ParseSubject(%q): want error, got %+v", tt.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseSubject(%q): %v", tt.in, err)
			continue
		}
		if got != tt.want {
			t.Errorf("ParseSubject(%q) = %+v, want %+v", tt.in, got, tt.want)
		}
		if got.String() != tt.in {
			t.Errorf("Subject.String() roundtrip: got %q want %q", got.String(), tt.in)
		}
	}
}
