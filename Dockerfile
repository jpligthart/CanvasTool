# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY frontend/ ./
COPY VERSION /app/VERSION
RUN npm run build

FROM python:3.12-slim AS runtime

ARG VERSION=dev
ARG IMAGE_CREATED=unknown

LABEL org.opencontainers.image.title="Canvastool" \
    org.opencontainers.image.description="Teacher tool for Canvas: manage sections and groups, view assignments and grades (read-only)." \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.vendor="Fontys ICT" \
    org.opencontainers.image.created="${IMAGE_CREATED}" \
    org.opencontainers.image.base.name="docker.io/library/python:3.12-slim"

WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY VERSION ./
COPY app/ ./app/
COPY --from=frontend-build /app/frontend/dist ./static
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
