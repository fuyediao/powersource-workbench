NAME=mihomo
BINDIR=bin
VERSION=mihomo
BUILDTIME=$(shell date -u)
GOBUILD=CGO_ENABLED=0 go build -tags with_gvisor -trimpath -ldflags '-X "github.com/metacubex/mihomo/constant.Version=$(VERSION)" \
		-X "github.com/metacubex/mihomo/constant.BuildTime=$(BUILDTIME)" \
		-w -s -buildid='

.PHONY: host clean

host:
	$(GOBUILD) -o $(BINDIR)/$(NAME) .

clean:
	rm -rf $(BINDIR)
