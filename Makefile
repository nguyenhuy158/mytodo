SHELL := /bin/sh
PNPM ?= corepack pnpm
NODE ?= node

.DEFAULT_GOAL := help

.PHONY: help install dev start lint build check audit env-check docker-build docker-run clean

help:
	@printf "%s\n" "Available targets:"
	@printf "%s\n" "  make install    Install pnpm dependencies"
	@printf "%s\n" "  make dev        Start Next.js dev server"
	@printf "%s\n" "  make start      Start production server after build"
	@printf "%s\n" "  make lint       Run ESLint"
	@printf "%s\n" "  make build      Build Next.js app"
	@printf "%s\n" "  make check      Run env-check, lint, and build"
	@printf "%s\n" "  make audit      Run pnpm audit at moderate level"
	@printf "%s\n" "  make env-check  Validate required local env values"
	@printf "%s\n" "  make docker-build Build production Docker image"
	@printf "%s\n" "  make docker-run   Run production Docker image locally"
	@printf "%s\n" "  make clean      Remove generated Next.js output"

install:
	$(PNPM) install

dev:
	$(PNPM) run dev

start:
	$(PNPM) run start

lint:
	$(PNPM) run lint

build:
	$(PNPM) run build

check: env-check lint build

audit:
	$(PNPM) audit --audit-level=moderate

env-check:
	@test -f .env.local || (printf "%s\n" "Missing .env.local. Create it from .env.example." && exit 1)
	@$(NODE) -e "const fs=require('fs');const lines=fs.readFileSync('.env.local','utf8').split(/\r?\n/);const env=Object.fromEntries(lines.filter((line)=>line&&!line.startsWith('#')).map((line)=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];}));const required=['GOOGLE_SHEET_ID','GOOGLE_SHEET_GID','NEXT_PUBLIC_TASK_POLLING_MS','AUTH_SECRET','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET','AUTH_ALLOWED_EMAILS'];const missing=required.filter((key)=>!env[key]);if(missing.length){console.error('Missing env: '+missing.join(', '));process.exit(1);}const credentialsPath=(env.GOOGLE_APPLICATION_CREDENTIALS||'').trim();const hasCredentialFile=credentialsPath&&fs.existsSync(credentialsPath);const hasServiceAccountPair=Boolean((env.GOOGLE_SERVICE_ACCOUNT_EMAIL||'').trim()&&(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||'').trim());if(credentialsPath&&!hasCredentialFile){console.error('GOOGLE_APPLICATION_CREDENTIALS file not found.');process.exit(1);}if(!hasCredentialFile&&!hasServiceAccountPair){console.error('Missing Google Sheet auth: set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.');process.exit(1);}const allowedEmails=(env.AUTH_ALLOWED_EMAILS||'').split(/[\\s,;]+/).filter(Boolean);if(!allowedEmails.length||allowedEmails.some((email)=>!email.includes('@'))){console.error('AUTH_ALLOWED_EMAILS must contain one or more email addresses.');process.exit(1);}console.log('env ok');"

docker-build:
	docker build -t mytodo:latest .

docker-run:
	docker run --rm --env-file .env.local -p 3000:3000 mytodo:latest

clean:
	rm -rf .next out
