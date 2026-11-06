# n8n with the exported JobRadar workflows baked in (no bind mounts: Coolify clones the repo, it does not
# guarantee host paths). Same version as docker-compose.yml, where the workflows were exported and tested.
# Build from the repository root:  docker build -f deploy/n8n.Dockerfile -t jobradar-n8n .
FROM docker.n8n.io/n8nio/n8n:2.40.5
COPY --chown=node:node n8n/workflows /workflows
