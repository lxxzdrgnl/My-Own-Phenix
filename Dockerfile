FROM node:22-alpine

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci

# Copy prisma schema and generate client
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# Copy source (volumes will overlay in dev mode)
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
