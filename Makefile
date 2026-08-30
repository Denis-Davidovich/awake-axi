.PHONY: build test check install-skill

build:
	npm run build

test:
	npm test

check:
	npm run check

install-skill: build
	node dist/bin/awake-axi.js skill install
