FROM node:20-alpine
WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm ci

# Copiar código fuente
COPY tsconfig.json ./
COPY src/ ./src/

# Compilar TypeScript
RUN npm run build

# Limpiar dev dependencies
RUN npm prune --production

EXPOSE 3000
CMD ["node", "dist/server.js"]