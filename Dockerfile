# Imagen oficial de Playwright con Node 20 y Chromium + todas las dependencias del sistema
# Esta imagen ya incluye fonts, codecs, libs de audio/video, etc. que Chromium necesita.
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

# Zona horaria
ENV TZ=America/Chicago
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Instalar dependencias primero (mejor caching de Docker)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copiar dev deps necesarias para ts-node en runtime
RUN npm install --no-save typescript ts-node @types/node

# Copiar el resto del código fuente
COPY tsconfig.json ./
COPY src ./src
COPY data ./data

# Crear carpetas runtime
RUN mkdir -p logs/screenshots downloads

# Forzar headless en contenedor
ENV HEADLESS=true
ENV NODE_ENV=production

# Comando por defecto: ejecutar el bot en modo polling (escucha emails)
CMD ["npx", "ts-node", "src/main.ts"]
