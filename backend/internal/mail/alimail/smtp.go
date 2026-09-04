package alimail

import (
	"crypto/tls"
	"net"
	"net/smtp"
	"strconv"
	"strings"
)

// sendSMTPMessage sends a raw RFC 2822 message via SMTP.
func sendSMTPMessage(cfg Config, raw, from string, to []string) error {
	addr := net.JoinHostPort(cfg.SMTPHost, strconv.Itoa(cfg.SMTPPort))
	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.SMTPHost)

	if cfg.SMTPSSL || cfg.SMTPPort == 465 {
		conn, err := tls.DialWithDialer(&net.Dialer{Timeout: imapDialTimeout}, "tcp", addr, &tls.Config{ServerName: cfg.SMTPHost, InsecureSkipVerify: true})
		if err != nil {
			return err
		}
		client, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			return err
		}
		defer func() { _ = client.Close() }()
		return smtpSend(client, auth, from, to, raw)
	}

	client, err := smtp.Dial(addr)
	if err != nil {
		return err
	}
	defer func() { _ = client.Close() }()
	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: cfg.SMTPHost, InsecureSkipVerify: true}); err != nil {
			return err
		}
	}
	return smtpSend(client, auth, from, to, raw)
}

func smtpSend(client *smtp.Client, auth smtp.Auth, from string, to []string, raw string) error {
	if ok, _ := client.Extension("AUTH"); ok {
		if err := client.Auth(auth); err != nil {
			return err
		}
	}
	if err := client.Mail(stripAngle(from)); err != nil {
		return err
	}
	for _, rcpt := range to {
		if err := client.Rcpt(stripAngle(rcpt)); err != nil {
			return err
		}
	}
	wc, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := wc.Write([]byte(raw)); err != nil {
		return err
	}
	if err := wc.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func stripAngle(addr string) string {
	addr = strings.TrimSpace(addr)
	if i := strings.LastIndex(addr, "<"); i != -1 {
		if j := strings.LastIndex(addr, ">"); j > i {
			return addr[i+1 : j]
		}
	}
	return addr
}
