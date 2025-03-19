#!/bin/bash

# Configuration
BRANCH="main"
CONTAINER_NAME="bot"
INTERVAL=100  # Check every 300 seconds (5 minutes)

# Move to repo directory
cd "$REPO_PATH" || exit

# Get the latest commit hash
LAST_COMMIT=$(git rev-parse HEAD)

while true; do
    # Fetch latest changes from remote
    git fetch

    # Get the latest commit hash from the remote
    LATEST_COMMIT=$(git rev-parse "$BRANCH")

    # Check if a new commit exists
    if [ "$LAST_COMMIT" != "$LATEST_COMMIT" ]; then
        echo "New commit detected! Pulling changes..."
        
        # Pull latest changes
        git pull "$BRANCH"

        # Restart the Docker container
        echo "Restarting container $CONTAINER_NAME..."
        docker compose down
        docker compose up -d

        # Update last commit
        LAST_COMMIT=$LATEST_COMMIT
    else
        echo "No new commits. Checking again in $INTERVAL seconds..."
    fi

    # Wait before next check
    sleep "$INTERVAL"
done
