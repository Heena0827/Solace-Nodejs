FROM crdgtlshrdqac002.azurecr.io/base/node:20-alpine

WORKDIR /app

# Set ownership of the working directory
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Copy package files with correct ownership
COPY --chown=node:node package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app with correct ownership
COPY --chown=node:node . .

EXPOSE 3000

CMD [ "node", "app.js" ]
