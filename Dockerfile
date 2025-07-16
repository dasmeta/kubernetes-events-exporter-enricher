FROM node:20-slim

# Set working directory
WORKDIR /app

COPY package.json ./

RUN yarn

COPY index.js ./

ENV PORT=8080

EXPOSE 8080

# Run the service
CMD ["node", "index.js"]