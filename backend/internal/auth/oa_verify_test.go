package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

const oaLoginHTML = `<html><body>
<input id="txtUserName" name="txtUserName" />
<input id="txtPassword" name="txtPassword" />
<input id="btnLogin" name="btnLogin" />
<input type="hidden" name="__VIEWSTATE" value="vs" />
</body></html>`

func TestVerifyOAAcceptsMainRedirect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(oaLoginHTML))
			return
		}
		if r.FormValue("txtUserName") != "PS0001" || r.FormValue("txtPassword") != "secret" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(oaLoginHTML + "验证失败"))
			return
		}
		http.Redirect(w, r, "/V_Main.aspx", http.StatusFound)
	}))
	defer server.Close()

	ok, err := VerifyOA(server.URL+"/", "ps0001", "secret")
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected OA accept")
	}
	ok, err = VerifyOA(server.URL+"/", "ps0001", "wrong")
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("expected OA reject")
	}
}

func TestOaLoginUsername(t *testing.T) {
	if got := oaLoginUsername("ps0042"); got != "PS0042" {
		t.Fatalf("got %q", got)
	}
	if got := oaLoginUsername("other.user"); got != "other.user" {
		t.Fatalf("got %q", got)
	}
}
