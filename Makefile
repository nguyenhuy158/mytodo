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
	@$(NODE) scripts/env-check.mjs

docker-build:
	docker build -t mytodo:latest .

docker-run:
	docker run --rm --env-file .env.local -p 3000:3000 mytodo:latest

clean:
	rm -rf .next out
