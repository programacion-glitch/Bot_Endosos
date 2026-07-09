# syntax=docker/dockerfile:1.6

# ---------- Builder: compila TypeScript del backend ----------
FROM mcr.microsoft.com/playwright:v1.58.2-jammy AS builder

WORKDIR /app

# La imagen base ya trae Chromium en /ms-playwright; evitamos que npm lo vuelva a bajar.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Instalar TODAS las deps (incluidas dev) para poder compilar con tsc
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Compilar TS -> dist/
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Dejar solo deps de producción para copiar un node_modules limpio al runtime
RUN --mount=type=cache,target=/root/.npm \
    npm prune --omit=dev


# ---------- UI builder: compila la SPA React (portal) ----------
FROM mcr.microsoft.com/playwright:v1.58.2-jammy AS ui-builder

WORKDIR /ui

COPY web/ui/package.json web/ui/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY web/ui ./
RUN npm run build


# ---------- Runtime: imagen única para bot (CMD) y web (command en compose) ----------
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

ENV TZ=America/Chicago \
    HEADLESS=true \
    NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Copiar artefactos de los builders
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=ui-builder /ui/dist ./web/ui/dist
COPY package.json ./
# Solo agents.xlsx llega aquí (las DBs y el perfil quedan fuera por .dockerignore);
# en el primer arranque Docker copia este contenido al volumen botdata vacío.
COPY data ./data

# Crear carpetas runtime (las sobrescriben los volúmenes de docker-compose)
RUN mkdir -p logs/screenshots downloads

# Ejecutar JS compilado directamente (sin ts-node)
CMD ["node", "dist/main.js"]
