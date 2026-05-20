# Instalar dependencias
FROM node:22-alpine

WORKDIR /app

COPY package*.json .

RUN npm ci

# Copiar el resto del código
COPY . .

# Exponer el puerto
EXPOSE 9002

# Comando de arranque
CMD ["npm", "run", "dev"]
